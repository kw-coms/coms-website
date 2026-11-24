import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { asMember, mockOptionalApis, signInHint } from './visualSupport.js'

test.use({ reducedMotion: 'reduce' })

test('a member saves a personal language template and editor preferences', async ({ page }, info) => {
  await mockOptionalApis(page)
  await asMember(page)
  await page.goto('/study/algorithms/settings')
  await expect(page.getByRole('heading', { name: '코딩 설정', exact: true })).toBeVisible()
  await page.getByLabel('기본 언어').selectOption('cpp')
  await page.getByLabel('코드 색상').selectOption('paper')
  await page.getByLabel('글자 크기').selectOption('18')
  await page.getByLabel('긴 줄 자동 줄바꿈').check()
  const editor = page.getByRole('textbox', { name: 'C++ 기본 템플릿 편집기' })
  await expect(editor).toBeVisible()
  await page.getByRole('button', { name: '예시 코드 불러오기' }).click()
  await expect(editor).toContainText('#include <bits/stdc++.h>')
  await expect(page.locator('.coding-settings-editor .cm-editor')).toHaveCSS('font-size', '18px')
  await page.getByRole('button', { name: '설정 저장' }).click()
  await expect(page.locator('.coding-settings-save [role="status"]')).toHaveText('코딩 설정을 저장했습니다.')
  await page.reload()
  await expect(page.getByLabel('기본 언어')).toHaveValue('cpp')
  await expect(page.getByLabel('코드 색상')).toHaveValue('paper')
  await expect(editor).toContainText('#include <bits/stdc++.h>')

  await page.getByLabel('템플릿 언어').selectOption('python')
  const pythonEditor = page.getByRole('textbox', { name: 'Python 기본 템플릿 편집기' })
  await expect(pythonEditor).toBeVisible()
  await expect(pythonEditor).not.toContainText('#include')
  await page.getByRole('button', { name: '예시 코드 불러오기' }).click()
  await expect(pythonEditor).toContainText('import sys')
  await page.getByRole('button', { name: '설정 저장' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
  await page.screenshot({ path: info.outputPath('coding-settings-mobile.png'), fullPage: true })
  const { violations } = await new AxeBuilder({ page }).include('.coding-settings-page').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')).toEqual([])
})

test('settings stay private to each member and a failed write reports failure', async ({ page }) => {
  await mockOptionalApis(page)
  await asMember(page)
  await page.goto('/study/algorithms/settings')
  await page.getByRole('button', { name: '예시 코드 불러오기' }).click()
  await page.getByRole('button', { name: '설정 저장' }).click()
  await signInHint(page)
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 6, studentId: '2023000003', name: '다른 회원', role: 'USER' } }))
  await page.reload()
  const editor = page.getByRole('textbox', { name: 'C++ 기본 템플릿 편집기' })
  await expect(editor).toBeVisible()
  await expect(editor).not.toContainText('#include')
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('coms-coding-settings:v1:')) throw new DOMException('Quota exceeded', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  await page.getByRole('button', { name: '예시 코드 불러오기' }).click()
  await page.getByRole('button', { name: '설정 저장' }).click()
  await expect(page.locator('.coding-settings-save [role="status"]')).toContainText('저장하지 못했습니다.')
})

test('guests see the member guide instead of template controls', async ({ page }) => {
  await mockOptionalApis(page)
  await page.goto('/study/algorithms/settings')
  await expect(page.getByRole('heading', { name: '코딩 설정은 동아리원만 사용할 수 있어요' })).toBeVisible()
  await expect(page.getByRole('button', { name: '설정 저장' })).toHaveCount(0)
})

test('the settings link returns to the same problem and language', async ({ page }) => {
  await mockOptionalApis(page)
  await asMember(page)
  await page.goto('/study/algorithms/11001?lang=cpp')
  await page.getByRole('link', { name: '코딩 설정' }).click()
  await expect(page).toHaveURL(/\/study\/algorithms\/settings$/)
  await page.getByRole('link', { name: '문제로 돌아가기' }).click()
  await expect(page).toHaveURL(/\/study\/algorithms\/11001\?lang=cpp$/)
})
