import { expect, test } from '@playwright/test'
import { mockAdminApis } from './visualSupport.js'
import { legacyEvent, doneEvent, summary, adminSummary } from '../hackathonFixture.mjs'

test.use({ serviceWorkers: 'block' })

const section = page => page.getByRole('region', { name: '해커톤 평가 관리' })

async function mockAdminEvents(page, state) {
  await mockAdminApis(page)
  await page.route('**/api/hackathon/events', route => route.fulfill({ json: [summary(state.event)] }))
  await page.route(/\/api\/hackathon\/events\/\d+$/, route => route.fulfill({ json: state.event }))
  await page.route('**/api/admin/hackathon/events', route => route.fulfill({ json: [adminSummary(state.event)] }))
  await page.route(/\/api\/admin\/hackathon\/events\/\d+(?:\/.*)?$/, route => {
    const parts = new URL(route.request().url()).pathname.split('/')
    const method = route.request().method()
    if (parts[6] === 'reviews') return route.fulfill({ json: [] })
    if (parts[6] === 'results-published' && method === 'PUT') {
      state.resultsCalls.push(route.request().postDataJSON())
      return state.resultsReply(route)
    }
    if (parts[6] === undefined && method === 'PUT') {
      const body = route.request().postDataJSON()
      state.saved.push(body)
      if (state.saveError) return route.fulfill({ status: 400, json: { message: state.saveError } })
      state.event = { ...state.event, ...body }
      return route.fulfill({ json: state.event })
    }
    return route.fulfill({ json: state.event })
  })
}

test('datetime inputs are validated and the results toggle explains why it is disabled', async ({ page }) => {
  const state = { event: { ...legacyEvent, startsAt: null, endsAt: null }, resultsCalls: [], saved: [] }
  await mockAdminEvents(page, state)
  await page.goto('/admin?tab=hackathon&event=1')
  const admin = section(page)
  const editor = admin.getByRole('form', { name: /행사 편집/ })
  await expect(editor.getByText('개발 시작 (한국 시간)')).toBeVisible()
  await editor.getByLabel('개발 시작 (한국 시간)').fill('2026-11-08T18:00')
  await expect(editor.getByRole('alert')).toContainText('시작과 종료를 함께 입력해 주세요')
  await expect(editor.getByRole('button', { name: '글 저장' })).toBeDisabled()
  await editor.getByLabel('개발 종료 (한국 시간)').fill('2026-11-07T04:00')
  await expect(editor.getByRole('alert')).toContainText('종료가 시작보다 빠를 수 없습니다')
  await expect(editor.getByRole('button', { name: '글 저장' })).toBeDisabled()
  await editor.getByLabel('개발 종료 (한국 시간)').fill('2026-11-15T04:00')
  await expect(editor.getByRole('alert')).toHaveCount(0)
  await expect(editor.getByRole('button', { name: '글 저장' })).toBeEnabled()
  const toggle = admin.getByRole('button', { name: '결과 공개' })
  await expect(toggle).toBeDisabled()
  const reason = admin.locator('#hackathon-results-reason')
  await expect(reason).toContainText("지금은 '평가 중'입니다")
  await expect(toggle).toHaveAttribute('aria-describedby', 'hackathon-results-reason')
  await expect(admin.getByRole('option', { name: /평가 중/ })).toHaveCount(1)
})

test('a rejected results publication shows the server message and a rejected save shows it beside the form', async ({ page }) => {
  const state = {
    event: { ...doneEvent, resultsPublished: false, results: [] }, resultsCalls: [], saved: [],
    resultsReply: route => route.fulfill({ status: 409, json: { message: '모든 팀에 졸업생 평가와 회장 평가가 있어야 결과를 공개할 수 있습니다.' } }),
    saveError: '종료가 시작보다 빠를 수 없습니다.',
  }
  await mockAdminEvents(page, state)
  await page.goto('/admin?tab=hackathon&event=3')
  const admin = section(page)
  const toggle = admin.getByRole('button', { name: '결과 공개' })
  await expect(toggle).toBeEnabled()
  await expect(admin.locator('#hackathon-results-reason')).toHaveCount(0)
  await toggle.click()
  await expect(admin.getByRole('alert').filter({ hasText: '모든 팀에 졸업생 평가와 회장 평가가 있어야' })).toBeVisible()
  expect(state.resultsCalls).toEqual([{ resultsPublished: true }])
  const editor = admin.getByRole('form', { name: /행사 편집/ })
  await editor.getByRole('button', { name: '글 저장' }).click()
  await expect(editor.getByRole('alert')).toContainText('종료가 시작보다 빠를 수 없습니다.')
})

test('saving an event refreshes the public archive and detail instead of serving cached copies', async ({ page }) => {
  const state = { event: { ...doneEvent, resultsPublished: false, results: [] }, resultsCalls: [], saved: [] }
  await mockAdminEvents(page, state)
  await page.goto('/hackathon/3')
  await expect(page.getByRole('heading', { name: '2025년 2학기 해커톤', level: 1 })).toBeVisible()
  const goTo = path => page.evaluate(target => { window.history.pushState({}, '', target); window.dispatchEvent(new PopStateEvent('popstate')) }, path)
  await goTo('/admin?tab=hackathon&event=3')
  const editor = section(page).getByRole('form', { name: /행사 편집/ })
  await editor.getByLabel('해커톤 이름').fill('2025년 2학기 해커톤 (수정)')
  await editor.getByRole('button', { name: '글 저장' }).click()
  await expect(section(page).getByRole('status').filter({ hasText: '해커톤 글을 저장했습니다.' })).toBeVisible()
  expect(state.saved).toHaveLength(1)
  await goTo('/hackathon')
  await expect(page.locator('a.hackathon-card', { hasText: '2025년 2학기 해커톤 (수정)' })).toBeVisible()
  await goTo('/hackathon/3')
  await expect(page.getByRole('heading', { name: '2025년 2학기 해커톤 (수정)', level: 1 })).toBeVisible()
})
