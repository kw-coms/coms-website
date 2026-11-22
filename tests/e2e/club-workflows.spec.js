import { expect, test } from '@playwright/test'
import { mockAdminApis, mockOptionalApis } from './visualSupport.js'
import { futureEvent } from '../hackathonFixture.mjs'

test.use({ serviceWorkers: 'block' })

test('a team member writes and previews a private hackathon draft on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockOptionalApis(page)
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 7, name: '테스트 회원', studentId: '2099000007', role: 'USER', emailVerified: true } }))
  await page.route('**/api/hackathon/events/2', route => route.fulfill({ json: { ...futureEvent, projects: [] } }))
  const teamPath = '**/api/hackathon/team-work/2'
  const project = { projectId: 'draft-work', teamName: '테스트 팀', title: '', author: '', description: '', github: null, live: null, position: 0, materials: [], published: false, version: 0 }
  await page.route(teamPath, route => route.fulfill({ json: { editable: true, projects: [project] } }))
  const requests = []
  await page.route(teamPath + '/draft-work', route => {
    requests.push(route.request().postDataJSON())
    return route.fulfill({ json: { ...project, ...requests.at(-1), version: 1 } })
  })
  await page.goto('/hackathon/2')
  const panel = page.getByRole('region', { name: '내 팀 작품' })
  await panel.locator('summary').click()
  await panel.getByLabel('작품 이름').fill('회로를 보여 주는 앱')
  await panel.getByLabel('작성자').fill('테스트 대표')
  await panel.getByRole('button', { name: '소개 양식 넣기' }).click()
  await expect(panel.getByLabel('작품 소개')).toHaveValue(/만든 이유/)
  await panel.getByRole('button', { name: '미리보기', exact: true }).click()
  await expect(panel.getByRole('region', { name: '작품 미리보기' })).toContainText('회로를 보여 주는 앱')
  await panel.getByRole('button', { name: '작품 저장' }).click()
  await expect(panel.getByRole('status')).toHaveText('팀 초안을 저장했습니다.')
  expect(requests).toHaveLength(1)
  expect(requests[0]).toMatchObject({ title: '회로를 보여 주는 앱', author: '테스트 대표', version: 0 })
  expect(requests[0]).not.toHaveProperty('published')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('the chair builds a reusable form and a member can submit its required answers', async ({ page }) => {
  await mockAdminApis(page)
  let active
  let response = null
  await page.route('**/api/admin/club-forms', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: active ? [active] : [] })
    active = { ...route.request().postDataJSON(), id: 11, open: true, version: 0 }
    return route.fulfill({ json: active })
  })
  await page.route('**/api/admin/club-forms/11/responses?*', route => route.fulfill({ json: { items: [], page: 0, total: 0 } }))
  await page.route('**/api/club-forms/11', route => route.fulfill({ json: { form: active, response } }))
  await page.route('**/api/club-forms/11/response', route => {
    expect(route.request().postDataJSON().formVersion).toBe(0)
    response = { answers: route.request().postDataJSON().answers, submittedAt: '2026-11-23T02:00:00Z' }
    return route.fulfill({ json: response })
  })
  await page.goto('/admin?tab=club-forms&category=TEAM_PROJECT')
  const admin = page.getByRole('region', { name: '신청·수요조사 관리' })
  await expect(admin.getByLabel('제목')).toHaveValue('팀 프로젝트 수요조사')
  await admin.getByRole('button', { name: '질문 추가' }).click()
  await admin.getByLabel('질문 내용').last().fill('희망하는 스터디 요일')
  await admin.getByLabel('답변 형식').last().selectOption('MULTIPLE')
  await admin.getByLabel('보기 (한 줄에 하나)').last().fill('월요일\n수요일')
  await admin.getByLabel('응답 받기').check()
  await admin.getByRole('button', { name: '양식 저장' }).click()
  await expect(admin.getByRole('status').filter({ hasText: '양식을 저장했습니다.' })).toBeVisible()
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 8, name: '응답 테스트', studentId: '2099000008', role: 'USER', emailVerified: true } }))
  await page.goto('/forms/11')
  await page.getByRole('radio', { name: '참여 희망', exact: true }).check()
  await page.getByLabel('관심 있는 분야나 해 보고 싶은 프로젝트').fill('로봇 제어')
  await page.getByRole('button', { name: '응답 제출' }).click()
  await expect(page.getByRole('alert')).toContainText('희망하는 스터디 요일')
  await page.getByRole('checkbox', { name: '수요일' }).check()
  await page.getByRole('button', { name: '응답 제출' }).click()
  await expect(page.getByRole('status').filter({ hasText: '응답을 저장했습니다.' })).toBeVisible()
  await expect(page.getByRole('button', { name: '응답 수정' })).toBeVisible()
  expect(Object.values(response.answers)).toContainEqual(['수요일'])
})

test('a visitor can send a collaboration proposal through the existing mailbox endpoint', async ({ page }) => {
  await mockOptionalApis(page)
  await page.route('**/api/site-settings', route => route.fulfill({ json: { askEnabled: true } }))
  const requests = []
  await page.route('**/api/ask', route => { requests.push(route.request().postDataJSON()); return route.fulfill({ status: 204 }) })
  await page.goto('/contact')
  const form = page.getByRole('form', { name: '협업 제안 보내기' })
  await form.getByLabel('제안 제목').fill('연합 세미나')
  await form.getByLabel('이름', { exact: true }).fill('테스트 제안자')
  await form.getByLabel('소속·팀').fill('테스트 동아리')
  await form.getByLabel('답장받을 이메일').fill('collab@example.com')
  await form.getByLabel('제안 내용').fill('다음 학기에 아두이노 세미나를 같이 열고 싶습니다.')
  await form.getByRole('button', { name: '협업 제안 보내기' }).click()
  await expect(page.getByRole('status').filter({ hasText: '협업 제안을 보냈습니다.' })).toBeVisible()
  expect(requests).toHaveLength(1)
  expect(requests[0]).toMatchObject({ topic: 'COLLABORATION', pagePath: '/contact' })
  expect(requests[0].question).toContain('테스트 동아리')
})
