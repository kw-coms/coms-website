import { expect, test } from '@playwright/test'
import { asMember, mockAdminApis, mockOptionalApis } from './visualSupport.js'

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

const notice = (id, title, createdAt, extra = {}) => ({ id, title, content: `<p>${title} 본문</p>`, category: 'GENERAL', author: '운영진', authorStudentId: 'staff', pinned: false, createdAt, viewCount: 0, upvotes: 0, myVote: 0, ...extra })
const noticeRows = [
  notice(1, '오래된 고정 공지', '2026-01-01T09:00:00', { pinned: true }),
  notice(2, '이번 주 최신 공지', '2026-06-01T09:00:00'),
  notice(3, '지난달 공지', '2026-05-01T09:00:00', { content: '<p>비밀문장찾기 포함</p>' }),
]

async function noticesAsMember(page, { role = 'USER', studentId = '2023000002', permissions = [] } = {}) {
  await signedInMember(page)
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { id: 5, studentId, name: '홍길동', role, emailVerified: true } }))
  await page.route('**/api/permissions/me', (route) => route.fulfill({ json: { role, permissions } }))
  await page.route('**/api/notices', (route) => route.fulfill({ json: noticeRows }))
  await page.route(/\/api\/notices\/\d+$/, (route) => {
    const id = Number(route.request().url().split('/').pop())
    return route.fulfill({ json: noticeRows.find((row) => row.id === id) })
  })
}

test.describe('notices', () => {
  test('"최신" card shows the newest notice, not the first pinned one, and says 고정', async ({ page }) => {
    await noticesAsMember(page)
    await page.goto('/notices')
    const card = page.locator('button:visible').filter({ hasText: '최신 공지' }).first()
    await expect(card).toContainText('이번 주 최신 공지')
    await expect(card).not.toContainText('오래된 고정 공지')
    await expect(page.locator('tbody tr').filter({ hasText: '오래된 고정 공지' }).getByText('고정', { exact: true })).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/notices-${test.info().project.name}.png`, fullPage: true })
  })

  test('the search box says it searches the body and does', async ({ page }) => {
    await noticesAsMember(page)
    await page.goto('/notices')
    const search = page.getByPlaceholder('제목, 내용, 작성자 검색')
    await search.fill('비밀문장찾기')
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await expect(page.locator('tbody tr')).toContainText('지난달 공지')
  })

  test('new notices show a dot per browser, opening one clears it, 모두 읽음 clears the rest', async ({ page }) => {
    await noticesAsMember(page)
    await page.addInitScript(() => {
      if (!localStorage.getItem('kwcoms-notice-read:v1')) {
        const seenAt = new Date('2026-05-15T00:00:00').getTime()
        localStorage.setItem('kwcoms-notice-read:v1', JSON.stringify({ seenAt, lastVisit: Date.now(), readIds: [] }))
      }
    })
    await page.goto('/notices')
    const dots = page.locator('[data-notice-new]:visible')
    await expect(dots).toHaveCount(1)
    await expect(page.locator('tbody tr').filter({ hasText: '이번 주 최신 공지' }).locator('[data-notice-new]')).toBeVisible()
    await page.locator('tbody tr').filter({ hasText: '이번 주 최신 공지' }).click()
    await expect(page).toHaveURL(/\/notices\/2$/)
    await page.goBack()
    await expect(page.locator('tbody tr').filter({ hasText: '이번 주 최신 공지' })).toBeVisible()
    await expect(dots).toHaveCount(0)
    await expect(page.getByRole('button', { name: '모두 읽음' })).toHaveCount(0)
  })

  test('모두 읽음 marks everything read', async ({ page }) => {
    await noticesAsMember(page)
    await page.addInitScript(() => {
      if (!localStorage.getItem('kwcoms-notice-read:v1')) localStorage.setItem('kwcoms-notice-read:v1', JSON.stringify({ seenAt: new Date('2026-04-01T00:00:00').getTime(), lastVisit: Date.now(), readIds: [] }))
    })
    await page.goto('/notices')
    await expect(page.locator('[data-notice-new]:visible')).toHaveCount(2)
    await page.getByRole('button', { name: '모두 읽음' }).click()
    await expect(page.locator('[data-notice-new]:visible')).toHaveCount(0)
    await page.reload()
    await expect(page.locator('tbody tr').first()).toBeVisible()
    await expect(page.locator('[data-notice-new]:visible')).toHaveCount(0)
  })

  test('on phones the featured notices are one compact row', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await noticesAsMember(page)
    await page.goto('/notices')
    const row = page.locator('[data-notice-featured-compact]')
    await expect(row).toBeVisible()
    expect((await row.boundingBox()).height).toBeLessThan(90)
    await expect(page.locator('button:visible').filter({ hasText: '이번 주 최신 공지' }).first()).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/notices-390-${test.info().project.name}.png` })
  })

  test('an author sees 수정 but not 삭제; an officer with notice.write sees 삭제 but not 수정 on others', async ({ page }) => {
    await noticesAsMember(page, { studentId: 'staff' })
    await page.goto('/notices/2')
    await expect(page.getByRole('heading', { name: '이번 주 최신 공지' })).toBeVisible()
    await expect(page.getByRole('button', { name: '수정', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '삭제', exact: true })).toHaveCount(0)
  })

  test('an officer with notice.write can delete but not edit another author\'s notice', async ({ page }) => {
    await noticesAsMember(page, { role: 'OFFICER', studentId: 'someone-else', permissions: ['notice.write'] })
    await page.goto('/notices/2')
    await expect(page.getByRole('button', { name: '삭제', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '수정', exact: true })).toHaveCount(0)
  })
})

const draftKeys = (page) => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('kwcoms-draft:v1:')))

test.describe('editor drafts', () => {
  let submitted = null
  async function adminCommunity(page) {
    await mockAdminApis(page)
    await page.route('**/api/community/posts{,?*}', (route) => route.request().method() === 'GET'
      ? route.fulfill({ json: [] })
      : route.fulfill({ json: { id: 91, ...(submitted = route.request().postDataJSON()), authorName: '관리자', authorStudentId: '2020123456', createdAt: '2026-06-22T01:00:00', viewCount: 0, upvotes: 0, downvotes: 0, myVote: 0, commentCount: 0 } }))
  }

  test('a post draft is saved, restored with a notice, deletable and cleared on submit', async ({ page }) => {
    await adminCommunity(page)
    await page.goto('/community')
    await page.getByRole('button', { name: '글쓰기' }).click()
    await page.locator('.community-compose-title').fill('쓰다 만 글')
    await page.locator('.community-compose-editor [contenteditable="true"]').fill('본문 초안')
    await expect.poll(() => draftKeys(page)).toHaveLength(1)

    await page.reload()
    await page.getByRole('button', { name: '글쓰기' }).click()
    await expect(page.getByText('임시 저장된 글을 불러왔어요')).toBeVisible()
    await expect(page.locator('.community-compose-title')).toHaveValue('쓰다 만 글')
    await expect(page.locator('.community-compose-editor [contenteditable="true"]')).toContainText('본문 초안')
    await page.screenshot({ path: `${SHOTS}/draft-restored-${test.info().project.name}.png` })

    await page.getByRole('button', { name: '삭제', exact: true }).click()
    await expect(page.getByText('임시 저장된 글을 불러왔어요')).toHaveCount(0)
    await expect(page.locator('.community-compose-title')).toHaveValue('')
    await expect.poll(() => draftKeys(page)).toHaveLength(0)

    await page.locator('.community-compose-title').fill('올릴 글')
    await page.locator('.community-compose-editor [contenteditable="true"]').fill('올릴 본문')
    await expect.poll(() => draftKeys(page)).toHaveLength(1)
    await page.getByRole('button', { name: '글 등록' }).click()
    await expect.poll(() => submitted).toMatchObject({ title: '올릴 글' })
    await page.waitForTimeout(2200)
    expect(await draftKeys(page)).toHaveLength(0)
  })

  test('leaving with unsaved changes asks first; a clean editor does not', async ({ page }) => {
    await adminCommunity(page)
    await page.goto('/community')
    await page.getByRole('button', { name: '글쓰기' }).click()
    const link = () => page.evaluate(() => {
      const anchor = document.createElement('a')
      anchor.href = '/notices'
      anchor.textContent = 'go'
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
    })
    await page.locator('.community-compose-title').fill('작성 중')
    await expect.poll(() => draftKeys(page)).toHaveLength(1)
    await link()
    const dialog = page.locator('.coms-confirm-card')
    await expect(dialog).toContainText('저장하지 않은 내용이 있습니다')
    await dialog.getByRole('button', { name: '계속 작성' }).click()
    await expect(page).toHaveURL(/\/community$/)
    await link()
    await page.locator('.coms-confirm-card').getByRole('button', { name: '떠나기' }).click()
    await expect(page).toHaveURL(/\/notices$/)
  })

  test('closing the tab with unsaved changes raises the browser prompt', async ({ page }) => {
    await adminCommunity(page)
    await page.goto('/community')
    await page.getByRole('button', { name: '글쓰기' }).click()
    await page.locator('.community-compose-title').click()
    await page.keyboard.type('작성 중')
    await expect.poll(() => draftKeys(page)).toHaveLength(1)
    // Headless Chrome shows no real prompt, so ask the page what its beforeunload handler does.
    const prevented = () => page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    })
    expect(await prevented()).toBe(true)
    await page.getByRole('button', { name: '취소' }).click()
    await expect.poll(prevented).toBe(false)
  })

  test('the notice form keeps a draft too', async ({ page }) => {
    await mockAdminApis(page)
    await page.route('**/api/notices', (route) => route.fulfill({ json: [] }))
    await page.goto('/notices')
    await page.getByRole('button', { name: '공지 작성' }).click()
    await page.getByPlaceholder('제목', { exact: true }).fill('공지 초안')
    await expect.poll(() => draftKeys(page)).toHaveLength(1)
    await page.reload()
    await page.getByRole('button', { name: '공지 작성' }).click()
    await expect(page.getByText('임시 저장된 글을 불러왔어요')).toBeVisible()
    await expect(page.getByPlaceholder('제목', { exact: true })).toHaveValue('공지 초안')
  })
})

test.describe('account settings', () => {
  const SECTIONS = ['settings-profile', 'settings-notifications', 'settings-email', 'settings-password', 'settings-miniapps']

  test('desktop: sections are open, no developer wording, a closed section stays closed after reload', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await mockAdminApis(page)
    await page.goto('/settings')
    for (const id of SECTIONS) await expect(page.locator(`details#${id}`)).toHaveAttribute('open', '')
    await expect(page.getByText('입력 영역을 분리했습니다')).toHaveCount(0)
    await expect(page.getByText('따로 관리합니다')).toHaveCount(0)
    await page.screenshot({ path: `${SHOTS}/settings-1440-${test.info().project.name}.png`, fullPage: true })
    await page.locator('details#settings-email > summary').click()
    await expect(page.locator('details#settings-email')).not.toHaveAttribute('open', '')
    await page.reload()
    await expect(page.locator('details#settings-email')).not.toHaveAttribute('open', '')
    await expect(page.locator('details#settings-password')).toHaveAttribute('open', '')
  })

  test('phone: sections start collapsed, open by keyboard, and an anchor opens its section', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockAdminApis(page)
    await page.goto('/settings')
    await expect(page.locator('details#settings-password > summary')).toBeVisible()
    for (const id of SECTIONS) await expect(page.locator(`details#${id}`)).not.toHaveAttribute('open', '')
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThan(2200)
    await page.screenshot({ path: `${SHOTS}/settings-390-collapsed-${test.info().project.name}.png`, fullPage: true })

    await page.locator('details#settings-password > summary').focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('details#settings-password')).toHaveAttribute('open', '')
    await expect(page.getByPlaceholder('현재 비밀번호를 입력하세요')).toBeVisible()

    await page.goto('/settings#settings-email')
    await expect(page.locator('details#settings-email')).toHaveAttribute('open', '')
    await page.screenshot({ path: `${SHOTS}/settings-390-anchor-${test.info().project.name}.png` })
  })
})
