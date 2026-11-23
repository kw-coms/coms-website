import { expect, test } from '@playwright/test'
import { mockOptionalApis, asMember } from './visualSupport.js'

const statement = '정수의 두 배를 출력합니다.'
const number = 90_000
const published = { number, problem: { id: 'club-problem-90000', title: '두 배를 출력하세요', level: 1,
  difficultyTier: 2, topics: ['구현'], langs: ['c', 'cpp', 'java', 'python', 'javascript'], chapter: {},
  statement, inputSpec: '정수 한 개', outputSpec: '정수의 두 배', examples: [{ stdin: '5', expected: '10' }],
  tests: [], starter: {}, solution: {}, mode: 'stdio', explain: '', hints: [],
} }

test('a published member problem appears under its COM’s number and submits through the existing judge', async ({ page }) => {
  await mockOptionalApis(page)
  await asMember(page)
  await page.route('**/study/api/club', route => route.fulfill({ json: route.request().postDataJSON().action === 'problem-catalog'
    ? { problems: [published] } : { count: 0, median: null, canVote: false, ownVote: null } }))
  await page.route('**/study/api/progress', route => route.fulfill({ json: { solved: [], solvedToday: 0, streak: 0 } }))
  let submitted
  await page.route('**/study/api/run', route => {
    submitted = route.request().postDataJSON()
    return route.fulfill({ json: { judge: { passed: 6, total: 6, solved: true, verdicts: Array(6).fill('correct') } } })
  })
  await page.goto('/study/algorithms?q=90000')
  await page.getByRole('link', { name: /두 배를 출력하세요/ }).click()
  await expect(page).toHaveURL(/\/90000$/)
  await expect(page.getByText(statement, { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '두 배를 출력하세요' })).toBeVisible()
  await expect(page.getByRole('button', { name: '답 보기' })).toHaveCount(0)
  await page.locator('.ex-editor .cm-content').fill('print(int(input()) * 2)')
  await page.getByRole('button', { name: '제출', exact: true }).click()
  await expect(page.getByText('6/6 통과')).toBeVisible()
  expect(submitted).toMatchObject({ problemNumber: number, code: 'print(int(input()) * 2)' })
  expect(submitted).not.toHaveProperty('tests')
})

test('a guest opening a published number sees the login guide before the statement', async ({ page }) => {
  await mockOptionalApis(page)
  let catalogRequested = false
  await page.route('**/study/api/club', route => {
    catalogRequested = true
    return route.abort()
  })
  await page.goto('/study/algorithms/90000')
  await expect(page.locator('[data-members-gate]')).toBeVisible()
  await expect(page.getByText(statement, { exact: true })).toHaveCount(0)
  expect(catalogRequested).toBe(false)
})
