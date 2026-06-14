export async function mockOptionalApis(page) {
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, json: { message: 'Unauthorized' } }))
  await page.route('**/api/auth/refresh', (route) => route.fulfill({ status: 401, json: { message: 'Unauthorized' } }))
  await page.route('**/api/fonts', (route) => route.fulfill({ status: 200, json: [] }))
  await page.route('**/api/notices', (route) => route.fulfill({ status: 200, json: [] }))
}

export async function mockAdminApis(page) {
  await page.route('**/api/auth/me', (route) => route.fulfill({
    status: 200,
    json: {
      id: 1,
      name: '관리자',
      studentId: '2020123456',
      role: 'ADMIN',
      emailVerified: true,
    },
  }))
  await page.route('**/api/auth/refresh', (route) => route.fulfill({ status: 204 }))
  await page.route('**/api/fonts', (route) => route.fulfill({ status: 200, json: [] }))
  await page.route('**/api/admin/members', (route) => route.fulfill({ status: 200, json: [] }))
  await page.route('**/api/notifications', (route) => route.fulfill({ status: 200, json: [] }))
  await page.route('**/api/notifications/summary', (route) => route.fulfill({ status: 200, json: { unreadCount: 0 } }))
}
