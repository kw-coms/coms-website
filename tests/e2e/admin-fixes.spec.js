import { expect, test } from '@playwright/test'
import { asMember, mockAdminApis } from './visualSupport.js'

// Operator panel and participation tools. Every person, title and number below is made up.

const recruitApplication = (over = {}) => ({
  id: 7, name: '김지원', studentId: '2026123000', department: '컴퓨터정보공학부', grade: '1학년',
  phone: '01012345678', email: 'apply@example.com', interests: '웹', motive: '같이 만들고 싶습니다.',
  expectation: '스터디', status: 'RECEIVED', adminNote: '', submittedAt: '2026-06-15T09:00:00', ...over,
})

async function mockOfficer(page, permissions) {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { id: 2, name: '임원', studentId: '2022000001', role: 'OFFICER', emailVerified: true } }))
  await page.route('**/api/permissions/me', (route) => route.fulfill({ json: { role: 'OFFICER', permissions } }))
}

test.describe('operator panel', () => {
  test('tabs sit under four headings and a heading with no visible tab is hidden', async ({ page }) => {
    await mockAdminApis(page)
    await page.goto('/admin')
    const nav = page.getByRole('navigation', { name: '운영 패널 메뉴' })
    for (const [group, tabs] of Object.entries({
      사람: ['회원 관리', '명부 인증', '권한 관리', '차단 관리', '모집 관리'],
      콘텐츠: ['활동 관리', '커뮤니티 관리', '삭제 보관함', '파일 관리', '작품 관리', '후원자'],
      사이트: ['사이트 문구', '폰트 관리', '수동 점검'],
      시스템: ['분석', '로그'],
    })) {
      const list = nav.getByRole('tablist', { name: group })
      await expect(list.getByRole('tab')).toHaveText(tabs)
    }
    await expect(nav.getByRole('tab')).toHaveCount(17)
  })

  test('an officer sees only the headings that still hold a permitted tab', async ({ page }) => {
    await mockAdminApis(page)
    await mockOfficer(page, ['operations.panel', 'activity.write'])
    await page.goto('/admin')
    const nav = page.getByRole('navigation', { name: '운영 패널 메뉴' })
    await expect(nav.getByRole('tab')).toHaveText(['활동 관리'])
    await expect(nav.getByRole('tablist', { name: '콘텐츠' })).toBeVisible()
    for (const group of ['사람', '사이트', '시스템']) await expect(nav.getByRole('tablist', { name: group })).toHaveCount(0)
    // A forbidden tab in the address falls back to the first permitted one.
    await page.goto('/admin?tab=members')
    await expect(page).toHaveURL(/tab=activities$/)
  })

  test('the tab is kept in the address: pushed on click, replaced on first load, Back moves between tabs', async ({ page }) => {
    await mockAdminApis(page)
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/admin\?tab=overview$/)
    await page.getByRole('tab', { name: '회원 관리' }).click()
    await expect(page).toHaveURL(/tab=members$/)
    await page.getByRole('tab', { name: '로그' }).click()
    await expect(page).toHaveURL(/tab=logs$/)
    await page.goBack()
    await expect(page).toHaveURL(/tab=members$/)
    await expect(page.getByRole('tab', { name: '회원 관리' })).toHaveAttribute('aria-selected', 'true')
    // A value the notification links use still opens its tab; an unknown one falls back.
    await page.goto('/admin?tab=recruit')
    await expect(page.getByRole('tab', { name: '모집 관리' })).toHaveAttribute('aria-selected', 'true')
    await page.goto('/admin?tab=nope')
    await expect(page).toHaveURL(/tab=overview$/)
  })

  test('on a phone a heading is picked first and then its tabs', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 })
    await mockAdminApis(page)
    await page.goto('/admin?tab=members')
    const nav = page.getByRole('navigation', { name: '운영 패널 메뉴' })
    await expect(nav.getByRole('tab', { name: '명부 인증' })).toBeVisible()
    await expect(nav.getByRole('tab', { name: '로그' })).toBeHidden()
    const heading = nav.getByRole('button', { name: '시스템' })
    expect((await heading.boundingBox()).height).toBeGreaterThanOrEqual(44)
    await heading.click()
    await expect(nav.getByRole('tab', { name: '로그' })).toBeVisible()
    await expect(nav.getByRole('tab', { name: '명부 인증' })).toBeHidden()
    await nav.getByRole('tab', { name: '로그' }).click()
    await expect(page).toHaveURL(/tab=logs$/)
  })

  test('the overview lists real work, each row opens its tab, and says so when there is none', async ({ page }) => {
    await mockAdminApis(page)
    await page.route('**/api/admin/recruit-applications', (route) => route.fulfill({ json: [recruitApplication(), recruitApplication({ id: 8, status: 'HOLD' }), recruitApplication({ id: 9, status: 'ACCEPTED' })] }))
    await page.route('**/api/admin/analytics', (route) => route.fulfill({ json: { communityReportsOpen: 3, communityReportsResolved: 1 } }))
    await page.goto('/admin')
    const todo = page.getByTestId('admin-todo')
    await expect(todo.getByRole('button')).toHaveCount(2)
    await expect(todo.getByRole('button', { name: /처리 대기 중인 지원서.*2건/ })).toBeVisible()
    await todo.getByRole('button', { name: /커뮤니티 신고.*3건/ }).click()
    await expect(page).toHaveURL(/tab=community$/)
    await expect(page.getByText('Admin OS')).toHaveCount(0)
  })

  test('the overview says there is nothing to do, and reports a failed source instead of counting it as zero', async ({ page }) => {
    await mockAdminApis(page)
    await page.route('**/api/admin/analytics', (route) => route.fulfill({ json: { communityReportsOpen: 0 } }))
    await page.goto('/admin')
    await expect(page.getByText('처리할 일이 없어요')).toBeVisible()

    await page.unroute('**/api/admin/analytics')
    await page.route('**/api/admin/analytics', (route) => route.fulfill({ status: 500, json: { message: '서버 오류' } }))
    await page.goto('/admin')
    await expect(page.getByRole('alert').filter({ hasText: '커뮤니티 신고 현황을 불러오지 못했습니다' })).toBeVisible()
    await expect(page.getByText('처리할 일이 없어요')).toHaveCount(0)
  })

  test('a recruit status saves on change with an undo, and accept warns that the application is deleted', async ({ page }) => {
    await mockAdminApis(page)
    let current = recruitApplication()
    const patches = []
    await page.route('**/api/admin/recruit-applications', (route) => route.fulfill({ json: [current] }))
    await page.route('**/api/admin/recruit-applications/7/status', async (route) => {
      const body = route.request().postDataJSON()
      patches.push(body)
      current = { ...current, ...body }
      await route.fulfill({ json: current })
    })
    await page.goto('/admin?tab=recruit')
    await expect(page.getByRole('button', { name: '김지원 저장' })).toHaveCount(0)

    await page.getByLabel('김지원 지원 상태').selectOption('REVIEWING')
    const state = page.getByRole('status', { name: '김지원 저장 상태' })
    await expect(state).toContainText('저장됨')
    expect(patches).toEqual([{ status: 'REVIEWING', adminNote: '' }])
    await state.getByRole('button', { name: '되돌리기' }).click()
    await expect.poll(() => patches.length).toBe(2)
    expect(patches[1]).toEqual({ status: 'RECEIVED', adminNote: '' })
    await expect(page.getByLabel('김지원 지원 상태')).toHaveValue('RECEIVED')

    // Accepting asks first and says the application is deleted; cancelling changes nothing.
    await page.getByLabel('김지원 지원 상태').selectOption('ACCEPTED')
    const card = page.locator('.coms-confirm-card')
    await expect(card.locator('.coms-confirm-message')).toContainText('지원서는 삭제됩니다')
    await card.getByRole('button', { name: /취소|아니/ }).click()
    expect(patches).toHaveLength(2)
    await expect(page.getByLabel('김지원 지원 상태')).toHaveValue('RECEIVED')
  })

  test('a failed recruit save is shown on the card and the old status comes back', async ({ page }) => {
    await mockAdminApis(page)
    await page.route('**/api/admin/recruit-applications', (route) => route.fulfill({ json: [recruitApplication()] }))
    await page.route('**/api/admin/recruit-applications/7/status', (route) => route.fulfill({ status: 500, json: { message: '저장 실패' } }))
    await page.goto('/admin?tab=recruit')
    await page.getByLabel('김지원 지원 상태').selectOption('HOLD')
    await expect(page.getByRole('status', { name: '김지원 저장 상태' })).toContainText('저장하지 못했습니다')
    await expect(page.getByLabel('김지원 지원 상태')).toHaveValue('RECEIVED')
  })

  test('recruit applications export as CSV and a missing submitted date shows a dash', async ({ page }) => {
    await mockAdminApis(page)
    await page.route('**/api/admin/recruit-applications', (route) => route.fulfill({
      json: [recruitApplication({ motive: '=HYPERLINK("http://example.com")' }), recruitApplication({ id: 8, name: '이무일', submittedAt: null })],
    }))
    await page.goto('/admin?tab=recruit')
    const second = page.locator('article').filter({ hasText: '이무일' })
    await expect(second).toContainText('학년 · -')
    await expect(second).not.toContainText('영구')
    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: 'CSV 내보내기' }).click()
    const download = await downloading
    expect(download.suggestedFilename()).toMatch(/^coms-recruit-\d{4}-\d{2}-\d{2}\.csv$/)
    const chunks = []
    for await (const chunk of await download.createReadStream()) chunks.push(chunk)
    const text = Buffer.concat(chunks).toString('utf8')
    expect(text).toContain('김지원')
    expect(text).toContain('이무일')
    expect(text).toContain(`"'=HYPERLINK(""http://example.com"")"`)
  })

  test('the screen check tab says it checks nothing', async ({ page }) => {
    await mockAdminApis(page)
    await page.goto('/admin?tab=screen-check')
    await expect(page.getByRole('tab', { name: '수동 점검' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('아무것도 자동으로 검사하지 않습니다')).toBeVisible()
    await expect(page.getByText('배포 전 화면 점검')).toHaveCount(0)
  })

  test('the member list marks who is on the roster and links to the roster tab and back', async ({ page }) => {
    await mockAdminApis(page)
    await page.route('**/api/admin/members', (route) => route.fulfill({
      json: [
        { id: 1, studentId: '2020123456', name: '관리자', email: 'a@example.com', emailVerified: true, role: 'ADMIN' },
        { id: 2, studentId: '2023000002', name: '홍길동', email: 'h@example.com', emailVerified: true, role: 'USER' },
        { id: 3, studentId: '2024000003', name: '김철수', email: 'k@example.com', emailVerified: true, role: 'USER' },
      ],
    }))
    await page.route('**/api/admin/eligible-members', (route) => route.fulfill({ json: [{ id: 11, studentId: '2023000002', name: '홍길동' }] }))
    await page.goto('/admin?tab=members')
    await expect(page.getByTestId('roster-mark-2')).toHaveText('명부 등록')
    await expect(page.getByTestId('roster-mark-3')).toHaveText('명부에 없음')
    await page.getByRole('button', { name: '명부 인증 탭' }).click()
    await expect(page).toHaveURL(/tab=roster$/)
    await page.getByRole('button', { name: '회원 관리 탭' }).click()
    await expect(page).toHaveURL(/tab=members$/)
  })
})

test.describe('participation tools', () => {
  const poll = (id, title, dates, answered) => ({ id, title, creatorName: '운영진', mine: false, canDelete: false, dates, startMinute: 1080, endMinute: 1320, slotMinutes: 30, participantCount: 2, answered })

  test('/meet puts polls waiting for an answer first and the past ones last', async ({ page }) => {
    await mockAdminApis(page)
    await page.route('**/api/meeting-polls', (route) => route.fulfill({
      json: [
        poll(1, '지난 번개', ['2020-01-02'], false),
        poll(2, '이미 답한 회의', ['2099-01-02'], true),
        poll(3, '아직 답 안 한 회의', ['2099-02-02'], false),
      ],
    }))
    await page.goto('/meet')
    const items = page.getByRole('main').getByRole('listitem').filter({ has: page.locator('.coms-card') })
    await expect(items).toHaveCount(3)
    await expect(items.nth(0)).toContainText('아직 답 안 한 회의')
    await expect(items.nth(0)).toContainText('응답 필요')
    await expect(items.nth(1)).toContainText('이미 답한 회의')
    await expect(items.nth(1)).not.toContainText('응답 필요')
    await expect(items.nth(2)).toContainText('지난 번개')
    await expect(items.nth(2)).not.toContainText('응답 필요')
  })

  test('/apps can be searched by name or description, shows an empty result and retries a failed load', async ({ page }) => {
    const project = (id, title, description) => ({ id, category: 'WEBSITE', categoryName: '웹사이트', title, eyebrow: '', description, madeBy: '', linkUrl: 'https://x.example/', displayUrl: '', position: id, files: [] })
    let fail = true
    await page.route('**/api/club-projects/categories', (route) => route.fulfill({ json: [{ key: 'WEBSITE', name: '웹사이트', position: 0 }] }))
    await page.route('**/api/club-projects', (route) => (fail
      ? route.fulfill({ status: 500, json: { message: 'x' } })
      : route.fulfill({ json: [project(1, '식단 앱', '학식 메뉴를 모아 봅니다'), project(2, '팀 뽑기', '조를 섞어 줍니다')] })))
    await page.goto('/apps')
    await expect(page.getByText('프로젝트를 불러오지 못했습니다')).toBeVisible()
    fail = false
    await page.getByRole('button', { name: '다시 불러오기' }).click()
    await expect(page.getByText('식단 앱', { exact: true })).toBeVisible()

    const search = page.getByRole('searchbox', { name: '프로젝트 검색' })
    await search.fill('학식')
    await expect(page.getByText('식단 앱', { exact: true })).toBeVisible()
    await expect(page.getByText('팀 뽑기', { exact: true })).toHaveCount(0)
    await search.fill('팀')
    await expect(page.getByText('식단 앱', { exact: true })).toHaveCount(0)
    await search.fill('없는말')
    await expect(page.getByText('"없는말"에 맞는 프로젝트가 없습니다.')).toBeVisible()
    await page.getByRole('button', { name: '검색 지우기' }).click()
    await expect(page.getByText('팀 뽑기', { exact: true })).toBeVisible()
  })

  test('/draw remembers names and the last result, clears them, and imports sign-ups', async ({ page }) => {
    await mockAdminApis(page)
    await page.route('**/api/gatherings', (route) => route.fulfill({ json: [{ id: 4, title: '스터디 모임', creatorName: '운영진', mine: false, canManage: false, open: true, full: false, participantCount: 2, joined: false, capacity: null }] }))
    await page.route('**/api/gatherings/4', (route) => route.fulfill({
      json: { gathering: { id: 4, title: '스터디 모임', creatorName: '운영진', mine: false, canManage: false, open: true, full: false, participantCount: 2, joined: false }, participants: [{ id: 1, name: '가나다', mine: false, signedUpAt: '2026-10-01T10:00:00' }, { id: 2, name: '라마바', mine: false, signedUpAt: '2026-10-01T10:00:00' }] },
    }))
    await page.route('**/api/attendance/sessions', (route) => route.fulfill({ json: [{ id: 3, title: '웹 세미나', openedByName: '운영진', openedAt: '2026-10-12T19:00:00', closesAt: '2026-10-12T19:30:00', open: false, remainingSeconds: 0, attendeeCount: 1, attended: false }] }))
    await page.route('**/api/attendance/sessions/3', (route) => route.fulfill({ json: { session: { id: 3, title: '웹 세미나' }, attendees: [{ name: '사아자', checkedAt: '2026-10-12T19:05:00' }] } }))
    await page.goto('/draw')
    const names = page.getByRole('textbox', { name: /^이름/ })
    await names.fill('가나다\n라마바\n사아자\n차카타')
    await page.getByRole('button', { name: '섞어서 나누기' }).click()
    await expect(page.getByRole('list', { name: '조 편성 결과' })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('textbox', { name: /^이름/ })).toHaveValue('가나다\n라마바\n사아자\n차카타')
    await expect(page.getByRole('list', { name: '조 편성 결과' })).toBeVisible()

    // Imports: a gathering's sign-ups, or (this account may run attendance) who attended.
    await page.getByRole('button', { name: '가져오기' }).click()
    await page.getByRole('button', { name: /스터디 모임/ }).click()
    await page.locator('.coms-confirm-card').getByRole('button', { name: /확인|바꾸/ }).click()
    await expect(names).toHaveValue('가나다\n라마바')
    await page.getByRole('button', { name: '가져오기' }).click()
    await page.getByRole('button', { name: /웹 세미나/ }).click()
    await page.locator('.coms-confirm-card').getByRole('button', { name: /확인|바꾸/ }).click()
    await expect(names).toHaveValue('사아자')

    await page.getByRole('button', { name: '지우기' }).click()
    await page.reload()
    await expect(page.getByRole('textbox', { name: /^이름/ })).toHaveValue('')
    await expect(page.getByRole('list', { name: '조 편성 결과' })).toHaveCount(0)
  })

  test('a plain member is not offered the attendance list to import from', async ({ page }) => {
    await mockAdminApis(page)
    await asMember(page)
    await page.route('**/api/permissions/me', (route) => route.fulfill({ json: { role: 'USER', permissions: [] } }))
    await page.route('**/api/gatherings', (route) => route.fulfill({ json: [] }))
    await page.goto('/draw')
    await page.getByRole('button', { name: '가져오기' }).click()
    await expect(page.getByText('모임 신청자')).toBeVisible()
    await expect(page.getByText('출석한 사람')).toHaveCount(0)
  })

  test('the four tools share a next-steps strip in lifecycle order', async ({ page }) => {
    await mockAdminApis(page)
    await page.route('**/api/meeting-polls', (route) => route.fulfill({ json: [] }))
    await page.route('**/api/gatherings', (route) => route.fulfill({ json: [] }))
    await page.route('**/api/attendance/sessions', (route) => route.fulfill({ json: [] }))
    for (const [path, current] of [['/meet', '일정 조율'], ['/gatherings', '모임 신청'], ['/attendance', '출석 체크'], ['/draw', '뽑기']]) {
      await page.goto(path)
      const strip = page.getByRole('navigation', { name: '다음 단계' })
      await expect(strip.getByRole('link')).toHaveText([/1\. 일정 조율/, /2\. 모임 신청/, /3\. 출석 체크/, /4\. 뽑기/])
      await expect(strip.getByRole('link', { name: new RegExp(current) })).toHaveAttribute('aria-current', 'page')
    }
  })

  test('/gatherings splits open ones by deadline from past ones, which start collapsed', async ({ page }) => {
    await mockAdminApis(page)
    const gathering = (id, title, open, closesAt) => ({ id, title, creatorName: '운영진', mine: false, canManage: false, open, full: false, participantCount: 1, joined: false, capacity: null, closesAt })
    await page.route('**/api/gatherings', (route) => route.fulfill({
      json: [
        gathering(1, '석 달 전 회식', false, null),
        gathering(2, '마감이 늦은 스터디', true, '2099-12-30T10:00:00'),
        gathering(3, '마감이 빠른 MT', true, '2099-11-01T10:00:00'),
      ],
    }))
    await page.goto('/gatherings')
    const active = page.getByRole('list', { name: '진행 중인 모임' })
    await expect(active.getByRole('listitem')).toHaveText([/마감이 빠른 MT/, /마감이 늦은 스터디/])
    await expect(page.getByText('석 달 전 회식')).toHaveCount(0)
    const toggle = page.getByRole('button', { name: /지난 모임 1개/ })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    await expect(page.getByRole('list', { name: '지난 모임' })).toContainText('석 달 전 회식')
  })

  test('/attendance offers recent titles as one-tap suggestions', async ({ page }) => {
    await mockAdminApis(page)
    const session = (id, title, openedAt) => ({ id, title, openedByName: '운영진', openedAt, closesAt: openedAt, open: false, remainingSeconds: 0, attendeeCount: 3, attended: false })
    await page.route('**/api/attendance/sessions', (route) => route.fulfill({
      json: [session(3, '웹 세미나 3주차', '2026-10-12T19:00:00'), session(2, '웹 세미나 2주차', '2026-10-05T19:00:00'), session(1, '웹 세미나 3주차', '2026-09-28T19:00:00')],
    }))
    await page.goto('/attendance')
    const suggestions = page.getByRole('group', { name: '최근에 쓴 이름' })
    await expect(suggestions.getByRole('button')).toHaveText(['웹 세미나 3주차', '웹 세미나 2주차'])
    await suggestions.getByRole('button', { name: '웹 세미나 2주차' }).click()
    await expect(page.getByRole('textbox', { name: '출석 이름' })).toHaveValue('웹 세미나 2주차')
  })
})
