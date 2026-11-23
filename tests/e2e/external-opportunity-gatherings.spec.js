import { expect, test } from '@playwright/test'
import { asMember, mockOptionalApis } from './visualSupport.js'

test.use({ serviceWorkers: 'block' })

test('a member opens an external event recruiting group and finds it from the event', async ({ page }) => {
  await mockOptionalApis(page)
  await asMember(page)
  const opportunity = {
    id: 41, title: '가상 코딩 대회', category: 'CONTEST', sourceName: '예시 기관',
    sourceUrl: 'https://example.com/contest', applicationStart: null, applicationEnd: '2099-12-20',
    eventStart: '2099-12-22', eventEnd: '2099-12-23', publishedAt: '2026-11-23T02:00:00Z',
  }
  let gathering = null
  let created = null
  await page.route('**/api/opportunities', route => route.fulfill({ json: [opportunity] }))
  await page.route('**/api/gatherings/opportunities', route => route.fulfill({ json: gathering ? [gathering] : [] }))
  await page.route('**/api/gatherings', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: gathering ? [gathering] : [] })
    created = route.request().postDataJSON()
    gathering = {
      ...created, id: 77, creatorName: '홍길동', mine: true, canManage: true,
      open: true, full: false, participantCount: 0, joined: false,
      createdAt: '2026-11-24T03:00:00',
    }
    return route.fulfill({ status: 201, json: { gathering, participants: [] } })
  })
  await page.route('**/api/gatherings/77', route => route.fulfill({ json: { gathering, participants: [] } }))

  await page.goto('/opportunities')
  await page.getByRole('link', { name: '함께 갈 사람 모집하기' }).click()
  await expect(page).toHaveURL(/\/gatherings\?opportunity=41&create=1$/)
  const form = page.getByRole('form', { name: '새 모임 열기' })
  await expect(form.getByLabel('제목')).toHaveValue('가상 코딩 대회 함께 가요')
  await expect(form.getByLabel(/설명/)).toHaveValue(/https:\/\/example.com\/contest/)
  await form.getByLabel(/정원/).fill('4')
  await form.getByRole('button', { name: '모임 열기' }).click()
  await expect(page).toHaveURL(/\/gatherings\/77$/)
  await expect(page.getByRole('link', { name: '연결된 외부 일정 보기' })).toHaveAttribute('href', '/opportunities#opportunity-41')
  expect(created).toMatchObject({ opportunityId: 41, capacity: 4, title: '가상 코딩 대회 함께 가요' })

  await page.goto('/opportunities')
  await expect(page.getByRole('link', { name: /가상 코딩 대회 함께 가요/ })).toHaveAttribute('href', '/gatherings/77')
})

test('an ended external event does not offer a new group to visitors', async ({ page }) => {
  await mockOptionalApis(page)
  let privateRequests = 0
  await page.route('**/api/gatherings/opportunities', route => { privateRequests++; return route.abort() })
  await page.route('**/api/opportunities', route => route.fulfill({ json: [{
    id: 42, title: '지난 코딩 대회', category: 'CONTEST', sourceName: '예시 기관',
    sourceUrl: 'https://example.com/past', applicationStart: '2025-01-01', applicationEnd: '2025-01-02',
    eventStart: '2025-01-03', eventEnd: '2025-01-04', publishedAt: '2025-01-01T03:00:00Z',
  }] }))
  await page.goto('/opportunities')
  await expect(page.getByRole('heading', { name: '지난 코딩 대회' })).toBeVisible()
  await expect(page.getByRole('link', { name: /함께 갈 사람 모집하기/ })).toHaveCount(0)
  expect(privateRequests).toBe(0)
})
