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
  await page.route('**/api/admin/recruit-applications', (route) => route.fulfill({ status: 200, json: [] }))
  await page.route('**/api/admin/community/deleted-posts**', (route) => route.fulfill({ status: 200, json: [] }))
  await page.route('**/api/notifications', (route) => route.fulfill({ status: 200, json: [] }))
  await page.route('**/api/notifications/summary', (route) => route.fulfill({ status: 200, json: { unreadCount: 0 } }))
  await page.route('**/api/club-activities/categories', (route) => route.fulfill({
    status: 200,
    json: [
      { id: 1, key: 'GENERAL', name: '일반', position: 0, activityCount: 0 },
      { id: 2, key: 'SEMINAR', name: '세미나', position: 1, activityCount: 0 },
      { id: 3, key: 'STUDY', name: '스터디', position: 2, activityCount: 0 },
      { id: 4, key: 'PROJECT', name: '프로젝트', position: 3, activityCount: 0 },
      { id: 5, key: 'MEETING', name: '회의', position: 4, activityCount: 0 },
    ],
  }))
  await page.route('**/api/club-activities', (route) => route.fulfill({ status: 200, json: [] }))
}
