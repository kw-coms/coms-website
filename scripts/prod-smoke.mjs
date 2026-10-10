import { chromium } from '@playwright/test'

const baseURL = process.env.COMS_SMOKE_URL || 'https://coms.kw.ac.kr'
const identifier = process.env.COMS_SMOKE_IDENTIFIER
const password = process.env.COMS_SMOKE_PASSWORD

if (!identifier || !password) {
  throw new Error('COMS_SMOKE_IDENTIFIER and COMS_SMOKE_PASSWORD are required')
}

const routes = [
  '/', '/about', '/activities', '/projects', '/apps', '/sponsors',
  '/notices', '/resources', '/community', '/activity-log',
  '/activity-events', '/monthly-calendar', '/settings', '/admin',
  '/recruit', '/recruit-notice',
]

const apiPaths = [
  '/api/auth/me', '/api/permissions/me', '/api/fonts', '/api/site-settings',
  '/api/notices', '/api/files', '/api/community/posts?page=0&size=20',
  '/api/club-activities', '/api/club-events', '/api/club-projects',
  '/api/sponsors', '/api/notifications/summary',
  '/api/admin/analytics', '/api/admin/members',
  '/api/admin/eligible-members', '/api/admin/recruit-applications',
  '/api/admin/permissions', '/api/admin/community/reports',
  '/api/admin/audit-logs?limit=10',
]

const result = { guest: {}, login: {}, security: {}, routes: [], mobileRoutes: [], api: [], adminTabs: [], browserErrors: [], apiErrors: [], logout: {} }
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } })
const page = await context.newPage()
let authenticated = false

page.on('pageerror', (error) => {
  result.browserErrors.push({ route: new URL(page.url()).pathname, error: error.name || 'Error' })
})
page.on('response', (response) => {
  const url = new URL(response.url())
  if (authenticated && url.origin === baseURL && url.pathname.startsWith('/api/') && response.status() >= 400) {
    result.apiErrors.push({ path: url.pathname, status: response.status() })
  }
})

try {
  const guestMe = await page.request.get('/api/auth/me')
  result.guest.meStatus = guestMe.status()
  await page.goto('/community', { waitUntil: 'domcontentloaded' })
  await page.waitForURL('**/login', { timeout: 15000 })
  result.guest.protectedRedirect = new URL(page.url()).pathname === '/login'

  await page.locator('#identifier').fill(identifier)
  await page.locator('#password').fill(password)
  const loginResponse = page.waitForResponse(
    (response) => response.url().includes('/api/auth/login') && response.request().method() === 'POST',
  )
  await page.locator('#main-content button[type="submit"]').click()
  result.login.status = (await loginResponse).status()
  if (result.login.status !== 200) throw new Error(`Login HTTP ${result.login.status}`)
  await page.waitForURL((url) => url.pathname !== '/login', { timeout: 15000 })
  authenticated = true

  const meResponse = await page.request.get('/api/auth/me')
  result.login.meStatus = meResponse.status()
  if (meResponse.ok()) {
    const me = await meResponse.json()
    result.login.role = me.role
    result.login.expectedIdentity = me.studentId === identifier
  }
  result.login.httpOnlyCookie = (await context.cookies()).some(
    (cookie) => cookie.name === 'token' && cookie.httpOnly && cookie.secure,
  )

  const crossOriginRefresh = await page.request.post('/api/auth/refresh', {
    headers: { Origin: 'https://untrusted.example' },
    data: {},
  })
  result.security.crossOriginRefreshStatus = crossOriginRefresh.status()
  result.security.crossOriginAllowed = Boolean(crossOriginRefresh.headers()['access-control-allow-origin'])

  for (const route of routes) {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.locator('#main-content').waitFor({ state: 'visible', timeout: 15000 })
    await page.waitForFunction(() => {
      const text = document.querySelector('#main-content')?.textContent || ''
      return text.trim().length > 30 && !text.includes('로그인 상태를 확인하는 중')
    }, null, { timeout: 15000 })
    await page.waitForTimeout(350)
    const text = await page.locator('#main-content').innerText()
    result.routes.push({
      path: route,
      http: response?.status(),
      finalPath: new URL(page.url()).pathname,
      rendered: text.trim().length > 30,
      errorBoundary: text.includes('페이지를 표시하는 중 오류가 발생했습니다'),
    })
  }

  const mobilePage = await context.newPage()
  await mobilePage.setViewportSize({ width: 390, height: 844 })
  for (const route of ['/', '/about', '/apps', '/notices', '/community', '/resources', '/admin']) {
    await mobilePage.goto(route, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await mobilePage.locator('#main-content').waitFor({ state: 'visible', timeout: 15000 })
    await mobilePage.waitForTimeout(500)
    result.mobileRoutes.push({
      path: route,
      finalPath: new URL(mobilePage.url()).pathname,
      overflowPx: await mobilePage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    })
    if (process.env.COMS_SMOKE_SHOTS_DIR && (route === '/' || route === '/admin')) {
      if (route === '/') {
        const skip = mobilePage.locator('button').filter({ hasText: /skip/i })
        if (await skip.isVisible()) {
          await skip.click()
          await skip.waitFor({ state: 'hidden', timeout: 5000 })
        }
      }
      const filename = route === '/' ? 'home-mobile.png' : 'admin-mobile.png'
      await mobilePage.screenshot({ path: `${process.env.COMS_SMOKE_SHOTS_DIR}/${filename}`, fullPage: false })
    }
  }
  await mobilePage.close()

  for (const path of apiPaths) {
    try {
      const response = await page.request.get(path, { timeout: 15000 })
      result.api.push({ path: path.split('?')[0], status: response.status() })
    } catch (error) {
      result.api.push({ path: path.split('?')[0], error: error.name || 'Error' })
    }
  }

  await page.goto('/admin', { waitUntil: 'domcontentloaded' })
  const tabs = page.getByRole('tab')
  await tabs.first().waitFor({ state: 'visible', timeout: 15000 })
  const tabCount = await tabs.count()
  for (let index = 0; index < tabCount; index += 1) {
    const tab = tabs.nth(index)
    const name = (await tab.innerText()).trim()
    await tab.click()
    await page.waitForTimeout(350)
    const panel = page.getByRole('tabpanel')
    result.adminTabs.push({ name, rendered: (await panel.innerText()).trim().length > 20 })
  }

  await page.getByRole('button', { name: 'Logout' }).click()
  await page.waitForTimeout(500)
  authenticated = false
  result.logout.meStatus = (await page.request.get('/api/auth/me')).status()
  await page.goto('/community', { waitUntil: 'domcontentloaded' })
  await page.waitForURL('**/login', { timeout: 15000 })
  result.logout.protectedRedirect = new URL(page.url()).pathname === '/login'
} catch (error) {
  result.failure = error.message
} finally {
  if (authenticated) await page.request.post('/api/auth/logout').catch(() => {})
  await browser.close()
  console.log(JSON.stringify(result, null, 2))
}

if (result.failure || result.routes.some((route) => route.http !== 200 || route.finalPath !== route.path || !route.rendered || route.errorBoundary)
  || result.mobileRoutes.some((route) => route.finalPath !== route.path || route.overflowPx > 1)
  || result.api.some((api) => api.status !== 200)
  || result.adminTabs.some((tab) => !tab.rendered)
  || !result.logout.protectedRedirect || result.login.meStatus !== 200 || !result.login.expectedIdentity || !result.login.httpOnlyCookie
  || result.security.crossOriginRefreshStatus !== 403 || result.security.crossOriginAllowed) {
  process.exitCode = 1
}
