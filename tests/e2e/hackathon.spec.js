import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mockAdminApis, mockOptionalApis } from './visualSupport.js'

test.use({ serviceWorkers: 'block' })

for (const width of [320, 390, 1280]) {
  test(`alumni can evaluate and leave feedback without login at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await mockOptionalApis(page)
    await page.route('**/api/hackathon', (route) => route.fulfill({ json: { open: true } }))
    const submissions = []
    await page.route('**/api/hackathon/reviews', async (route) => {
      submissions.push(route.request().postDataJSON())
      return route.fulfill({ status: 201, json: { projectId: 'wargether' } })
    })
    await page.goto('/hackathon')
    await expect(page.getByRole('heading', { name: 'COM’s 해커톤 2026', exact: true })).toBeVisible()
    await expect(page.locator('[data-members-gate]')).toHaveCount(0)
    await expect(page.locator('#wargether button[type="submit"]')).toBeDisabled()
    await page.getByLabel('기수', { exact: true }).fill('42')
    await page.getByLabel('이름', { exact: true }).fill('홍길동')
    const form = page.getByRole('form', { name: 'wargether 채점' })
    for (const select of await form.locator('select').all()) await select.selectOption('20')
    await form.locator('textarea').fill('좋은 연결 아이디어입니다.')
    await expect(form).toContainText('합계 100 / 100점')
    await form.getByRole('button', { name: '평가 제출', exact: true }).click()
    await expect(page.locator('#wargether')).toContainText('평가가 접수되었습니다')
    expect(submissions).toEqual([{ projectId: 'wargether', generation: 42, name: '홍길동', themeFit: 20, creativity: 20, technology: 20, completeness: 20, practicality: 20, feedback: '좋은 연결 아이디어입니다.' }])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.locator('video[preload="none"]')).toHaveCount(3)
  })
}

test('duplicate errors preserve scores and a closed event disables submissions', async ({ page }) => {
  await mockOptionalApis(page)
  let open = true
  await page.route('**/api/hackathon', (route) => route.fulfill({ json: { open } }))
  await page.route('**/api/hackathon/reviews', (route) => route.fulfill({ status: 409, json: { message: '이 기수와 이름으로 이 팀의 평가를 이미 제출했습니다.' } }))
  await page.goto('/hackathon')
  await page.getByLabel('기수', { exact: true }).fill('42')
  await page.getByLabel('이름', { exact: true }).fill('홍길동')
  const form = page.getByRole('form', { name: 'wargether 채점' })
  for (const select of await form.locator('select').all()) await select.selectOption('0')
  await form.getByRole('button', { name: '평가 제출', exact: true }).click()
  await expect(form.getByRole('alert')).toContainText('이미 제출했습니다')
  await expect(form.locator('select').first()).toHaveValue('0')
  open = false
  await page.reload()
  await expect(page.getByRole('status').filter({ hasText: '평가가 마감되었습니다' })).toBeVisible()
  for (const button of await page.getByRole('button', { name: '평가 제출', exact: true }).all()) await expect(button).toBeDisabled()
})

for (const width of [390, 1280]) {
  test(`chair confirms individual deletion and sees updated totals at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockAdminApis(page)
    const review = (id, name, score, chair = false) => ({
      id, name, chair, projectId: 'wargether', generation: chair ? null : 42,
      themeFit: score, creativity: score, technology: score, completeness: score, practicality: score,
      feedback: '평가 피드백', createdAt: '2026-11-18T12:00:00',
    })
    let reviews = [review(1, '남길평가', 10), review(2, '삭제대상', 20), review(3, '회장', 15, true)]
    let failDelete = true
    const deleted = []
    await page.route('**/api/hackathon', (route) => route.fulfill({ json: { open: true } }))
    await page.route('**/api/admin/hackathon/reviews', (route) => route.fulfill({ json: reviews }))
    await page.route('**/api/admin/hackathon/reviews/*', async (route) => {
      expect(route.request().method()).toBe('DELETE')
      const id = Number(route.request().url().split('/').at(-1))
      deleted.push(id)
      if (failDelete) return route.fulfill({ status: 500, json: { message: '삭제 실패' } })
      reviews = reviews.filter((item) => item.id !== id)
      return route.fulfill({ status: 204 })
    })
    await page.goto('/admin?tab=hackathon')
    const section = page.getByRole('region', { name: '해커톤 평가 관리' })
    const totals = section.locator('tbody tr').filter({ hasText: 'wargether' })
    await expect(totals.locator('td').nth(3)).toHaveText('75.00점')
    const project = section.locator('article').filter({ has: page.getByRole('heading', { name: 'wargether · 회장 평가', exact: true }) })
    await project.locator('summary').click()
    const remove = project.getByRole('button', { name: '42기 삭제대상 평가 삭제', exact: true })
    const dialog = page.getByRole('dialog', { name: '해커톤 평가 삭제' })
    await remove.click()
    await expect(dialog).toContainText('wargether의 42기 삭제대상')
    await expect(dialog).toContainText('복구할 수 없습니다')
    const accessibility = await new AxeBuilder({ page }).include('.coms-confirm-card').analyze()
    expect(accessibility.violations.map((violation) => violation.id)).toEqual([])
    await dialog.getByRole('button', { name: '취소', exact: true }).click()
    expect(deleted).toEqual([])
    await expect(remove).toBeVisible()
    await remove.click()
    await dialog.getByRole('button', { name: '평가 삭제', exact: true }).click()
    await expect(section.getByRole('alert')).toBeVisible()
    await expect(remove).toBeVisible()
    failDelete = false
    await remove.click()
    await dialog.getByRole('button', { name: '평가 삭제', exact: true }).click()
    await expect(remove).toHaveCount(0)
    await expect(totals.locator('td').nth(2)).toHaveText('1명')
    await expect(totals.locator('td').nth(3)).toHaveText('50.00점')
    await expect(totals.locator('td').nth(5)).toHaveText('62.50점')
    await expect(project.getByText('42기 남길평가', { exact: true })).toBeVisible()
    await project.getByRole('button', { name: 'wargether 회장 평가 삭제', exact: true }).click()
    await dialog.getByRole('button', { name: '평가 삭제', exact: true }).click()
    await expect(totals.locator('td').nth(4)).toHaveText('미집계')
    await expect(totals.locator('td').nth(5)).toHaveText('미집계')
    await expect(project.locator('form select').first()).toHaveValue('')
    expect(deleted).toEqual([2, 2, 3])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
