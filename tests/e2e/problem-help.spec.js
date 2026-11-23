import { expect, test } from '@playwright/test'
import { asMember, mockOptionalApis } from './visualSupport.js'

test.use({ reducedMotion: 'reduce' })

test('numbered problem hints open in order and discussion stays on the same problem', async ({ page }, info) => {
  await mockOptionalApis(page)
  await asMember(page)
  let listCalls = 0
  await page.route('**/api/community/posts?page=0&size=200', (route) => {
    listCalls++
    return route.fulfill({ json: [
      { id: 10, category: 'QUESTION', title: '[문제 11001번] 입력이 안 읽혀요', commentCount: 2 },
      { id: 11, category: 'QUESTION', title: '[문제 110012번] 다른 번호 질문' },
      { id: 12, category: 'GENERAL', title: '[문제 11001번] 일반 게시판 글' },
    ] })
  })
  await page.goto('/study/algorithms/11001')
  const help = page.locator('#judge-help')
  await expect(help).toBeVisible()
  expect(listCalls).toBe(0)
  await expect(help.getByRole('button', { name: '힌트 1 보기' })).toBeVisible()
  await help.getByRole('button', { name: '힌트 1 보기' }).click()
  await expect(help.getByText('힌트 1', { exact: true })).toBeVisible()
  await help.getByRole('button', { name: '질문 보기' }).click()
  await expect(help.getByRole('link', { name: /입력이 안 읽혀요/ })).toHaveAttribute('href', '/community/10')
  await expect(help.getByRole('link', { name: /다른 번호 질문/ })).toHaveCount(0)
  await expect(help.getByRole('link', { name: /일반 게시판 글/ })).toHaveCount(0)
  expect(listCalls).toBe(1)
  await help.screenshot({ path: info.outputPath('problem-help-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await help.screenshot({ path: info.outputPath('problem-help-mobile.png') })
})

test('a written question uses the existing QUESTION board and escapes its content', async ({ page }) => {
  await mockOptionalApis(page)
  await asMember(page)
  await page.route('**/api/community/posts?page=0&size=200', (route) => route.fulfill({ json: [] }))
  let created
  await page.route('**/api/community/posts', async (route) => {
    created = route.request().postDataJSON()
    await route.fulfill({ status: 201, json: { id: 777, title: created.title, category: 'QUESTION' } })
  })
  await page.route('**/api/community/posts/777', (route) => route.fulfill({ json: { id: 777, title: '[문제 11001번] 입력 질문', category: 'QUESTION' } }))
  await page.goto('/study/algorithms/11001')
  const help = page.locator('#judge-help')
  await help.getByRole('button', { name: '질문 보기' }).click()
  await expect(help.getByText('아직 이 문제의 질문이 없어요.')).toBeVisible()
  await help.getByRole('textbox', { name: '질문 제목' }).fill('입력 질문')
  await help.getByRole('textbox', { name: '질문 내용' }).fill('입력을 어떻게 읽나요? <script>alert(1)</script>')
  await help.getByRole('button', { name: '질문 등록' }).click()
  await expect(page).toHaveURL(/\/community\/777$/)
  expect(created.title).toBe('[문제 11001번] 입력 질문')
  expect(created.category).toBe('QUESTION')
  const blocks = JSON.parse(created.content)
  expect(blocks).toHaveLength(1)
  expect(blocks[0].content).toContain('&lt;script&gt;')
  expect(blocks[0].content).toMatch(/href="https?:\/\/(?:localhost|127\.0\.0\.1):\d+\/study\/algorithms\/11001"/)
  expect(blocks[0].content).toContain('/study/algorithms/11001')
})
