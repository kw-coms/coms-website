import { expect, test } from '@playwright/test'
import { mockAdminApis } from './visualSupport.js'

const application = (overrides = {}) => ({
  id: 7, name: '김지원', studentId: '2026123000', department: '컴퓨터정보공학부',
  grade: '1학년', phone: '01012345678', email: 'apply@example.com',
  interests: '웹', motive: '함께 만들고 싶습니다.', expectation: '스터디',
  status: 'RECEIVED', adminNote: '', submittedAt: '2026-06-15T09:00:00',
  ...overrides,
})

for (const succeeds of [true, false]) {
  test(`a delayed ${succeeds ? 'successful' : 'failed'} status save preserves a memo still being typed`, async ({ page }) => {
    await mockAdminApis(page)
    let saved = application()
    let release
    const pending = new Promise((resolve) => { release = resolve })
    const payloads = []
    await page.route('**/api/admin/recruit-applications', (route) => route.fulfill({ json: [saved] }))
    await page.route('**/api/admin/recruit-applications/7/status', async (route) => {
      const payload = route.request().postDataJSON()
      payloads.push(payload)
      if (payloads.length === 1) {
        await pending
        if (!succeeds) return route.fulfill({ status: 500, json: { message: '상태 저장 실패' } })
      }
      saved = { ...saved, ...payload }
      await route.fulfill({ json: saved })
    })
    await page.goto('/admin?tab=recruit')
    await page.getByLabel('김지원 지원 상태').selectOption('REVIEWING')
    await expect.poll(() => payloads.length).toBe(1)
    const memo = page.getByLabel('김지원 운영 메모')
    await memo.fill('아직 입력 중인 메모')
    release()
    await expect(page.getByRole('status', { name: '김지원 저장 상태' })).toContainText(succeeds ? '저장됨' : '저장하지 못했습니다')
    await expect(memo).toBeFocused()
    await expect(memo).toHaveValue('아직 입력 중인 메모')
    await memo.blur()
    await expect.poll(() => payloads.length).toBe(2)
    expect(payloads[1]).toEqual({ status: succeeds ? 'REVIEWING' : 'RECEIVED', adminNote: '아직 입력 중인 메모' })
    await expect(page.getByRole('status', { name: '김지원 저장 상태' })).toContainText('저장됨')
  })
}

test('a queued memo save does not hide a failed status change', async ({ page }) => {
  await mockAdminApis(page)
  let saved = application()
  let release
  const pending = new Promise((resolve) => { release = resolve })
  const payloads = []
  await page.route('**/api/admin/recruit-applications', (route) => route.fulfill({ json: [saved] }))
  await page.route('**/api/admin/recruit-applications/7/status', async (route) => {
    const payload = route.request().postDataJSON()
    payloads.push(payload)
    if (payloads.length === 1) {
      await pending
      return route.fulfill({ status: 500, json: { message: '상태 저장 실패' } })
    }
    saved = { ...saved, ...payload }
    await route.fulfill({ json: saved })
  })
  await page.goto('/admin?tab=recruit')
  await page.getByLabel('김지원 지원 상태').selectOption('REVIEWING')
  await expect.poll(() => payloads.length).toBe(1)
  await page.getByLabel('김지원 운영 메모').fill('이어 저장한 메모')
  await page.getByLabel('김지원 운영 메모').blur()
  release()
  await expect.poll(() => payloads.length).toBe(2)
  const state = page.getByRole('status', { name: '김지원 저장 상태' })
  await expect(state).toContainText('저장하지 못했습니다')
  await expect(state).toContainText('HTTP 500')
  await expect(page.getByLabel('김지원 지원 상태')).toHaveValue('RECEIVED')
  await expect(page.getByLabel('김지원 운영 메모')).toHaveValue('이어 저장한 메모')
})

test('status change and memo blur save in order without losing either field', async ({ page }) => {
  await mockAdminApis(page)
  let saved = application()
  let releaseFirst
  const firstBlocked = new Promise((resolve) => { releaseFirst = resolve })
  const payloads = []
  await page.route('**/api/admin/recruit-applications', (route) => route.fulfill({ json: [saved] }))
  await page.route('**/api/admin/recruit-applications/7/status', async (route) => {
    const payload = route.request().postDataJSON()
    payloads.push(payload)
    if (payloads.length === 1) await firstBlocked
    saved = { ...saved, ...payload }
    await route.fulfill({ json: saved })
  })

  await page.goto('/admin?tab=recruit')
  await page.getByLabel('김지원 지원 상태').selectOption('REVIEWING')
  await expect.poll(() => payloads.length).toBe(1)
  await page.getByLabel('김지원 운영 메모').fill('면담 일정 조율 중')
  await page.getByLabel('김지원 운영 메모').blur()
  await page.waitForTimeout(150)
  expect(payloads).toHaveLength(1)
  releaseFirst()
  await expect.poll(() => payloads.length).toBe(2)
  expect(payloads).toEqual([
    { status: 'REVIEWING', adminNote: '' },
    { status: 'REVIEWING', adminNote: '면담 일정 조율 중' },
  ])
  await expect(page.getByRole('status', { name: '김지원 저장 상태' })).toContainText('저장됨')
  await expect(page.getByLabel('김지원 지원 상태')).toHaveValue('REVIEWING')
  await expect(page.getByLabel('김지원 운영 메모')).toHaveValue('면담 일정 조율 중')
})

test('reject confirms deletion and cancel leaves the application untouched', async ({ page }) => {
  await mockAdminApis(page)
  const payloads = []
  await page.route('**/api/admin/recruit-applications', (route) => route.fulfill({ json: [application()] }))
  await page.route('**/api/admin/recruit-applications/7/status', (route) => {
    payloads.push(route.request().postDataJSON())
    return route.fulfill({ json: application({ status: 'REJECTED' }) })
  })

  await page.goto('/admin?tab=recruit')
  await page.getByLabel('김지원 지원 상태').selectOption('REJECTED')
  await expect(page.locator('.coms-confirm-message')).toContainText('지원서는 삭제됩니다')
  await page.locator('.coms-confirm-card').getByRole('button', { name: /취소|아니/ }).click()
  expect(payloads).toHaveLength(0)
  await expect(page.getByLabel('김지원 지원 상태')).toHaveValue('RECEIVED')
})

test('CSV export treats a formula after leading spaces as text', async ({ page }) => {
  await mockAdminApis(page)
  await page.route('**/api/admin/recruit-applications', (route) => route.fulfill({ json: [application({ motive: '  =1+1' })] }))
  await page.goto('/admin?tab=recruit')
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'CSV 내보내기' }).click()
  const download = await downloading
  const chunks = []
  for await (const chunk of await download.createReadStream()) chunks.push(chunk)
  expect(Buffer.concat(chunks).toString('utf8')).toContain('"\'  =1+1"')
})

test('undo restores only the most recent memo edit', async ({ page }) => {
  await mockAdminApis(page)
  let saved = application()
  const payloads = []
  await page.route('**/api/admin/recruit-applications', (route) => route.fulfill({ json: [saved] }))
  await page.route('**/api/admin/recruit-applications/7/status', (route) => {
    const payload = route.request().postDataJSON()
    payloads.push(payload)
    saved = { ...saved, ...payload }
    return route.fulfill({ json: saved })
  })

  await page.goto('/admin?tab=recruit')
  await page.getByLabel('김지원 지원 상태').selectOption('REVIEWING')
  await expect(page.getByRole('status', { name: '김지원 저장 상태' })).toContainText('저장됨')
  await page.getByLabel('김지원 운영 메모').fill('면담 예약')
  await page.getByLabel('김지원 운영 메모').blur()
  const state = page.getByRole('status', { name: '김지원 저장 상태' })
  await expect.poll(() => payloads.length).toBe(2)
  await expect(state).toContainText('저장됨')
  await state.getByRole('button', { name: '되돌리기' }).click()
  await expect.poll(() => payloads.length).toBe(3)
  expect(payloads[2]).toEqual({ status: 'REVIEWING', adminNote: '' })
  await expect(page.getByLabel('김지원 지원 상태')).toHaveValue('REVIEWING')
  await expect(page.getByLabel('김지원 운영 메모')).toHaveValue('')
})
