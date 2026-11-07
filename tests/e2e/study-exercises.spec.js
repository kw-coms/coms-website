import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mockOptionalApis } from './visualSupport.js'

test('fixture build includes sample exercises when requested', async ({ page }) => {
  test.skip(process.env.STUDY_EXERCISE_FIXTURES !== '1', 'requires the opt-in study exercise fixtures')
  await page.goto('/study/c/practice/sample-echo')
  await expect(page.getByRole('heading', { name: '첫 인사 출력하기' })).toBeVisible()
})

// These examples are included only in a fixture build. Run with
// STUDY_EXERCISE_FIXTURES=1 for both `npm run build` and `playwright test`.
test.skip(process.env.STUDY_EXERCISE_FIXTURES !== '1', 'requires the opt-in study exercise fixtures')
test.use({ reducedMotion: 'reduce' })

const result = (stdout) => ({ stdout, stderr: '', exitCode: 0, signal: null, timedOut: false, truncated: false, timeMs: 12 })

async function mockGrader(page) {
  await mockOptionalApis(page)
  const calls = []
  await page.route('**/study/api/run', async (route) => {
    const body = route.request().postDataJSON()
    calls.push(body)
    const correctGreeting = body.code.includes('안녕, %s')
    const correctSquare = body.code.includes('return n * n')
    const output = (input) => {
      if (body.code.includes('square(')) return result(correctSquare ? `${Number(input.trim()) ** 2}\n` : '0\n')
      const name = input.trim()
      return result(correctGreeting ? `안녕, ${name}\n` : `${name}\n`)
    }
    const json = Array.isArray(body.tests)
      ? { ok: true, stage: 'run', stderr: '', diagnostics: [], timeMs: 50, results: body.tests.map(output) }
      : { ok: true, stage: 'run', diagnostics: [], ...output(body.stdin ?? '') }
    await route.fulfill({ status: 200, json })
  })
  return calls
}

async function replaceEditor(page, selector, code) {
  const editor = page.locator(selector)
  await expect(editor).toBeVisible()
  await editor.click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText(code)
}

test('wrong greeting shows a failing case and diff, then correct submission persists as solved', async ({ page }) => {
  const calls = await mockGrader(page)
  await page.goto('/study/c/practice')
  await expect(page.getByRole('heading', { name: 'C 기초 실습 문제' })).toBeVisible()
  await page.getByRole('link', { name: /첫 인사 출력하기/ }).last().click()
  await expect(page.getByRole('heading', { name: '첫 인사 출력하기' })).toBeVisible()
  await page.getByRole('button', { name: '제출', exact: true }).click()
  await expect(page.locator('[data-ex-result-summary]')).toContainText('0/4 통과')
  await expect(page.locator('.ex-case').first()).toContainText('오답')
  await expect(page.locator('.ex-case').first()).toContainText('안녕, 민수')
  await expect(page.locator('.ex-case').first().locator('.ex-diff')).toBeVisible()

  await replaceEditor(page, '.ex-editor .cm-content', '#include <stdio.h>\nint main(void) { char name[100]; scanf("%99s", name); printf("안녕, %s\\n", name); return 0; }\n')
  await page.getByRole('button', { name: '제출', exact: true }).click()
  await expect(page.locator('[data-ex-result-summary]')).toContainText('4/4 통과')
  await expect(page.getByText('문제를 해결했어요')).toBeVisible()
  await expect.poll(() => calls.filter((body) => Array.isArray(body.tests)).length).toBe(2)
  expect(calls.filter((body) => Array.isArray(body.tests)).every((body) => body.tests.length === 4)).toBe(true)
  await page.goto('/study/c/practice')
  await expect(page.getByRole('link', { name: /첫 인사 출력하기/ }).last()).toContainText('✓')
})

test('function submission sends the harness and grades the student function', async ({ page }) => {
  const calls = await mockGrader(page)
  await page.goto('/study/c/practice/sample-function')
  await expect(page.getByRole('heading', { name: '제곱 함수 만들기' })).toBeVisible()
  await replaceEditor(page, '.ex-editor .cm-content', 'int square(int n) { return n * n; }')
  await page.getByRole('button', { name: '제출', exact: true }).click()
  await expect(page.locator('[data-ex-result-summary]')).toContainText('4/4 통과')
  const submission = calls.find((body) => Array.isArray(body.tests))
  expect(submission.code).toContain('int main(void)')
  expect(submission.code).toContain('return n * n')
  expect(submission.code).not.toContain('/*@USER@*/')
})

test('web checks fail on starter CSS and pass after editing in the real sandbox', async ({ page }) => {
  await mockOptionalApis(page)
  await page.goto('/study/web/practice/sample-web-heading')
  await expect(page.locator('iframe.ex-web-preview')).toBeVisible()
  await expect(page.locator('iframe.ex-web-preview').contentFrame().getByText('안녕하세요')).toBeVisible()
  await page.locator('.ex-web').getByRole('button', { name: '제출', exact: true }).click()
  await expect(page.locator('.ex-web-results')).toContainText('파란색 확인')
  await expect(page.locator('.ex-web-results')).toContainText('실패')
  await page.locator('.ex-web-tabs').getByRole('tab', { name: 'CSS' }).click()
  await replaceEditor(page, '.ex-web-editor .cm-content', 'h1 { color: blue; }')
  await page.locator('.ex-web').getByRole('button', { name: '제출', exact: true }).click()
  await expect(page.locator('.ex-web-results')).toContainText('통과')
  await expect(page.locator('.ex-web-results')).not.toContainText('실패')
})

test('shared web code stays idle until Run is clicked', async ({ page }) => {
  await mockOptionalApis(page)
  const files = { html: '<p id="shared-preview-marker">공유 실행 확인</p>', css: '', js: 'window.sharedCodeRan = true' }
  const hash = `#pg=0.${Buffer.from(JSON.stringify(files)).toString('base64url')}`
  await page.goto(`/study/web/practice/sample-web-heading${hash}`)
  await expect(page.locator('.ex-web-shared')).toBeVisible()
  await expect(page.locator('.ex-web-status')).toHaveText('공유된 코드는 실행 버튼을 눌러야 미리보기가 돼요')
  await page.waitForTimeout(650)
  await expect(page.locator('iframe.ex-web-preview')).not.toHaveAttribute('src', /study-sandbox/)
  await page.locator('.ex-web').getByRole('button', { name: '실행', exact: true }).click()
  await expect(page.locator('iframe.ex-web-preview').contentFrame().locator('#shared-preview-marker')).toHaveText('공유 실행 확인')
})

test('practice page fits a mobile viewport without horizontal scrolling', async ({ page }) => {
  await mockGrader(page)
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/study/c/practice/sample-echo')
  await expect(page.locator('.ex-editor .cm-content')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
  await page.screenshot({ path: 'test-results/study-exercises-mobile.png', fullPage: true })
})

test('practice problem has no serious or critical axe violations', async ({ page }) => {
  await mockGrader(page)
  await page.goto('/study/c/practice/sample-echo')
  await expect(page.locator('.ex-editor .cm-content')).toBeVisible()
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const blocking = violations.filter((entry) => ['serious', 'critical'].includes(entry.impact))
  expect(blocking, blocking.map((entry) => `${entry.id}: ${entry.nodes.length} nodes`).join('\n')).toEqual([])
  await page.screenshot({ path: 'test-results/study-exercises-desktop.png', fullPage: true })
})

test('inline chapter cards cap at four and open a persistent removable chapter filter', async ({ page }) => {
  await mockOptionalApis(page)
  await page.goto('/study/c/practice')
  const chapterSelect = page.getByRole('combobox', { name: '장', exact: true })
  await chapterSelect.selectOption('loop')
  const rows = page.locator('.ex-list .ex-row')
  const chapterHrefs = await rows.evaluateAll(links => links.map(link => link.getAttribute('href')))
  expect(chapterHrefs.length).toBeGreaterThan(4)

  await page.goto('/study/c')
  const cards = page.locator('section[id] .ex-inline')
  await expect(cards.first()).toBeVisible()
  for (const card of await cards.all()) {
    expect(await card.locator('li').count()).toBeLessThanOrEqual(4)
  }
  const loopCard = page.locator('section#loop .ex-inline')
  await expect(loopCard.locator('li')).toHaveCount(4)
  const fullList = loopCard.getByRole('link', { name: `이 장 문제 전체 ${chapterHrefs.length}개 →`, exact: true })
  await expect(fullList).toHaveAttribute('href', '/study/c/practice?chapter=loop')
  await fullList.click()
  await expect(page).toHaveURL(/\/study\/c\/practice\?chapter=loop$/)
  await expect(chapterSelect).toHaveValue('loop')
  await expect(rows).toHaveCount(chapterHrefs.length)
  expect(await rows.evaluateAll(links => links.map(link => link.getAttribute('href')))).toEqual(chapterHrefs)
  const chip = page.getByRole('button', { name: '장 필터 해제: loop' })
  await expect(chip).toBeVisible()

  await page.reload()
  await expect(chapterSelect).toHaveValue('loop')
  await expect(rows).toHaveCount(chapterHrefs.length)
  await chip.click()
  await expect(chapterSelect).toHaveValue('')
  await expect(chip).toHaveCount(0)
  await expect(page).toHaveURL(/\/study\/c\/practice$/)
  expect(await rows.count()).toBeGreaterThan(chapterHrefs.length)
  await page.goBack()
  await expect(chapterSelect).toHaveValue('loop')
  await expect(chip).toBeVisible()
  await expect(rows).toHaveCount(chapterHrefs.length)
  await page.goForward()
  await expect(chapterSelect).toHaveValue('')
  await expect(chip).toHaveCount(0)

  // Changing/removing a chapter preserves unrelated URL parameters.
  await page.goto('/study/c/practice?chapter=loop&source=lesson')
  await chapterSelect.selectOption('array')
  await expect(page).toHaveURL(/chapter=array&source=lesson$/)
  await page.getByRole('button', { name: '장 필터 해제: array' }).click()
  await expect(page).toHaveURL(/\?source=lesson$/)
})
