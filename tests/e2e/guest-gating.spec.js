import { expect, test } from '@playwright/test'
import { expectMembersGate, mockAdminApis, mockOptionalApis, trackRequests } from './visualSupport.js'

// Guests: member-only menus carry a lock and open a guide screen; study shows chapter titles only.

const LOCK = '[data-member-lock]'
const skipIntro = (page) => page.addInitScript(() => window.sessionStorage.setItem('coms.intro.played:v1', '1'))
const nav = (page) => page.locator('header.apple-global-nav')

test.describe('lock icons', () => {
  test('desktop: guests see locks on member-only entries, and only on those', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await skipIntro(page)
    await mockOptionalApis(page)
    await page.goto('/about')
    // The bar itself shows four group names, no lock: the locks are on the entries in the panel.
    await expect(nav(page).locator(LOCK)).toHaveCount(0)
    await nav(page).getByRole('button', { name: '멤버', exact: true }).click()
    const panel = page.locator('#nav-panel')
    const column = (name) => panel.getByRole('region', { name })
    for (const label of ['공지', '커뮤니티', '자료실', '활동 기록', '월별 일정', '회지·인기투표']) {
      await expect(column('멤버').getByRole('button', { name: new RegExp(`^${label}`) }).locator(LOCK), label).toHaveCount(1)
    }
    await expect(column('멤버').getByRole('button')).toHaveCount(6)
    await expect(column('멤버').locator(LOCK)).toHaveCount(6)
    await expect(panel.getByRole('button', { name: '공지 (회원 전용)' })).toBeVisible()
    // Public entries have none.
    for (const name of ['동아리', '배움']) await expect(column(name).locator(LOCK), name).toHaveCount(0)
    const tools = column('도구')
    for (const label of ['모임 신청', '일정 조율', '출석 체크']) await expect(tools.getByRole('button', { name: new RegExp(`^${label}`) }).locator(LOCK)).toHaveCount(1)
    await expect(tools.getByRole('button', { name: /^조 편성/ }).locator(LOCK)).toHaveCount(0)
    await expect(tools.getByRole('button', { name: /^앱/ }).locator(LOCK)).toHaveCount(0)
    await expect(tools.locator(LOCK)).toHaveCount(3)
  })

  test('mobile menu: locks on member-only entries', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await skipIntro(page)
    await mockOptionalApis(page)
    await page.goto('/about')
    await page.getByRole('button', { name: '메뉴 열기' }).click()
    const menu = page.locator('#mobile-menu')
    const section = (name) => menu.getByRole('region', { name })
    for (const label of ['공지', '커뮤니티', '자료실']) {
      await expect(menu.getByRole('button', { name: new RegExp(`^${label}`) }).locator(LOCK), label).toHaveCount(1)
    }
    await expect(menu.getByRole('button', { name: /^후원/ }).locator(LOCK)).toHaveCount(0)
    await expect(section('멤버').locator(LOCK)).toHaveCount(6)
    const tools = section('도구')
    await expect(tools.locator(LOCK)).toHaveCount(3)
    await expect(tools.getByRole('button', { name: /^조 편성/ }).locator(LOCK)).toHaveCount(0)
    await expect(section('동아리').locator(LOCK)).toHaveCount(0)
    await expect(section('배움').locator(LOCK)).toHaveCount(0)
  })

  test('quick jump: member pages carry the lock for a guest', async ({ page }) => {
    await skipIntro(page)
    await mockOptionalApis(page)
    await page.goto('/about')
    await page.getByRole('button', { name: '빠른 이동 열기' }).first().click()
    const dialog = page.getByRole('dialog', { name: '빠른 이동' })
    await dialog.getByRole('combobox', { name: '어디로 갈까요?' }).fill('공지')
    await expect(dialog.getByRole('option', { name: /공지사항/ }).locator(LOCK)).toHaveCount(1)
    await dialog.getByRole('combobox', { name: '어디로 갈까요?' }).fill('프로젝트')
    await expect(dialog.getByRole('option').first().locator(LOCK)).toHaveCount(0)
  })

  test('a signed-in member sees no locks anywhere', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await skipIntro(page)
    await mockAdminApis(page)
    await page.goto('/about')
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible()
    await expect(nav(page).locator(LOCK)).toHaveCount(0)
    await nav(page).getByRole('button', { name: '멤버', exact: true }).click()
    await expect(page.locator('#nav-panel').locator(LOCK)).toHaveCount(0)
    await expect(page.getByText('(회원 전용)')).toHaveCount(0)
  })

  test('clicking a locked entry still navigates, to the guide', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await skipIntro(page)
    await mockOptionalApis(page)
    await page.goto('/about')
    await nav(page).getByRole('button', { name: '멤버', exact: true }).click()
    await page.locator('#nav-panel').getByRole('button', { name: /^공지/ }).click()
    await expectMembersGate(page, '/notices')
  })
})

test.describe('guide screen', () => {
  test('the login link carries the page as `from`, and the recruit link is offered', async ({ page }) => {
    await skipIntro(page)
    await mockOptionalApis(page)
    await page.goto('/resources')
    const gate = await expectMembersGate(page, '/resources')
    await expect(gate.getByText('세미나, 프로젝트, 학술회지 자료를 모아 두었어요.')).toBeVisible()
    await gate.getByRole('link', { name: '로그인', exact: true }).click()
    await expect(page).toHaveURL(/\/login$/)
    expect(await page.evaluate(() => history.state?.usr?.from?.pathname)).toBe('/resources')
  })

  test('an auth error still redirects', async ({ page }) => {
    await skipIntro(page)
    await mockOptionalApis(page)
    await page.route('**/api/auth/me', (route) => route.fulfill({ status: 500, json: { message: 'boom' } }))
    await page.goto('/settings')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('a member opens the page, not the guide', async ({ page }) => {
    await skipIntro(page)
    await mockAdminApis(page)
    await page.route('**/api/notices', (route) => route.fulfill({ json: [] }))
    await page.goto('/notices')
    await expect(page.getByRole('heading', { name: '공지사항', exact: true })).toBeVisible()
    await expect(page.locator('[data-members-gate]')).toHaveCount(0)
  })
})

test.describe('study for guests', () => {
  const LESSON_SENTENCE = '초보자가 제일 많이 하는 실수입니다.'

  test('a guest sees the subject and chapter titles, not the lesson', async ({ page }) => {
    await skipIntro(page)
    await mockOptionalApis(page)
    await page.goto('/study/c')
    await expect(page.getByRole('heading', { name: 'C 기초', exact: true })).toBeVisible()
    const chapters = page.getByRole('list', { name: '목차' }).getByRole('listitem')
    await expect(chapters.first()).toHaveText('0. 시작하기')
    await expect(chapters).toContainText(['0. 시작하기', '1. 첫 프로그램 해부', '7. 포인터', '10. 막힐 때 · 다음 단계'])
    await expect(page.getByRole('heading', { name: '강의 본문은 동아리원만 볼 수 있어요' })).toBeVisible()
    await expect(page.getByRole('link', { name: '로그인', exact: true })).toHaveAttribute('href', '/login')
    await expect(page.getByRole('link', { name: '가입 안내 보기' })).toHaveAttribute('href', '/recruit')
    // No lesson in the DOM: no body sentence, no layout, no playground.
    await expect(page.getByText(LESSON_SENTENCE)).toHaveCount(0)
    expect(await page.evaluate((text) => document.body.textContent.includes(text), LESSON_SENTENCE)).toBe(false)
    await expect(page.locator('.study-layout')).toHaveCount(0)
    await expect(page.locator('.pg-status, .pg-editor, [data-pg]')).toHaveCount(0)
  })

  test('a guest on the Arduino study gets no "Circuit Lab에서 열기" button', async ({ page }) => {
    await skipIntro(page)
    await mockOptionalApis(page)
    await page.goto('/study/arduino')
    await expect(page.getByRole('heading', { name: '강의 본문은 동아리원만 볼 수 있어요' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Circuit Lab에서 열기' })).toHaveCount(0)
    await expect(page.getByText('Circuit Lab에서 열기')).toHaveCount(0)
  })

  test('a member sees the lesson, and no guide', async ({ page }) => {
    await skipIntro(page)
    await mockAdminApis(page)
    await page.goto('/study/c')
    await expect(page.getByText(LESSON_SENTENCE)).toBeVisible()
    await expect(page.locator('[data-members-gate]')).toHaveCount(0)
  })

  test('the practice list shows problem titles with locks, no statements', async ({ page }) => {
    await skipIntro(page)
    await mockOptionalApis(page)
    await page.goto('/study/c/practice')
    // The list row (the page also has a "start here" link to the same problem).
    const row = page.locator('a.ex-row', { hasText: '첫 이름표 출력' })
    await expect(row).toBeVisible()
    await expect(row.locator(LOCK)).toHaveCount(1)
    await expect(page.getByText('동아리 이름표에 적힌 번호를')).toHaveCount(0)
    await row.click()
    await expect(page).toHaveURL(/\/study\/c\/practice\/c-start-badge$/)
  })

  test('a guest on a problem gets the title and the guide, no statement and no editor', async ({ page }) => {
    await skipIntro(page)
    await mockOptionalApis(page)
    const runs = trackRequests(page, /\/study\/api\/run/)
    await page.goto('/study/c/practice/c-start-badge')
    await expect(page.getByRole('heading', { name: '첫 이름표 출력', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: '문제 풀이는 동아리원만 할 수 있어요' })).toBeVisible()
    await expect(page.getByRole('link', { name: '로그인', exact: true })).toHaveAttribute('href', '/login')
    await expect(page.getByText('동아리 이름표에 적힌 번호를')).toHaveCount(0)
    await expect(page.getByLabel('문제 설명')).toHaveCount(0)
    await expect(page.locator('.ex-editor, .cm-editor')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '제출' })).toHaveCount(0)
    expect(runs).toEqual([])
    expect(await page.evaluate(() => document.body.textContent.includes('scanf("%d", &n)'))).toBe(false)
  })

  test('while /api/auth/me is pending nothing flashes: no lesson, no gate, no lock; then a member never sees the gate', async ({ page }) => {
    await skipIntro(page)
    await mockOptionalApis(page)
    let release
    const held = new Promise((resolve) => { release = resolve })
    await page.route('**/api/auth/me', async (route) => {
      await held
      await route.fulfill({ json: { id: 5, studentId: '2023000002', name: '홍길동', role: 'USER', emailVerified: true } })
    })
    await page.goto('/study/c')
    await expect(page.locator('.study-loading')).toBeVisible()
    await page.waitForTimeout(500)
    await expect(page.getByText(LESSON_SENTENCE)).toHaveCount(0)
    await expect(page.locator('[data-members-gate]')).toHaveCount(0)
    await expect(page.locator(LOCK)).toHaveCount(0)
    const gateSeen = page.evaluate(() => new Promise((resolve) => {
      const check = () => document.querySelector('[data-members-gate]') ? resolve(true) : undefined
      new MutationObserver(check).observe(document.body, { childList: true, subtree: true })
      setTimeout(() => resolve(false), 2500)
    }))
    release()
    await expect(page.getByText(LESSON_SENTENCE)).toBeVisible()
    expect(await gateSeen).toBe(false)
    await expect(page.locator(LOCK)).toHaveCount(0)
  })

  test('while /api/auth/me is pending, then answers 401, a guest gets the gate only after it resolves', async ({ page }) => {
    await skipIntro(page)
    await mockOptionalApis(page)
    let release
    const held = new Promise((resolve) => { release = resolve })
    await page.route('**/api/auth/me', async (route) => {
      await held
      await route.fulfill({ status: 401, json: { message: 'Unauthorized' } })
    })
    await page.goto('/study/c')
    await expect(page.locator('.study-loading')).toBeVisible()
    await page.waitForTimeout(500)
    await expect(page.locator('[data-members-gate]')).toHaveCount(0)
    await expect(page.locator(LOCK)).toHaveCount(0)
    await expect(page.getByText(LESSON_SENTENCE)).toHaveCount(0)
    release()
    await expect(page.locator('[data-members-gate]')).toBeVisible()
    await expect(page.getByText(LESSON_SENTENCE)).toHaveCount(0)
  })

  test('a failed /api/auth/me is not a guest: a retry state, not the gate, and 다시 시도 recovers', async ({ page }) => {
    await skipIntro(page)
    await mockOptionalApis(page)
    let fail = true
    await page.route('**/api/auth/me', (route) => (fail
      ? route.fulfill({ status: 500, json: { message: 'boom' } })
      : route.fulfill({ json: { id: 5, studentId: '2023000002', name: '홍길동', role: 'USER', emailVerified: true } })))
    await page.goto('/study/c')
    // AuthProvider retries /me twice (600ms + 1500ms backoff) before it reports authError.
    await expect(page.getByRole('heading', { name: '로그인 상태를 확인하지 못했어요' })).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-members-gate]')).toHaveCount(0)
    await expect(page.getByText(LESSON_SENTENCE)).toHaveCount(0)
    await expect(page.locator(LOCK)).toHaveCount(0)
    fail = false
    await page.getByRole('button', { name: '다시 시도' }).click()
    await expect(page.getByText(LESSON_SENTENCE)).toBeVisible()
  })

  test('a failed /api/auth/me on a problem: the retry state, no statement, and 다시 시도 recovers', async ({ page }) => {
    await skipIntro(page)
    await mockOptionalApis(page)
    let fail = true
    await page.route('**/api/auth/me', (route) => (fail
      ? route.fulfill({ status: 500, json: { message: 'boom' } })
      : route.fulfill({ json: { id: 5, studentId: '2023000002', name: '홍길동', role: 'USER', emailVerified: true } })))
    await page.goto('/study/c/practice/c-start-badge')
    await expect(page.getByRole('heading', { name: '로그인 상태를 확인하지 못했어요' })).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-members-gate]')).toHaveCount(0)
    await expect(page.getByText('동아리 이름표에 적힌 번호를')).toHaveCount(0)
    fail = false
    await page.getByRole('button', { name: '다시 시도' }).click()
    await expect(page.getByText('동아리 이름표에 적힌 번호를')).toBeVisible()
  })

  test('a member opens the problem with its statement and editor', async ({ page }) => {
    await skipIntro(page)
    await mockAdminApis(page)
    await page.goto('/study/c/practice/c-start-badge')
    await expect(page.getByText('동아리 이름표에 적힌 번호를')).toBeVisible()
    await expect(page.locator('.ex-editor')).toBeVisible()
    await expect(page.locator('[data-members-gate]')).toHaveCount(0)
  })
})
