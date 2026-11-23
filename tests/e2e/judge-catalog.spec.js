import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { asMember, mockOptionalApis } from './visualSupport.js'

test.use({ reducedMotion: 'reduce' })

test('catalog pages, number search and tier filtering survive direct links', async ({ page }, info) => {
  await mockOptionalApis(page)
  await page.goto('/study/algorithms?page=2')
  const list = page.getByRole('region', { name: '전체 문제' })
  await expect(list.locator('.judge-table-row')).toHaveCount(30)
  await expect(page.getByRole('button', { name: '2', exact: true })).toHaveAttribute('aria-current', 'page')
  await list.getByRole('searchbox', { name: '문제 검색' }).fill('1100')
  await expect(page).toHaveURL(/\?q=1100$/)
  await expect(list.locator('.judge-table-row')).toHaveCount(1)
  await page.reload()
  await expect(list.getByRole('searchbox', { name: '문제 검색' })).toHaveValue('1100')
  await list.getByRole('combobox', { name: '난이도' }).selectOption('gold')
  await expect(list.getByRole('status')).toHaveText(/\d+개 문제/)
  await list.getByRole('combobox', { name: '난이도' }).selectOption('12')
  await expect(page).toHaveURL(/tier=12/)
  await list.getByRole('searchbox', { name: '문제 검색' }).fill('')
  await expect(list.locator('.judge-table-row').first().getByLabel('COM’s 난도 골드 IV')).toBeVisible()
  await list.screenshot({ path: info.outputPath('judge-tier-filter.png') })
  await list.getByRole('button', { name: '초기화' }).click()
  await expect(list.locator('.judge-table-row')).toHaveCount(30)
})

test('catalog at phone width keeps actions and the next page usable', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockOptionalApis(page)
  await page.goto('/study/algorithms')
  const daily = page.getByRole('region', { name: '오늘의 문제' })
  const weekly = page.getByRole('region', { name: '주간 문제' })
  await expect(daily.getByRole('link', { name: /문제 풀기/ })).toBeVisible()
  await expect(weekly.getByRole('link', { name: /문제 풀기/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
  const accessibility = await new AxeBuilder({ page }).include('.judge-catalog').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(accessibility.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')).toEqual([])
  await page.screenshot({ path: info.outputPath('judge-catalog-mobile.png') })
  await page.getByRole('button', { name: '다음 페이지' }).click()
  await expect(page).toHaveURL(/page=2/)
})

test('member achievements reflect the verified judge record', async ({ page }) => {
  await mockOptionalApis(page)
  await asMember(page)
  await page.route('**/study/api/progress', (route) => route.fulfill({ status: 200, json: {
    solved: [1001, 1100], solvedToday: 1, streak: 3,
  } }))
  await page.goto('/study/algorithms')
  const achievements = page.getByRole('region', { name: '내 문제 풀이 기록' })
  await expect(achievements).toContainText('2채점 완료')
  await expect(achievements).toContainText('1오늘 해결')
  await expect(achievements).toContainText('3연속 풀이일')
  await expect(achievements.getByRole('button', { name: '기록 공유' })).toBeVisible()
  const list = page.getByRole('region', { name: '전체 문제' })
  await list.getByRole('combobox', { name: '해결 상태' }).selectOption('solved')
  await expect(list.locator('.judge-table-row')).toHaveCount(2)
})
