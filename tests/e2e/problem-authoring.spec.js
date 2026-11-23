import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { asMember, mockOptionalApis } from './visualSupport.js'

test.use({ reducedMotion: 'reduce' })

const id = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const draft = () => ({
  title: '새로운 합 문제', statement: '두 수를 더하세요.', inputSpec: '', outputSpec: '',
  difficultyTier: 6, topics: ['수학', '구현'],
  examples: [{ stdin: '1 2', expected: '3' }],
  tests: Array.from({ length: 5 }, (_, index) => ({ stdin: `${index + 4} 2`, expected: `${index + 6}` })),
  reference: { lang: 'python', code: 'a,b=map(int,input().split())\nprint(a+b)' }, compare: 'tokens',
})
const proposal = (status = 'draft', verified = false) => ({
  id, title: '새로운 합 문제', status, revision: 0, updatedAt: Date.now(),
  number: null, verified, owned: true, draft: draft(), note: '',
  verification: verified ? { passed: 6, total: 6, solved: true } : null,
})

test('member writes examples and five private cases, verifies, and requests review', async ({ page }, info) => {
  await mockOptionalApis(page)
  await asMember(page)
  let saved = null
  const actions = []
  await page.route('**/study/api/club', (route) => {
    const body = route.request().postDataJSON()
    actions.push(body)
    if (body.action === 'problem-list') return route.fulfill({ json: { proposals: saved ? [saved] : [] } })
    if (body.action === 'problem-save') {
      expect(body.draft.tests).toHaveLength(5)
      expect(body.draft.topics).toEqual(['수학', '구현'])
      saved = { ...proposal(), draft: body.draft }
      return route.fulfill({ json: { proposal: saved } })
    }
    if (body.action === 'problem-submit') {
      saved = { ...saved, status: 'pending', revision: 1, verified: false }
      return route.fulfill({ json: { proposal: saved } })
    }
    throw Error(`Unexpected action ${body.action}`)
  })
  await page.route('**/study/api/run', (route) => {
    const body = route.request().postDataJSON()
    expect(body).toEqual({ action: 'problem-verify', authoringId: id })
    saved = { ...saved, verified: true, verification: { passed: 6, total: 6, solved: true } }
    return route.fulfill({ json: { proposal: saved, judge: { passed: 6, total: 6, solved: true, verdicts: Array(6).fill('correct'), compileError: false } } })
  })

  await page.goto('/study/algorithms/authoring')
  await expect(page.getByRole('heading', { name: '새 문제 만들기' })).toBeVisible()
  await page.getByLabel('문제 제목').fill('새로운 합 문제')
  await page.getByLabel('문제 내용').fill('두 수를 더하세요.')
  await page.getByLabel('주제 태그').fill('수학, 구현')
  const examples = page.getByRole('region', { name: '공개 예제' })
  await examples.getByLabel('입력').fill('1 2')
  await examples.getByLabel('기대 출력').fill('3')
  const cases = page.getByRole('region', { name: '비공개 채점 사례' })
  for (let index = 0; index < 5; index++) {
    await cases.getByLabel('입력').nth(index).fill(`${index + 4} 2`)
    await cases.getByLabel('기대 출력').nth(index).fill(`${index + 6}`)
  }
  await page.getByLabel('검증 언어').selectOption('python')
  await page.getByRole('textbox', { name: '기준 코드' }).fill(draft().reference.code)
  await page.getByRole('button', { name: '초안 저장' }).click()
  await expect(page.getByText('초안을 저장했습니다.')).toBeVisible()
  await page.getByRole('button', { name: '기준 코드 검증' }).click()
  await expect(page.getByRole('region', { name: '검증 결과' })).toContainText('6/6 통과')
  await expect(page.getByRole('region', { name: '검증 결과' }).getByText('채점 사례 5')).toBeVisible()
  await page.getByRole('button', { name: '검토 요청' }).click()
  await expect(page.getByText('문제 검토를 요청했습니다.')).toBeVisible()
  expect(actions.map((action) => action.action)).toEqual(['problem-list', 'problem-save', 'problem-submit'])

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
  await page.screenshot({ path: info.outputPath('authoring-member-mobile.png'), fullPage: true })
  const { violations } = await new AxeBuilder({ page }).include('.authoring-page').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(violations.filter(({ impact }) => ['serious', 'critical'].includes(impact))).toEqual([])
})

test('president verifies a pending proposal and publishes its number', async ({ page }, info) => {
  await mockOptionalApis(page)
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { id: 1, studentId: '2026000001', name: '회장', role: 'ADMIN', emailVerified: true } }))
  let current = { ...proposal('pending'), owned: false }
  await page.route('**/study/api/club', (route) => {
    const body = route.request().postDataJSON()
    if (body.action === 'problem-list') return route.fulfill({ json: { proposals: [current] } })
    if (body.action === 'problem-get') return route.fulfill({ json: { proposal: current } })
    if (body.action === 'problem-publish') {
      expect(current.verified).toBe(true)
      current = { ...current, number: 90000, status: 'published', revision: current.revision + 1 }
      return route.fulfill({ json: { proposal: current } })
    }
    throw Error(`Unexpected action ${body.action}`)
  })
  await page.route('**/study/api/run', (route) => {
    current = { ...current, verified: true, verification: { passed: 6, total: 6, solved: true } }
    return route.fulfill({ json: { proposal: current, judge: { passed: 6, total: 6, solved: true, verdicts: Array(6).fill('correct'), compileError: false } } })
  })
  await page.goto('/study/algorithms/authoring')
  await page.getByRole('tab', { name: /검토 요청/ }).click()
  await page.getByRole('button', { name: /새로운 합 문제/ }).click()
  await expect(page.getByRole('region', { name: '문제 설명' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('authoring-review-desktop.png') })
  await expect(page.getByRole('button', { name: '번호 부여하고 공개' })).toBeDisabled()
  await page.getByRole('button', { name: '기준 코드 검증' }).click()
  await expect(page.getByRole('button', { name: '번호 부여하고 공개' })).toBeEnabled()
  await page.getByRole('button', { name: '번호 부여하고 공개' }).click()
  await expect(page.getByRole('link', { name: '90000번 문제 보기' })).toHaveAttribute('href', '/study/algorithms/90000')
})

test('guests see only the member gate', async ({ page }) => {
  await mockOptionalApis(page)
  let clubCalled = false
  await page.route('**/study/api/club', (route) => { clubCalled = true; return route.abort() })
  await page.goto('/study/algorithms/authoring')
  await expect(page.getByRole('heading', { name: '문제 제작은 동아리원만 할 수 있어요' })).toBeVisible()
  expect(clubCalled).toBe(false)
})

test('a failed reference run shows the judge reason in Korean', async ({ page }) => {
  await mockOptionalApis(page)
  await asMember(page)
  await page.route('**/study/api/club', (route) => {
    const action = route.request().postDataJSON().action
    if (action === 'problem-list') return route.fulfill({ json: { proposals: [proposal()] } })
    if (action === 'problem-get') return route.fulfill({ json: { proposal: proposal() } })
    throw Error(`Unexpected action ${action}`)
  })
  await page.route('**/study/api/run', (route) => route.fulfill({ status: 409, json: {
    error: 'rejected', messageKo: '다른 화면에서 수정된 문제예요. 새로고침한 뒤 다시 시도해 주세요.',
  } }))
  await page.goto('/study/algorithms/authoring')
  await page.getByRole('button', { name: /새로운 합 문제/ }).click()
  await page.getByRole('button', { name: '기준 코드 검증' }).click()
  await expect(page.getByRole('alert')).toHaveText('다른 화면에서 수정된 문제예요. 새로고침한 뒤 다시 시도해 주세요.')
})
