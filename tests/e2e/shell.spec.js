import { expect, test } from '@playwright/test'
import { mockActivityTimeline, mockAdminApis, mockOptionalApis } from './visualSupport.js'
import { doneEvent, summary } from '../hackathonFixture.mjs'

test.beforeEach(async ({ page }) => {
  await mockOptionalApis(page)
  await page.addInitScript(() => sessionStorage.setItem('coms.intro.played:v1', '1'))
})

test.describe('mobile tap targets', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' })

  const surfaces = [
    ['/', '.scene-frame__link, .scene-hubcard__link, .scene-chip'],
    ['/signup', '#main-content .apple-action-secondary, #main-content form button, #main-content form input:not([type="hidden"])'],
    ['/hackathon', '.hackathon-card'],
    ['/sponsors', 'a[href="https://example.com/sponsor"], a[href="https://example.com/contact"], a[href="mailto:sponsors@example.com"]'],
    ['/activities', '.apple-mobile-tab, .apple-detail-home-button, .act-guest-note a, .act-jump a, .act-recruit-link'],
  ]

  for (const [path, selector] of surfaces) {
    test(`${path} controls are at least 44 by 44 at 390px`, async ({ page }) => {
      await mockActivityTimeline(page)
      await page.route('**/api/site-settings', (route) => route.fulfill({ json: {} }))
      await page.route('**/api/hackathon/events', (route) => route.fulfill({ json: [summary(doneEvent)] }))
      await page.route('**/api/sponsors/page', (route) => route.fulfill({ json: {
        settings: { howToSection: { contactLink: 'https://example.com/contact', contactEmail: 'sponsors@example.com' } },
      } }))
      if (path === '/sponsors') {
        await mockAdminApis(page)
        await page.route('**/api/sponsors', (route) => route.fulfill({ json: [{
          id: 1, name: '후원', sponsors: [{ id: 1, name: '테스트 후원자', linkUrl: 'https://example.com/sponsor', anonymous: false }],
        }] }))
      }
      await page.goto(path)

      const skip = page.getByRole('link', { name: '본문으로 건너뛰기' })
      await skip.focus()
      await expect(skip).toBeInViewport()
      const targets = page.locator(`${selector}, .coms-skip-link, .coms-quick-open, .apple-global-nav-menu, .coms-footer-link`)
      await expect(page.locator(selector).first()).toBeVisible()
      if (path === '/sponsors') await expect(page.locator(selector)).toHaveCount(3)
      const tooSmall = await targets.evaluateAll((nodes) => nodes.flatMap((node) => {
        const { width, height } = node.getBoundingClientRect()
        if (!width || !height || (width >= 44 && height >= 44)) return []
        return [`${node.textContent.trim() || node.getAttribute('aria-label') || node.id}: ${width}×${height}`]
      }))
      expect(tooSmall).toEqual([])
    })
  }

  test('the last activities card can scroll above both floating buttons', async ({ page }) => {
    await mockActivityTimeline(page)
    await page.route('**/api/site-settings', (route) => route.fulfill({ json: {} }))
    await page.goto('/activities')
    const main = page.locator('.activities-page main')
    const card = main.locator('.coms-cta').last()
    await expect(card).toBeVisible()
    await main.evaluate((node) => window.scrollBy(0, node.getBoundingClientRect().bottom - window.innerHeight))
    await expect(page.locator('.coms-to-top.is-visible')).toBeVisible()
    await expect(page.getByRole('button', { name: '질문하기' })).toBeVisible()
    await expect.poll(() => card.evaluate((node) => {
      const top = document.querySelector('.coms-to-top.is-visible')
      const chat = document.querySelector('.coms-ask-trigger')
      return node.getBoundingClientRect().bottom <= Math.min(top.getBoundingClientRect().top, chat.getBoundingClientRect().top)
    })).toBe(true)
  })
})

const headers = [
  ['/about', '함께 배우고, 바로 만듭니다.', '동아리 소개'],
  ['/activities', '배움이 매주 쌓이고, 서로에게 남습니다.', '활동'],
  ['/projects', '아이디어를 실제 서비스와 제작물로.', '프로젝트'],
  ['/apps', "COM's 작품", '작품'],
  ['/study', '스터디 자료', '스터디'],
  ['/study/c', 'C 기초', 'C 기초'],
  ['/signup', "COM's 회원가입", '회원가입'],
  ['/recruit', "COM's 지원하기", '지원하기'],
  ['/recruit-notice', "COM's 신입 부원 모집 공지", '모집 공지'],
]

test('inner pages keep one original h1 and a route HUD', async ({ page }) => {
  for (const [path, title, crumb] of headers) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
    await expect(page.locator('.page-crumb')).toHaveText(`COM'S / ${crumb}`)
    await expect(page.locator('h1')).toHaveClass(/cine-lines/)
    await expect(page.locator('h1')).toHaveCSS('font-weight', '700')
  }
})

for (const width of [1440, 390]) for (const theme of ['light', 'dark']) for (const mode of ['full', 'lite', 'reduce']) {
  test(`${width}px ${theme} ${mode}: headers and footer remain readable without overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: mode === 'reduce' ? 'reduce' : 'no-preference' })
    await page.addInitScript(({ theme, mode }) => {
      localStorage.setItem('kwcoms-theme-mode:v2', theme)
      localStorage.setItem('kwcoms-perf-mode:v1', mode === 'lite' ? 'lite' : 'full')
    }, { theme, mode })
    for (const path of ['/activities', '/apps', '/study']) {
      await page.goto(path)
      const title = page.locator('h1')
      await expect(title).toBeVisible()
      await expect(title.locator('.cine-m > span')).toHaveCSS('transform', 'none')
      await expect(page.locator('#main-content')).toHaveCSS('transform', 'none')
      if (mode === 'full') {
        await expect(page.locator('#main-content')).toHaveCSS('animation-duration', '0.45s')
        await expect(page.locator('#main-content')).toHaveCSS('animation-fill-mode', 'backwards')
      }
      if (mode !== 'full') await expect(page.locator('#main-content')).toHaveCSS('animation-name', 'none')
      const sitemap = page.getByRole('navigation', { name: '사이트맵' })
      await sitemap.scrollIntoViewIfNeeded()
      await expect(sitemap).toBeVisible()
      const columns = await sitemap.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
      expect(columns).toBe(width === 390 ? 2 : 4)
      await page.locator('.coms-footer-wordmark').scrollIntoViewIfNeeded()
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
      const cards = page.locator('.coms-card, .apple-product-panel.app-card, .study-card')
      for (const card of await cards.all()) {
        await expect(card).toHaveCSS('box-shadow', 'none')
        await expect(card).toHaveCSS('border-top-width', '0px')
      }
    }
  })
}

test('a member lesson keeps its original title and the shared reveal', async ({ page }) => {
  await mockAdminApis(page)
  await page.goto('/study/c')
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1, name: '처음 배우는 C 언어 변수부터 포인터까지' })).toBeVisible()
  await expect(page.locator('.page-crumb')).toHaveText("COM'S / 스터디 · C 101") // the lesson file's own crumb, with its course code
  await expect(page.locator('h1 .cine-m > span')).toHaveCSS('transform', 'none')
  await expect(page.locator('h1')).toHaveCSS('font-weight', '700')
})

test('editing a notice preserves the changing h1 and does not reveal it twice', async ({ page }) => {
  await mockAdminApis(page)
  await page.goto('/notices')
  await expect(page.getByRole('heading', { level: 1, name: '공지사항', exact: true })).toBeVisible()
  await expect(page.locator('h1')).toHaveClass(/is-revealed/)
  await page.getByRole('button', { name: '공지 작성', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1, name: '공지 작성', exact: true })).toBeVisible()
  await expect(page.locator('h1')).toHaveClass(/is-revealed/)
  await expect(page.locator('.page-crumb')).toHaveText("COM'S / 공지사항")
})

test('calmer mobile cards retain a visible keyboard focus cue', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockAdminApis(page)
  await page.route('**/api/notices', (route) => route.fulfill({ json: [{ id: 8, title: '공지 포커스 점검', content: '', category: 'GENERAL', createdAt: '2026-11-01T10:00:00' }] }))
  await page.route('**/api/community/posts{,?*}', (route) => route.fulfill({ json: [{ id: 9, title: '게시글 포커스 점검', content: '', category: 'GENERAL', authorName: '작성자', createdAt: '2026-11-01T10:00:00', viewCount: 0, commentCount: 0 }] }))
  for (const [path, selector] of [['/notices', '.notice-mobile-card'], ['/community', '.community-post-card-mobile']]) {
    await page.goto(path)
    const card = page.locator(selector).first()
    await expect(card).toBeVisible()
    await page.keyboard.press('Tab')
    await card.focus()
    await expect(card).toBeFocused()
    await expect(card).toHaveCSS('outline-style', 'solid')
    await expect(card).toHaveCSS('outline-width', '2px')
  }
})
