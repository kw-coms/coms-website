import { expect, test } from '@playwright/test'
import { mockOptionalApis } from './visualSupport.js'

// Result frames of the web study (live examples, "직접 해보기" output, the practice preview) must be as tall as
// their content, up to the 640px cap where they scroll inside. The frames have an opaque origin, so Playwright
// measures them through contentFrame().
const CAP = 640

/**
 * The frame's size and its document's, or null when it cannot be read right now. An edit or a run reloads the frame
 * (a fresh document is posted into the sandbox page), and evaluating inside it then fails with "Execution context was
 * destroyed"; that is a moment to retry, not a failure, so every caller reads this through expect.poll.
 */
async function measure(handle) {
  try {
    return await read(handle)
  } catch {
    return null
  }
}

async function read(handle) {
  const box = await handle.boundingBox()
  const inner = await (await handle.contentFrame()).evaluate(() => ({
    scroll: document.documentElement.scrollHeight,
    viewport: innerHeight,
    content: Math.ceil(document.documentElement.getBoundingClientRect().height),
    // the sandbox shell has no <style>; a document the page posted into it always has one (see buildDoc)
    loaded: !!document.querySelector('head style'),
  }))
  return { height: Math.round(box.height), ...inner }
}

/** Not clipped (or at the cap), and tall enough to read: at least min(content, 160). */
function problem(m) {
  const clipped = m.scroll > m.viewport + 1 && m.height < CAP
  const tiny = m.height < Math.min(m.content, 160)
  return clipped || tiny ? m : null
}

/** Poll function: null once the frame shows its document and fits it. */
const settled = (handle) => async () => {
  // the frame may be between two documents: treat that as not loaded
  const m = await measure(handle)
  return m?.loaded ? problem(m) : 'not loaded yet'
}

for (const width of [1440, 375]) {
  test(`every live example frame of the web study fits its content (${width}px)`, async ({ page }) => {
    await mockOptionalApis(page)
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/study/web')
    const demos = page.locator('.study-page .demo')
    await expect(demos.locator('iframe').first()).toBeAttached()
    const count = await demos.count()
    // one frame per demo box the page has (the markup carries data-height on each), not a magic number
    expect(count).toBe(await page.locator('.study-page .demo[data-height]').count())
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      const demo = demos.nth(i)
      await demo.scrollIntoViewIfNeeded()
      const frame = await demo.locator('iframe').elementHandle()
      await expect.poll(settled(frame), { message: `demo #${i}`, timeout: 4000 }).toBeNull()
    }
  })
}

const tall = (n) => Array.from({ length: n }, (_, i) => `<p>줄 ${i + 1}</p>`).join('\n')

/** The practice page of a web problem, with its editor, its preview frame and a size-report log on window.__sizes. */
async function openPractice(page) {
  await mockOptionalApis(page)
  await page.addInitScript(() => {
    window.__sizes = []
    window.addEventListener('message', (e) => { if (e.data && e.data.type === 'size') window.__sizes.push(e.data.h) })
  })
  await page.goto('/study/web/practice/web-html-headings')
  const editor = page.locator('.ex-web-editor .cm-content')
  await expect(editor).toBeVisible()
  const preview = await page.locator('iframe.ex-web-preview').elementHandle()
  const type = async (code) => {
    await editor.click()
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.insertText(code)
    await page.evaluate(() => { window.__sizes.length = 0 })
  }
  return { preview, type }
}

test('the practice preview grows with tall content', async ({ page }) => {
  const { preview, type } = await openPractice(page)
  await type(tall(14))
  await expect.poll(async () => { const m = await measure(preview); return m?.loaded ? m.content : 0 }, { message: 'preview shows the new code', timeout: 5000 }).toBeGreaterThan(300)
  await expect.poll(settled(preview), { timeout: 5000 }).toBeNull()
})

test('a playground output frame fits its content', async ({ page }) => {
  await mockOptionalApis(page)
  await page.goto('/study/web')
  const stage = page.locator('.pg-stage').filter({ has: page.getByRole('button', { name: /직접 해보기/ }) }).first()
  await stage.scrollIntoViewIfNeeded()
  await stage.getByRole('button', { name: /직접 해보기/ }).click()
  await stage.getByRole('button', { name: /실행/ }).first().click()
  const out = await stage.locator('iframe.pg-frame').elementHandle()
  await expect.poll(settled(out), { timeout: 5000 }).toBeNull()
})

test('content that fills its frame exactly (min-height:100vh, no margin) takes at most 2 reports and stays put', async ({ page }) => {
  const { preview, type } = await openPractice(page)
  // a frame scrolled out of view is not rendered by the browser, so it reports nothing until it is seen
  await preview.scrollIntoViewIfNeeded()
  await type('<style>html,body,p{margin:0}body{min-height:100vh;background:#eef}</style><p>안녕</p>')
  // the new document has rendered once it has reported (type() cleared the log after the edit); without this the checks below could run on the old one
  await expect.poll(() => page.evaluate(() => window.__sizes.length), { timeout: 5000 }).toBeGreaterThan(0)
  await expect.poll(async () => { const m = await measure(preview); return m?.loaded ? m.height : Infinity }, { timeout: 5000 }).toBeLessThan(300)
  await page.waitForTimeout(1000)
  expect(await page.evaluate(() => window.__sizes.length)).toBeLessThanOrEqual(2)
})

test('content that follows its own frame height with the default margin grows to the cap and then stops reporting', async ({ page }) => {
  const { preview, type } = await openPractice(page)
  await preview.scrollIntoViewIfNeeded()
  // no fixed point: the frame grows to the cap, stops there, and the reports end
  const t0 = Date.now()
  await type('<style>body{min-height:100vh}</style><p>안녕</p>')
  await expect.poll(async () => (await measure(preview))?.height, { timeout: 10_000 }).toBe(CAP)
  console.log(`100vh ramp to the cap: ${Date.now() - t0}ms, ${await page.evaluate(() => window.__sizes.length)} reports`)
  await page.evaluate(() => { window.__sizes.length = 0 })
  await page.waitForTimeout(1000)
  expect(await page.evaluate(() => window.__sizes.length)).toBe(0)
  await expect.poll(async () => (await measure(preview))?.height, { timeout: 5000 }).toBe(CAP)
})

test('quick successive edits leave the frame as tall as the last content', async ({ page }) => {
  await mockOptionalApis(page)
  await page.goto('/study/web/practice/web-html-headings')
  const editor = page.locator('.ex-web-editor .cm-content')
  await expect(editor).toBeVisible()
  await editor.click()
  // tall, short, tall again, each well inside the 400ms preview debounce, then the tallest
  for (const n of [14, 1, 10, 18]) {
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.insertText(tall(n))
    await page.waitForTimeout(100)
  }
  const preview = await page.locator('iframe.ex-web-preview').elementHandle()
  await expect.poll(async () => { const m = await measure(preview); return m?.loaded ? m.content : 0 }, { timeout: 5000 }).toBeGreaterThan(600)
  await expect.poll(settled(preview), { timeout: 5000 }).toBeNull()
  await expect.poll(async () => { const m = await measure(preview); return !!m?.loaded && m.height >= Math.min(m.content, CAP) }, { timeout: 5000 }).toBe(true)
})
