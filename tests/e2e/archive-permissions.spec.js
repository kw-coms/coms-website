import { expect, test } from '@playwright/test'
import { mockAdminApis, mockOptionalApis, signInHint } from './visualSupport.js'

const archiveFiles = [
  { id: 801, title: '운영 회의록', originalName: 'minutes.pdf', uploadedBy: 'other', uploaderName: '운영진', category: 'GENERAL', visibility: 'MEMBERS', fileSize: 2048, uploadedAt: '2026-11-20T12:00:00', viewCount: 12 },
  { id: 802, title: '가을 학술회지', originalName: 'journal.zip', uploadedBy: 'other', uploaderName: '편집부', category: 'ACADEMIC_JOURNAL', visibility: 'PUBLIC', fileSize: 8192, uploadedAt: '2026-11-21T12:00:00', viewCount: 5 },
]

test('archive controls honor the individual grant and save selected visibility', async ({ page }) => {
  await mockAdminApis(page)
  await signInHint(page)
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 2, studentId: 'viewer', role: 'USER', name: '회원', emailVerified: true } }))
  await page.route('**/api/permissions/me', route => route.fulfill({ json: { role: 'USER', permissions: ['archive.visibility'] } }))
  await page.route('**/api/files', route => route.fulfill({ json: archiveFiles }))
  await page.route('**/api/files/visibility-members?*', route => route.fulfill({ json: [{ studentId: '2026000001', name: '지정 회원', role: 'USER' }] }))
  let saved
  await page.route('**/api/files/801/visibility', async route => {
    saved = route.request().postDataJSON()
    await route.fulfill({ json: { ...archiveFiles[0], ...saved } })
  })
  await page.goto('/admin?tab=files')
  await expect(page.getByRole('heading', { name: '운영 회의록', exact: true })).toBeVisible()
  for (const name of ['수정', '삭제', '작성자 변경']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0)
  await page.getByLabel('자료 검색', { exact: true }).fill('journal.zip')
  await expect(page.getByRole('heading', { name: '가을 학술회지', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '운영 회의록', exact: true })).toHaveCount(0)
  await page.getByLabel('자료 검색', { exact: true }).clear()
  await page.getByLabel('운영 회의록 공개 범위', { exact: true }).selectOption('SELECTED')
  await page.getByLabel('지정 회원 · 2026000001').check()
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await expect.poll(() => saved).toEqual({ visibility: 'SELECTED', selectedStudentIds: ['2026000001'] })
  await expect(page.getByText('지정 회원 수정', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/archive-files-desktop.png', fullPage: true })
})

test('archive mobile controls fit, retry errors, and offer upload visibility', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockAdminApis(page)
  let failed = true
  await page.route('**/api/files', route => route.fulfill(failed
    ? { status: 500, json: { message: '목록을 읽지 못했습니다.' } }
    : { json: archiveFiles }))
  await page.goto('/admin?tab=files')
  await expect(page.getByRole('alert').filter({ hasText: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요. (HTTP 500)' })).toBeVisible()
  failed = false
  await page.getByRole('button', { name: '다시 시도', exact: true }).click()
  await expect(page.getByRole('heading', { name: '운영 회의록', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  for (const name of ['수정', '삭제', '작성자 변경']) {
    const box = await page.getByRole('button', { name, exact: true }).first().boundingBox()
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.width).toBeGreaterThanOrEqual(44)
  }
  await page.screenshot({ path: 'test-results/archive-files-mobile.png', fullPage: true })
  await page.getByRole('button', { name: '파일 업로드', exact: true }).click()
  await expect(page.getByRole('radio', { name: '동아리원', exact: true })).toBeChecked()
  await expect(page.getByRole('radio', { name: '전체 공개', exact: true })).toBeEnabled()
  await expect(page.getByRole('radio', { name: '지정 회원', exact: true })).toBeEnabled()
})

test('guest follows a PUBLIC archive link without a member gate', async ({ page }) => {
  await mockOptionalApis(page)
  await page.route('**/api/files', route => route.fulfill({ json: [archiveFiles[1]] }))
  await page.route('**/api/files/802', route => route.fulfill({ json: archiveFiles[1] }))
  await page.goto('/resources/802')
  await expect(page.getByRole('heading', { name: '가을 학술회지', exact: true })).toBeVisible()
  await expect(page.locator('[data-members-gate]')).toHaveCount(0)
  await expect(page.getByRole('link', { name: '다운로드', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '삭제', exact: true })).toHaveCount(0)
})
