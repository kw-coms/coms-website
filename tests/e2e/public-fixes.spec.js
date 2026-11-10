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

test.describe('recruit form (item 5)', () => {
  async function open(page) {
    await skipIntro(page)
    await mockOptionalApis(page)
    await page.goto('/recruit')
    await expect(page.getByLabel('이름', { exact: true }).first()).toBeVisible()
  }
  const form = (page) => page.locator('form').filter({ has: page.locator('#motive') })
  async function fillValid(page) {
    await page.locator('#name').fill('홍길동')
    await page.locator('#studentId').fill('2026123456')
    await page.locator('#department').fill('컴퓨터정보공학부')
    await page.locator('#phone').fill('010-1234-5678')
    await page.locator('#email').fill('gil@example.com')
    await page.locator('#motive').fill('함께 배우고 싶어요')
    await page.locator('#expectation').fill('스터디')
  }

  test('bad phone and e-mail get messages tied to their fields, and focus goes to the first', async ({ page }) => {
    await open(page)
    await fillValid(page)
    await page.locator('#phone').fill('1234')
    await page.locator('#email').fill('not-an-email')
    await form(page).getByRole('button', { name: '지원서 제출하기' }).click()
    await expect(page.locator('#phone')).toBeFocused()
    await expect(page.locator('#phone')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.locator('#phone')).toHaveAttribute('aria-describedby', 'phone-error')
    await expect(page.locator('#phone-error')).toContainText('전화번호 형식')
    await expect(page.locator('#email')).toHaveAttribute('aria-describedby', 'email-error')
    await expect(page.locator('#email-error')).toContainText('이메일 형식')
    await expect(page.locator('#consent-error')).toContainText('동의')
  })

  test('accepts Korean mobile and landline numbers, rejects others', async ({ page }) => {
    await open(page)
    await fillValid(page)
    await form(page).getByRole('button', { name: '지원서 제출하기' }).click()
    await expect(page.locator('#phone-error')).toHaveCount(0)
    for (const bad of ['010-12-5678', '0101234567890', '12345678', '010-abcd-5678', '010--1234-5678']) {
      await page.locator('#phone').fill(bad)
      await form(page).getByRole('button', { name: '지원서 제출하기' }).click()
      await expect(page.locator('#phone-error'), bad).toBeVisible()
    }
    for (const good of ['01012345678', '010-1234-5678', '011-123-4567', '02-123-4567', '02-1234-5678', '031-123-4567']) {
      await page.locator('#phone').fill(good)
      await form(page).getByRole('button', { name: '지원서 제출하기' }).click()
      await expect(page.locator('#phone-error'), good).toHaveCount(0)
    }
  })

  test('the personal-data notice lists the items, and consent is required', async ({ page }) => {
    let posts = 0
    await page.route('**/api/recruit/apply', (route) => { posts += 1; return route.fulfill({ status: 201, json: {} }) })
    await open(page)
    const notice = page.getByText('개인정보 수집·이용 안내').locator('..')
    for (const item of ['이름', '학번', '전화번호', '이메일', '지원 동기']) await expect(notice).toContainText(item)
    await expect(notice).toContainText('삭제')
    await fillValid(page)
    await form(page).getByRole('button', { name: '지원서 제출하기' }).click()
    await expect(page.locator('#consent')).toBeFocused()
    expect(posts).toBe(0)
  })

  test('after submit the form is replaced by a confirmation, and 다른 지원서 작성 resets it', async ({ page }) => {
    const bodies = []
    await page.route('**/api/recruit/apply', (route) => { bodies.push(route.request().postDataJSON()); return route.fulfill({ status: 201, json: {} }) })
    await open(page)
    await fillValid(page)
    await page.locator('#consent').check()
    await form(page).getByRole('button', { name: '지원서 제출하기' }).click()
    const done = page.getByRole('status').filter({ hasText: '지원서를 접수했어요' })
    await expect(done).toContainText('gil@example.com')
    await expect(done).toContainText('확인 메일')
    await expect(page.getByRole('button', { name: '지원서 제출하기' })).toHaveCount(0)
    expect(bodies).toHaveLength(1)
    await done.getByRole('button', { name: '다른 지원서 작성' }).click()
    await expect(page.locator('#name')).toHaveValue('')
    await expect(page.locator('#consent')).not.toBeChecked()
    await expect(page.getByRole('button', { name: '지원서 제출하기' })).toBeVisible()
  })

  for (const theme of ['light', 'dark']) {
    for (const view of VIEWS) {
      test(`screenshot errors and confirmation ${theme} ${view.name}`, async ({ page }) => {
        await page.setViewportSize(view.size)
        await setTheme(page, theme)
        await page.route('**/api/recruit/apply', (route) => route.fulfill({ status: 201, json: {} }))
        await open(page)
        await fillValid(page)
        await page.locator('#phone').fill('12')
        await form(page).getByRole('button', { name: '지원서 제출하기' }).click()
        await expect(page.locator('#phone-error')).toBeVisible()
        await shot(page, `recruit-form-errors-${theme}-${view.name}`)
        await page.locator('#phone').fill('010-1234-5678')
        await page.locator('#consent').check()
        await form(page).getByRole('button', { name: '지원서 제출하기' }).click()
        await expect(page.getByText('지원서를 접수했어요')).toBeVisible()
        await shot(page, `recruit-form-done-${theme}-${view.name}`)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
        expect(overflow).toBe(false)
      })
    }
  }
})
