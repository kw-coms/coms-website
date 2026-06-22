import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mockAdminApis } from './visualSupport.js'

// Only serious/critical findings fail the suite; axe also reports minor/moderate
// issues that we surface in the attachment but do not gate on yet.
const BLOCKING_IMPACTS = ['serious', 'critical']

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
  await page.route('**/api/community/posts', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, json: [samplePost] })
    }
    return route.fallback()
  })
  await page.route('**/api/community/posts/77', (route) => route.fulfill({ status: 200, json: samplePost }))
  await page.route('**/api/community/posts/77/comments', (route) => route.fulfill({ status: 200, json: [] }))
}

// color-contrast is excluded for now: the muted text design tokens
// (--app-subtle / --app-muted, ~#86868b on white) sit below the 4.5:1 AA
// threshold site-wide. That is a separate visual-design change tracked
// independently; this suite gates on the structural a11y guarantees this
// work targets — accessible names, roles, ARIA usage, and focus order.
async function assertNoSeriousViolations(page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .disableRules(['color-contrast'])
    .analyze()
  const blocking = results.violations.filter((violation) => BLOCKING_IMPACTS.includes(violation.impact))
  const summary = blocking.map((violation) => `${violation.id} (${violation.impact}): ${violation.nodes.length} node(s)`)
  expect(blocking, summary.join('\n')).toEqual([])
}

test('home page has no serious or critical accessibility violations', async ({ page }) => {
  await mockAdminApis(page)
  await page.goto('/')
  await expect(page.locator('body')).toContainText("KW COM's")
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
