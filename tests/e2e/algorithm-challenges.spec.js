import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { algorithmChallenges } from '../../src/pages/study/exercises/algorithmChallenges.ts'
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
  await expect(page.getByRole('heading', { name: '문제 풀이는 동아리원만 할 수 있어요' })).toBeVisible()
  await expect(page.getByRole('button', { name: '제출', exact: true })).toHaveCount(0)
  expect(runCalls).toBe(0)
  await page.getByRole('link', { name: /알고리즘 문제 목록/ }).click()
  await expect(weekly).toBeVisible()
})

test('member submission uses the study editor and persists a solved daily problem', async ({ page }, info) => {
  const { problem } = algorithmChallenges(stamp.getTime()).daily
  const cases = [...problem.examples, ...problem.tests]
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.clock.setFixedTime(stamp)
  await mockOptionalApis(page)
  await asMember(page)
  await page.route('**/study/api/run', async (route) => {
    const body = route.request().postDataJSON()
    expect(body.lang).toBe('python')
    expect(body.tests).toEqual(cases.map(({ stdin }) => stdin))
    expect(body.code).toContain(problem.solution.python.trim())
    await route.fulfill({ status: 200, json: {
      ok: true, stage: 'run', stderr: '', diagnostics: [], timeMs: 12,
      results: cases.map(({ expected }) => ({ stdout: expected, stderr: '', exitCode: 0, signal: null, timedOut: false, truncated: false, timeMs: 2 })),
    } })
  })
  await page.goto('/study/algorithms')
  const daily = page.getByRole('region', { name: '오늘의 문제' })
  await expect(daily.getByRole('heading', { name: problem.title })).toBeVisible()
  await page.screenshot({ path: info.outputPath('algorithms-desktop.png') })
  await daily.getByRole('link', { name: /문제 풀기/ }).click()
  await expect(page.getByRole('tab', { name: 'Python' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab', { name: 'C', exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Java' })).toBeVisible()
  const editor = page.locator('.ex-editor .cm-content')
  await editor.click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText(problem.solution.python)
  await page.getByRole('button', { name: '제출', exact: true }).click()
  await expect(page.getByText('문제를 해결했어요!')).toBeVisible()
  await page.getByRole('link', { name: /과제 확인/ }).click()
  await expect(daily).toContainText('해결 완료')
  await page.reload()
  await expect(daily.getByRole('link', { name: /다시 풀기/ })).toBeVisible()
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1')
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
