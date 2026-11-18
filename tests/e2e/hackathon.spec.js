import { expect, test } from '@playwright/test'
import { mockOptionalApis } from './visualSupport.js'

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
