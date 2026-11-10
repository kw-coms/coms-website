import { expect, test } from '@playwright/test'
import { asMember, mockOptionalApis } from './visualSupport.js'

const SHOTS = '/private/tmp/claude-501/-Users-choi-Documents-project/e43260bf-49ca-468b-9a62-7fea75ac4e6a/scratchpad/fix-members'
const day = (offset) => {
  const date = new Date(Date.now() + offset * 86400000)
  return `${date.toISOString().slice(0, 10)}T00:00:00`
}

async function signedInMember(page) {
  await mockOptionalApis(page)
  await asMember(page)
  await page.route('**/api/notifications**', (route) => route.fulfill({ status: 200, json: [] }))
}

const baseEvent = { description: '', totalVotes: 0, myEntryId: null, entryCount: 0, entries: [], goingCount: 0, maybeCount: 0, notGoingCount: 0, myRsvpStatus: null, createdByName: '관리자', createdAt: day(-3), updatedAt: day(-3) }
const events = [
  { ...baseEvent, id: 1, title: '지난 회지 투표', startsAt: day(-30), endsAt: day(-20), votingOpen: false, entryCount: 2, totalVotes: 4 },
  { ...baseEvent, id: 7, title: '봄 MT', description: '<p>가평 1박 2일</p>', startsAt: day(10), endsAt: day(11), votingOpen: false },
  { ...baseEvent, id: 2, title: '진행 중 인기투표', startsAt: day(-2), endsAt: day(5), votingOpen: true, entryCount: 1, totalVotes: 3 },
]

async function mockEvents(page) {
  await page.route('**/api/club-events', (route) => route.fulfill({ status: 200, json: events }))
  await page.route(/\/api\/club-events\/\d+$/, (route) => {
    const id = Number(route.request().url().split('/').pop())
    const found = events.find((item) => item.id === id)
    return found ? route.fulfill({ status: 200, json: found }) : route.fulfill({ status: 404, json: { message: 'not found' } })
  })
}

test.describe('club events', () => {
  test('an opened event has its own address that survives reload and Back', async ({ page }) => {
    await signedInMember(page)
    await mockEvents(page)
    await page.goto('/activity-events')
    await page.locator('.club-event-list-button').filter({ hasText: '봄 MT' }).click()
    await expect(page).toHaveURL(/\/activity-events\/7$/)
    await expect(page.getByRole('heading', { name: '봄 MT', level: 2 })).toBeVisible()
    await page.reload()
    await expect(page).toHaveURL(/\/activity-events\/7$/)
    await expect(page.getByRole('heading', { name: '봄 MT', level: 2 })).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(/\/activity-events$/)
    await expect(page.locator('.club-event-list-button').first()).toBeVisible()
    await page.goto('/activity-events/7')
    await page.getByRole('button', { name: '목록' }).click()
    await expect(page).toHaveURL(/\/activity-events$/)
  })

  test('an unknown event id says so and links back', async ({ page }) => {
    await signedInMember(page)
    await mockEvents(page)
    await page.goto('/activity-events/999')
    await expect(page.getByRole('heading', { name: '이벤트를 찾을 수 없습니다.' })).toBeVisible()
    await page.getByRole('button', { name: '이벤트 목록으로' }).click()
    await expect(page).toHaveURL(/\/activity-events$/)
  })

  test('the detail copies its link', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await signedInMember(page)
    await mockEvents(page)
    await page.goto('/activity-events/7')
    await page.getByRole('button', { name: '링크 복사' }).click()
    await expect(page.getByText('링크를 복사했습니다.')).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/activity-events\/7$/)
  })

  test('a plain event shows no contest wording; a contest still does', async ({ page }) => {
    await signedInMember(page)
    await mockEvents(page)
    await page.goto('/activity-events/7')
    await expect(page.getByRole('heading', { name: '봄 MT', level: 2 })).toBeVisible()
    await expect(page.getByText('가평 1박 2일')).toBeVisible()
    const main = page.locator('#activity-events')
    for (const text of ['EVENT CONTEST', 'Event contest', '투표 종료', '0표', '작품']) {
      await expect(main.getByText(text, { exact: false })).toHaveCount(0)
    }
    await page.goto('/activity-events/2')
    await expect(page.getByText('투표 진행 중')).toBeVisible()
    await expect(page.getByText('3표')).toBeVisible()
  })

  test('the list shows open events first, then upcoming, then closed, and no vote counts on a plain event', async ({ page }) => {
    await signedInMember(page)
    await mockEvents(page)
    await page.goto('/activity-events')
    await expect(page.locator('.club-event-list-card strong').first()).toBeVisible()
    expect(await page.locator('.club-event-list-card .club-event-list-button strong').allTextContents()).toEqual(['진행 중 인기투표', '봄 MT', '지난 회지 투표'])
    const plain = page.locator('.club-event-list-card').filter({ hasText: '봄 MT' })
    await expect(plain.getByText('표', { exact: false })).toHaveCount(0)
    await page.screenshot({ path: `${SHOTS}/events-list-${test.info().project.name}.png`, fullPage: true })
  })

  test('the entry form tells the truth: only admins upload works', async ({ page }) => {
    await signedInMember(page)
    await mockEvents(page)
    await page.goto('/activity-events/2')
    await expect(page.getByRole('form', { name: '이벤트 회지 글쓰기' })).toHaveCount(0)
    await expect(page.getByText('업로드할 수 있습니다')).toHaveCount(0)
  })
})
