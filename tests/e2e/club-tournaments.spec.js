import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { asMember, mockOptionalApis, signInHint } from './visualSupport.js'

test.use({ reducedMotion: 'reduce' })

const id = '1234567890abcdef12345678'
const matchId = 'abcdef1234567890abcdef12'
const startsAt = Date.now() + 48 * 60 * 60 * 1000
const summary = (overrides = {}) => ({
  id, title: 'COM’s 알고리즘 컵', startsAt, capacity: 4, durationMinutes: 20, breakMinutes: 5,
  status: 'registration', participantCount: 1, registered: false, champion: null, ...overrides,
})
const detail = (overrides = {}) => ({
  ...summary(), rules: '회원은 한 번만 참가할 수 있습니다.\n각 라운드 20분입니다.',
  participants: ['참가자 1'], problemNumbers: null, rounds: [], ...overrides,
})

test('chair creates a draft with round problems and publishes recruitment', async ({ page }, info) => {
  await mockOptionalApis(page)
  await signInHint(page)
  await page.route('**/api/auth/me', route => route.fulfill({ json: {
    id: 1, studentId: '2026000001', name: '회장', role: 'ADMIN', emailVerified: true,
  } }))
  let created = null
  const actions = []
  await page.route('**/study/api/club', route => {
    const body = route.request().postDataJSON()
    actions.push(body)
    if (body.action === 'problem-catalog') return route.fulfill({ json: {
      problems: [{ number: 90000, problem: { title: '운영진이 등록한 새 문제' } }],
    } })
    if (body.action === 'tournament-list') return route.fulfill({ json: { events: created ? [created] : [] } })
    if (body.action === 'tournament-save') {
      created = detail({ ...body, id, status: 'draft', participantCount: 0, registered: false,
        champion: null, participants: [], rounds: [] })
      return route.fulfill({ json: { event: created } })
    }
    if (body.action === 'tournament-get') return route.fulfill({ json: { event: created } })
    if (body.action === 'tournament-publish') {
      created = { ...created, status: 'registration' }
      return route.fulfill({ json: { event: created } })
    }
    throw Error(`Unexpected action ${body.action}`)
  })
  await page.goto('/study/algorithms/tournaments')
  await page.getByRole('button', { name: '대회 만들기' }).click()
  await page.getByRole('textbox', { name: '대회 이름' }).fill('COM’s 알고리즘 컵')
  await page.getByRole('textbox', { name: '대회 규칙' }).fill('회원은 한 번만 참가할 수 있습니다.')
  await page.getByRole('combobox', { name: '모집 정원' }).selectOption('4')
  await page.getByRole('combobox', { name: '점수 방식' }).selectOption('partial')
  await page.getByRole('combobox', { name: '1라운드 문제 1 번호' }).fill('1100')
  await page.getByRole('region', { name: '1라운드 설정' }).getByRole('button', { name: '문제 추가' }).click()
  await page.getByRole('combobox', { name: '1라운드 문제 2 번호' }).fill('1001')
  await page.getByRole('region', { name: '1라운드 설정' }).getByRole('spinbutton', { name: '배점' }).nth(1).fill('250')
  await page.getByRole('button', { name: '1라운드 문제 2 위로' }).click()
  await expect(page.getByRole('combobox', { name: '1라운드 문제 1 번호' })).toHaveValue('1001')
  await page.getByRole('region', { name: '1라운드 설정' }).getByRole('button', { name: '문제 추가' }).click()
  await page.getByRole('combobox', { name: '1라운드 문제 3 번호' }).fill('90000')
  await expect(page.locator('.club-tournament-round-config small').getByText('운영진이 등록한 새 문제')).toBeVisible()
  await page.getByRole('combobox', { name: '결승 문제 1 번호' }).fill('11001')
  await page.screenshot({ path: info.outputPath('tournament-editor-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
  await page.screenshot({ path: info.outputPath('tournament-editor-mobile.png'), fullPage: true })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByRole('button', { name: '초안 저장' }).click()
  await expect(page.getByRole('link', { name: '대회 설정 열기' })).toHaveAttribute('href', `/study/algorithms/tournaments/${id}`)
  expect(actions.find(action => action.action === 'tournament-save').roundsConfig).toEqual([
    { durationMinutes: 20, problems: [{ number: 1001, points: 250 }, { number: 1100, points: 100 }, { number: 90000, points: 100 }] },
    { durationMinutes: 20, problems: [{ number: 11001, points: 100 }] },
  ])
  expect(actions.find(action => action.action === 'tournament-save').scoring).toBe('partial')
  expect(Number.isFinite(actions.find(action => action.action === 'tournament-save').startsAt)).toBe(true)
  await page.getByRole('link', { name: '대회 설정 열기' }).click()
  await page.getByRole('button', { name: '설정 수정' }).click()
  await page.getByRole('textbox', { name: '대회 규칙' }).fill('회원은 두 경기까지 참가할 수 있습니다.')
  await page.getByRole('button', { name: '설정 저장' }).click()
  await expect(page.getByText('설정을 저장했습니다.')).toBeVisible()
  expect(actions.filter(action => action.action === 'tournament-save')).toHaveLength(2)
  await page.getByRole('button', { name: '참가 모집 시작' }).click()
  await expect(page.getByText('참가 신청을 열었습니다.')).toBeVisible()
  expect(actions.map(action => action.action)).toContain('tournament-publish')
  await page.screenshot({ path: info.outputPath('tournament-chair-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
  await page.screenshot({ path: info.outputPath('tournament-chair-mobile.png'), fullPage: true })
})

test('member finds an event, joins and sees the current match without early problem exposure', async ({ page }, info) => {
  await mockOptionalApis(page)
  await asMember(page)
  let event = detail()
  await page.route('**/study/api/club', route => {
    const body = route.request().postDataJSON()
    if (body.action === 'problem-catalog') return route.fulfill({ json: { problems: [] } })
    if (body.action === 'tournament-list') return route.fulfill({ json: { events: [summary()] } })
    if (body.action === 'tournament-get') return route.fulfill({ json: { event } })
    if (body.action === 'tournament-join') {
      event = { ...event, registered: true, participantCount: 2, participants: ['참가자 1', '참가자 2'] }
      return route.fulfill({ json: { event } })
    }
    throw Error(`Unexpected action ${body.action}`)
  })
  await page.goto('/study/algorithms/tournaments')
  await page.getByRole('searchbox', { name: '대회 검색' }).fill('없는 대회')
  await expect(page.getByText('조건에 맞는 대회가 없어요.')).toBeVisible()
  await page.getByRole('searchbox', { name: '대회 검색' }).fill('COM’s')
  await page.getByRole('link', { name: /COM’s 알고리즘 컵/ }).click()
  await expect(page.getByRole('heading', { name: 'COM’s 알고리즘 컵' })).toBeVisible()
  await expect(page.getByRole('button', { name: '설정 수정' })).toHaveCount(0)
  await page.getByRole('button', { name: '참가 신청', exact: true }).click()
  await expect(page.getByText('참가 신청을 완료했습니다.')).toBeVisible()
  await expect(page.getByText('2/4명 참가')).toBeVisible()
  event = detail({ status: 'running', startsAt: Date.now() - 1000, registered: true, participantCount: 2, participants: ['참가자 1', '참가자 2'], rounds: [
    { number: 1, startsAt: Date.now() - 1000, endsAt: Date.now() + 600_000, problemNumber: 1100, problems: [{ number: 1100, points: 100 }, { number: 1001, points: 250 }], matches: [
      { id: matchId, number: 1, status: 'active', players: ['참가자 1', '참가자 2'], winner: null, winnerSlot: null, result: null, isMine: true, canSubmit: true },
      { id: 'abcdef1234567890abcdef34', number: 2, status: 'finished', players: ['같은 이름', '같은 이름'], winner: '같은 이름', winnerSlot: 1, result: 'solved', scores: [0, 350], isMine: false, canSubmit: false },
    ] },
    { number: 2, startsAt: Date.now() + 900_000, endsAt: Date.now() + 1_500_000, problemNumber: null, matches: [] },
  ] })
  await page.reload()
  await expect(page.getByRole('link', { name: /1100번 문제 풀기/ })).toHaveAttribute('href', '/study/algorithms/1100?tournament=' + id + '&match=' + matchId)
  await expect(page.getByRole('link', { name: /1001번 문제 풀기/ })).toHaveAttribute('href', '/study/algorithms/1001?tournament=' + id + '&match=' + matchId)
  await expect(page.getByText('획득 점수 0 : 350')).toBeVisible()
  await expect(page.getByText('11001번')).toHaveCount(0)
  await expect(page.locator('.club-tournament-round').first().getByText('1라운드')).toBeVisible()
  await expect(page.locator('.club-tournament-players [data-winner="true"]')).toHaveCount(1)
  await page.screenshot({ path: info.outputPath('tournament-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
  const { violations } = await new AxeBuilder({ page }).include('.club-tournaments').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')).toEqual([])
  await page.screenshot({ path: info.outputPath('tournament-mobile.png'), fullPage: true })
})

test('guest sees the member guide before tournament data is requested', async ({ page }) => {
  await mockOptionalApis(page)
  let called = false
  await page.route('**/study/api/club', route => { called = true; return route.abort() })
  await page.goto('/study/algorithms/tournaments')
  await expect(page.getByRole('heading', { name: '알고리즘 대회는 동아리원만 참가할 수 있어요' })).toBeVisible()
  expect(called).toBe(false)
})

test('older draft settings load and a closed application window blocks the action', async ({ page }) => {
  await mockOptionalApis(page)
  await signInHint(page)
  await page.route('**/api/auth/me', route => route.fulfill({ json: {
    id: 1, studentId: '2026000001', name: '회장', role: 'ADMIN', emailVerified: true,
  } }))
  const legacy = detail({
    status: 'draft', participantCount: 0, participants: [], registered: false,
    problemNumbers: [1001, 1100], durationMinutes: 15,
  })
  await page.route('**/study/api/club', route => {
    const body = route.request().postDataJSON()
    if (body.action === 'problem-catalog') return route.fulfill({ json: { problems: [] } })
    if (body.action === 'tournament-get') return route.fulfill({ json: { event: legacy } })
    throw Error('Unexpected action ' + body.action)
  })
  await page.goto('/study/algorithms/tournaments/' + id)
  await page.getByRole('button', { name: '설정 수정' }).click()
  await expect(page.getByRole('combobox', { name: '1라운드 문제 1 번호' })).toHaveValue('1001')
  await expect(page.getByRole('combobox', { name: '결승 문제 1 번호' })).toHaveValue('1100')
  await expect(page.getByRole('region', { name: '결승 설정' }).getByRole('spinbutton', { name: '경기 시간 (분)' })).toHaveValue('15')
  await page.getByRole('combobox', { name: '모집 정원' }).selectOption('64')
  await expect(page.getByRole('region', { name: '결승 설정' })).toHaveCount(1)
  await expect(page.getByRole('combobox', { name: '1라운드 문제 1 번호' })).toHaveValue('1001')

  legacy.status = 'registration'
  legacy.registrationClosesAt = Date.now() - 1000
  await page.reload()
  await expect(page.getByText('참가 신청이 마감됐습니다.')).toBeVisible()
  await expect(page.getByRole('button', { name: '참가 신청', exact: true })).toHaveCount(0)
})
