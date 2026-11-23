import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { asMember, mockOptionalApis } from './visualSupport.js'

test.use({ reducedMotion: 'reduce' })

test('numbered workspace keeps code while changing language and editor appearance', async ({ page }) => {
  await mockOptionalApis(page)
  await asMember(page)
  await page.goto('/study/algorithms/1100?lang=cpp')
  const editor = page.locator('.ex-editor .cm-content')
  await expect(page.getByRole('tab', { name: 'C++' })).toHaveAttribute('aria-selected', 'true')
  await expect(editor).toContainText('#include <bits/stdc++.h>')
  await editor.click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText('#include <iostream>\nint main(){std::cout << 42;}')

  await page.getByRole('tab', { name: 'Python' }).click()
  await page.getByRole('tab', { name: 'C++' }).click()
  await expect(editor).toContainText('std::cout << 42')

  await page.getByRole('tab', { name: 'JavaScript' }).click()
  await expect(editor).toContainText("require('node:fs')")
  await page.getByRole('tab', { name: 'C++' }).click()
  await expect(editor).toContainText('std::cout << 42')

  await page.getByText('편집기 설정').click()
  await page.getByLabel('코드 색상').selectOption('paper')
  await page.getByLabel('글자 크기').selectOption('18')
  await page.getByLabel('긴 줄 자동 줄바꿈').check()
  await expect(page.locator('.cm-editor')).toHaveCSS('font-size', '18px')
  await expect(page.locator('.cm-editor')).toHaveCSS('background-color', 'rgb(248, 250, 252)')
  await expect(editor).toContainText('std::cout << 42')
  await page.reload()
  await expect(page.getByLabel('코드 색상')).toHaveValue('paper')
  await expect(page.getByLabel('글자 크기')).toHaveValue('18')
  await expect(page.getByLabel('긴 줄 자동 줄바꿈')).toBeChecked()
  await expect(editor).toContainText('std::cout << 42')
})

test('stdio scaffold confirms replacement and the mobile explanation remains readable', async ({ page }, info) => {
  await mockOptionalApis(page)
  await asMember(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/study/algorithms/1100?lang=java')
  const editor = page.locator('.ex-editor .cm-content')
  await expect(page.locator('.ex-statement')).toHaveCSS('font-size', '17px')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
  await page.getByRole('link', { name: '코드 작성' }).click()
  await expect(page.locator('#judge-workspace')).toBeInViewport()
  const original = await editor.innerText()
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: '입출력 기본 코드' }).click()
  await expect(editor).toContainText(original.trim())
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '입출력 기본 코드' }).click()
  await expect(editor).toContainText('BufferedReader reader')
  await page.screenshot({ path: info.outputPath('judge-mobile.png') })
  const { violations } = await new AxeBuilder({ page }).include('.judge-problem').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(violations.filter(({ impact }) => ['serious', 'critical'].includes(impact))).toEqual([])
})

test('numbered submission shows private verdicts and shares only verified progress', async ({ page }) => {
  await mockOptionalApis(page)
  await asMember(page)
  await page.addInitScript(() => {
    navigator.share = async (payload) => { window.__sharedAchievement = payload }
  })
  await page.route('**/study/api/progress', (route) => route.fulfill({ status: 200, json: { solved: [], solvedToday: 0, streak: 0 } }))
  await page.route('**/study/api/run', (route) => {
    const request = route.request().postDataJSON()
    expect(request.problemNumber).toBe(1100)
    expect(request.lang).toBe('python')
    expect(request.tests).toBeUndefined()
    return route.fulfill({ status: 200, json: {
      judge: { passed: 3, total: 3, solved: true, verdicts: ['correct', 'correct', 'correct'], diagnostics: [], timeMs: 18 },
      progress: { solved: [1100], solvedToday: 1, streak: 1 },
    } })
  })
  await page.goto('/study/algorithms/1100')
  await expect(page.getByRole('button', { name: '해결 성취 공유하기' })).toHaveCount(0)
  await page.getByRole('button', { name: '제출', exact: true }).click()
  await expect(page.locator('[data-ex-result-summary]')).toContainText('3/3 통과')
  await expect(page.locator('.judge-verdict-list li')).toHaveCount(3)
  await expect(page.locator('.ex-case')).toHaveCount(0)
  await expect(page.getByText('누적 1문제 해결')).toBeVisible()
  await page.getByRole('button', { name: '해결 성취 공유하기' }).click()
  const share = await page.evaluate(() => window.__sharedAchievement)
  expect(share.text).toContain('1100번 구간 합 질의 해결')
  expect(share.url).toContain('/study/algorithms/1100')
})
