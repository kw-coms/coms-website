import { expect, test } from '@playwright/test'
import { asMember, mockOptionalApis } from './visualSupport.js'

const id = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const matchId = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const url = `/study/algorithms/11001?tournament=${id}&match=${matchId}`

async function useTournament(page, isMine) {
  await mockOptionalApis(page)
  await asMember(page)
  await page.route('**/study/api/progress', route => route.fulfill({ json: { solved: [], solvedToday: 0, streak: 0 } }))
  await page.route('**/study/api/club', route => route.fulfill({ json: { event: {
    id, title: '가을 알고리즘 대회', status: 'running', rounds: [{ number: 1, problemNumber: 11001,
      endsAt: Date.now() + 300_000, matches: [{ id: matchId, status: 'active', isMine, canSubmit: isMine }],
    }],
  } } }))
}

test('the match workspace supports timed tournament submission and keeps practice tools out', async ({ page }) => {
  await useTournament(page, true)
  let submitted
  await page.route('**/study/api/run', (route) => {
    submitted = route.request().postDataJSON()
    return route.fulfill({ json: { judge: { passed: 1, total: 1, solved: true, verdicts: ['correct'] } } })
  })
  await page.goto(url)
  await expect(page.getByRole('timer', { name: '남은 경기 시간' })).toBeVisible()
  await expect(page.getByRole('link', { name: /대진표로 돌아가기/ })).toHaveAttribute('href', `/study/algorithms/tournaments/${id}`)
  await expect(page.locator('#judge-help')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '답 보기' })).toHaveCount(0)
  await page.locator('.ex-editor .cm-content').fill('print(42)')
  await page.getByRole('button', { name: '대회 제출' }).click()
  await expect(page.getByText('문제를 해결했어요!')).toBeVisible()
  expect(submitted).toMatchObject({ tournamentId: id, matchId, problemNumber: 11001, code: 'print(42)' })
  expect(submitted).not.toHaveProperty('battleCode')
})

test('a direct link does not open another member’s match editor', async ({ page }) => {
  await useTournament(page, false)
  await page.goto(url)
  await expect(page.getByText('내 경기가 시작되면 대진표에서 문제를 열 수 있습니다.')).toBeVisible()
  await expect(page.locator('#judge-workspace')).toHaveCount(0)
})
