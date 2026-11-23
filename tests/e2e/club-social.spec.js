import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { asMember, mockOptionalApis } from './visualSupport.js'

test.use({ reducedMotion: 'reduce' })

test('a member saves, shares, and removes a numbered problem set', async ({ page }, info) => {
  await mockOptionalApis(page)
  await asMember(page)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  let saved = null
  const actions = []
  await page.route('**/study/api/club', async (route) => {
    const body = route.request().postDataJSON()
    if (body.action === 'problem-catalog') return route.fulfill({ json: { problems: [] } })
    actions.push(body)
    if (body.action === 'sets-list') return route.fulfill({ json: { sets: saved ? [saved] : [] } })
    if (body.action === 'sets-save') {
      saved = { id: 'aabbccdd-0000-4000-8000-111111111111', title: body.title, problemNumbers: body.problemNumbers, shared: body.shared, updatedAt: Date.now(), owned: true }
      return route.fulfill({ json: { set: saved } })
    }
    if (body.action === 'sets-delete') { saved = null; return route.fulfill({ json: { deleted: true } }) }
    if (body.action === 'sets-open') return route.fulfill({ json: { set: saved } })
    throw new Error(`Unexpected action ${body.action}`)
  })
  await page.goto('/study/algorithms/problem-sets?problem=1001')
  await expect(page.getByRole('link', { name: /1001번/ })).toBeVisible()
  await page.getByRole('textbox', { name: '제목' }).fill('이번 주 알고리즘')
  await page.getByRole('checkbox', { name: '링크가 있는 동아리원에게 공유' }).check()
  await page.getByRole('button', { name: '문제집 저장' }).click()
  await expect(page.getByText('문제집을 저장했습니다.', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('club-problem-sets-desktop.png') })
  expect(saved.problemNumbers).toEqual([1001])
  await page.getByRole('button', { name: '공유 링크 복사' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('/study/algorithms/problem-sets?set=aabbccdd-0000-4000-8000-111111111111')
  await page.goto('/study/algorithms/problem-sets?problem=1100')
  await page.getByRole('button', { name: /이번 주 알고리즘/ }).click()
  await expect(page.getByText('1100번 문제를 담았습니다. 저장하면 반영됩니다.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '문제집 저장' }).click()
  await expect(page.getByText('문제집을 저장했습니다.', { exact: true })).toBeVisible()
  expect(saved.problemNumbers).toEqual([1001, 1100])
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '삭제', exact: true }).click()
  await expect(page.getByText('저장한 문제집이 없어요. 첫 문제집을 만들어 보세요.')).toBeVisible()
  expect(actions.map(({ action }) => action)).toContain('sets-delete')
})

test('a shared set opens as read-only and the owner can copy it', async ({ page }, info) => {
  await mockOptionalApis(page)
  await asMember(page)
  const shared = { id: 'aabbccdd-0000-4000-8000-222222222222', title: '자료구조 연습', problemNumbers: [1001, 1100], shared: true, updatedAt: 1, owned: false }
  let revoked = false
  let copied = null
  await page.route('**/study/api/club', (route) => {
    const body = route.request().postDataJSON()
    if (body.action === 'problem-catalog') return route.fulfill({ json: { problems: [] } })
    if (body.action === 'sets-list') return route.fulfill({ json: { sets: copied ? [copied] : [] } })
    if (body.action === 'sets-open') {
      return revoked
        ? route.fulfill({ status: 404, json: { error: 'rejected', messageKo: '문제집을 찾을 수 없어요.' } })
        : route.fulfill({ json: { set: shared } })
    }
    if (body.action === 'sets-save') {
      expect(body.shared).toBe(false)
      copied = { ...shared, id: 'aabbccdd-0000-4000-8000-333333333333', owned: true, shared: body.shared }
      return route.fulfill({ json: { set: copied } })
    }
    throw new Error(`Unexpected action ${body.action}`)
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/study/algorithms/problem-sets?set=${shared.id}`)
  await expect(page.getByRole('region', { name: '공유된 문제집' })).toContainText('자료구조 연습')
  await expect(page.getByRole('textbox', { name: '제목' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '삭제', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /1100번/ })).toHaveAttribute('href', '/study/algorithms/1100')
  await page.getByRole('button', { name: '내 문제집으로 복사' }).click()
  await expect(page.getByText('내 문제집으로 복사했습니다.', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
  const { violations } = await new AxeBuilder({ page }).include('.club-sets-page').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(violations.filter(({ impact }) => ['serious', 'critical'].includes(impact))).toEqual([])
  await page.screenshot({ path: info.outputPath('club-problem-sets-mobile.png') })
  revoked = true
  await page.reload()
  await expect(page.getByRole('alert')).toHaveText('문제집을 찾을 수 없어요.')
  await expect(page.getByRole('complementary', { name: '내 문제집 목록' }).getByRole('button', { name: /자료구조 연습/ })).toBeVisible()
})

test('only a verified solver can vote and changing a vote keeps one vote', async ({ page }) => {
  await mockOptionalApis(page)
  await asMember(page)
  let vote = { count: 1, median: 7, ownVote: null, canVote: false }
  let writes = 0
  await page.route('**/study/api/club', (route) => {
    const body = route.request().postDataJSON()
    if (body.action === 'vote-get') return route.fulfill({ json: vote })
    if (body.action === 'vote-put') {
      writes += 1
      vote = { count: 2, median: body.tier, ownVote: body.tier, canVote: true }
      return route.fulfill({ json: vote })
    }
    throw new Error(`Unexpected action ${body.action}`)
  })
  await page.goto('/study/algorithms/1001')
  const voting = page.getByRole('region', { name: '난이도 투표' })
  await expect(voting.getByText('이 문제를 해결하면 난이도에 투표할 수 있어요.')).toBeVisible()
  await expect(voting.getByRole('button', { name: '투표하기' })).toHaveCount(0)
  vote = { ...vote, canVote: true }
  await page.reload()
  await voting.getByRole('combobox', { name: '체감 난이도' }).selectOption('11')
  await voting.getByRole('button', { name: '투표하기' }).click()
  await expect(voting.getByText('내 투표 골드 V')).toBeVisible()
  await voting.getByRole('combobox', { name: '체감 난이도' }).selectOption('12')
  await voting.getByRole('button', { name: '투표 변경' }).click()
  await expect(voting.getByText('내 투표 골드 IV')).toBeVisible()
  await expect(voting.getByText('2명 참여')).toBeVisible()
  expect(writes).toBe(2)
})
