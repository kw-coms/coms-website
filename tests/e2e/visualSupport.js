export async function mockOptionalApis(page) {
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, json: { message: 'Unauthorized' } }))
  await page.route('**/api/auth/refresh', (route) => route.fulfill({ status: 401, json: { message: 'Unauthorized' } }))
  await page.route('**/api/fonts', (route) => route.fulfill({ status: 200, json: [] }))
  await page.route('**/api/notices', (route) => route.fulfill({ status: 200, json: [] }))
}
