import { expect, test } from '@playwright/test'

// Real-backend auth e2e.
//
// Unlike the other specs in this folder, this one does NOT mock the API. It
// runs against a live Spring Boot backend (booted on H2 by
// scripts/e2e-backend.mjs) reached through the Vite dev-server proxy
// (/api -> http://localhost:8080). Run it with:
//
//   npm run test:e2e:backend
//
// Origin enforcement
// ------------------
// The backend's OriginValidationFilter rejects unsafe (POST/PATCH/...) requests
// whose Origin/Referer is not in cors.allowed-origins. In the dev profile that
// allow-list is http://localhost:3000,http://localhost:5173 — note the host is
// `localhost`, not `127.0.0.1`. So this lane runs on http://localhost:3000 and
// every direct API POST below carries an explicit Origin header.
//
// Email-verification handling
// ---------------------------
// A normal /signup leaves the member with emailVerified=false and login is
// blocked until the emailed 6-digit code is confirmed; there is no SMTP server
// here. Two facts make full real-backend coverage possible without email:
//
//  1. The dev profile auto-seeds an ADMIN (studentId "admin" / "admin1234" via
//     DevDataInitializer). ADMINs bypass the email-verification login gate, so
//     this account logs in immediately — test 1 drives a complete real login.
//  2. The runner boots with MAIL_LOG_VERIFICATION_CODES=true, which makes the
//     verification-code "sender" log instead of throwing, so /signup returns
//     success and the UI advances to the verify step — test 2 exercises the
//     real signup + login-gating path end-to-end (the actual code is logged,
//     not emailed, so we assert through the "verification required" step rather
//     than completing it).

const ORIGIN = 'http://localhost:3000'
const BOOTSTRAP_SECRET =
  process.env.BOOTSTRAP_SECRET || 'coms-e2e-bootstrap-secret-please-change-32+'

// Auto-seeded dev admin (see backend DevDataInitializer). Login-able without
// email verification because ADMINs bypass the gate.
const ADMIN = { identifier: 'admin', password: 'admin1234' }

test.describe('real backend auth', () => {
  test('dev admin logs in through the UI and reaches a gated page', async ({ page }) => {
    await page.goto('/login')

    await page.locator('#identifier').fill(ADMIN.identifier)
    await page.locator('#password').fill(ADMIN.password)
    // The header also has a "로그인" button; target the login form's submit.
    await page.locator('#main-content button[type="submit"]').click()

    // After a successful login the SPA leaves /login (onSuccess navigation).
    await expect(page).not.toHaveURL(/\/login$/, { timeout: 15_000 })

    // The httpOnly access-token cookie must be set by the real backend.
    const cookies = await page.context().cookies()
    const tokenCookie = cookies.find((c) => c.name === 'token')
    expect(tokenCookie, 'access-token cookie should be set after login').toBeTruthy()
    expect(tokenCookie.value.length).toBeGreaterThan(10)

    // /api/auth/me must return 200 with the admin identity. Use page.request so
    // the call shares the browser context's cookie jar (the standalone `request`
    // fixture has its own, cookie-less context).
    const meRes = await page.request.get('/api/auth/me')
    expect(meRes.status()).toBe(200)
    const me = await meRes.json()
    expect(me.studentId).toBe('admin')
    expect(me.role).toBe('ADMIN')

    // A gated page renders for the authenticated session (the RequireAuth guard
    // would redirect to /login otherwise).
    await page.goto('/community')
    await expect(page).toHaveURL(/\/community$/, { timeout: 15_000 })
    await expect(page).not.toHaveURL(/\/login$/)
  })

  test('fresh UI signup against the real backend reaches the email-verification step', async ({ page, request }) => {
    // Seed an eligible-roster entry so signup passes roster validation. The
    // add-eligible endpoint needs an authenticated ADMIN AND the bootstrap
    // secret header, so log in as the dev admin first to obtain the cookie.
    const studentId = `2026${String(Date.now()).slice(-6).padStart(6, '0')}`
    const name = '김철수'

    const loginRes = await request.post('/api/auth/login', {
      headers: { Origin: ORIGIN },
      data: { identifier: ADMIN.identifier, password: ADMIN.password, rememberMe: false },
    })
    expect(loginRes.status()).toBe(200)

    const seedRes = await request.post('/api/maintenance/add-eligible', {
      headers: { Origin: ORIGIN, 'X-Bootstrap-Secret': BOOTSTRAP_SECRET },
      data: { studentId, name },
    })
    expect(seedRes.status(), `add-eligible failed: ${await seedRes.text().catch(() => '')}`).toBe(200)

    await page.goto('/signup')

    await page.locator('#studentId').fill(studentId)
    await page.locator('#name').fill(name)
    await page.locator('#email').fill(`e2e-${Date.now()}@example.com`)
    await page.locator('#password').fill('Member1234!@')
    await page.locator('#passwordConfirm').fill('Member1234!@')
    await page.locator('#aspiration').fill('동아리 활동에 적극 참여하고 싶습니다.')
    // Current-student signup requires at least one interest selected.
    await page.getByRole('button', { name: '웹', exact: true }).click()

    const signupResponse = page.waitForResponse(
      (res) => res.url().includes('/api/auth/signup') && res.request().method() === 'POST',
    )
    // The signup form's submit button ("회원가입" / "가입 처리 중...").
    await page.locator('#main-content button[type="submit"]').click()

    // The real backend must accept the signup (2xx) and the SPA must advance to
    // the email-verification step (the signup verify step shows
    // "이메일로 인증코드를 발송했습니다." and an "인증 완료" button).
    const res = await signupResponse
    expect(res.status(), `signup failed: ${await res.text().catch(() => '')}`).toBeLessThan(400)
    await expect(page.getByText('이메일로 인증코드를 발송했습니다.')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: '인증 완료' })).toBeVisible()
  })
})
