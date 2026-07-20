import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mockAdminApis } from './visualSupport.js'

// Only serious/critical findings fail the suite; axe also reports minor/moderate
// issues that we surface in the attachment but do not gate on yet.
const BLOCKING_IMPACTS = ['serious', 'critical']

// The route-enter fade (.coms-page-enter) animates opacity for 360ms; if axe
// scans mid-fade it measures semi-transparent text against the backdrop and
// reports bogus color-contrast violations. The app disables the fade under
// prefers-reduced-motion, so run the scans in that mode for determinism.
test.use({ reducedMotion: 'reduce' })

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
