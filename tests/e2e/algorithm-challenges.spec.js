import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { algorithmChallenges } from '../../src/pages/study/exercises/algorithmChallenges.ts'
import { numberedProblemNumber } from '../../src/pages/study/exercises/problemNumbers.ts'
import { asMember, mockOptionalApis } from './visualSupport.js'

test.use({ reducedMotion: 'reduce', timezoneId: 'America/Los_Angeles' })

const stamp = new Date('2026-11-23T02:00:00Z')

test('guests can discover daily and weekly problems, and the member gate protects the editor', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.clock.setFixedTime(stamp)
  await mockOptionalApis(page)
  let runCalls = 0
  await page.route('**/study/api/run', (route) => { runCalls += 1; return route.abort() })
  await page.goto('/study')
  await page.getByRole('link', { name: /알고리즘 문제 오늘의 문제/ }).click()
  const daily = page.getByRole('region', { name: '오늘의 문제' })
  const weekly = page.getByRole('region', { name: '주간 문제' })
  await expect(page).toHaveTitle("알고리즘 문제 | KW COM's")
  await expect(daily).toContainText('11월 23일')
  await expect(weekly).toContainText('11월 23일 – 11월 29일')
  const weeklyAction = weekly.getByRole('link', { name: /문제 풀기/ })
  await expect(weeklyAction).toBeInViewport({ ratio: 1 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  const results = await new AxeBuilder({ page }).include('.ex-page').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(results.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')).toEqual([])
  await page.screenshot({ path: info.outputPath('algorithms-mobile.png') })
  await weeklyAction.click()
  const weeklyNumber = numberedProblemNumber(algorithmChallenges(stamp.getTime()).weekly.problem.id)
  await expect(page).toHaveURL(new RegExp(`/study/algorithms/${weeklyNumber}$`))
  await expect(page.getByRole('heading', { name: '문제 풀이는 동아리원만 할 수 있어요' })).toBeVisible()
  await expect(page.getByRole('button', { name: '제출', exact: true })).toHaveCount(0)
  expect(runCalls).toBe(0)
  await page.getByRole('link', { name: /알고리즘 문제 목록/ }).click()
  await expect(weekly).toBeVisible()
})

test('member submission uses the study editor and persists a solved daily problem', async ({ page }, info) => {
  const { problem } = algorithmChallenges(stamp.getTime()).daily
  const number = numberedProblemNumber(problem.id)
  const code = 'print("submission")'
  const progress = { solved: [], solvedToday: 0, streak: 0 }
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.clock.setFixedTime(stamp)
  await mockOptionalApis(page)
  await asMember(page)
  await page.route('**/study/api/progress', (route) => route.fulfill({ json: progress }))
  await page.route('**/study/api/run', async (route) => {
    const body = route.request().postDataJSON()
    expect(body.lang).toBe('python')
    expect(body).toEqual({ lang: 'python', problemNumber: number, code })
    progress.solved.push(number)
    progress.solvedToday = 1
    progress.streak = 1
    await route.fulfill({ status: 200, json: {
      judge: { passed: 5, total: 5, solved: true, verdicts: Array(5).fill('correct'), diagnostics: [], compileError: false, stderr: '', timeMs: 12 },
      progress,
    } })
  })
  await page.goto('/study/algorithms')
  const daily = page.getByRole('region', { name: '오늘의 문제' })
  await expect(daily.getByRole('heading', { name: problem.title })).toBeVisible()
  await page.screenshot({ path: info.outputPath('algorithms-desktop.png') })
  await daily.getByRole('link', { name: /문제 풀기/ }).click()
  await expect(page.getByRole('tab', { name: 'Python' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab', { name: 'C', exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Java', exact: true })).toBeVisible()
  const editor = page.locator('.ex-editor .cm-content')
  await editor.click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText(code)
  await page.getByRole('button', { name: '제출', exact: true }).click()
  await expect(page.getByText('문제를 해결했어요!')).toBeVisible()
  await page.getByRole('link', { name: /과제 확인/ }).click()
  await expect(daily).toContainText('해결 완료')
  await page.reload()
  await expect(daily.getByRole('link', { name: /다시 풀기/ })).toBeVisible()
  const summary = page.getByRole('region', { name: '내 문제 풀이 기록' })
  await expect(summary.getByText('채점 완료', { exact: true }).locator('..').locator('strong')).toHaveText('1')
  const list = page.getByRole('region', { name: '전체 문제', exact: true })
  await list.getByRole('combobox', { name: '해결 상태' }).selectOption('solved')
  await expect(list.getByRole('link')).toHaveCount(1)
  await expect(list.getByRole('link')).toContainText(problem.title)
})

test('an open challenge page rolls over at midnight without refreshing', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-22T14:58:00Z') })
  await mockOptionalApis(page)
  await page.goto('/study/algorithms')
  const daily = page.getByRole('region', { name: '오늘의 문제' })
  const weekly = page.getByRole('region', { name: '주간 문제' })
  await expect(daily).toContainText('11월 22일')
  await page.clock.fastForward(121_000)
  await expect(daily).toContainText('11월 23일')
  await expect(weekly).toContainText('11월 23일 – 11월 29일')
})

test('a lesson opens its numbered problem in the study language and the catalog finds it by number', async ({ page }) => {
  await mockOptionalApis(page)
  await asMember(page)
  await page.goto('/study/java#array')
  const link = page.locator('#array .ex-inline-row').filter({ hasText: /\d+번/ }).first()
  await expect(link).toHaveAttribute('href', /^\/study\/algorithms\/\d+\?lang=java$/)
  const href = await link.getAttribute('href')
  const number = href.split('/').at(-1).split('?')[0]
  await link.click()
  await expect(page).toHaveURL(new RegExp(`/study/algorithms/${number}\\?lang=java$`))
  await expect(page.locator('.ex-eyebrow')).toContainText(`문제 ${number}번`)
  await expect(page.getByRole('textbox', { name: 'Java 코드 편집기' })).toBeVisible()
  await page.getByRole('link', { name: /알고리즘 문제 목록/ }).click()
  const list = page.getByRole('region', { name: '전체 문제', exact: true })
  await list.getByRole('searchbox', { name: '문제 검색' }).fill(`#${number}`)
  await expect(list.getByRole('link')).toHaveCount(1)
  await expect(list.getByRole('link')).toHaveAttribute('href', `/study/algorithms/${number}`)
  await page.reload()
  await expect(list.getByRole('searchbox', { name: '문제 검색' })).toHaveValue(`#${number}`)
})

test('the catalog filters by supported language and opens results in that language', async ({ page }, info) => {
  await mockOptionalApis(page)
  await page.goto('/study/algorithms?q=1041&lang=java')
  const list = page.getByRole('region', { name: '전체 문제', exact: true })
  await expect(list.getByText('일치하는 문제가 없습니다.')).toBeVisible()
  await list.getByRole('combobox', { name: '언어', exact: true }).selectOption('c')
  await expect(list.getByRole('link')).toHaveCount(1)
  await expect(list.getByRole('link')).toHaveAttribute('href', '/study/algorithms/1041?lang=c')
  await list.screenshot({ path: info.outputPath('numbered-filters.png') })
})
