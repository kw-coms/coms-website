import { expect, test } from '@playwright/test'
import { mockOptionalApis } from './visualSupport.js'

// The four-group navigation: the panel (keyboard, hover, outside click), every route of the old
// 13-item bar still reachable from the new menu on desktop and on phone, and "자주 가는 곳".

const skipIntro = (page) => page.addInitScript(() => window.sessionStorage.setItem('coms.intro.played:v1', '1'))
const group = (page, name) => page.locator('header nav.nav-groups').getByRole('button', { name, exact: true })
const panel = (page) => page.locator('#nav-panel')

// [group that is opened, entry label, path]: the old bar's routes, then the old Records and Tools menus.
const ROUTES = [
  ['동아리', '소개', '/about'],
  ['동아리', '활동', '/activities'],
  ['배움', '스터디 자료', '/study'],
  ['동아리', '프로젝트', '/projects'],
  ['동아리', '지원', '/recruit'],
  ['멤버', '공지', '/notices'],
  ['동아리', '후원', '/sponsors'],
  ['멤버', '자료실', '/resources'],
  ['멤버', '커뮤니티', '/community'],
  ['도구', '앱', '/apps'],
  ['멤버', '활동 기록', '/activity-log'],
  ['멤버', '월별 일정', '/monthly-calendar'],
  ['멤버', '회지·인기투표', '/activity-events'],
  ['도구', '모임 신청', '/gatherings'],
  ['도구', '일정 조율', '/meet'],
  ['도구', '출석 체크', '/attendance'],
  ['도구', '조 편성·뽑기', '/draw'],
]
const entry = (scope, label) => scope.getByRole('button', { name: new RegExp(`^${label}( \\(회원 전용\\))?$`) })

test.describe('desktop panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await skipIntro(page)
    await mockOptionalApis(page)
  })

  test('opens by keyboard, walks the columns with Tab, and Escape hands focus back', async ({ page }) => {
    await page.goto('/about')
    const toggle = group(page, '배움')
    await toggle.focus()
    await expect(panel(page)).toHaveCount(0)
    await page.keyboard.press('Enter')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(toggle).toHaveAttribute('aria-controls', 'nav-panel')
    await expect(panel(page)).toBeVisible()
    // Focus moves to the first entry of the opened group, and Tab goes on in column order.
    await expect(entry(panel(page), '스터디 자료')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(entry(panel(page), '회로 Lab')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(entry(panel(page), '공지')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(panel(page)).toHaveCount(0)
    await expect(toggle).toBeFocused()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    // Space opens it too.
    await page.keyboard.press('Space')
    await expect(panel(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(toggle).toBeFocused()
  })

  test('Tab out of the panel closes it', async ({ page }) => {
    await page.goto('/about')
    await group(page, '도구').focus()
    await page.keyboard.press('Enter')
    await expect(panel(page)).toBeVisible()
    // Past the last entry the focus leaves the panel for the search button.
    for (let i = 0; i < 5; i += 1) await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: '빠른 이동 열기' }).first()).toBeFocused()
    await expect(panel(page)).toHaveCount(0)
  })

  test('hover opens it after a short delay, and leaving closes it', async ({ page }) => {
    await page.goto('/about')
    await group(page, '멤버').hover()
    await expect(panel(page)).toBeVisible()
    await expect(panel(page).getByRole('region', { name: '멤버' })).toHaveAttribute('data-open', 'true')
    // Moving across the bar to another group switches the emphasised column.
    await group(page, '도구').hover()
    await expect(panel(page).getByRole('region', { name: '도구' })).toHaveAttribute('data-open', 'true')
    // Into the panel: it stays open.
    await panel(page).getByRole('region', { name: '배움' }).hover()
    await page.waitForTimeout(450)
    await expect(panel(page)).toBeVisible()
    await page.mouse.move(700, 800)
    await expect(panel(page)).toHaveCount(0)
  })

  test('a press outside closes it, and a click on the same group toggles it', async ({ page }) => {
    await page.goto('/about')
    await group(page, '동아리').click()
    await expect(panel(page)).toBeVisible()
    await page.mouse.click(700, 880)
    await expect(panel(page)).toHaveCount(0)
    await group(page, '동아리').click()
    await expect(panel(page)).toBeVisible()
    await page.mouse.move(1000, 700)
    await group(page, '동아리').click()
    await expect(panel(page)).toHaveCount(0)
  })

  test('the panel rises in about 250ms, and does not animate under reduced motion', async ({ page }) => {
    await page.goto('/about')
    await group(page, '동아리').click()
    const animation = () => panel(page).evaluate((el) => { const s = getComputedStyle(el); return [s.animationName, s.animationDuration] })
    expect(await animation()).toEqual(['nav-panel-in', '0.25s'])
    await page.keyboard.press('Escape')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await group(page, '동아리').click()
    expect((await animation())[0]).toBe('none')
  })

  for (const [button, label, path] of ROUTES) {
    test(`${label} is reachable from the ${button} group (${path})`, async ({ page }) => {
      await page.goto('/')
      await group(page, button).click()
      await entry(panel(page), label).click()
      await expect(page).toHaveURL(new RegExp(`${path}$`))
      await expect(panel(page)).toHaveCount(0)
    })
  }

  test('Lab is reachable from the 배움 group with a full page load', async ({ page }) => {
    await page.goto('/')
    await group(page, '배움').click()
    const request = page.waitForRequest((r) => r.isNavigationRequest() && new URL(r.url()).pathname === '/lab/')
    await entry(panel(page), '회로 Lab').click()
    await request
  })
})

test.describe('frequent places', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await skipIntro(page)
    await mockOptionalApis(page)
  })

  test('no row until three visits; then the top three, most visited first', async ({ page }) => {
    await page.goto('/about')
    await group(page, '동아리').click()
    await expect(panel(page).getByText('자주 가는 곳')).toHaveCount(0)
    await page.evaluate(() => localStorage.setItem('kwcoms-nav-visits:v1', JSON.stringify({ '/about': 1, '/study': 5, '/projects': 3, '/apps': 2 })))
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await group(page, '배움').click()
    const row = panel(page).locator('.nav-frequent')
    await expect(row.getByText('자주 가는 곳')).toBeVisible()
    await expect(row.getByRole('button')).toHaveText([/스터디 자료/, /프로젝트/, /앱/])
    await row.getByRole('button', { name: /프로젝트/ }).click()
    await expect(page).toHaveURL(/\/projects$/)
  })

  test('menu pages are counted as they are visited, and bad stored data is ignored', async ({ page }) => {
    await page.goto('/about')
    // The visit that loaded the page is counted once the header has mounted; then break the stored data.
    await expect.poll(() => page.evaluate(() => localStorage.getItem('kwcoms-nav-visits:v1'))).toBe('{"/about":1}')
    await page.evaluate(() => localStorage.setItem('kwcoms-nav-visits:v1', 'not json'))
    await group(page, '배움').click()
    await entry(panel(page), '스터디 자료').click()
    await expect(page).toHaveURL(/\/study$/)
    await group(page, '동아리').click()
    await entry(panel(page), '프로젝트').click()
    await expect(page).toHaveURL(/\/projects$/)
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('kwcoms-nav-visits:v1') || '{}'))).toEqual({ '/study': 1, '/projects': 1 })
  })

  test('phone menu shows the same row', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/about')
    await page.evaluate(() => localStorage.setItem('kwcoms-nav-visits:v1', JSON.stringify({ '/study': 5, '/apps': 3 })))
    await page.getByRole('button', { name: '메뉴 열기' }).click()
    // The visit to /about that opened this page is counted too, so it comes third.
    await expect(page.getByRole('region', { name: '자주 가는 곳' }).getByRole('button')).toHaveText([/스터디 자료/, /앱/, /소개/])
  })
})

test.describe('phone menu', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeEach(async ({ page }) => {
    await skipIntro(page)
    await mockOptionalApis(page)
  })

  test('is a full-screen overlay: groups open, page locked, focus trapped, Escape closes', async ({ page }) => {
    await page.goto('/about')
    const toggle = page.getByRole('button', { name: '메뉴 열기' })
    await toggle.click()
    const dialog = page.getByRole('dialog', { name: '메뉴' })
    await expect(dialog).toBeVisible()
    await dialog.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
    const box = await dialog.boundingBox()
    expect(box).toMatchObject({ x: 0, y: 0, width: 390, height: 844 })
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')
    // Focus starts inside and cannot leave: Shift+Tab from the first control wraps to the last.
    await expect(page.getByRole('button', { name: '메뉴 닫기' })).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    for (let i = 0; i < 40; i += 1) await page.keyboard.press('Tab')
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    // Every entry is at least 44px tall.
    const heights = await dialog.locator('.nav-m-item').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
    await expect(toggle).toBeFocused()
  })

  test('the tutorial entry and the login button are in the menu', async ({ page }) => {
    await page.goto('/about')
    await page.getByRole('button', { name: '메뉴 열기' }).click()
    const menu = page.locator('#mobile-menu')
    await expect(menu.getByRole('button', { name: /튜토리얼 시작/ })).toBeVisible()
    await menu.getByRole('button', { name: '로그인', exact: true }).click()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('dialog', { name: '메뉴' })).toHaveCount(0)
  })

  for (const [, label, path] of ROUTES) {
    test(`${label} is reachable from the phone menu (${path})`, async ({ page }) => {
      await page.goto('/')
      await page.getByRole('button', { name: '메뉴 열기' }).click()
      await entry(page.locator('#mobile-menu'), label).click()
      await expect(page).toHaveURL(new RegExp(`${path}$`))
      await expect(page.getByRole('dialog', { name: '메뉴' })).toHaveCount(0)
    })
  }

  test('Lab is reachable from the phone menu with a full page load', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '메뉴 열기' }).click()
    const request = page.waitForRequest((r) => r.isNavigationRequest() && new URL(r.url()).pathname === '/lab/')
    await entry(page.locator('#mobile-menu'), '회로 Lab').click()
    await request
  })
})
