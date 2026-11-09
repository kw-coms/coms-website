import { expect, test } from '@playwright/test'
import { loadProblems } from '../../scripts/verify-exercises.mjs'
import { asMember, mockOptionalApis } from './visualSupport.js'

const webProblems = (await loadProblems()).filter((problem) => !('langs' in problem))

async function replaceEditor(page, code) {
  const editor = page.locator('.ex-web-editor .cm-content')
  await expect(editor).toBeVisible()
  await editor.click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText(code)
}

test('shipped web problems exist', () => {
  expect(webProblems.length).toBeGreaterThan(0)
})

for (const problem of webProblems) {
  test(`${problem.id}: solution passes and starter fails in the real sandbox`, async ({ page }) => {
    await mockOptionalApis(page)
    await asMember(page)
    await page.goto(`/study/web/practice/${problem.id}`)
    await expect(page.getByRole('heading', { name: problem.title })).toBeVisible()

    for (const [tab, key] of [['HTML', 'html'], ['CSS', 'css'], ['JavaScript', 'js']]) {
      await page.locator('.ex-web-tabs').getByRole('tab', { name: tab }).click()
      await replaceEditor(page, problem.solution[key])
    }
    await page.locator('.ex-web').getByRole('button', { name: '제출', exact: true }).click()
    await expect(page.locator('.ex-web-results li')).toHaveCount(problem.checks.length)
    await expect(page.locator('.ex-web-results .is-pass')).toHaveCount(problem.checks.length)

    page.once('dialog', (dialog) => dialog.accept())
    await page.locator('.ex-web').getByRole('button', { name: '초기화', exact: true }).click()
    await page.locator('.ex-web').getByRole('button', { name: '제출', exact: true }).click()
    await expect(page.locator('.ex-web-results li')).toHaveCount(problem.checks.length)
    await expect(page.locator('.ex-web-results .is-fail').first()).toBeVisible()
  })
}
