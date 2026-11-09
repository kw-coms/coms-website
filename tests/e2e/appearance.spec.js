import { expect, test } from '@playwright/test'
import { mockOptionalApis } from './visualSupport.js'

// The footer's "화면 설정" control: one button that opens a popover (desktop) or a bottom sheet (phones).
const trigger = (page) => page.getByRole('button', { name: '화면 설정', exact: true })
const dialog = (page) => page.getByRole('dialog', { name: '화면 설정' })

test.beforeEach(async ({ page }) => {
  await mockOptionalApis(page)
  await page.addInitScript(() => window.sessionStorage.setItem('coms.intro.played:v1', '1'))
})

const openFromFooter = async (page) => {
  await trigger(page).scrollIntoViewIfNeeded()
  await trigger(page).click()
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(dialog(page)).toBeVisible()
  await expect(trigger(page)).toHaveAttribute('aria-controls', (await dialog(page).getAttribute('id')) ?? '')
}

test.describe('desktop popover', () => {
  test('opens with focus inside; Esc closes it and returns focus to the button', async ({ page }) => {
    await page.goto('/activities')
    await openFromFooter(page)
    await expect(dialog(page)).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(trigger(page)).toBeFocused()
  })

  test('a click outside closes it', async ({ page }) => {
    await page.goto('/activities')
    await openFromFooter(page)
    await page.locator('.apple-footer-note').click()
    await expect(dialog(page)).toHaveCount(0)
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(trigger(page)).toBeFocused()
  })

  test('a route change closes it', async ({ page }) => {
    await page.goto('/activities')
    await openFromFooter(page)
    // Keyboard navigation: a pointer press on the link would already count as an outside click.
    const link = page.locator('.apple-global-nav').getByRole('button', { name: 'Notices', exact: true }).first()
    await link.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/notices/)
    await expect(dialog(page)).toHaveCount(0)
    // Back to the page it was opened on: it stays closed.
    await page.goBack()
    await expect(page).toHaveURL(/\/activities/)
    await expect(dialog(page)).toHaveCount(0)
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false')
  })

  test('the low-power notice opens it with the screen-effects choice focused', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('kwcoms-perf-mode:v1', 'auto')
      const real = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (type, opts) {
        return type === 'webgl' && opts?.failIfMajorPerformanceCaveat ? null : real.call(this, type, opts)
      }
    })
    await page.goto('/activities')
    const notice = page.locator('.coms-perf-notice').filter({ hasText: '가벼운 화면으로 바꿨어요' })
    await notice.getByRole('button', { name: '설정 열기' }).click()
    await expect(dialog(page)).toBeVisible()
    await expect(dialog(page).getByRole('radio', { name: '자동' })).toBeFocused()
  })
})

test.describe('phone bottom sheet', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('sits above the header and tab bar, traps Tab, and is modal', async ({ page }) => {
    await page.goto('/activities')
    await openFromFooter(page)
    await expect(dialog(page)).toHaveAttribute('aria-modal', 'true')

    await dialog(page).evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished))) // the sheet slides in
    const box = await dialog(page).boundingBox()
    const hit = (x, y) => page.evaluate(([px, py]) => {
      const el = document.elementFromPoint(px, py)
      return { inside: Boolean(el?.closest('[role="dialog"]')), backdrop: Boolean(el?.closest('.appearance-backdrop')) }
    }, [x, y])
    expect((await hit(box.x + box.width / 2, box.y + box.height / 2)).inside).toBe(true)
    expect((await hit(box.x + box.width / 2, box.y + 4)).inside).toBe(true)
    // The backdrop covers the fixed header and the tab bar under it.
    expect((await hit(195, 20)).backdrop).toBe(true)
    expect((await hit(195, 80)).backdrop).toBe(true)

    // Tab stays inside the sheet: wraps from the last control to the first, and back.
    const close = dialog(page).getByRole('button', { name: '화면 설정 닫기' })
    const reset = dialog(page).getByRole('button', { name: 'Reset' })
    await page.keyboard.press('Shift+Tab')
    await expect(reset).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(close).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(reset).toBeFocused()

    // A press on the backdrop closes it and hands focus back to the button.
    await page.mouse.click(195, 20)
    await expect(dialog(page)).toHaveCount(0)
    await expect(trigger(page)).toBeFocused()
  })
})
