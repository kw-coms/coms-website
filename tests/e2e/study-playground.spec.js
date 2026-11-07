import { expect, test } from '@playwright/test'
import { mockOptionalApis } from './visualSupport.js'

// "직접 해보기" on the study pages. /study/api/run is mocked (the real runner is a separate service);
// HTML/JS blocks run through the real /study-sandbox.html iframe.

const OK = { ok: true, stage: 'run', stdout: "Hello, COM's!\n", stderr: '', exitCode: 0, signal: null, timedOut: false, truncated: false, timeMs: 37, diagnostics: [] }

async function mockRun(page, respond) {
  await mockOptionalApis(page)
  const calls = []
  await page.route('**/study/api/run', async (route) => {
    const body = route.request().postDataJSON()
    calls.push(body)
    const res = respond(body, calls.length)
    await route.fulfill({ status: res.status ?? 200, headers: res.headers, json: res.json })
  })
  return calls
}

async function openStudy(page, id) {
  await page.goto(`/study/${id}`)
  await expect(page.locator('.pg-stage').first()).toBeAttached()
}

const editorOf = (page, n) => page.locator(`#code-${n} .cm-content`)
async function openEditor(page, n) {
  await page.locator(`#code-${n}`).getByRole('button', { name: /직접 해보기/ }).click()
  await expect(page.locator(`#code-${n} .cm-editor`)).toBeVisible()
}
async function replaceCode(page, n, text) {
  await editorOf(page, n).click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText(text)
}
const runBtn = (page, n) => page.locator(`#code-${n}`).getByRole('button', { name: /실행/ }).first()

test('C block: editor loads only on demand, runs, shows output and compares with the expected output', async ({ page }) => {
  const requests = []
  page.on('request', (r) => requests.push(r.url()))
  const calls = await mockRun(page, () => ({ json: OK }))
  await openStudy(page, 'c')
  await expect(page.locator('.cm-editor')).toHaveCount(0)
  expect(requests.filter((u) => /study-editor/.test(u))).toEqual([])
  await openEditor(page, 0)
  expect(requests.some((u) => /study-editor/.test(u))).toBe(true)
  await runBtn(page, 0).click()
  const out = page.locator('#code-0 .pg-out')
  await expect(out.locator('.pg-stdout')).toHaveText("Hello, COM's!\n")
  await expect(out).toContainText('종료 코드 0')
  await expect(out).toContainText('37ms')
  expect(calls[0].lang).toBe('c')
  expect(calls[0].code).toContain('int main')
  await out.getByRole('button', { name: '예상 출력과 비교' }).click()
  await expect(out.locator('.pg-compare-result')).toContainText('✅')
  await page.screenshot({ path: 'test-results/study-c.png', fullPage: false }).catch(() => {})
})

test('edited code is saved per block, restored with a badge, and "원래대로" clears it', async ({ page }) => {
  await mockRun(page, () => ({ json: OK }))
  await openStudy(page, 'c')
  await openEditor(page, 0)
  await replaceCode(page, 0, '#include <stdio.h>\nint main(void) { printf("mine\\n"); return 0; }\n')
  await expect(page.locator('#code-0 .pg-badge')).toHaveText('수정한 코드')
  await expect.poll(() => draftsRaw(page)).toContain('mine') // save is debounced
  await page.reload()
  await expect(page.locator('#code-0 .cm-editor')).toHaveCount(0)
  const badge = page.locator('#code-0 button.pg-badge')
  await expect(badge).toBeVisible()
  await badge.click()
  await expect(editorOf(page, 0)).toContainText('mine')
  await page.locator('#code-0').getByRole('button', { name: '↺ 원래대로' }).click()
  await expect(editorOf(page, 0)).toContainText("Hello, COM's!")
  await expect(page.locator('#code-0 .pg-badge')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('#code-0 .pg-badge')).toHaveCount(0)
})

test('works with blocked localStorage', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError') } }) })
  await mockRun(page, () => ({ json: OK }))
  await openStudy(page, 'c')
  await openEditor(page, 0)
  await runBtn(page, 0).click()
  await expect(page.locator('#code-0 .pg-stdout')).toContainText('Hello')
})

test('Java compile error: squiggle, gutter marker, Korean hint, click jumps to the line', async ({ page }) => {
  await mockRun(page, () => ({
    json: { ok: false, stage: 'compile', stdout: '', stderr: "Broken.java:3: error: ';' expected", exitCode: null, signal: null, timedOut: false, truncated: false, timeMs: 410,
      diagnostics: [{ line: 3, column: 38, severity: 'error', message: "';' expected", hintKo: '문장 끝에 세미콜론(;)을 붙였는지 확인해 보세요.' }] },
  }))
  await openStudy(page, 'java')
  await openEditor(page, 5)
  await runBtn(page, 5).click()
  const out = page.locator('#code-5 .pg-out')
  await expect(out).toContainText('컴파일 오류')
  await expect(out.locator('.pg-diag-hint')).toContainText('세미콜론')
  await expect(page.locator('#code-5 .cm-lintRange-error')).toHaveCount(1)
  await expect(page.locator('#code-5 .cm-lint-marker-error')).toHaveCount(1)
  await page.locator('#code-5').getByRole('button', { name: /3번째 줄/ }).click()
  await expect(page.locator('#code-5 .cm-activeLine')).toContainText('System.out.println')
  await expect(out.getByRole('button', { name: '예상 출력과 비교' })).toBeHidden()
})

test('timeout and truncated output badges', async ({ page }) => {
  await mockRun(page, () => ({ json: { ...OK, stdout: 'x\n', exitCode: null, signal: 'SIGKILL', timedOut: true, truncated: true, timeMs: 10000 } }))
  await openStudy(page, 'python')
  await openEditor(page, 2)
  await runBtn(page, 2).click()
  const out = page.locator('#code-2 .pg-out')
  await expect(out).toContainText('시간 초과')
  await expect(out).toContainText('출력이 너무 길어 잘렸어요')
  await expect(out).toContainText('SIGKILL')
})

test('stderr is shown separately and in red', async ({ page }) => {
  await mockRun(page, () => ({ json: { ...OK, stdout: 'a\n', stderr: 'Traceback: boom\n', exitCode: 1 } }))
  await openStudy(page, 'python')
  await openEditor(page, 2)
  await runBtn(page, 2).click()
  const err = page.locator('#code-2 .pg-stderr')
  await expect(err).toContainText('boom')
  await expect(page.locator('#code-2 .pg-out')).toContainText('종료 코드 1')
  const color = await err.evaluate((e) => getComputedStyle(e).color)
  expect(color).toMatch(/^rgb\((19\d|2\d\d), /) // a red
})

test('stdin box appears for programs that read input and is sent to the runner', async ({ page }) => {
  const calls = await mockRun(page, () => ({ json: OK }))
  await openStudy(page, 'python')
  const idx = await page.evaluate(() => [...document.querySelectorAll('.pg-stage')].findIndex((s) => /input\(/.test(s.textContent)))
  expect(idx).toBeGreaterThan(-1)
  await openEditor(page, idx)
  await runBtn(page, idx).click()
  const box = page.locator(`#code-${idx} .pg-stdin textarea`)
  await expect(box).toBeVisible()
  await box.fill('지수\n20')
  await runBtn(page, idx).click()
  await expect.poll(() => calls.length).toBe(2)
  expect(calls[1].stdin).toBe('지수\n20')
  // a program without input keeps the box closed, but it can be opened by hand
  await openStudy(page, 'c')
  await openEditor(page, 0)
  await runBtn(page, 0).click()
  await expect(page.locator('#code-0 .pg-stdin')).toBeHidden()
  await page.locator('#code-0').getByRole('button', { name: '입력(stdin)' }).click()
  await expect(page.locator('#code-0 .pg-stdin textarea')).toBeVisible()
})

test('401 asks for a login and the link returns to the same block', async ({ page }) => {
  await mockRun(page, () => ({ status: 401, json: { message: 'Unauthorized' } }))
  await openStudy(page, 'c')
  await openEditor(page, 0)
  await runBtn(page, 0).click()
  const alert = page.locator('#code-0 .pg-status[role="alert"]')
  await expect(alert).toContainText('로그인한 동아리원만 실행할 수 있어요')
  await alert.getByRole('link', { name: '로그인하러 가기' }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('429 shows a friendly message with a countdown, then runs again', async ({ page }) => {
  await mockRun(page, (_b, n) => (n === 1 ? { status: 429, headers: { 'Retry-After': '2' }, json: { error: 'rate-limited', messageKo: '너무 자주 실행했어요.' } } : { json: OK }))
  await openStudy(page, 'c')
  await openEditor(page, 0)
  await runBtn(page, 0).click()
  const btn = page.locator('#code-0 [data-pg="run"]')
  await expect(btn).toContainText('다시 시도')
  await expect(btn).toBeDisabled()
  await expect(page.locator('#code-0 .pg-status')).toContainText('너무 자주 실행했어요.')
  await expect(btn).toHaveText('▶ 실행', { timeout: 6000 })
  await btn.click()
  await expect(page.locator('#code-0 .pg-stdout')).toContainText('Hello')
})

test('network failure and a rejected request show messages', async ({ page }) => {
  let mode = 'down'
  await mockOptionalApis(page)
  await page.route('**/study/api/run', (route) => (mode === 'down' ? route.abort('connectionrefused') : route.fulfill({ status: 400, json: { error: 'rejected', messageKo: '코드가 너무 길어요.' } })))
  await openStudy(page, 'c')
  await openEditor(page, 0)
  await runBtn(page, 0).click()
  await expect(page.locator('#code-0 .pg-status')).toContainText('네트워크')
  mode = 'reject'
  await runBtn(page, 0).click()
  await expect(page.locator('#code-0 .pg-status')).toContainText('코드가 너무 길어요.')
})

test('keeps the last 5 runs of a block', async ({ page }) => {
  await mockRun(page, (_b, n) => ({ json: { ...OK, stdout: `run ${n}\n` } }))
  await openStudy(page, 'c')
  await openEditor(page, 0)
  for (let i = 1; i <= 6; i++) {
    await runBtn(page, 0).click()
    await expect(page.locator('#code-0 .pg-stdout')).toHaveText(`run ${i}\n`)
  }
  const history = page.locator('#code-0 .pg-history')
  await expect(history.locator('option')).toHaveCount(5)
  await history.selectOption('4')
  await expect(page.locator('#code-0 .pg-stdout')).toHaveText('run 2\n')
})

test('HTML/JS blocks run in the real sandbox iframe and show console output without a login', async ({ page }) => {
  const calls = await mockRun(page, () => ({ json: OK }))
  await openStudy(page, 'web')
  // block 10: JS ("const school ... let score ..."), edited to log
  await openEditor(page, 10)
  await replaceCode(page, 10, 'console.log("안녕", 1 + 1)\nconsole.warn("조심")\nnotDefined()\n')
  await runBtn(page, 10).click()
  const out = page.locator('#code-10 .pg-out')
  await expect(out.locator('.pg-stdout')).toContainText('안녕 2')
  await expect(out.locator('.pg-stdout')).toContainText('[경고] 조심')
  await expect(out.locator('.pg-stderr')).toContainText('notDefined')
  // block 0: an HTML fragment renders in the preview frame
  await runBtn(page, 0).click()
  await expect(page.locator('#code-0 iframe').contentFrame().getByText('안녕하세요')).toBeVisible()
  expect(calls).toHaveLength(0) // never touched the server runner
  expect(await page.locator('#code-0 iframe').getAttribute('sandbox')).toBe('allow-scripts allow-modals')
})

test('Arduino sketch opens in the Circuit Lab with a share link holding only the default UNO and the code', async ({ page, context }) => {
  await mockRun(page, () => ({ json: OK }))
  await openStudy(page, 'arduino')
  const popup = context.waitForEvent('page')
  await page.locator('#code-0').getByRole('button', { name: 'Circuit Lab에서 열기' }).click()
  const lab = await popup
  expect(lab.url()).toMatch(/\/lab\/#s=[A-Za-z0-9_-]+$/)
  const token = lab.url().split('#s=')[1]
  const scene = await page.evaluate(async (t) => {
    const b64 = t.replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text())
  }, token)
  expect(scene.parts.map((p) => p.kind)).toEqual(['arduino-uno'])
  expect(scene.wires).toEqual([])
  expect(scene.code).toContain('void setup()')
  await lab.close()
})

test('share link reopens the edited code for someone else', async ({ page, browser }) => {
  await mockRun(page, () => ({ json: OK }))
  await openStudy(page, 'c')
  await openEditor(page, 0)
  await replaceCode(page, 0, '#include <stdio.h>\nint main(void) { puts("공유됨"); return 0; }\n')
  await page.locator('#code-0').getByRole('button', { name: '공유 링크' }).click()
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#pg=0\./)
  const url = page.url()
  const other = await browser.newContext()
  const p2 = await other.newPage()
  await mockRun(p2, () => ({ json: OK }))
  await p2.goto(url)
  await expect(p2.locator('#code-0 .cm-content')).toContainText('공유됨')
  await other.close()
})

// A shared link must never overwrite what the reader saved: it opens as a temporary view with a banner.
async function makeShareUrl(browser, code) {
  const other = await browser.newContext()
  const p = await other.newPage()
  await mockRun(p, () => ({ json: OK }))
  await openStudy(p, 'c')
  await openEditor(p, 0)
  await replaceCode(p, 0, code)
  await p.locator('#code-0').getByRole('button', { name: '공유 링크' }).click()
  await expect.poll(() => p.evaluate(() => location.hash)).toMatch(/^#pg=0\./)
  const url = p.url()
  await other.close()
  return url
}
const MINE = '#include <stdio.h>\nint main(void) { puts("내코드"); return 0; }\n'
const THEIRS = '#include <stdio.h>\nint main(void) { puts("공유됨"); return 0; }\n'

async function savedDraft(page, text) {
  await page.goto('/study/c')
  await expect(page.locator('.pg-stage').first()).toBeAttached()
  await page.locator('#code-0 button.pg-badge').click()
  await expect(editorOf(page, 0)).toContainText(text)
}

test('opening a share link keeps the reader\'s saved draft; leaving or reloading restores it untouched', async ({ page, context, browser }) => {
  await mockRun(page, () => ({ json: OK }))
  await openStudy(page, 'c')
  await openEditor(page, 0)
  await replaceCode(page, 0, MINE)
  await expect.poll(() => draftsRaw(page)).toContain('내코드') // save is debounced
  const url = await makeShareUrl(browser, THEIRS)

  const shared = await context.newPage()
  await mockRun(shared, () => ({ json: OK }))
  await shared.goto(url)
  await expect(shared.locator('#code-0 .cm-content')).toContainText('공유됨')
  const banner = shared.locator('#code-0 .pg-shared')
  await expect(banner).toContainText('공유된 코드를 보고 있어요')
  await expect(shared.locator('#code-0 .pg-badge')).toContainText('저장 안 됨')
  // Editing inside the temporary view is not saved either.
  await replaceCode(shared, 0, THEIRS + '// 더 고침\n')
  await shared.evaluate(() => window.dispatchEvent(new Event('pagehide'))) // flushes any pending save now
  expect(await draftsRaw(shared)).toContain('내코드')
  expect(await draftsRaw(shared)).not.toContain('공유됨')

  // Reload (same link, then the plain page): the saved draft is intact.
  await shared.reload()
  await expect(shared.locator('#code-0 .pg-shared')).toBeVisible()
  await savedDraft(shared, '내코드')
  await expect(editorOf(shared, 0)).not.toContainText('공유됨')

  // "내 코드로 돌아가기" in the shared view puts the reader's own code back and drops the hash.
  const again = await context.newPage()
  await mockRun(again, () => ({ json: OK }))
  await again.goto(url)
  await expect(again.locator('#code-0 .pg-shared')).toBeVisible()
  await again.getByRole('button', { name: '내 코드로 돌아가기' }).click()
  await expect(again.locator('#code-0 .pg-shared')).toHaveCount(0)
  await expect(editorOf(again, 0)).toContainText('내코드')
  await expect.poll(() => again.evaluate(() => location.hash)).toBe('')
  await again.reload()
  await expect(again.locator('#code-0 button.pg-badge')).toBeVisible()
})

test('"이 코드로 저장" replaces the draft and "이전 코드 복원" brings it back', async ({ page, context, browser }) => {
  await mockRun(page, () => ({ json: OK }))
  await openStudy(page, 'c')
  await openEditor(page, 0)
  await replaceCode(page, 0, MINE)
  await expect.poll(() => draftsRaw(page)).toContain('내코드') // save is debounced
  const url = await makeShareUrl(browser, THEIRS)

  const shared = await context.newPage()
  await mockRun(shared, () => ({ json: OK }))
  await shared.goto(url)
  await expect(shared.locator('#code-0 .pg-shared')).toBeVisible()
  await expect(shared.locator('#code-0').getByRole('button', { name: /이전 코드 복원/ })).toHaveCount(0)
  await shared.getByRole('button', { name: '이 코드로 저장' }).click()
  await expect(shared.locator('#code-0 .pg-shared')).toHaveCount(0)
  await expect(shared.locator('#code-0').getByRole('button', { name: /이전 코드 복원/ })).toBeVisible()

  await shared.goto('/study/c')
  await expect(shared.locator('#code-0 button.pg-badge')).toBeVisible()
  await shared.locator('#code-0 button.pg-badge').click()
  await expect(editorOf(shared, 0)).toContainText('공유됨')
  await shared.locator('#code-0').getByRole('button', { name: /이전 코드 복원/ }).click()
  await expect(editorOf(shared, 0)).toContainText('내코드')
  await shared.reload()
  await shared.locator('#code-0 button.pg-badge').click()
  await expect(editorOf(shared, 0)).toContainText('내코드')
  // The restore swapped: the shared code is now the one-step backup.
  await shared.locator('#code-0').getByRole('button', { name: /이전 코드 복원/ }).click()
  await expect(editorOf(shared, 0)).toContainText('공유됨')
})

test('leaving a shared view uses the draft saved by another tab meanwhile, not the one from link-open time', async ({ page, context, browser }) => {
  await mockRun(page, () => ({ json: OK }))
  await openStudy(page, 'c')
  await openEditor(page, 0)
  await replaceCode(page, 0, MINE)
  await expect.poll(() => draftsRaw(page)).toContain('내코드')
  const url = await makeShareUrl(browser, THEIRS)

  const shared = await context.newPage()
  await mockRun(shared, () => ({ json: OK }))
  await shared.goto(url)
  await expect(shared.locator('#code-0 .pg-shared')).toBeVisible()

  // The first tab saves a newer draft while the shared view is open.
  const NEWER = MINE.replace('내코드', '더새로운코드')
  await replaceCode(page, 0, NEWER)
  await expect.poll(() => draftsRaw(page)).toContain('더새로운코드')

  await shared.getByRole('button', { name: '내 코드로 돌아가기' }).click()
  await expect(editorOf(shared, 0)).toContainText('더새로운코드')

  // Saving the shared code instead backs up the newer draft, not the stale one.
  const again = await context.newPage()
  await mockRun(again, () => ({ json: OK }))
  await again.goto(url)
  await expect(again.locator('#code-0 .pg-shared')).toBeVisible()
  await replaceCode(page, 0, MINE.replace('내코드', '가장새로운코드'))
  await expect.poll(() => draftsRaw(page)).toContain('가장새로운코드')
  await again.getByRole('button', { name: '이 코드로 저장' }).click()
  await again.locator('#code-0').getByRole('button', { name: /이전 코드 복원/ }).click()
  await expect(editorOf(again, 0)).toContainText('가장새로운코드')
})

// Every saved record of the C page (one localStorage record per block), as one string for substring checks.
const draftsRaw = (page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('coms-study-playground:c:')).map((k) => localStorage.getItem(k)).join('\n') || null)
// The saved draft of block n (default 0) and its one-step backup, parsed from storage.
async function drafts(page, n = 0) {
  return page.evaluate((i) => {
    const k = Object.keys(localStorage).find((x) => x.startsWith(`coms-study-playground:c:${i}-`))
    const rec = k ? JSON.parse(localStorage.getItem(k)) : null
    return { primary: rec ? rec.code : null, backup: rec && rec.backup !== undefined ? rec.backup : null }
  }, n)
}
// Rewrites block 0's saved draft in storage as another tab would have, without going through this page's editor.
async function saveElsewhere(page, from, to) {
  await page.evaluate(([f, t]) => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('coms-study-playground:c:0-'))
    const rec = JSON.parse(localStorage.getItem(k))
    localStorage.setItem(k, JSON.stringify({ ...rec, code: rec.code.replace(f, t), at: Date.now() }))
  }, [from, to])
}
// Freezes the page's clock so the 400 ms autosave debounce only fires when the test advances it.
async function freeze(page) {
  const now = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(now + 1000)
}

test('returning to your draft never autosaves over a newer draft another tab saves right after', async ({ page, context, browser }) => {
  await mockRun(page, () => ({ json: OK }))
  await openStudy(page, 'c')
  await openEditor(page, 0)
  await replaceCode(page, 0, MINE)
  await expect.poll(() => draftsRaw(page)).toContain('내코드')
  const url = await makeShareUrl(browser, THEIRS)

  const shared = await context.newPage()
  await shared.clock.install()
  await mockRun(shared, () => ({ json: OK }))
  await shared.goto(url)
  await expect(shared.locator('#code-0 .pg-shared')).toBeVisible()
  await freeze(shared)
  await shared.getByRole('button', { name: '내 코드로 돌아가기' }).click()
  await expect(editorOf(shared, 0)).toContainText('내코드')

  // The other tab saves a newer draft before the returning tab's 400 ms deadline.
  await saveElsewhere(page, '내코드', '더새로운코드')
  await shared.clock.runFor(1000) // past the deadline
  await shared.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  const { primary, backup } = await drafts(page)
  expect(primary).toContain('더새로운코드')
  expect(backup).toBeNull()
})

test('restore is declined when another tab saved meanwhile; the pending edit is kept and the other draft ends up as the backup', async ({ page, context }) => {
  await mockRun(page, () => ({ json: OK }))
  await openStudy(page, 'c')
  await openEditor(page, 0)
  await replaceCode(page, 0, MINE) // A
  await expect.poll(() => draftsRaw(page)).toContain('내코드')
  await page.evaluate(() => { // an older draft the reader could restore
    const k = Object.keys(localStorage).find((x) => x.startsWith('coms-study-playground:c:0-'))
    const rec = JSON.parse(localStorage.getItem(k))
    localStorage.setItem(k, JSON.stringify({ ...rec, backup: '#include <stdio.h>\nint main(void) { puts("옛날코드"); return 0; }\n' }))
  })

  const tab = await context.newPage()
  await tab.clock.install()
  await mockRun(tab, () => ({ json: OK }))
  await tab.goto('/study/c')
  await tab.locator('#code-0 button.pg-badge').click()
  await expect(editorOf(tab, 0)).toContainText('내코드')
  await freeze(tab)
  await replaceCode(tab, 0, MINE.replace('내코드', '고치는중')) // C, autosave pending
  await saveElsewhere(page, '내코드', '다른탭이저장') // B

  await tab.locator('#code-0').getByRole('button', { name: /이전 코드 복원/ }).click()
  await expect(tab.getByText('다른 탭에서 이 코드가 바뀌어서 되돌리기를 멈췄어요.')).toBeVisible()
  await expect(editorOf(tab, 0)).toContainText('고치는중')
  await expect(editorOf(tab, 0)).not.toContainText('옛날코드')

  await tab.clock.runFor(1000) // the pending autosave takes the normal conflict path
  const { primary, backup } = await drafts(page)
  expect(primary).toContain('고치는중')
  expect(backup).toContain('다른탭이저장')
})

test('two tabs saving from the same baseline: one ends as the draft, the other as the backup, nothing lost', async ({ page, context }) => {
  await mockRun(page, () => ({ json: OK }))
  await page.clock.install()
  await openStudy(page, 'c')
  await openEditor(page, 0)
  await replaceCode(page, 0, MINE)
  await page.clock.runFor(1000)
  await expect.poll(() => draftsRaw(page)).toContain('내코드')

  const other = await context.newPage()
  await other.clock.install()
  await mockRun(other, () => ({ json: OK }))
  await other.goto('/study/c')
  await other.locator('#code-0 button.pg-badge').click()
  await expect(editorOf(other, 0)).toContainText('내코드')
  await freeze(page)
  await freeze(other)
  await page.bringToFront() // keyboard input only reaches the foreground tab
  await replaceCode(page, 0, MINE.replace('내코드', '첫번째'))
  await expect(editorOf(page, 0)).toContainText('첫번째')
  await other.bringToFront()
  await replaceCode(other, 0, MINE.replace('내코드', '두번째'))
  await expect(editorOf(other, 0)).toContainText('두번째')
  // One after the other: firing both at the same instant would hit the accepted read-then-write window of localStorage.
  await page.clock.runFor(1000)
  await other.clock.runFor(1000)
  await expect.poll(async () => {
    const d = await drafts(page)
    return [d.primary, d.backup].filter(Boolean).join('|')
  }).toMatch(/(첫번째[\s\S]*두번째|두번째[\s\S]*첫번째)/)
  const { primary, backup } = await drafts(page)
  expect(primary).not.toBeNull()
  expect(backup).not.toBeNull()
})

test('typing after returning keeps the newer draft of another tab as the backup', async ({ page, context, browser }) => {
  await mockRun(page, () => ({ json: OK }))
  await openStudy(page, 'c')
  await openEditor(page, 0)
  await replaceCode(page, 0, MINE)
  await expect.poll(() => draftsRaw(page)).toContain('내코드')
  const url = await makeShareUrl(browser, THEIRS)

  const shared = await context.newPage()
  await mockRun(shared, () => ({ json: OK }))
  await shared.goto(url)
  await shared.getByRole('button', { name: '내 코드로 돌아가기' }).click()
  await expect(editorOf(shared, 0)).toContainText('내코드')
  await replaceCode(page, 0, MINE.replace('내코드', '다른탭코드'))
  await expect.poll(() => draftsRaw(page)).toContain('다른탭코드')

  await replaceCode(shared, 0, MINE.replace('내코드', '여기서고침'))
  await shared.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  const raw = await draftsRaw(page)
  expect(raw).toContain('여기서고침')
  expect(raw).toContain('다른탭코드') // kept as the one-step backup, not lost
})

test('two tabs editing different blocks keep both edits', async ({ page, context }) => {
  await mockRun(page, () => ({ json: OK }))
  await page.clock.install()
  await openStudy(page, 'c')
  const other = await context.newPage()
  await other.clock.install()
  await mockRun(other, () => ({ json: OK }))
  await openStudy(other, 'c')
  await openEditor(page, 0)
  await openEditor(other, 3)
  await replaceCode(page, 0, MINE.replace('내코드', '블록영'))
  await replaceCode(other, 3, MINE.replace('내코드', '블록일'))
  await Promise.all([page.clock.runFor(1000), other.clock.runFor(1000)])
  await expect.poll(async () => (await drafts(page, 0)).primary).toContain('블록영')
  await expect.poll(async () => (await drafts(page, 3)).primary).toContain('블록일')
  expect((await drafts(page, 0)).backup).toBeNull()
  expect((await drafts(page, 3)).backup).toBeNull()
})

test('pagehide right after typing, before the debounce, still saves the edit', async ({ page }) => {
  await mockRun(page, () => ({ json: OK }))
  await page.clock.install()
  await openStudy(page, 'c')
  await openEditor(page, 0)
  await freeze(page)
  await replaceCode(page, 0, MINE)
  expect((await drafts(page)).primary).toBeNull() // the debounce has not fired
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  expect((await drafts(page)).primary).toContain('내코드')
})

test('closing a shared view while another tab saved a draft leaves that draft untouched', async ({ page, context, browser }) => {
  await mockRun(page, () => ({ json: OK }))
  await openStudy(page, 'c')
  await openEditor(page, 0)
  await replaceCode(page, 0, MINE)
  await expect.poll(() => draftsRaw(page)).toContain('내코드')
  const url = await makeShareUrl(browser, THEIRS)

  const shared = await context.newPage()
  await shared.clock.install()
  await mockRun(shared, () => ({ json: OK }))
  await shared.goto(url)
  await expect(shared.locator('#code-0 .pg-shared')).toBeVisible()
  await freeze(shared)
  await replaceCode(shared, 0, THEIRS + '// 보는 중 고침\n') // typing in the temporary view
  await saveElsewhere(page, '내코드', '다른탭B')
  const before = await draftsRaw(page)
  await shared.getByRole('button', { name: '내 코드로 돌아가기' }).click()
  await shared.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  await shared.clock.runFor(1000)
  expect(await draftsRaw(page)).toBe(before) // nothing written, no backup invented
  await expect(editorOf(shared, 0)).toContainText('다른탭B')
})

test('a reader with no saved draft can leave a shared view for the original code', async ({ page, browser }) => {
  const url = await makeShareUrl(browser, THEIRS)
  await mockRun(page, () => ({ json: OK }))
  await page.goto(url)
  await expect(page.locator('#code-0 .pg-shared')).toBeVisible()
  await page.getByRole('button', { name: '내 코드로 돌아가기' }).click()
  await expect(editorOf(page, 0)).toContainText("Hello, COM's!")
  expect(await draftsRaw(page)).toBeNull()
})

test('full screen mode is a modal dialog that Escape closes', async ({ page }) => {
  await mockRun(page, () => ({ json: OK }))
  await openStudy(page, 'c')
  await openEditor(page, 0)
  const full = page.locator('#code-0').getByRole('button', { name: '전체 화면' })
  await full.click()
  const stage = page.locator('#code-0')
  await expect(stage).toHaveAttribute('role', 'dialog')
  await expect(stage).toHaveAttribute('aria-modal', 'true')
  await expect(page.locator('.pg-stage.pg-full')).toHaveCount(1)
  await page.locator('#code-0 [data-pg="full"]').focus()
  await page.keyboard.press('Escape')
  await expect(page.locator('.pg-stage.pg-full')).toHaveCount(0)
  await expect(stage).not.toHaveAttribute('role', 'dialog')
})

test('toolbar space is reserved and leaving the page removes everything it added', async ({ page }) => {
  await mockRun(page, () => ({ json: OK }))
  await openStudy(page, 'c')
  const metrics = await page.evaluate(() => {
    const stage = document.querySelector('.pg-stage')
    const pre = stage.querySelector('pre.code')
    const bar = stage.querySelector('.pg-bar')
    return { stage: stage.offsetHeight, pre: pre.offsetHeight, barBottom: bar.getBoundingClientRect().bottom - pre.getBoundingClientRect().top, padTop: parseFloat(getComputedStyle(pre).paddingTop) }
  })
  expect(metrics.stage).toBe(metrics.pre) // the wrapper and the absolutely positioned bar add no height
  expect(metrics.barBottom).toBeLessThanOrEqual(metrics.padTop)
  const total = await page.locator('pre.code').count()
  expect(await page.locator('.pg-stage').count()).toBe(total)
  await page.getByRole('link', { name: /스터디 목록/ }).click()
  await expect(page.locator('.pg-stage')).toHaveCount(0)
  await page.goto('/study/java')
  expect(await page.locator('.pg-stage').count()).toBe(await page.locator('pre.code').count())
})

test.describe('mobile 375px', () => {
  test.use({ viewport: { width: 375, height: 800 }, hasTouch: true })

  test('toolbar fits, the page never scrolls sideways, editing and running work', async ({ page }) => {
    await mockRun(page, () => ({ json: OK }))
    await openStudy(page, 'c')
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(await overflow()).toBeLessThanOrEqual(0)
    await openEditor(page, 0)
    await runBtn(page, 0).click()
    await expect(page.locator('#code-0 .pg-stdout')).toContainText('Hello')
    expect(await overflow()).toBeLessThanOrEqual(0)
    const bar = await page.locator('#code-0 .pg-bar').boundingBox()
    const right = await page.locator('#code-0 [data-pg="copy"]').boundingBox()
    expect(right.x + right.width).toBeLessThanOrEqual(bar.x + bar.width + 1)
  })
})
