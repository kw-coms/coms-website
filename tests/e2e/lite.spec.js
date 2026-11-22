import { expect, test } from '@playwright/test'
import { mockOptionalApis } from './visualSupport.js'

// Runs in the `lite-visual` project (storageState pins the lite look).
test('the lite opening keeps its title, actions, and illustration in the first desktop viewport', async ({ page }) => {
  await mockOptionalApis(page)
  await page.addInitScript(() => window.sessionStorage.setItem('coms.intro.played:v1', '1'))
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-perf', 'lite')
  const opening = page.locator('#opening')
  await expect(opening.getByRole('heading', { level: 1 })).toBeInViewport({ ratio: 1 })
  await expect(opening.getByRole('button', { name: '동아리 소개' })).toBeInViewport({ ratio: 1 })
  await expect(opening.getByRole('button', { name: '지원하기' })).toBeInViewport({ ratio: 1 })
  await expect(opening.locator('.scene-opening__art')).toBeInViewport({ ratio: 1 })
  await expect(opening.locator('.scene-opening__floor')).toBeHidden()
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
    await page.evaluate(() => window.scrollTo({ top: 800, behavior: 'instant' }))
    const topButton = page.locator('.coms-to-top.is-visible')
    await expect(topButton).toBeVisible()
    await expect.poll(async () => {
      const noticeBox = await notice.boundingBox()
      const topBox = await topButton.boundingBox()
      return Math.max(topBox.y - (noticeBox.y + noticeBox.height), noticeBox.y - (topBox.y + topBox.height))
    }).toBeGreaterThanOrEqual(-1)
  })
})
