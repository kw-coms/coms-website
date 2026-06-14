import { expect, test } from '@playwright/test'
import { mockOptionalApis } from './visualSupport.js'

test.beforeEach(async ({ page }) => {
  await mockOptionalApis(page)
})

test('activities mobile title visual baseline', async ({ page }) => {
  await page.goto('/activities')
  await page.evaluate(() => {
    document.documentElement.style.setProperty(
      '--apple-font-family',
      '"Pretendard Variable", -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Apple SD Gothic Neo", "Segoe UI", "Malgun Gothic", sans-serif',
    )
  })

  await expect(page.locator('.apple-detail-title')).toHaveScreenshot('activities-title-mobile.png')
})
