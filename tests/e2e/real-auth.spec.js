import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Buffer } from 'node:buffer'

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
// The runner provides a local SMTP sink. The signup test receives a real mail,
// confirms its code, then logs in as the newly created member.

const ORIGIN = 'http://localhost:3000'
const MAILBOX_PATH = fileURLToPath(new URL('../../test-results/coms-e2e-mailbox.json', import.meta.url))

// Auto-seeded dev admin (see backend DevDataInitializer). Login-able without
// email verification because ADMINs bypass the gate.
const ADMIN = { identifier: 'admin', password: process.env.COMS_E2E_ADMIN_PASSWORD }

test.describe('real backend auth', () => {
  test('archive uploads one post with two attachments and downloads the original bytes', async ({ page }) => {
    const login = await page.request.post('/api/auth/login', {
      headers: { Origin: ORIGIN },
      data: { identifier: ADMIN.identifier, password: ADMIN.password, rememberMe: false },
    })
    expect(login.status()).toBe(200)
    const title = `다중 첨부 검증 ${Date.now()}`
    const files = [
      { name: 'first.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 first attachment') },
      { name: 'second.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 second attachment') },
    ]
    let postId
    try {
      await page.goto('/resources')
      await page.getByRole('button', { name: '자료 올리기' }).click()
      await page.getByPlaceholder('자료 제목').fill(title)
      await page.locator('input[type="file"]').setInputFiles(files)
      await expect(page.locator('[contenteditable="true"]').first()).toBeVisible()
      const creating = page.waitForResponse(response => new URL(response.url()).pathname === '/api/files' && response.request().method() === 'POST')
      await page.getByRole('button', { name: '등록', exact: true }).click()
      const created = await creating
      expect(created.status()).toBe(200)
      const saved = await created.json()
      postId = saved.id
      expect(saved.title).toBe(title)
      expect(saved.attachments.map(file => file.originalName)).toEqual(['first.pdf', 'second.pdf'])
      const listed = await page.request.get('/api/files')
      expect((await listed.json()).filter(post => post.title === title)).toHaveLength(1)
      await page.getByRole('button', { name: '첨부파일 2개', exact: true }).click()
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()

      for (const file of files) {
        const link = page.getByRole('link', { name: `${file.name} 다운로드`, exact: true })
        const download = await page.request.get(await link.getAttribute('href'))
        expect(download.status()).toBe(200)
        expect(await download.body()).toEqual(file.buffer)
        expect(download.headers()['content-disposition']).toContain('attachment')
        expect(download.headers()['cache-control']).toContain('no-store')
      }

      await page.getByRole('button', { name: '수정', exact: true }).click()
      await expect(page.getByText('2개 기존 파일 유지')).toBeVisible()
      await page.getByPlaceholder('자료 제목').fill(`${title} 수정`)
      await expect(page.locator('[contenteditable="true"]').first()).toBeVisible()
      const updating = page.waitForResponse(response => new URL(response.url()).pathname === `/api/files/${postId}` && response.request().method() === 'PUT')
      await page.getByRole('button', { name: '수정 저장' }).click()
      const updated = await updating
      expect(updated.status()).toBe(200)
      expect((await updated.json()).attachments.map(file => file.id)).toEqual(saved.attachments.map(file => file.id))
      await expect(page.getByRole('heading', { name: `${title} 수정`, exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: 'second.pdf 다운로드', exact: true })).toBeVisible()
    } finally {
      if (postId) {
        const removed = await page.request.delete(`/api/files/${postId}`, { headers: { Origin: ORIGIN } })
        expect(removed.status()).toBe(204)
      }
    }
  })

  test('dev admin logs in through the UI and reaches a gated page', async ({ page }) => {
    await page.goto('/login')

    await page.locator('#identifier').fill(ADMIN.identifier)
    await page.locator('#password').fill(ADMIN.password)
    // The header also has a "로그인" button; target the login form's submit.
    await page.locator('#main-content button[type="submit"]').click()

    // After a successful login the SPA leaves /login (onSuccess navigation).
    await expect(page).not.toHaveURL(/\/login$/, { timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible()

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
    const browserMeStatus = await page.evaluate(async () => {
      const response = await fetch('/api/auth/me', { credentials: 'include' })
      return response.status
    })
    expect(browserMeStatus, 'browser fetch must retain the session cookie').toBe(200)

    // A gated page renders for the authenticated session (the RequireAuth guard
    // would redirect to /login otherwise). Simulate a brief backend outage on
    // the first /me request after navigation: AuthProvider should retry it.
    let transientMeCount = 0
    await page.route('**/api/auth/me', async (route) => {
      if (transientMeCount++ === 0) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"temporary outage"}' })
      } else {
        await route.continue()
      }
    })
    await page.goto('/community')
    await expect(page).toHaveURL(/\/community$/, { timeout: 15_000 })
    await expect(page).not.toHaveURL(/\/login$/)
    expect(transientMeCount).toBeGreaterThanOrEqual(2)
  })

  test('fresh UI signup checks the roster phone, sends mail, verifies and logs in', async ({ page, request }) => {
    // Seed an eligible-roster entry through the real admin API. The test uses
    // a separate API context so the signup page remains signed out.
    const studentId = `2026${String(Date.now()).slice(-6).padStart(6, '0')}`
    const name = '김철수'
    const email = `e2e-${Date.now()}@example.com`
    const phone = '01012345678'

    const loginRes = await request.post('/api/auth/login', {
      headers: { Origin: ORIGIN },
      data: { identifier: ADMIN.identifier, password: ADMIN.password, rememberMe: false },
    })
    expect(loginRes.status()).toBe(200)

    const seedRes = await request.post('/api/admin/eligible-members', {
      headers: { Origin: ORIGIN },
      data: { studentId, name, generation: '60', phone },
    })
    expect(seedRes.status(), `add-eligible failed: ${await seedRes.text().catch(() => '')}`).toBe(204)

    await page.goto('/signup')

    await page.locator('#studentId').fill(studentId)
    await page.locator('#name').fill(name)
    await page.locator('#email').fill(email)
    await page.locator('#password').fill('Member1234!@')
    await page.locator('#passwordConfirm').fill('Member1234!@')
    await page.locator('#aspiration').fill('동아리 활동에 적극 참여하고 싶습니다.')
    // Current-student signup requires at least one interest selected.
    await page.getByRole('button', { name: '웹', exact: true }).click()
    await expect(page.getByText('명부에 전화번호가 등록돼 있다면 같은 번호를 입력해야 가입할 수 있습니다.')).toBeVisible()

    const rejectedSignup = page.waitForResponse(
      (res) => res.url().includes('/api/auth/signup') && res.request().method() === 'POST',
    )
    await page.locator('#main-content button[type="submit"]').click()
    expect((await rejectedSignup).status()).toBe(403)
    await expect(page.getByText('명부에 등록된 학번 또는 졸업생 인증 정보, 이름, 전화번호를 확인해주세요.')).toBeVisible()

    await page.locator('#phone').fill(phone)

    const signupResponse = page.waitForResponse(
      (res) => res.url().includes('/api/auth/signup') && res.request().method() === 'POST',
    )
    // The signup form's submit button ("회원가입" / "가입 처리 중...").
    await page.locator('#main-content button[type="submit"]').click()

    // The real backend must accept the signup and send the code over SMTP.
    const res = await signupResponse
    expect(res.status(), `signup failed: ${await res.text().catch(() => '')}`).toBeLessThan(400)
    await expect(page.getByText('이메일로 인증코드를 발송했습니다.')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: '인증 완료' })).toBeVisible()

    let receivedMail
    await expect.poll(() => {
      try {
        receivedMail = JSON.parse(readFileSync(MAILBOX_PATH, 'utf8'))
        return receivedMail.to
      } catch { return null }
    }, { timeout: 10_000 }).toBe(email)
    expect(receivedMail.code).toMatch(/^\d{6}$/)

    await page.locator('input[autocomplete="one-time-code"]').fill(receivedMail.code)
    await page.getByRole('button', { name: '인증 완료' }).click()
    await expect(page.getByText('인증이 완료되어 계정이 생성되었습니다.')).toBeVisible()

    await page.getByRole('button', { name: '로그인하러 가기' }).click()
    await page.locator('#identifier').fill(studentId)
    await page.locator('#password').fill('Member1234!@')
    await page.locator('#main-content button[type="submit"]').click()
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible({ timeout: 15_000 })
    const me = await page.request.get('/api/auth/me')
    expect(me.status()).toBe(200)
    const profile = await me.json()
    expect(profile.studentId).toBe(studentId)
    // 가입 화면이 기수를 보내지 않아도 위에서 명부에 심은 60기가 계정에 들어가야 한다.
    expect(profile.generation).toBe('60')
  })
})
