import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mockAdminApis, mockOptionalApis } from './visualSupport.js'

// Only serious/critical findings fail the suite; axe also reports minor/moderate
// issues that we surface in the attachment but do not gate on yet.
const BLOCKING_IMPACTS = ['serious', 'critical']

// The route-enter fade (.coms-page-enter) animates opacity for 360ms; if axe
// scans mid-fade it measures semi-transparent text against the backdrop and
// reports bogus color-contrast violations. The app disables the fade under
// prefers-reduced-motion, so run the scans in that mode for determinism.
test.use({ reducedMotion: 'reduce' })

test.describe('first-visit intro', () => {
  test.use({ reducedMotion: 'no-preference' })

  test('visible skip control is available to assistive technology', async ({ page }) => {
    await mockAdminApis(page)
    await page.goto('/')
    const skip = page.getByRole('button', { name: /skip/i })
    await expect(skip).toBeVisible()
    await skip.click()
    await expect(skip).toBeHidden()
  })
})

const samplePost = {
  id: 77,
  title: '접근성 점검 게시글',
  content: '접근성 스캔을 위한 본문입니다.',
  category: 'GENERAL',
  authorName: '작성자',
  authorDisplayName: '작성자',
  authorStudentId: '2025123456',
  authorAdmin: false,
  editable: true,
  createdAt: '2026-06-22T01:00:00',
  updatedAt: null,
  viewCount: 3,
  upvotes: 0,
  downvotes: 0,
  myVote: 0,
  commentCount: 0,
}

async function mockCommunity(page) {
  await page.route('**/api/community/posts{,?*}', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, json: [samplePost] })
    }
    return route.fallback()
  })
  await page.route('**/api/community/posts/77', (route) => route.fulfill({ status: 200, json: samplePost }))
  await page.route('**/api/community/posts/77/comments', (route) => route.fulfill({ status: 200, json: [] }))
}

async function assertNoSeriousViolations(page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  const blocking = results.violations.filter((violation) => BLOCKING_IMPACTS.includes(violation.impact))
  const summary = blocking.map((violation) => `${violation.id} (${violation.impact}): ${violation.nodes.length} node(s)`)
  expect(blocking, summary.join('\n')).toEqual([])
}

test('home page has no serious or critical accessibility violations', async ({ page }) => {
  await mockAdminApis(page)
  await page.goto('/')
  await expect(page.locator('body')).toContainText("KW COM's")
  await expect(page.getByRole('heading', { level: 1, name: "COM's" })).toBeVisible()
  // The lower home sections lazy-mount as they scroll into view; axe scanning
  // while a section is mid-mount reads its not-yet-revealed (transparent) text
  // as bogus color-contrast violations. Walk the page to mount everything and
  // let it settle before analyzing.
  await page.evaluate(async () => {
    for (let y = 0; y <= document.body.scrollHeight; y += 800) {
      window.scrollTo(0, y)
      await new Promise((resolve) => setTimeout(resolve, 60))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(700)
  await assertNoSeriousViolations(page)
})

test('desktop activity disclosure uses navigation semantics and closes with Escape', async ({ page }) => {
  await mockAdminApis(page)
  await page.goto('/')
  const toggle = page.getByRole('button', { name: 'Activity', exact: true })
  await toggle.click()
  const navigation = page.getByRole('navigation', { name: '활동 메뉴' })
  await expect(navigation).toBeVisible()
  await assertNoSeriousViolations(page)
  await page.keyboard.press('Escape')
  await expect(navigation).toBeHidden()
  await expect(toggle).toBeFocused()
})

test.describe('mobile navigation', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('open menu is accessible and Escape restores focus', async ({ page }) => {
    await mockOptionalApis(page)
    await page.goto('/')
    const toggle = page.getByRole('button', { name: '메뉴 열기' })
    await toggle.click()
    const navigation = page.getByRole('navigation', { name: '모바일 메뉴' })
    await expect(navigation).toBeVisible()
    await assertNoSeriousViolations(page)
    await page.keyboard.press('Escape')
    await expect(navigation).toBeHidden()
    await expect(page.getByRole('button', { name: '메뉴 열기' })).toBeFocused()
  })

  test('login form has no serious or critical accessibility violations', async ({ page }) => {
    await mockOptionalApis(page)
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: '로그인' })).toBeVisible()
    await assertNoSeriousViolations(page)
  })
})

test('community list has no serious or critical accessibility violations', async ({ page }) => {
  await mockAdminApis(page)
  await mockCommunity(page)
  await page.goto('/community')
  await expect(page.getByRole('button', { name: '글쓰기' })).toBeVisible()
  await assertNoSeriousViolations(page)
})

test('community post detail has no serious or critical accessibility violations', async ({ page }) => {
  await mockAdminApis(page)
  await mockCommunity(page)
  await page.goto('/community/77')
  await expect(page.getByRole('heading', { name: '접근성 점검 게시글' })).toBeVisible()
  await assertNoSeriousViolations(page)
})

test('admin panel has no serious or critical accessibility violations', async ({ page }) => {
  await mockAdminApis(page)
  await page.goto('/admin')
  await expect(page.getByRole('tablist', { name: '관리자 패널 섹션' })).toBeVisible()
  await assertNoSeriousViolations(page)
})

const publicRoutes = ['/about', '/activities', '/projects', '/apps', '/sponsors', '/recruit', '/recruit-notice', '/login', '/signup']

for (const viewport of [{ width: 1280, height: 900 }, { width: 320, height: 720 }]) {
  test.describe(`public routes at ${viewport.width}px`, () => {
    test.use({ viewport })

    for (const route of publicRoutes) {
      test(`${route} has no serious accessibility violation or horizontal overflow`, async ({ page }) => {
        await mockOptionalApis(page)
        await page.goto(route)
        await expect(page.locator('#main-content')).toBeVisible()
        await expect.poll(() => page.locator('#main-content').innerText()).not.toBe('')
        // Detail pages fade in after navigation; scan at full opacity to avoid transient contrast readings.
        await page.waitForTimeout(500)
        await assertNoSeriousViolations(page)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow, `${route} overflows at ${viewport.width}px`).toBeLessThanOrEqual(1)
      })
    }
  })
}
