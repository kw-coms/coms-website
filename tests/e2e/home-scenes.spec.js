import { expect, test } from '@playwright/test'
import { mockAdminApis, mockOptionalApis } from './visualSupport.js'

// The home page is a film in scenes (docs/design/specs/2026-11-10-cinematic-redesign.md).
// These checks cover what a visitor sees and what must hold under every switch: reduced
// motion and lite mode show every scene's text at once, and no width overflows the page.

const skipIntro = (page) => page.addInitScript(() => {
  try { sessionStorage.setItem('coms.intro.played:v1', '1') } catch { /* ignore */ }
})

const forceLite = (page) => page.addInitScript(() => {
  try { localStorage.setItem('kwcoms-perf-mode:v1', 'lite') } catch { /* ignore */ }
})

// Every element of the page that carries its own text, with how visible it is: the product of
// its own and its ancestors' opacity, and whether a transform or clip-path still hides it.
const hiddenTextElements = (page) => page.evaluate(() => {
  const hidden = []
  for (const el of document.querySelectorAll('main *')) {
    const ownText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim())
    // Screen-reader-only text is meant to be 1px.
    if (!ownText || el.classList.contains('sr-only')) continue
    let opacity = 1
    let clipped = false
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const cs = getComputedStyle(node)
      opacity *= Number(cs.opacity)
      if (cs.clipPath !== 'none') clipped = true
    }
    const rect = el.getBoundingClientRect()
    const mask = el.closest('.cine-m')
    const risen = !mask || getComputedStyle(el.closest('.cine-m > span') ?? el).transform === 'none'
    if (opacity < 0.99 || clipped || !risen || rect.width < 2 || rect.height < 2) {
      hidden.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} "${el.textContent.trim().slice(0, 24)}" opacity=${opacity} clipped=${clipped} risen=${risen} ${Math.round(rect.width)}x${Math.round(rect.height)}`)
    }
  }
  return hidden
})

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

test.describe('a visitor on the home page', () => {
  test.beforeEach(async ({ page }) => {
    await mockOptionalApis(page)
    await skipIntro(page)
    await page.goto('/')
  })

  test('sees the story, "멤버가 되면", and neither a calendar nor a member shortcut grid', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: "COM's" })).toBeVisible()
    await expect(page.getByRole('heading', { name: '멤버가 되면' })).toBeAttached()
    await expect(page.getByRole('heading', { name: '동아리 일정 캘린더' })).toHaveCount(0)
    await expect(page.locator('.coms-tools-grid')).toHaveCount(0)
    // The scenes come in the story's order, with the members scene just before the finale.
    const ids = await page.locator('main > section').evaluateAll((els) => els.map((el) => el.id))
    expect(ids).toEqual(['opening', 'about', 'activities', 'projects', 'members', 'recruit'])
  })

  test('can be linked to by the four section hashes', async ({ page }) => {
    for (const id of ['about', 'activities', 'projects', 'recruit']) {
      await expect(page.locator(`section#${id}`)).toHaveCount(1)
    }
  })

  test('has a scene rail that scrolls to a scene', async ({ page }) => {
    const rail = page.getByRole('navigation', { name: '장면 이동' })
    await expect(rail.getByRole('button')).toHaveCount(6)
    await rail.getByRole('button', { name: '04 프로젝트' }).click()
    await expect(page.locator('#projects')).toBeInViewport()
    await expect(rail.getByRole('button', { name: '04 프로젝트' })).toHaveAttribute('aria-current', 'true')
  })

  test('has no horizontal overflow at 1440 and 390', async ({ page }) => {
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      await page.setViewportSize({ width, height })
      await page.goto('/')
      await page.evaluate(async () => {
        for (let y = 0; y <= document.body.scrollHeight; y += 700) {
          window.scrollTo(0, y)
          await new Promise((resolve) => setTimeout(resolve, 40))
        }
      })
      expect(await overflow(page), `${width}px`).toBeLessThanOrEqual(0)
    }
  })

  test('the manifesto stays pinned while its words light up, then lets go', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    const track = page.locator('.scene-about__track')
    const title = page.locator('.scene-about__pin h2')
    const first = page.locator('.scene-about__pin .cine-w').first()
    const last = page.locator('.scene-about__pin .cine-w').last()
    const top = await track.evaluate((el) => el.getBoundingClientRect().top + window.scrollY)
    const span = await track.evaluate((el) => el.offsetHeight - window.innerHeight)
    const at = async (progress) => {
      await page.evaluate((y) => window.scrollTo(0, y), top + progress * span)
      await page.waitForTimeout(150)
    }
    await at(0.05)
    const y1 = (await title.boundingBox()).y
    const earlyLast = await last.evaluate((el) => getComputedStyle(el).color)
    await at(0.6)
    const y2 = (await title.boundingBox()).y
    expect(Math.abs(y1 - y2)).toBeLessThanOrEqual(1)
    await at(1)
    const lateLast = await last.evaluate((el) => getComputedStyle(el).color)
    const firstColor = await first.evaluate((el) => getComputedStyle(el).color)
    expect(lateLast).not.toBe(earlyLast)
    expect(lateLast).toBe(firstColor)
  })
})

for (const [label, setup] of [
  ['reduced motion', async (page) => { await page.emulateMedia({ reducedMotion: 'reduce' }) }],
  ['lite mode', async (page) => { await forceLite(page) }],
]) {
  test.describe(`with ${label}`, () => {
    test('every scene is plain flow with all its text visible, no scrolling tricks needed', async ({ page }) => {
      await setup(page)
      await mockOptionalApis(page)
      await skipIntro(page)
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto('/')
      await page.waitForTimeout(500)
      // No pin: the manifesto's track is as tall as its content, not 180vh.
      expect(await page.locator('.scene-about__pin').evaluate((el) => getComputedStyle(el).position)).toBe('static')
      // Straight from load, without scrolling an inch: nothing is left transparent, clipped or lowered.
      expect(await hiddenTextElements(page)).toEqual([])
      // The grain is off.
      await expect(page.locator('.cine-grain')).toBeHidden()
      expect(await overflow(page)).toBeLessThanOrEqual(0)
    })
  })
}


test('a member\'s latest-notice buttons appear after a slow notices response', async ({ page }) => {
  await mockAdminApis(page)
  await skipIntro(page)
  // Later routes win: the notices arrive well after the first scan of reveal elements.
  await page.route('**/api/notices', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200))
    await route.fulfill({ json: [{ id: 3, title: '늦게 도착한 공지', content: '', category: 'GENERAL', createdAt: '2026-11-01T10:00:00' }] })
  })
  await page.goto('/')
  const lead = page.locator('.scene-notice--lead')
  await expect(lead).toBeAttached({ timeout: 8000 })
  await lead.scrollIntoViewIfNeeded()
  await expect(lead).toHaveCSS('opacity', '1')
  await expect(page.locator('.scene-notice').first()).toHaveCSS('opacity', '1')
})

// The rail names the scene under the middle of the viewport, scrolling down and back up, with the
// tall pinned manifesto and with the member's order (the members scene second).
for (const [width, height] of [[1440, 900], [1280, 720]]) {
  for (const who of ['guest', 'member']) {
    test(`the scene rail follows the middle of the viewport at ${width}x${height}, ${who}`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      if (who === 'member') await mockAdminApis(page)
      else await mockOptionalApis(page)
      await skipIntro(page)
      await page.goto('/')
      const rail = page.getByRole('navigation', { name: '장면 이동' })
      await expect(rail.getByRole('button')).toHaveCount(6)
      const ids = await page.locator('main > section').evaluateAll((els) => els.map((el) => el.id))
      const total = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
      const stops = []
      for (let y = 0; y <= total; y += 240) stops.push(y)
      stops.push(total)
      const seen = new Set()
      for (const y of [...stops, ...[...stops].reverse()]) {
        await page.evaluate((to) => window.scrollTo(0, to), y)
        // The scene whose box holds the middle line.
        const expected = await page.evaluate(() => {
          const middle = window.innerHeight / 2
          return [...document.querySelectorAll('main > section')].find((el) => { const r = el.getBoundingClientRect(); return r.top <= middle && middle < r.bottom })?.id
        })
        if (!expected) continue
        seen.add(expected)
        const index = ids.indexOf(expected)
        await expect(rail.getByRole('button').nth(index), `y=${y} scene ${expected}`).toHaveAttribute('aria-current', 'true')
        await expect(rail.locator('[aria-current="true"]')).toHaveCount(1)
      }
      expect([...seen].sort()).toEqual([...ids].sort())
    })
  }
}
