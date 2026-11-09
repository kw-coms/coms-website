import { expect, test } from '@playwright/test'
import { mockOptionalApis } from './visualSupport.js'

test.describe('/activities timeline', () => {
  test.beforeEach(async ({ page }) => {
    await mockOptionalApis(page)
  })

  test('renders the semester sections, loads every photo and has alt text', async ({ page }) => {
    await page.goto('/activities')
    const timeline = page.locator('#timeline')
    for (const name of ['2026 1학기', '2026 여름방학 소모임', '2026 2학기', '예정']) {
      await expect(timeline.getByRole('heading', { level: 3, name })).toBeVisible()
    }
    await expect(timeline.getByRole('heading', { name: /57주년 COM’s 창립제/ })).toBeVisible()
    await expect(timeline.getByRole('heading', { name: /COM’s 해커톤 2026/ })).toBeVisible()
    await expect(timeline.getByRole('link', { name: /지원 안내 보기/ })).toHaveAttribute('href', '/recruit')

    const images = timeline.locator('img')
    const count = await images.count()
    expect(count).toBeGreaterThanOrEqual(12)
    for (let i = 0; i < count; i += 1) {
      const img = images.nth(i)
      await img.scrollIntoViewIfNeeded()
      expect((await img.getAttribute('alt')) ?? '').not.toBe('')
      await expect.poll(() => img.evaluate((el) => el.complete && el.naturalWidth > 0), { message: `image ${i} loads` }).toBe(true)
    }
  })

  test('lightbox opens, steps and closes with Esc, returning focus', async ({ page }) => {
    await page.goto('/activities')
    const trigger = page.locator('#timeline .act-photo').first()
    await trigger.scrollIntoViewIfNeeded()
    await trigger.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: '활동 사진 크게 보기' })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('img')).toHaveAttribute('alt', /.+/)
    await expect(dialog.getByText('1 / ')).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await expect(dialog.getByText('2 / ')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test('has no horizontal overflow at 390', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/activities')
    await expect(page.locator('#timeline')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  })

  // The hackathon status and progress come from the clock, not from stored text.
  const hackathonAt = [
    ['before the opening', '2026-11-08T17:00:00+09:00', '예정', '0'],
    ['mid-run', '2026-11-11T23:00:00+09:00', '진행 중', '77'],
    ['after the deadline', '2026-11-15T05:00:00+09:00', '완료', '154'],
  ]
  for (const [label, at, badge, elapsed] of hackathonAt) {
    test(`hackathon is ${badge} ${label}`, async ({ page }) => {
      await page.clock.setFixedTime(new Date(at))
      await page.goto('/activities')
      const card = page.locator('#timeline .act-live')
      await expect(card.locator('.act-status')).toHaveText(badge)
      const bar = card.getByRole('progressbar', { name: '해커톤 경과 시간' })
      await expect(bar).toHaveAttribute('aria-valuenow', elapsed)
      await expect(bar).toHaveAttribute('aria-valuemax', '154')
    })
  }
})
