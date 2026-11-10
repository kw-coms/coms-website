import { expect, test } from '@playwright/test'
import { asMember, mockOptionalApis, trackRequests } from './visualSupport.js'

// Fixes from the public-pages audit: recruit facts, activities for guests, 404, recruit form, next steps,
// quick search over study content, study hub weight.

const SHOTS = '/private/tmp/claude-501/-Users-choi-Documents-project/e43260bf-49ca-468b-9a62-7fea75ac4e6a/scratchpad/fix-public'
const skipIntro = (page) => page.addInitScript(() => window.sessionStorage.setItem('coms.intro.played:v1', '1'))
const setTheme = (page, theme) => page.addInitScript((mode) => { try { localStorage.setItem('kwcoms-theme-mode:v2', mode) } catch { /* storage blocked */ } }, theme)

async function shot(page, name) {
  if (process.env.PUBLIC_SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
}

const VIEWS = [
  { name: '1440', size: { width: 1440, height: 900 } },
  { name: '390', size: { width: 390, height: 844 } },
]

test.describe('recruit facts (item 1)', () => {
  for (const path of ['/recruit', '/recruit-notice']) {
    test(`${path} says what joining involves`, async ({ page }) => {
      await skipIntro(page)
      await mockOptionalApis(page)
      await page.route('**/api/site-settings', (route) => route.fulfill({
        json: { semesterLabel: 's', recruitmentStatus: '60기 모집 중', recruitmentPeriod: '상시 접수', homeHeroTitle: 't', homeHeroCopy: 'c', contactLinks: [{ label: 'Mail', href: 'mailto:kwcoms69@gmail.com' }] },
      }))
      await page.goto(path)
      const facts = page.getByTestId('recruit-facts')
      await expect(facts).toBeVisible()
      await expect(facts).toContainText('마감 없음')
      await expect(facts).toContainText('2만원')
      await expect(facts).toContainText('복지관 403호')
      await expect(page.getByRole('link', { name: /메일로 문의/ }).first()).toHaveAttribute('href', 'mailto:kwcoms69@gmail.com')
      await expect(page.getByRole('link', { name: 'Mail', exact: true })).toHaveCount(0)
    })
  }

  test('/recruit shows the facts before the form, and shows the site settings', async ({ page }) => {
    await skipIntro(page)
    await mockOptionalApis(page)
    await page.route('**/api/site-settings', (route) => route.fulfill({
      json: { semesterLabel: 's', recruitmentStatus: '60기 모집 중', recruitmentPeriod: '상시 접수', homeHeroTitle: 't', homeHeroCopy: 'c', contactLinks: [] },
    }))
    await page.goto('/recruit')
    const facts = page.getByTestId('recruit-facts')
    await expect(facts).toContainText('60기 모집 중')
    await expect(facts).toContainText('상시 접수')
    const factsY = (await facts.boundingBox()).y
    const formY = (await page.getByLabel('이름', { exact: true }).first().boundingBox()).y
    expect(factsY).toBeLessThan(formY)
  })

  test('the /activities banner uses the same facts', async ({ page }) => {
    await mockOptionalApis(page)
    await page.goto('/activities')
    const banner = page.locator('.act-recruit')
    await expect(banner).toContainText('2만원')
    await expect(banner).toContainText('복지관 403호')
  })
})

test.describe('/activities for guests (items 2, 3)', () => {
  test('no drafting notes and no meeting agenda; every entry stays', async ({ page }) => {
    await mockOptionalApis(page)
    await page.goto('/activities')
    const timeline = page.locator('#timeline')
    await expect(page.locator('#act-fall').getByRole('heading', { name: '개강총회' })).toBeVisible()
    await expect(page.locator('#act-fall').getByRole('heading', { name: 'MT', exact: true })).toBeVisible()
    await expect(timeline).not.toContainText('확인하지 못했습니다')
    await expect(timeline).not.toContainText('자료를 기준')
    await expect(timeline).not.toContainText('안건')
    await expect(timeline).toContainText('날짜는 미정입니다')
    expect(await timeline.locator('.act-card-title').count()).toBeGreaterThanOrEqual(12)
  })

  test('a member sees the agenda line', async ({ page }) => {
    await mockOptionalApis(page)
    await asMember(page)
    await page.route('**/member-media/**', (route) => route.fulfill({ status: 404, body: '' }))
    await page.goto('/activities')
    await expect(page.locator('#timeline')).toContainText('안건: 동아리방 이용 규칙 개정안')
    await expect(page.getByTestId('act-photo-notice')).toHaveCount(0)
  })

  test('one login notice, quiet slots that are not focusable, no photo request', async ({ page }) => {
    const photoRequests = trackRequests(page, /\/member-media\//)
    await mockOptionalApis(page)
    await page.goto('/activities')
    const notice = page.getByTestId('act-photo-notice')
    await expect(notice).toBeVisible()
    await expect(page.getByText('로그인하면 활동 사진을 볼 수 있어요')).toHaveCount(1)
    await expect(page.locator('#timeline a[href="/login"]')).toHaveCount(1)
    await expect(notice.getByRole('link', { name: '로그인' })).toHaveAttribute('href', '/login')
    const slots = page.locator('#timeline .act-photo-locked')
    expect(await slots.count()).toBeGreaterThanOrEqual(12)
    // Slots keep their size and carry nothing focusable.
    const box = await slots.first().boundingBox()
    expect(box.height).toBeGreaterThan(80)
    await expect(page.locator('#timeline .act-photo-locked a, #timeline .act-photo-locked button')).toHaveCount(0)
    await expect(slots.first()).toHaveAttribute('aria-hidden', 'true')
    expect(photoRequests).toEqual([])
  })

  for (const theme of ['light', 'dark']) {
    for (const view of VIEWS) {
      test(`screenshot ${theme} ${view.name}`, async ({ page }) => {
        await page.setViewportSize(view.size)
        await setTheme(page, theme)
        await mockOptionalApis(page)
        await page.goto('/activities')
        await expect(page.getByTestId('act-photo-notice')).toBeVisible()
        await shot(page, `activities-${theme}-${view.name}`)
        await page.goto('/recruit')
        await expect(page.getByTestId('recruit-facts')).toBeVisible()
        await shot(page, `recruit-${theme}-${view.name}`)
        await page.goto('/recruit-notice')
        await expect(page.getByTestId('recruit-facts')).toBeVisible()
        await shot(page, `recruit-notice-${theme}-${view.name}`)
      })
    }
  }
})

test.describe('404 page (item 4)', () => {
  test('is noindex only while mounted, and offers next steps', async ({ page }) => {
    await skipIntro(page)
    await mockOptionalApis(page)
    await page.goto('/no-such-page')
    await expect(page.getByRole('heading', { name: '페이지를 찾을 수 없어요' })).toBeVisible()
    await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(1)
    const steps = page.getByRole('navigation', { name: '이런 페이지는 어때요' })
    for (const group of ['동아리', '배움', '멤버', '도구']) await expect(steps.getByText(group, { exact: true })).toBeVisible()
    await expect(steps.getByRole('link', { name: '소개' })).toHaveAttribute('href', '/about')
    await page.getByRole('button', { name: '빠른 검색' }).click()
    await expect(page.getByRole('dialog', { name: /빠른 이동/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await steps.getByRole('link', { name: '소개' }).click()
    await expect(page).toHaveURL(/\/about$/)
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
  })

  for (const theme of ['light', 'dark']) {
    for (const view of VIEWS) {
      test(`screenshot 404 ${theme} ${view.name}`, async ({ page }) => {
        await page.setViewportSize(view.size)
        await skipIntro(page)
        await setTheme(page, theme)
        await mockOptionalApis(page)
        await page.goto('/no-such-page')
        await expect(page.getByRole('navigation', { name: '이런 페이지는 어때요' })).toBeVisible()
        await shot(page, `404-${theme}-${view.name}`)
      })
    }
  }
})
