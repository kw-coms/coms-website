import { expect, test } from '@playwright/test'
import { asMember, mockOptionalApis } from './visualSupport.js'

test('a signed-in study member checks in to the selected round', async ({ page }) => {
  await mockOptionalApis(page)
  await asMember(page)

  const studentId = '2023000002'
  const group = {
    id: 42, name: '알고리즘 스터디', topicTags: ['알고리즘'], status: 'ACTIVE',
    manager: false, interestSummary: { total: 0, levels: {}, slots: {} },
    myMembership: { studentId, role: 'MEMBER', status: 'APPROVED' },
  }
  const round = { id: 7, groupId: 42, roundNo: 1, date: '2026-11-24', topic: '그래프', attendanceOpen: true }
  const checkedAt = '2026-11-24T19:30:00'
  let checkedIn = false

  await page.route('**/api/study-groups', (route) => route.fulfill({ json: [group] }))
  await page.route('**/api/study-groups/42', (route) => route.fulfill({ json: group }))
  await page.route('**/api/study-groups/42/sessions', (route) => route.fulfill({ json: [round] }))
  await page.route('**/api/study-groups/42/sessions/7/attendance/roster', (route) => route.fulfill({
    json: { members: [{ studentId, name: '홍길동', status: checkedIn ? 'PRESENT' : null, checkedAt: checkedIn ? checkedAt : null }] },
  }))
  await page.route('**/api/attendance/check-in', (route) => {
    expect(route.request().method()).toBe('POST')
    expect(route.request().postDataJSON()).toEqual({ code: '1234', studyGroupId: 42, studySessionId: 7 })
    checkedIn = true
    return route.fulfill({ json: { sessionId: 9, title: round.topic, checkedAt, alreadyChecked: false } })
  })

  await page.goto('/study/groups')
  await page.getByRole('link', { name: '알고리즘 스터디' }).click()
  await expect(page).toHaveTitle(/스터디 모임/)
  await page.getByRole('tab', { name: '회차/출석' }).click()
  await expect(page.getByRole('heading', { name: '이번 출석 · 0명' })).toBeVisible()
  await page.getByRole('textbox', { name: '출석 코드' }).fill('1234')
  await page.getByRole('button', { name: '출석하기' }).click()
  await expect(page.getByRole('heading', { name: '이번 출석 · 1명' })).toBeVisible()
})
