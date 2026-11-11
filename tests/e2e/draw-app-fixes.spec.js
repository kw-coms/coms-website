import { expect, test } from '@playwright/test'
import { mockAdminApis, mockOptionalApis } from './visualSupport.js'

test('guests can draw without persisting names or offering private imports', async ({ page }) => {
  await mockOptionalApis(page)
  const privateRequests = []
  page.on('request', (request) => {
    if (/\/api\/(gatherings|attendance)/.test(request.url())) privateRequests.push(request.url())
  })
  await page.goto('/draw')
  await page.getByRole('textbox', { name: /^이름/ }).fill('가\n나')
  await page.getByRole('button', { name: '섞어서 나누기' }).click()
  await expect(page.getByRole('list', { name: '조 편성 결과' })).toBeVisible()
  await expect(page.getByRole('button', { name: '가져오기' })).toHaveCount(0)
  expect(privateRequests).toEqual([])
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('coms:draw:')))).toEqual([])
})

for (const path of ['/draw', '/attendance']) {
  test(`revoked attendance permission never offers manager actions while permissions load on ${path}`, async ({ page }) => {
    await mockAdminApis(page)
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: {
      id: 2, name: '임원', studentId: '2026000002', role: 'OFFICER', emailVerified: true,
    } }))
    let release
    const pending = new Promise((resolve) => { release = resolve })
    await page.route('**/api/permissions/me', async (route) => {
      await pending
      await route.fulfill({ json: { role: 'OFFICER', permissions: [] } })
    })
    await page.route('**/api/gatherings', (route) => route.fulfill({ json: [] }))
    await page.route('**/api/attendance/sessions', (route) => route.fulfill({ json: [] }))
    await page.goto(path)
    if (path === '/draw') await page.getByRole('button', { name: '가져오기' }).click()
    else await expect(page.getByRole('heading', { name: '출석 체크', exact: true })).toBeVisible()
    await expect(page.getByText(path === '/draw' ? '출석한 사람' : '출석 진행', { exact: true })).toHaveCount(0)
    const answered = page.waitForResponse('**/api/permissions/me')
    release()
    await answered
    await expect(page.getByText(path === '/draw' ? '출석한 사람' : '출석 진행', { exact: true })).toHaveCount(0)
  })
}

test('draw names and results belong to one member and logout forgets them', async ({ page }) => {
  await mockAdminApis(page)
  let memberId = 1
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: {
    id: memberId, name: '테스트 회원', studentId: `202600000${memberId}`, role: 'ADMIN', emailVerified: true,
  } }))
  await page.route('**/api/auth/logout', (route) => route.fulfill({ status: 204 }))
  await page.goto('/draw')
  const names = page.getByRole('textbox', { name: /^이름/ })
  await names.fill('첫 계정 이름\n첫 계정 친구')
  await page.getByRole('button', { name: '섞어서 나누기' }).click()
  await expect(page.getByRole('list', { name: '조 편성 결과' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('coms:draw:v2:1'))).toContain('첫 계정 이름')

  memberId = 2
  await page.reload()
  await expect(names).toHaveValue('')
  await expect(page.getByRole('list', { name: '조 편성 결과' })).toHaveCount(0)
  await names.fill('둘째 계정 이름\n둘째 계정 친구')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('coms:draw:v2:2'))).toContain('둘째 계정 이름')
  await page.getByTitle('로그아웃', { exact: true }).click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('coms:draw:v2:2'))).toBeNull()
  expect(await page.evaluate(() => localStorage.getItem('coms:draw:v2:1'))).toContain('첫 계정 이름')

  memberId = 1
  await page.goto('/draw')
  await expect(names).toHaveValue('첫 계정 이름\n첫 계정 친구')
  await names.fill('')
  await expect(page.getByRole('list', { name: '조 편성 결과' })).toBeVisible()
  await expect(page.getByRole('button', { name: '지우기', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '지우기', exact: true }).click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('coms:draw:v2:1'))).toBeNull()
})

test('logout clears draw names in another open tab before they can be saved again', async ({ page, context }) => {
  await mockAdminApis(page)
  await page.route('**/api/auth/logout', (route) => route.fulfill({ status: 204 }))
  const other = await context.newPage()
  await mockAdminApis(other)
  await page.goto('/draw')
  await other.goto('/draw')
  const names = other.getByRole('textbox', { name: /^이름/ })
  await names.fill('비밀 이름\n친구')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('coms:draw:v2:1'))).toContain('비밀 이름')
  await page.getByTitle('로그아웃', { exact: true }).click()
  await expect(names).toHaveValue('')
  await names.fill('다시 입력')
  expect(await other.evaluate(() => localStorage.getItem('coms:draw:v2:1'))).toBeNull()
  await other.close()
})

test('draw discards the shared legacy list and tolerates malformed or blocked storage', async ({ page }) => {
  await mockAdminApis(page)
  await page.addInitScript(() => {
    localStorage.setItem('coms:draw:v1', JSON.stringify({ text: '이전 계정 이름', result: null }))
    localStorage.setItem('coms:draw:v2:1', '{broken')
  })
  await page.goto('/draw')
  const names = page.getByRole('textbox', { name: /^이름/ })
  await expect(names).toHaveValue('')
  expect(await page.evaluate(() => localStorage.getItem('coms:draw:v1'))).toBeNull()
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError') }
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError') }
    Storage.prototype.removeItem = () => { throw new DOMException('Blocked', 'SecurityError') }
  })
  await page.reload()
  await names.fill('가\n나')
  await page.getByRole('button', { name: '섞어서 나누기' }).click()
  await expect(page.getByRole('list', { name: '조 편성 결과' })).toBeVisible()
})

test('apps search and category chips are adjacent and announce filtered counts', async ({ page }) => {
  await mockAdminApis(page)
  await page.route('**/api/club-projects/categories', (route) => route.fulfill({ json: [
    { key: 'WEB', name: '웹', position: 0 }, { key: 'GAME', name: '게임', position: 1 },
  ] }))
  await page.route('**/api/club-projects', (route) => route.fulfill({ json: [
    { id: 1, title: '웹 도구', description: '스터디 도우미', category: 'WEB', files: [] },
    { id: 2, title: '게임 도구', description: '스터디 게임', category: 'GAME', files: [] },
  ] }))
  await page.goto('/apps')
  const filters = page.getByRole('group', { name: '프로젝트 찾기' })
  await filters.getByRole('searchbox', { name: '프로젝트 검색' }).fill('스터디')
  await filters.getByRole('button', { name: /게임 1/ }).click()
  await expect(page.getByRole('status', { name: '검색 결과' })).toHaveText('1개')
  await expect(page.getByText('게임 도구', { exact: true })).toBeVisible()
  await expect(page.getByText('웹 도구', { exact: true })).toHaveCount(0)
})
