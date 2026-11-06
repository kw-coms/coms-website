import { expect, test } from '@playwright/test'
import { mockOptionalApis } from './visualSupport.js'

// Runs in the `lite-visual` project (storageState pins the lite look).
test('home in the lite look', async ({ page }) => {
  await mockOptionalApis(page)
  await page.addInitScript(() => window.sessionStorage.setItem('coms.intro.played:v1', '1'))
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-perf', 'lite')
  await page.waitForTimeout(800)
  await expect(page).toHaveScreenshot('home-lite.png', { maxDiffPixelRatio: 0.03 })
})

test.describe('notice placement at 360px', () => {
  test.use({ viewport: { width: 360, height: 740 } })

  test('the one-time notice does not cover the back-to-top button (the tab bar sits at the top)', async ({ page }) => {
    await mockOptionalApis(page)
    await page.addInitScript(() => {
      window.sessionStorage.setItem('coms.intro.played:v1', '1')
      window.localStorage.setItem('kwcoms-perf-mode:v1', 'auto')
      const real = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (type, opts) {
        return type === 'webgl' && opts?.failIfMajorPerformanceCaveat ? null : real.call(this, type, opts)
      }
    })
    await page.goto('/activities')
    const notice = page.locator('.coms-perf-notice')
    await expect(notice).toBeVisible()
    const noticeBox = await notice.boundingBox()
    const topBox = await page.locator('.coms-to-top').boundingBox()
    expect(noticeBox.y + noticeBox.height).toBeLessThanOrEqual(topBox.y + 1)
  })
})
