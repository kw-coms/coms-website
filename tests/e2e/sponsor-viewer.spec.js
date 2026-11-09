import { expect, test } from '@playwright/test'
import { mockOptionalApis, trackRequests } from './visualSupport.js'

// 후원자 목록은 보는 사람에 따라 다르다(비회원: 익명 자리 표시자, 회원: 실명). 서버 응답을 흉내 내
// 쿠키 대신 /api/auth/me 결과로 구분한다.

const skipIntro = (page) => page.addInitScript(() => window.sessionStorage.setItem('coms.intro.played:v1', '1'))
const ME = { id: 5, studentId: '2023000002', name: '홍길동', role: 'USER', emailVerified: true }
const sponsor = (over) => ({ id: null, name: '익명 후원자', tierId: 1, logoUrl: null, linkUrl: null, description: null, sinceDate: null, untilDate: null, anonymous: true, ...over })
const tier = (sponsors) => [{ id: 1, name: 'Gold', color: '#caa54a', description: null, sortOrder: 0, sponsors }]

async function mockSponsors(page, loggedIn) {
  await page.route('**/api/sponsors/page', (route) => route.fulfill({
    json: { settings: {}, bannerImageUrl: null, sponsorCount: 1, tierCount: 1 },
  }))
  await page.route('**/api/sponsors', (route) => route.fulfill({
    headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
    json: loggedIn() ? tier([sponsor({ id: 7, name: '실명후원사', anonymous: false })]) : tier([sponsor({})]),
  }))
}

test('guest sees the anonymous placeholder', async ({ page }) => {
  await skipIntro(page)
  await mockOptionalApis(page)
  await mockSponsors(page, () => false)
  await page.goto('/sponsors')
  await expect(page.getByText('익명 후원자').first()).toBeVisible()
  await expect(page.getByText('실명후원사')).toHaveCount(0)
})

test('the list waits for /api/auth/me, so a member never gets (or caches) the guest list', async ({ page }) => {
  await skipIntro(page)
  await mockOptionalApis(page)
  let loggedIn = false
  let release
  const held = new Promise((resolve) => { release = resolve })
  await page.route('**/api/auth/me', async (route) => {
    await held
    loggedIn = true
    await route.fulfill({ json: ME })
  })
  await mockSponsors(page, () => loggedIn)
  const listRequests = trackRequests(page, /\/api\/sponsors$/)
  await page.goto('/sponsors')
  await page.waitForTimeout(500)
  expect(listRequests.length).toBe(0)
  release()
  await expect(page.getByText('실명후원사')).toBeVisible()
  await expect(page.getByText('익명 후원자')).toHaveCount(0)
  expect(listRequests.length).toBe(1)
})
