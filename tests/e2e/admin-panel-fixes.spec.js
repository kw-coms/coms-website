import { expect, test } from '@playwright/test'
import { mockAdminApis } from './visualSupport.js'

test('overview announces loading without an empty claim before its sources settle', async ({ page }) => {
  await mockAdminApis(page)
  let release
  const pending = new Promise((resolve) => { release = resolve })
  await page.route('**/api/admin/recruit-applications', async (route) => {
    await pending
    await route.fulfill({ json: [{ id: 7, name: '지원 회원', status: 'RECEIVED' }] })
  })
  await page.route('**/api/admin/analytics', (route) => route.fulfill({ json: { communityReportsOpen: 0 } }))
  await page.goto('/admin')
  await expect(page.getByRole('status', { name: '할 일을 불러오는 중' })).toBeVisible()
  await expect(page.getByText('처리할 일이 없어요')).toHaveCount(0)
  release()
  await expect(page.getByRole('button', { name: /처리 대기 중인 지원서.*1건/ })).toBeVisible()
})

for (const width of [1440, 390]) {
  test(`weekly member approval, application reading and roster access take at most two actions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await mockAdminApis(page)
    let member = { id: 7, studentId: '2026000007', name: '가입 회원', email: 'member@example.com', emailVerified: true, role: 'ASSOCIATE' }
    await page.route('**/api/admin/members', (route) => route.fulfill({ json: [member] }))
    await page.route('**/api/admin/members/7/role', (route) => {
      expect(route.request().method()).toBe('PATCH')
      expect(route.request().postDataJSON()).toEqual({ role: 'USER' })
      member = { ...member, role: 'USER' }
      return route.fulfill({ json: member })
    })
    await page.route('**/api/admin/recruit-applications', (route) => route.fulfill({ json: [{
      id: 9, name: '지원 회원', studentId: '2026000009', status: 'RECEIVED', motive: '함께 공부하고 싶습니다.',
    }] }))
    await page.goto('/admin')
    await page.getByRole('tab', { name: '회원 관리' }).click()
    if (width === 390) {
      const identity = page.getByText('가입 회원', { exact: true }).locator('../..')
      expect((await identity.boundingBox()).width).toBeGreaterThan(200)
    }
    await page.getByLabel('가입 회원 역할 변경').selectOption('USER')
    await expect(page.getByLabel('가입 회원 역할 변경')).toHaveValue('USER')

    await page.goto('/admin')
    await page.getByRole('tab', { name: '모집 관리' }).click()
    await expect(page.getByText('함께 공부하고 싶습니다.', { exact: true })).toBeVisible()

    await page.goto('/admin')
    await page.getByRole('tab', { name: '명부 인증' }).click()
    await expect(page).toHaveURL(/tab=roster$/)
    await expect(page.getByRole('tabpanel', { name: '명부 인증' })).toBeVisible()
  })
}

test('an operator with just one tab permission sees only that group and recovers from a forbidden URL', async ({ page }) => {
  await mockAdminApis(page)
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: {
    id: 2, name: '임원', studentId: '2022000001', role: 'OFFICER', emailVerified: true,
  } }))
  await page.route('**/api/permissions/me', (route) => route.fulfill({ json: {
    role: 'OFFICER', permissions: ['activity.write'],
  } }))

  await page.goto('/admin?tab=members')
  await expect(page).toHaveURL(/\/admin\?tab=activities$/)
  const nav = page.getByRole('navigation', { name: '운영 패널 메뉴' })
  await expect(nav.getByRole('tab')).toHaveText(['활동 관리'])
  await expect(nav.getByRole('tablist', { name: '콘텐츠' })).toBeVisible()
  for (const group of ['사람', '사이트', '시스템']) {
    await expect(nav.getByRole('tablist', { name: group })).toHaveCount(0)
  }
})

test('member roster marks disappear when the existing roster API cannot be read', async ({ page }) => {
  await mockAdminApis(page)
  await page.route('**/api/admin/members', (route) => route.fulfill({ json: [{
    id: 7, studentId: '2023000002', name: '홍길동', email: 'member@example.com',
    emailVerified: true, role: 'USER',
  }] }))
  await page.route('**/api/admin/eligible-members', (route) => route.fulfill({
    status: 500, json: { message: '명부 조회 실패' },
  }))

  await page.goto('/admin?tab=members')
  await expect(page.getByText('홍길동')).toBeVisible()
  await expect(page.locator('[data-testid^="roster-mark-"]')).toHaveCount(0)
  await page.getByRole('button', { name: '명부 인증 탭' }).click()
  await expect(page).toHaveURL(/tab=roster$/)
})
