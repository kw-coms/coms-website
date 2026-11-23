import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { asMember, mockOptionalApis } from './visualSupport.js'

test.use({ reducedMotion: 'reduce' })

const code = 'A1B2C3D4E5F6'
const pending = () => ({
  code, problemNumber: 1100, durationMinutes: 15, status: 'waiting',
  createdAt: Date.now(), startedAt: null, endsAt: null, yourAcceptedAt: null,
  opponentAcceptedAt: null, isHost: true, opponentJoined: false, result: null,
})

test('member creates a room, copies a link and sees a timed race after a friend joins', async ({ page }, info) => {
  await mockOptionalApis(page)
  await asMember(page)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  const room = pending()
  await page.route('**/study/api/club', async (route) => {
    const { action, problemNumber, durationMinutes } = route.request().postDataJSON()
    if (action === 'problem-catalog') return route.fulfill({ json: { problems: [] } })
    if (action === 'battle-list') return route.fulfill({ json: { battles: [] } })
    if (action === 'battle-create') {
      expect(problemNumber).toBe(1100)
      expect(durationMinutes).toBe(15)
      return route.fulfill({ json: { battle: room } })
    }
    if (action === 'battle-get') return route.fulfill({ json: { battle: room } })
    throw Error(`Unexpected battle request ${action}`)
  })
  await page.goto('/study/algorithms/battles')
  await expect(page.getByRole('heading', { name: '친구와 문제 대결' })).toBeVisible()
  await page.getByRole('combobox', { name: '문제 번호 또는 제목' }).fill('1100')
  await page.getByRole('button', { name: /방 만들기/ }).click()
  await expect(page.getByRole('heading', { name: '구간 합 질의' })).toBeVisible()
  await expect(page.getByText(code)).toBeVisible()
  await page.getByRole('button', { name: '초대 링크 복사' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`/study/algorithms/battles?room=${code}`)
  room.status = 'active'
  room.opponentJoined = true
  room.startedAt = Date.now()
  room.endsAt = Date.now() + 15 * 60_000
  await expect(page.getByRole('link', { name: /문제 풀기/ })).toHaveAttribute('href', `/study/algorithms/1100?battle=${code}`, { timeout: 7000 })
  await expect(page.getByRole('timer', { name: '남은 대결 시간' })).toContainText('14:')
  await page.screenshot({ path: info.outputPath('battle-active-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  const axe = await new AxeBuilder({ page }).include('.club-battles').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')).toEqual([])
  await page.screenshot({ path: info.outputPath('battle-active-mobile.png') })
})

test('guest sees member guidance without requesting battle data', async ({ page }) => {
  await mockOptionalApis(page)
  let called = false
  await page.route('**/study/api/club', (route) => { called = true; return route.abort() })
  await page.goto('/study/algorithms/battles')
  await expect(page.getByRole('heading', { name: '친구와 문제 대결은 동아리원만 할 수 있어요' })).toBeVisible()
  expect(called).toBe(false)
})

test('invite link lets a friend join and shows the recorded result', async ({ page }) => {
  await mockOptionalApis(page)
  await asMember(page)
  const room = { ...pending(), isHost: false }
  const actions = []
  await page.route('**/study/api/club', async (route) => {
    const body = route.request().postDataJSON()
    if (body.action === 'problem-catalog') return route.fulfill({ json: { problems: [] } })
    actions.push(body.action)
    if (body.action === 'battle-get' && room.status === 'waiting') {
      return route.fulfill({ status: 403, json: { message: '참가 후 볼 수 있어요.' } })
    }
    if (body.action === 'battle-join') {
      expect(body.code).toBe(code)
      room.status = 'active'
      room.opponentJoined = true
      room.startedAt = Date.now()
      room.endsAt = room.startedAt + 600_000
    }
    return route.fulfill({ json: { battle: room } })
  })
  await page.goto(`/study/algorithms/battles?room=${code}`)
  await expect(page.getByRole('textbox', { name: '초대 코드' })).toHaveValue(code)
  await page.getByRole('button', { name: /대결 참가/ }).click()
  await expect(page.getByRole('link', { name: /문제 풀기/ })).toHaveAttribute('href', `/study/algorithms/1100?battle=${code}`)
  expect(actions).toContain('battle-join')
  room.status = 'finished'
  room.yourAcceptedAt = Date.now() - 5000
  room.opponentAcceptedAt = Date.now() - 1000
  room.result = 'win'
  await expect(page.getByText('승리', { exact: true })).toBeVisible({ timeout: 7000 })
})
