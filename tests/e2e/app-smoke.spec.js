import { expect, test } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { asMember, mockAdminApis, mockOptionalApis, autoDriveModals, expectMembersGate, trackRequests } from './visualSupport.js'

const routeExpectations = [
  ['/', /KW COM's/],
  ['/activities', /배움이 매주 쌓이고,\s*서로에게 남습니다\./],
  ['/activity-events', /회지 인기투표|로그인/],
  ['/projects', /아이디어를 실제 서비스와 제작물로\./],
  ['/apps', /COM's Apps/],
  ['/login', /로그인|아이디/],
]

const fontFamilies = [
  'Pretendard Variable',
  'Noto Sans KR',
  'IBM Plex Sans KR',
  'Nanum Gothic',
  'Gowun Dodum',
  'Nanum Myeongjo',
]

test('archive edit preserves its file and offers explicit author reassignment', async ({ page }) => {
  await mockAdminApis(page)
  let file = { id: 910, title: '기존 자료', description: '기존 설명', originalName: 'original.pdf', uploadedBy: 'owner', uploaderName: '원작성자', category: 'GENERAL', fileSize: 42, viewCount: 7, upvotes: 2, uploadedAt: '2026-09-01T00:00:00', contentVersion: 'original' }
  const edits = []
  const authors = []
  await page.route('**/api/files', route => route.fulfill({ json: [file] }))
  await page.route('**/api/files/910', async route => {
    expect(route.request().method()).toBe('PUT')
    const body = route.request().postData()
    edits.push(body)
    file = { ...file, title: multipartField(body, 'title'), description: multipartField(body, 'description') }
    await route.fulfill({ json: file })
  })
  await page.route('**/api/admin/members', route => route.fulfill({ json: [{ studentId: '2026123456', name: '박채현' }] }))
  await page.route('**/api/files/910/author', async route => {
    const body = route.request().postDataJSON()
    authors.push(body)
    file = { ...file, uploaderName: body.uploaderName || '박채현', uploadedBy: body.studentId || file.uploadedBy }
    await route.fulfill({ json: file })
  })
  await page.goto('/resources/910')
  await page.getByRole('button', { name: '수정', exact: true }).click()
  await expect(page.getByText('기존 파일 유지: original.pdf')).toBeVisible()
  await page.getByPlaceholder('자료 제목').fill('수정된 자료')
  await expect(page.locator('[contenteditable="true"]').first()).toContainText('기존 설명')
  await page.getByRole('button', { name: '수정 저장' }).click()
  await expect(page.getByRole('heading', { name: '수정된 자료', exact: true })).toBeVisible()
  expect(edits).toHaveLength(1)
  expect(edits[0]).not.toContain('filename=')
  await expect(page.getByText(/원작성자 ·/)).toBeVisible()
  await expect(page.getByRole('link', { name: '다운로드' })).toHaveAttribute('href', '/api/files/910/download?v=original')
  await page.getByRole('button', { name: '작성자 변경', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: '작성자 변경' })
  await dialog.getByLabel('표시 이름').fill('표시 전용 이름')
  await dialog.getByRole('button', { name: '표시 이름 변경' }).click()
  await expect(dialog).not.toBeVisible()
  expect(authors[0]).toEqual({ uploaderName: '표시 전용 이름' })
  await page.getByRole('button', { name: '작성자 변경', exact: true }).click()
  dialog = page.getByRole('dialog', { name: '작성자 변경' })
  await dialog.getByRole('radio', { name: '회원 선택' }).check()
  await dialog.getByLabel('회원 검색').fill('박채현')
  await dialog.getByRole('combobox', { name: '회원 선택' }).selectOption('2026123456')
  await dialog.getByRole('button', { name: '소유권 변경 확인' }).click()
  await expect(dialog).not.toBeVisible()
  expect(authors[1]).toEqual({ studentId: '2026123456' })
})

test('archive replacement sends only the explicitly chosen file', async ({ page }) => {
  await mockAdminApis(page)
  const file = { id: 911, title: '교체 대상', description: '', originalName: 'old.txt', uploadedBy: 'other', category: 'GENERAL', uploadedAt: '2026-09-01T00:00:00' }
  let body = ''
  await page.route('**/api/files', route => route.fulfill({ json: [file] }))
  await page.route('**/api/files/911', async route => {
    body = route.request().postData()
    await route.fulfill({ json: { ...file, originalName: 'replacement.txt', contentVersion: 'new-blob' } })
  })
  await page.goto('/resources/911')
  await page.getByRole('button', { name: '수정', exact: true }).click()
  await page.getByLabel('파일 선택', { exact: true }).setInputFiles({ name: 'replacement.txt', mimeType: 'text/plain', buffer: Buffer.from('replacement bytes') })
  await expect(page.locator('[contenteditable="true"]').first()).toBeVisible()
  await page.getByRole('button', { name: '수정 저장' }).click()
  await expect(page.getByRole('link', { name: '다운로드' })).toHaveAttribute('href', '/api/files/911/download?v=new-blob')
  expect(body).toContain('filename="replacement.txt"')
  expect(body).toContain('replacement bytes')
})

test('archive refuses saving while its rich editor is still loading', async ({ page }) => {
  await mockAdminApis(page)
  const file = { id: 915, title: '편집기 지연 자료', description: '보존할 설명', originalName: 'old.txt', uploadedBy: 'other', category: 'GENERAL', uploadedAt: '2026-09-01T00:00:00' }
  let releaseEditor
  const gate = new Promise(resolve => { releaseEditor = resolve })
  let saves = 0
  await page.route('**/assets/TiptapTextEditor-*.js', async route => { await gate; await route.continue() })
  await page.route('**/api/files', route => route.fulfill({ json: [file] }))
  await page.route('**/api/files/915', async route => { saves++; await route.fulfill({ json: file }) })
  try {
    await page.goto('/resources/915')
    await page.getByRole('button', { name: '수정', exact: true }).click()
    await page.getByPlaceholder('자료 제목').fill('제목만 변경')
    await page.getByRole('button', { name: '수정 저장' }).click()
    await expect(page.getByText('편집기를 불러오는 중입니다. 잠시 후 저장해주세요.')).toBeVisible()
    expect(saves).toBe(0)
  } finally { releaseEditor() }
  await expect(page.locator('[contenteditable="true"]').first()).toContainText('보존할 설명')
  await page.getByRole('button', { name: '수정 저장' }).click()
  await expect.poll(() => saves).toBe(1)
})

test('archive non-owner vice president cannot see the content edit action', async ({ page }) => {
  await mockAdminApis(page)
  await page.route('**/api/auth/me', route => route.fulfill({ json: { studentId: 'vp', name: '부회장', role: 'VICE_PRESIDENT', emailVerified: true } }))
  await page.route('**/api/permissions/me', route => route.fulfill({ json: { role: 'VICE_PRESIDENT', permissions: ['archive.manage'] } }))
  await page.route('**/api/files', route => route.fulfill({ json: [{ id: 912, title: '타인 자료', uploadedBy: 'owner', originalName: 'old.txt', uploadedAt: '2026-09-01T00:00:00' }] }))
  await page.goto('/resources/912')
  await expect(page.getByRole('heading', { name: '타인 자료' })).toBeVisible()
  await expect(page.getByRole('button', { name: '수정', exact: true })).toHaveCount(0)
})

test('notice author can edit after reassignment but cannot pin or delete', async ({ page }) => {
  await mockAdminApis(page)
  const notice = { id: 913, title: '이관된 공지', content: '기존 본문', category: 'GENERAL', author: '회원', authorStudentId: 'owner', pinned: true, createdAt: '2026-09-01T00:00:00' }
  let edited = null
  await page.route('**/api/auth/me', route => route.fulfill({ json: { studentId: 'owner', name: '회원', role: 'USER', emailVerified: true } }))
  await page.route('**/api/permissions/me', route => route.fulfill({ json: { role: 'USER', permissions: [] } }))
  await page.route('**/api/notices', route => route.fulfill({ json: [notice] }))
  await page.route('**/api/notices/913', async route => {
    if (route.request().method() === 'PUT') {
      edited = route.request().postDataJSON()
      return route.fulfill({ json: { ...notice, ...edited } })
    }
    return route.fulfill({ json: notice })
  })
  await page.goto('/notices/913')
  await expect(page.getByRole('button', { name: '수정', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '고정 해제', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '삭제', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '수정', exact: true }).click()
  await page.getByPlaceholder('제목', { exact: true }).fill('수정된 공지 제목')
  // The editor is a lazy chunk; the title input becoming visible does not imply its API is ready.
  await expect(page.locator('[contenteditable="true"]').first()).toContainText('기존 본문')
  await page.getByRole('button', { name: /수정|저장/ }).last().click()
  await expect.poll(() => edited?.title).toBe('수정된 공지 제목')
  expect(edited.pinned).toBe(true)
})

test('notice write permission does not expose another authors edit action', async ({ page }) => {
  await mockAdminApis(page)
  const notice = { id: 914, title: '다른 회원의 공지', content: '본문', category: 'GENERAL', author: '다른 회원', authorStudentId: 'owner', pinned: false, createdAt: '2026-09-01T00:00:00' }
  await page.route('**/api/auth/me', route => route.fulfill({ json: { studentId: 'vp', name: '부회장', role: 'VICE_PRESIDENT', emailVerified: true } }))
  await page.route('**/api/permissions/me', route => route.fulfill({ json: { role: 'VICE_PRESIDENT', permissions: ['notice.write'] } }))
  await page.route('**/api/notices', route => route.fulfill({ json: [notice] }))
  await page.route('**/api/notices/914', route => route.fulfill({ json: notice }))
  await page.goto('/notices/914')
  await expect(page.getByRole('heading', { name: '다른 회원의 공지', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '수정', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '고정', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '삭제', exact: true })).toBeVisible()
})

function multipartField(body, name) {
  const match = new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]+)`).exec(body || '')
  return match?.[1] || ''
}

function multipartFilenames(body, name = 'files') {
  return [...(body || '').matchAll(new RegExp(`name="${name}"; filename="([^"]+)"`, 'g'))].map(match => match[1])
}

function archivePost(id, title, filenames) {
  return {
    id,
    title,
    originalName: filenames[0],
    uploadedBy: '2020123456',
    category: 'GENERAL',
    fileSize: filenames.length * 7,
    attachments: filenames.map((originalName, index) => ({ id: id * 10 + index, originalName, mimeType: 'application/pdf', fileSize: 7, contentVersion: `v${index + 1}` })),
  }
}

async function assertActivitiesTitleFits(page) {
  await expect
    .poll(async () => {
      return page.locator('.apple-detail-title').evaluate((titleEl) => {
        const titleBox = titleEl.getBoundingClientRect()
        const lineHeight = parseFloat(getComputedStyle(titleEl).lineHeight)
        return [...titleEl.querySelectorAll('.apple-detail-title-phrase')].every((phrase) => {
          const phraseBox = phrase.getBoundingClientRect()
          const lineEstimate = Math.round(phraseBox.height / lineHeight)
          return lineEstimate === 1 && phrase.scrollWidth <= titleBox.width + 1
        })
      })
    })
    .toBe(true)
}

test.beforeEach(async ({ page }) => {
  await mockOptionalApis(page)
})

test.describe('public route smoke', () => {
  for (const [path, expectedText] of routeExpectations) {
    test(`${path} renders without the backend`, async ({ page }) => {
      await page.goto(path)

      await expect(page.locator('body')).toContainText(expectedText)
      await expect(page.getByText('문제가 발생했습니다.')).toHaveCount(0)
    })
  }
})

// The film leader lasts at most 1.8s; reduced motion bypasses it entirely.
// What it lets go of is the finished home screen: the wordmark and the actions are there
// without any scrolling (the hero used to open on a giant logo that had to be scrolled away).
test.describe('home boot intro', () => {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    test.describe(`with reduced motion set to ${reducedMotion}`, () => {
      test.use({ reducedMotion })

      test('plays once and hands over the finished home screen', async ({ page }) => {
        await mockOptionalApis(page)
        await page.goto('/', { waitUntil: 'domcontentloaded' })

        const skip = page.getByRole('button', { name: 'skip ›' })
        if (reducedMotion === 'reduce') await expect(skip).toHaveCount(0)
        else {
          await expect(skip).toBeVisible()
          await expect(page.locator('[data-coms-intro]')).toContainText("COM's")
          await expect(skip).toBeHidden({ timeout: 1800 })
          expect(await page.evaluate(() => sessionStorage.getItem('coms.intro.played:v1'))).toBe('1')
        }
        await expect(page.locator('html')).not.toHaveClass(/coms-boot/)
        await expect(page.locator('h1')).toContainText("COM's")
        await expect(page.locator('h1')).toBeInViewport()
        await expect(page.getByRole('button', { name: '더 알아보기', exact: true })).toBeInViewport()
        await expect(page.locator('.scene-opening__copy')).toHaveCSS('opacity', '1')
        expect(await page.evaluate(() => window.scrollY)).toBe(0)
        // The page under the intro takes clicks again.
        await page.getByRole('button', { name: '지원하기', exact: true }).click()
        await expect(page).toHaveURL(/\/recruit$/)
        await page.goBack()
        await expect(page.getByRole('button', { name: '더 알아보기', exact: true })).toBeVisible()

        // Once per tab: coming back to the home page does not replay it.
        await page.reload()
        await expect(page.locator('h1')).toContainText("COM's")
        await expect(skip).toHaveCount(0)
      })
    })
  }

  test('lite mode never covers the home page on a fresh tab', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('kwcoms-perf-mode:v1', 'lite'))
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('[data-coms-intro]')).toHaveCount(0)
    await expect(page.locator('h1')).toHaveText("COM's")
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
  })

  for (const input of ['button', 'keyboard', 'wheel', 'touch', 'card']) {
    test(`${input} skips the title card and restores scrolling`, async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      const intro = page.locator('[data-coms-intro]')
      await expect(intro).toBeVisible()
      if (input === 'button') await intro.getByRole('button', { name: 'skip ›', exact: true }).click()
      else if (input === 'keyboard') await page.keyboard.press('Escape')
      else if (input === 'wheel') await page.mouse.wheel(0, 1)
      else if (input === 'touch') await intro.dispatchEvent('touchstart')
      else await intro.locator('.coms-intro-title').click()
      await expect(intro).toHaveCount(0)
      await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
    })
  }
})

// The home sections under the hero: every card is a real control that goes where it says.
// The tools row on the home lists menu entries (activity records and the tools) and takes a member there.
test('home tools row lists entries of the header menu and opens a tool', async ({ page }) => {
  await page.addInitScript(() => {
    try { sessionStorage.setItem('coms.intro.played:v1', '1') } catch { /* ignore */ }
  })
  await mockAdminApis(page)
  await page.route('**/api/meeting-polls', route => route.fulfill({ json: [] }))
  await page.goto('/')

  const tools = page.getByRole('list', { name: '활동 도구 바로가기' })
  await tools.scrollIntoViewIfNeeded()
  const tiles = tools.getByRole('button')
  const titles = await tiles.evaluateAll(items => items.map(item => item.querySelector('.scene-chip__label').textContent))
  // The chips are exactly the panel's records items then its tools items (marked data-nav-activity): same labels, order and count.
  await page.getByRole('button', { name: '멤버', exact: true }).click()
  const labels = await page.locator('#nav-panel [data-nav-activity] .nav-item-label').allTextContents()
  await page.keyboard.press('Escape')
  expect(labels).toHaveLength(7)
  expect(titles).toEqual(labels)

  await tools.getByRole('button', { name: /일정 조율/ }).click()
  await expect(page).toHaveURL(/\/meet$/)
  await expect(page.getByRole('heading', { level: 1, name: '일정 조율' })).toBeVisible()
})

test('home section cards lead where they say', async ({ page }) => {
  await page.addInitScript(() => {
    try { sessionStorage.setItem('coms.intro.played:v1', '1') } catch { /* ignore */ }
  })
  await page.goto('/')

  // A visitor's "멤버가 되면" scene: the three hub entries (still buttons that go to the login
  // guide), the tool shortcuts as chips, and no calendar or member grid.
  const members = page.locator('#members')
  await expect(members.getByRole('heading', { name: '멤버가 되면' })).toBeAttached()
  for (const name of [/공지사항/, /커뮤니티/, /자료실/]) {
    await expect(members.getByRole('button', { name })).toBeVisible()
  }
  await expect(page.getByRole('heading', { name: '동아리 일정 캘린더' })).toHaveCount(0)
  for (const heading of ['배운 건 만들어 보고, 만든 건 함께 나눕니다.', '기초부터 실전까지, 매주 이어지는 학습 루틴.', '아이디어를 실제 서비스와 제작물로.', '함께 배울 다음 멤버를 기다립니다.']) {
    await expect(page.getByRole('heading', { name: heading })).toBeAttached()
  }

  // A showcase card scrolls to its section; the recruit panel's action opens the form.
  await page.getByRole('button', { name: /학습 흐름을 한눈에/ }).click()
  await expect(page.locator('#activities')).toBeInViewport()
  await page.locator('#recruit').getByRole('button', { name: '지원서 작성하기' }).click()
  await expect(page).toHaveURL(/\/recruit$/)
})

// The admin lists can be searched, narrowed and ordered without another request. The people
// here are made up.
test('admin member list and roster can be searched and ordered', async ({ page }) => {
  await mockAdminApis(page)
  await page.route('**/api/admin/members', route => route.fulfill({ json: [
    { id: 1, studentId: '2020123456', name: '관리자', email: 'admin@example.com', emailVerified: true, department: '컴퓨터정보공학부', generation: '58', phone: '01000000001', role: 'ADMIN' },
    { id: 2, studentId: '2023000002', name: '홍길동', email: 'hong@example.com', emailVerified: true, department: '소프트웨어학부', generation: '61', phone: '01000000002', role: 'USER' },
    { id: 3, studentId: '2022000003', name: '김철수', email: 'kim@example.com', emailVerified: false, department: '전자공학과', generation: '60', phone: '01000000003', role: 'OFFICER' },
    { id: 4, studentId: '2023000006', name: '최가람', email: 'choi@example.com', emailVerified: true, department: '소프트웨어학부', generation: '', phone: '01000000006', role: 'USER' },
  ] }))
  await page.route('**/api/admin/eligible-members', route => route.fulfill({ json: [
    { id: 11, studentId: '2023000002', name: '홍길동', generation: '61', phone: '01000000002' },
    { id: 12, studentId: '', name: '졸업선배', generation: '41', phone: '01000000013' },
    { id: 13, studentId: '2022000003', name: '김철수', generation: '60', phone: '' },
  ] }))

  await page.goto('/admin?tab=members')
  const memberNames = page.locator('span.font-semibold.text-\\[var\\(--theme-body-dark\\)\\]')
  await expect(memberNames).toHaveText(['관리자', '홍길동', '김철수', '최가람'])
  const tools = page.getByRole('search', { name: '회원 목록 찾기' })
  await expect(tools.getByRole('status')).toHaveText('4명')

  // Ordered by 기수, newest first; the member without one stays last either way.
  await tools.getByLabel('정렬 기준').selectOption('generation')
  await expect(memberNames).toHaveText(['관리자', '김철수', '홍길동', '최가람'])
  await tools.getByRole('button', { name: /오름차순 정렬 중/ }).click()
  await expect(memberNames).toHaveText(['홍길동', '김철수', '관리자', '최가람'])

  // Narrowed by role and by a search that ignores hyphens.
  await tools.getByLabel('역할로 거르기').selectOption('USER')
  await expect(memberNames).toHaveText(['홍길동', '최가람'])
  await tools.getByLabel('회원 검색').fill('010-0000-0006')
  await expect(memberNames).toHaveText(['최가람'])
  await expect(tools.getByRole('status')).toHaveText('4명 중 1명')
  await tools.getByLabel('회원 검색').fill('없는사람')
  await expect(page.getByText('조건에 맞는 회원이 없습니다.')).toBeVisible()

  await page.goto('/admin?tab=roster')
  // Matched from the start of the cell: a name may be followed by a chip (가입함, 준회원).
  const rosterNames = page.locator('tbody tr td:nth-child(2)')
  await expect(rosterNames).toHaveText([/^홍길동/, /^졸업선배/, /^김철수/])
  const generationHeading = page.getByRole('columnheader', { name: '기수' })
  await generationHeading.getByRole('button').click()
  await expect(generationHeading).toHaveAttribute('aria-sort', 'ascending')
  await expect(rosterNames).toHaveText([/^졸업선배/, /^김철수/, /^홍길동/])
  await generationHeading.getByRole('button').click()
  await expect(generationHeading).toHaveAttribute('aria-sort', 'descending')
  await expect(rosterNames).toHaveText([/^홍길동/, /^김철수/, /^졸업선배/])
  await generationHeading.getByRole('button').click()
  await expect(generationHeading).toHaveAttribute('aria-sort', 'none')
  await expect(rosterNames).toHaveText([/^홍길동/, /^졸업선배/, /^김철수/])
  await page.getByLabel('명부 검색').fill('졸업')
  await expect(rosterNames).toHaveText([/^졸업선배/])
})

// The roster shows which rows already have an account, and the member list can be saved as a
// spreadsheet file after a confirmation. The people here are made up.
test('admin roster marks who has signed up and the member list exports as CSV', async ({ page }) => {
  await mockAdminApis(page)
  await page.route('**/api/admin/members', route => route.fulfill({ json: [
    { id: 1, studentId: '2020123456', name: '관리자', email: 'admin@example.com', emailVerified: true, department: '컴퓨터정보공학부', generation: '58', phone: '01000000001', role: 'ADMIN' },
    { id: 2, studentId: '2023000002', name: '홍길동', email: 'hong@example.com', emailVerified: true, department: '소프트웨어학부', generation: '61', phone: '01000000002', role: 'USER' },
    { id: 3, studentId: 'G2019-12', name: '졸업선배', email: 'old@example.com', emailVerified: true, department: '', generation: '41', phone: '', role: 'USER' },
  ] }))
  await page.route('**/api/admin/eligible-members', route => route.fulfill({ json: [
    { id: 11, studentId: '2023000002', name: '홍길동', generation: '61', phone: '01000000002' },
    { id: 12, studentId: '', name: '졸업선배', generation: '41', phone: '01000000013' },
    { id: 13, studentId: '2022000003', name: '김철수', generation: '60', phone: '' },
  ] }))

  await page.goto('/admin?tab=roster')
  const rows = page.locator('tbody tr')
  await expect(rows).toHaveCount(3)
  // A member by 학번, a graduate by the roster id inside the account id, and one with no account.
  await expect(rows.nth(0)).toContainText('가입함')
  await expect(rows.nth(1)).toContainText('가입함')
  await expect(rows.nth(2)).not.toContainText('가입함')
  await page.getByLabel('가입 여부로 거르기').selectOption('NOT_JOINED')
  await expect(page.locator('tbody tr td:nth-child(2)')).toHaveText(['김철수'])
  await page.getByLabel('가입 여부로 거르기').selectOption('JOINED')
  await expect(rows).toHaveCount(2)

  await page.goto('/admin?tab=members')
  const tools = page.getByRole('search', { name: '회원 목록 찾기' })
  await tools.getByLabel('회원 검색').fill('example.com')
  await tools.getByLabel('정렬 기준').selectOption('name')
  const exportButton = tools.getByRole('button', { name: 'CSV 내보내기' })

  // Declining the confirmation downloads nothing.
  await exportButton.click()
  const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'))
  await expect(dialog).toContainText('회원 3명')
  await dialog.getByRole('button', { name: '취소' }).click()
  await expect(dialog).toBeHidden()

  const downloadPromise = page.waitForEvent('download')
  await exportButton.click()
  await dialog.getByRole('button', { name: '확인' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^coms-members-\d{4}-\d{2}-\d{2}\.csv$/)
  const stream = await download.createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  const text = Buffer.concat(chunks).toString('utf8')
  const lines = text.replace(/^\uFEFF/, '').split('\r\n')
  expect(lines[0]).toBe('"이름","학번","기수","역할","이메일","이메일 인증","학과","전화번호"')
  // In the order on screen (by name), phone numbers kept as text.
  expect(lines.slice(1).map((line) => line.split(',')[0])).toEqual(['"관리자"', '"졸업선배"', '"홍길동"'])
  expect(lines[3]).toContain('"010-0000-0002"')
  expect(lines[2]).toContain('"2019 (졸업생)"')
})

test('notices can be ordered by date, views and upvotes', async ({ page }) => {
  await mockAdminApis(page)
  const notice = (id, title, createdAt, viewCount, upvotes, pinned = false) => ({ id, title, content: '본문', category: 'GENERAL', author: '운영진', authorStudentId: 'a', pinned, createdAt, viewCount, upvotes, myVote: 0 })
  await page.route('**/api/notices', route => route.fulfill({ json: [
    notice(3, '고정 공지', '2026-09-02T00:00:00', 5, 1, true),
    notice(1, '오래된 공지', '2026-09-01T00:00:00', 40, 0),
    notice(2, '새 공지', '2026-09-03T00:00:00', 10, 7),
  ] }))
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/notices')
  const titles = page.locator('table.apple-table tbody tr td:nth-child(3)')
  await expect(titles).toHaveText([/고정 공지/, /오래된 공지/, /새 공지/])
  const sort = page.getByLabel('공지 정렬')
  await sort.selectOption('newest')
  await expect(titles).toHaveText([/새 공지/, /고정 공지/, /오래된 공지/])
  await sort.selectOption('oldest')
  await expect(titles).toHaveText([/오래된 공지/, /고정 공지/, /새 공지/])
  await sort.selectOption('views')
  await expect(titles).toHaveText([/오래된 공지/, /새 공지/, /고정 공지/])
  await sort.selectOption('upvotes')
  await expect(titles).toHaveText([/새 공지/, /고정 공지/, /오래된 공지/])
  await sort.selectOption('default')
  await expect(titles).toHaveText([/고정 공지/, /오래된 공지/, /새 공지/])
})

test('activities title remains readable across selectable fonts and viewport widths', async ({ page }) => {
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/activities')

    for (const family of fontFamilies) {
      await page.evaluate((fontFamily) => {
        document.documentElement.style.setProperty(
          '--apple-font-family',
          `"${fontFamily}", -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Apple SD Gothic Neo', 'Segoe UI', 'Malgun Gothic', sans-serif`,
        )
      }, family)
      await page.waitForTimeout(80)
      await assertActivitiesTitleFits(page)
    }
  }
})

// The footer's appearance settings sit behind one "화면 설정" button that opens a dialog (popover on desktop, sheet on phones).
const openAppearance = async (page) => {
  const trigger = page.getByRole('button', { name: '화면 설정', exact: true })
  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  const dialog = page.getByRole('dialog', { name: '화면 설정' })
  await expect(dialog).toBeVisible()
  return dialog
}

test('appearance panel explains guest font persistence scope', async ({ page }) => {
  await page.goto('/')
  await openAppearance(page)

  await expect(page.locator('[aria-label="폰트 설정"]')).toBeVisible()
  await expect(page.getByText('이 브라우저에 임시 적용')).toBeVisible()
})

test('apps page surfaces companion service links away from the home dashboard', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: "COM's Apps" })).toHaveCount(0)
  // A guest's home has no calendar (it moves to the signed-in "오늘의 COM's" scene).
  await expect(page.getByRole('heading', { name: '동아리 일정 캘린더' })).toHaveCount(0)

  await page.goto('/apps')
  await expect(page.getByRole('heading', { name: "COM's Apps" })).toBeVisible()

  for (const [name, href] of [
    ['Food Club', 'https://coms.kw.ac.kr/foodclub/'],
    ['TeamMate', 'https://coms.kw.ac.kr/team-randomizer/'],
    ['Game Club', 'https://coms.kw.ac.kr/gameclub/'],
    ['KW Mate', 'http://kwmate.com/'],
    ['Daily Coding', 'https://dailycoding-final.com/'],
    ['PRDoctor', 'https://coms.kw.ac.kr/PRDoctor'],
  ]) {
    await expect(page.getByRole('link', { name: new RegExp(`${name}.*열기`) })).toHaveAttribute('href', href)
  }
})

// The server looks at the catalogue's links every ten minutes; the Apps page marks the ones
// that did not answer, so a visitor does not find out from an error page.
test('apps page marks an app whose link did not answer', async ({ page }) => {
  // The link check is for members; guests are not asked.
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 5, studentId: '2023000002', name: '홍길동', role: 'USER', emailVerified: true } }))
  const project = (id, title, linkUrl) => ({ id, category: 'WEBSITE', categoryName: '웹사이트', title, eyebrow: '', description: `${title} 설명`, madeBy: '', linkUrl, displayUrl: '', position: id, files: [] })
  await page.route('**/api/club-projects/categories', route => route.fulfill({ json: [{ key: 'WEBSITE', name: '웹사이트', position: 0 }] }))
  await page.route('**/api/club-projects', route => route.fulfill({
    json: [project(1, '열리는 앱', 'https://up.example/'), project(2, '죽은 앱', 'https://down.example/'), project(3, '주소를 바꾼 앱', 'https://new.example/'), project(4, '아직 안 본 앱', 'https://unseen.example/')],
  }))
  await page.route('**/api/club-projects/link-status', route => route.fulfill({
    json: [
      { projectId: 1, linkUrl: 'https://up.example/', state: 'UP', checkedAt: '2026-10-12T17:00:00' },
      { projectId: 2, linkUrl: 'https://down.example/', state: 'DOWN', checkedAt: '2026-10-12T17:00:00' },
      // Looked at before the entry's address was changed: says nothing about the new one.
      { projectId: 3, linkUrl: 'https://old.example/', state: 'DOWN', checkedAt: '2026-10-12T17:00:00' },
    ],
  }))

  await page.goto('/apps')
  await expect(page.getByRole('heading', { name: "COM's Apps" })).toBeVisible()
  const dead = page.getByRole('link', { name: /죽은 앱/ })
  await expect(dead).toContainText('지금 응답 없음')
  // It still opens: the look can be minutes old.
  await expect(dead).toHaveAttribute('href', 'https://down.example/')
  await expect(page.getByText('지금 응답 없음')).toHaveCount(1)
  for (const name of [/열리는 앱/, /주소를 바꾼 앱/, /아직 안 본 앱/]) {
    await expect(page.getByRole('link', { name })).not.toContainText('응답 없음')
  }
})

test('apps page does without the link check when it cannot be read', async ({ page }) => {
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 5, studentId: '2023000002', name: '홍길동', role: 'USER', emailVerified: true } }))
  await page.route('**/api/club-projects/categories', route => route.fulfill({ json: [{ key: 'WEBSITE', name: '웹사이트', position: 0 }] }))
  await page.route('**/api/club-projects', route => route.fulfill({
    json: [{ id: 1, category: 'WEBSITE', categoryName: '웹사이트', title: '열리는 앱', eyebrow: '', description: '', madeBy: '', linkUrl: 'https://up.example/', displayUrl: '', position: 1, files: [] }],
  }))
  await page.route('**/api/club-projects/link-status', route => route.fulfill({ status: 500, json: { message: 'boom' } }))

  await page.goto('/apps')
  await expect(page.getByRole('link', { name: /열리는 앱/ })).toHaveAttribute('href', 'https://up.example/')
  await expect(page.getByText('프로젝트를 불러오지 못했습니다')).toHaveCount(0)
  await expect(page.getByText('응답 없음')).toHaveCount(0)
})

test('apps page does not ask guests for link status, members get it', async ({ page }) => {
  const calls = []
  await page.route('**/api/club-projects/categories', route => route.fulfill({ json: [{ key: 'WEBSITE', name: '웹사이트', position: 0 }] }))
  await page.route('**/api/club-projects', route => route.fulfill({
    json: [{ id: 1, category: 'WEBSITE', categoryName: '웹사이트', title: '죽은 앱', eyebrow: '', description: '', madeBy: '', linkUrl: 'https://down.example/', displayUrl: '', position: 1, files: [] }],
  }))
  await page.route('**/api/club-projects/link-status', (route) => {
    calls.push(route.request().url())
    return route.fulfill({ json: [{ projectId: 1, linkUrl: 'https://down.example/', state: 'DOWN', checkedAt: '2026-10-12T17:00:00' }] })
  })

  // Guest (the default mock answers /api/auth/me with 401): no call, no dots, no error.
  await page.goto('/apps')
  await expect(page.getByRole('link', { name: /죽은 앱/ })).toBeVisible()
  await page.waitForLoadState('networkidle')
  expect(calls).toHaveLength(0)
  await expect(page.getByText('응답 없음')).toHaveCount(0)

  // Member: the call is made and the dot shows.
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 5, studentId: '2023000002', name: '홍길동', role: 'USER', emailVerified: true } }))
  await page.goto('/apps')
  await expect(page.getByRole('link', { name: /죽은 앱/ })).toContainText('지금 응답 없음')
  expect(calls).toHaveLength(1)
})

test('club event page renders entries and ranking from real API data', async ({ page }) => {
  await mockAdminApis(page)

  await page.goto('/activity-events')

  await expect(page.getByRole('heading', { name: '이벤트', exact: true })).toBeVisible()
  const eventCard = page.locator('.club-event-list-button').filter({ hasText: '회지 인기투표' })
  await expect(eventCard).toBeVisible()
  await eventCard.click()

  await expect(page.getByRole('heading', { name: '회지 인기투표' })).toBeVisible()
  await expect(page.getByText('1위')).toBeVisible()
  await expect(page.getByRole('heading', { name: '여름호' })).toBeVisible()
  await expect(page.getByText('5표')).toBeVisible()
  await expect(page.getByRole('link', { name: /summer\.pdf/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /summer-source\.zip/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /내 투표/ })).toBeVisible()
})

test('appearance panel directs signed-in users to account-saved font settings', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('kwcoms-font-id', 'b:noto-sans-kr'))
  await mockAdminApis(page)
  await page.goto('/')

  await openAppearance(page)
  const fontSettings = page.locator('[aria-label="폰트 설정"]')
  await expect(fontSettings).toContainText('내 계정에 저장됨')
  await fontSettings.getByRole('button', { name: '계정 설정에서 폰트 변경' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  // Choosing it closes the popover; open it again so the "no font select" check is not vacuously true.
  await openAppearance(page)
  await expect(fontSettings).toContainText('내 계정에 저장됨')
  await expect(fontSettings.getByRole('combobox', { name: '사이트 폰트 선택' })).toHaveCount(0)
  // The guest-local pick (Noto Sans KR) must NOT apply for a signed-in user
  // whose account has no font — the account default (site default Pretendard)
  // wins. The old assertion expected an empty property back when the site
  // default was the bare system stack.
  await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--apple-font-family')))
    .toContain('Pretendard Variable')
  await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--apple-font-family')))
    .not.toContain('Noto Sans KR')
})

test('signed-in account built-in font applies across the site', async ({ page }) => {
  await mockAdminApis(page)
  await page.unroute('**/api/auth/me')
  await page.route('**/api/auth/me', (route) => route.fulfill({
    status: 200,
    json: {
      id: 1,
      name: '관리자',
      studentId: '2020123456',
      role: 'ADMIN',
      emailVerified: true,
      selectedBuiltinFontKey: 'b:pretendard',
    },
  }))

  await page.goto('/')

  await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--apple-font-family')))
    .toContain('Pretendard Variable')
})

test('member settings saves and previews a built-in font preference', async ({ page }) => {
  await mockAdminApis(page)
  let savedProfile = null
  await page.route('**/api/auth/profile', async (route) => {
    savedProfile = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      json: {
        id: 1,
        name: '관리자',
        studentId: '2020123456',
        role: 'ADMIN',
        emailVerified: true,
        ...savedProfile,
      },
    })
  })

  await page.goto('/settings')
  await page.getByLabel('사이트 폰트').selectOption('b:pretendard')

  await expect(page.getByTestId('account-font-preview')).toHaveCSS('font-family', /Pretendard Variable/)
  await page.getByRole('button', { name: '회원 정보 저장' }).click()
  await expect.poll(() => savedProfile).toMatchObject({
    selectedFontId: null,
    selectedBuiltinFontKey: 'b:pretendard',
  })
})

test('signup follows the recruit application form structure', async ({ page }) => {
  await page.goto('/signup')

  await expect(page.getByRole('heading', { name: "COM's 회원가입" })).toBeVisible()
  await expect(page.getByText('지원하기와 같은 흐름으로 가입 정보를 작성합니다.')).toBeVisible()
  await expect(page.getByRole('heading', { name: '가입 정보 양식' })).toBeVisible()
  await expect(page.getByText('Process')).toBeVisible()
  await expect(page.getByText('가입 정보 확인 → 이메일 인증 → 계정 생성')).toBeVisible()
  await expect(page.getByText('1. 가입 정보 확인')).toBeVisible()
  await expect(page.getByText('2. 이메일 인증')).toBeVisible()
  await expect(page.getByText('3. 계정 생성 후 로그인')).toBeVisible()

  for (const interest of ['웹', '앱', '보안', '알고리즘', '아두이노', '디자인', '기타']) {
    await expect(page.getByRole('button', { name: interest })).toBeVisible()
  }
})

test('signup does not offer login until code confirmation creates the account', async ({ page }) => {
  await mockOptionalApis(page)
  let signupAttempts = 0
  await page.route('**/api/auth/signup', async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      signupType: 'CURRENT',
      studentId: '2026123456',
      email: 'new-member@example.com',
      name: '홍길동',
    })
    signupAttempts += 1
    if (signupAttempts === 1) {
      await route.fulfill({ status: 503, json: { message: '이메일 발송에 실패했습니다.' } })
      return
    }
    await route.fulfill({
      status: 200,
      json: { studentId: '2026123456', name: '홍길동', role: 'ASSOCIATE', emailVerified: false },
    })
  })
  await page.route('**/api/auth/email-verification/confirm-signup', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ studentId: '2026123456', code: '123456' })
    await route.fulfill({
      status: 200,
      json: { studentId: '2026123456', name: '홍길동', role: 'ASSOCIATE', emailVerified: true },
    })
  })
  await page.route('**/api/auth/email-verification/request-signup', (route) => route.fulfill({
    status: 200,
    json: { message: '입력 정보와 일치하는 계정이 있다면 인증코드를 이메일로 보냈습니다.' },
  }))

  await page.goto('/signup')

  await expect(page.getByText('가입 정보 확인 → 이메일 인증 → 계정 생성')).toBeVisible()
  await page.getByLabel('학번').fill('2026123456')
  // 기수는 더 이상 묻지 않는다 — 명부 값을 쓰고, 없으면 서버가 가입 연도로 부여한다.
  // 화면은 서울 기준으로 센다(roleAccess.currentGeneration). 러너 시간대로 재계산하면
  // 1월 1일 전후로 어긋난다.
  const seoulYear = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(new Date()))
  const thisYearGeneration = seoulYear - 1966
  await expect(page.getByText(`올해 들어오는 분은 ${thisYearGeneration}기`)).toBeVisible()
  await expect(page.getByLabel('기수')).toHaveCount(0)
  await page.getByLabel('이름').fill('홍길동')
  await page.getByLabel('이메일').fill('new-member@example.com')
  await page.getByLabel('학과').fill('소프트웨어학부')
  await page.getByLabel('전화번호').fill('01012345678')
  await page.getByLabel('비밀번호', { exact: true }).fill('Strong!234')
  await page.getByLabel('비밀번호 확인').fill('Strong!234')
  await page.getByRole('button', { name: '웹' }).click()
  await page.getByLabel('포부').fill('열심히 활동하겠습니다.')
  await page.getByRole('button', { name: '회원가입' }).click()

  await expect(page.getByText('인증 메일 발송에 실패해 계정이 생성되지 않았습니다. 잠시 후 다시 시도하거나 관리자에게 문의해주세요.')).toBeVisible()
  await expect(page.getByLabel('이메일')).toHaveValue('new-member@example.com')
  await page.getByRole('button', { name: '회원가입' }).click()

  await expect(page.getByText('이메일로 인증코드를 발송했습니다.')).toBeVisible()
  await expect(page.getByRole('button', { name: '로그인하러 가기' })).toHaveCount(0)
  await page.locator('input[autocomplete="one-time-code"]').fill('123456')
  await page.getByRole('button', { name: '인증 완료' }).click()

  await expect(page.getByText('인증이 완료되어 계정이 생성되었습니다.')).toBeVisible()
  await expect(page.getByRole('button', { name: '로그인하러 가기' })).toBeVisible()
})

test('president adds a verified member from member management', async ({ page }) => {
  await mockAdminApis(page)
  let members = [
    {
      id: 2,
      name: '기존회원',
      studentId: '2025123456',
      email: 'old@example.com',
      emailVerified: true,
      role: 'USER',
      generation: 59,
    },
  ]
  let postedMember = null
  let postCount = 0

  await page.route('**/api/admin/members', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, json: members })
      return
    }
    if (route.request().method() === 'POST') {
      postCount += 1
      postedMember = route.request().postDataJSON()
      members = [
        ...members,
        {
          id: 3,
          ...postedMember,
          emailVerified: true,
        },
      ]
      await new Promise((resolve) => setTimeout(resolve, 100))
      await route.fulfill({ status: 200, json: members.at(-1) })
      return
    }
    await route.fallback()
  })

  await page.goto('/admin?tab=members')
  await page.getByRole('button', { name: '회원 추가' }).click()

  await expect(page.getByText('이메일 인증 완료 상태로 생성됩니다.')).toBeVisible()
  await page.getByLabel('학번').fill('2026123456')
  await page.getByLabel('이름').fill('신규회원')
  await page.getByLabel('이메일').fill('new-member@example.com')
  await page.getByLabel('임시 비밀번호').fill('temp1')
  await page.getByLabel('기수').fill('60')
  await page.getByLabel('역할', { exact: true }).selectOption('OFFICER')
  await page.getByLabel('학과').fill('컴퓨터정보공학부')
  await page.getByLabel('전화번호').fill('01099998888')
  await page.locator('#add-member-form').evaluate((form) => {
    form.requestSubmit()
    form.requestSubmit()
  })

  await expect.poll(() => postedMember).toEqual({
    studentId: '2026123456',
    name: '신규회원',
    email: 'new-member@example.com',
    password: 'temp1',
    generation: '60',
    role: 'OFFICER',
    department: '컴퓨터정보공학부',
    phone: '01099998888',
  })
  expect(postCount).toBe(1)
  expect(postedMember).not.toHaveProperty('passwordConfirm')
  expect(postedMember).not.toHaveProperty('emailVerified')
  await expect(page.getByText('신규회원')).toBeVisible()
  await expect(page.getByText('new-member@example.com · 이메일 인증')).toBeVisible()
})

test('admin exposes a pre-deploy screen check panel', async ({ page }) => {
  await mockAdminApis(page)

  await page.goto('/admin')
  await page.getByRole('tab', { name: '화면 점검' }).click()

  await expect(page.getByRole('heading', { name: '배포 전 화면 점검' })).toBeVisible()
  await expect(page.getByText('Smoke 대상 경로')).toBeVisible()
  const routePanel = page.getByTestId('screen-check-routes')
  for (const path of ['/', '/activities', '/projects', '/notices', '/login', '/signup', '/recruit']) {
    await expect(routePanel.locator(`a[href="${path}"]`)).toBeVisible()
  }
  await expect(page.getByText('/api/auth/me')).toBeVisible()
  await expect(page.getByText('/api/fonts')).toBeVisible()
})

test('admin permissions tab toggles a role capability and saves the matrix', async ({ page }) => {
  await mockAdminApis(page)
  let savedAllowed = null
  let sentExpectedUpdatedAt = 'unset'
  // mockAdminApis 뒤에 등록해 LIFO 로 먼저 매칭되게 한다 — PUT 본문을 여기서 확인한다.
  await page.route('**/api/admin/permissions', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = JSON.parse(route.request().postData() || '{}')
      savedAllowed = body.allowed
      sentExpectedUpdatedAt = body.expectedUpdatedAt
      await route.fulfill({
        status: 200,
        json: {
          roles: ['ASSOCIATE', 'USER', 'OFFICER', 'VICE_PRESIDENT'],
          permissions: [],
          allowed: savedAllowed,
          updatedAt: '2026-09-06T00:00:00',
          updatedBy: '2026000001',
        },
      })
      return
    }
    await route.fallback()
  })

  await page.goto('/admin')
  await page.getByRole('tab', { name: '권한 관리' }).click()

  const panel = page.getByTestId('admin-permissions')
  await expect(panel.getByRole('heading', { name: '직급별 권한' })).toBeVisible()
  // 회장 열은 항상 체크 + 비활성.
  const presidentBox = panel.getByRole('checkbox', { name: '회장 — 커뮤니티 중재 (항상 허용)' })
  await expect(presidentBox).toBeChecked()
  await expect(presidentBox).toBeDisabled()

  // 임원에게 커뮤니티 중재를 열어준다.
  await panel.getByRole('checkbox', { name: '임원 — 커뮤니티 중재' }).check()
  await panel.getByRole('button', { name: '저장' }).click()

  await expect.poll(() => savedAllowed?.OFFICER).toContain('community.moderate')
  // 화면이 GET 으로 읽은 updatedAt('2026-09-01T09:00:00', visualSupport.js 의 mockAdminApis)을
  // 낙관적 동시성 체크용으로 그대로 실어 보냈는지 — 이게 없으면 서버가 항상 409 를 낸다.
  expect(sentExpectedUpdatedAt).toBe('2026-09-01T09:00:00')
})

test('admin password reset accepts simple temporary passwords without complexity copy', async ({ page }) => {
  await mockAdminApis(page)
  let promptMessage
  let resetPayload = null

  await page.route('**/api/admin/members', (route) => route.fulfill({
    status: 200,
    json: [
      {
        id: 2,
        name: '홍길동',
        studentId: '2024123456',
        email: 'hong@example.com',
        emailVerified: true,
        role: 'USER',
      },
    ],
  }))
  await page.route('**/api/admin/members/2/password', async (route) => {
    resetPayload = route.request().postDataJSON()
    await route.fulfill({ status: 204 })
  })
  await autoDriveModals(page, { promptValue: 'temp1' })

  await page.goto('/admin')
  await page.getByRole('tab', { name: '회원 관리' }).click()
  await page.getByRole('button', { name: '비번 초기화' }).click()
  promptMessage = await page.evaluate(() => window.__modalPromptMessages[0] || '')

  expect(promptMessage).not.toContain('특수문자')
  expect(promptMessage).not.toContain('8자')
  await expect.poll(() => resetPayload).toEqual({ password: 'temp1' })
})

test('admin roster tab can add edit and delete eligible members', async ({ page }) => {
  await mockAdminApis(page)
  let roster = [
    {
      id: 1,
      studentId: '2025123456',
      name: '기존회원',
      generation: 59,
      phone: '01011112222',
    },
  ]
  let addPayload = null
  let updatePayload = null
  let deletedId = null

  await autoDriveModals(page)
  await page.route('**/api/admin/eligible-members', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, json: roster })
    }
    if (route.request().method() === 'POST') {
      addPayload = route.request().postDataJSON()
      roster = [
        ...roster,
        {
          id: 2,
          studentId: addPayload.studentId,
          name: addPayload.name,
          generation: 60,
          phone: '',
        },
      ]
      return route.fulfill({ status: 201, json: roster.at(-1) })
    }
    return route.fallback()
  })
  await page.route('**/api/admin/eligible-members/*', async (route) => {
    const id = Number(new URL(route.request().url()).pathname.split('/').at(-1))
    if (route.request().method() === 'PATCH') {
      updatePayload = route.request().postDataJSON()
      roster = roster.map((member) => (
        member.id === id
          ? { ...member, ...updatePayload }
          : member
      ))
      return route.fulfill({ status: 204 })
    }
    if (route.request().method() === 'DELETE') {
      deletedId = id
      roster = roster.filter((member) => member.id !== id)
      return route.fulfill({ status: 204 })
    }
    return route.fallback()
  })

  await page.goto('/admin')
  await page.getByRole('tab', { name: '명부 인증' }).click()

  await expect(page.getByText('명부 확인 · 편집')).toBeVisible()
  await page.getByPlaceholder('학번 (10자리)').fill('2026123456')
  // exact: the roster search box below also mentions 이름 in its placeholder.
  await page.getByPlaceholder('이름', { exact: true }).fill('신규회원')
  await page.getByRole('button', { name: '추가' }).click()

  await expect.poll(() => addPayload).toEqual({
    studentId: '2026123456',
    name: '신규회원',
  })
  // 기수/전화번호 입력칸은 비워 뒀으므로 payload에 실리지 않아야 한다.
  await expect(page.getByText('신규회원 (2026123456) 명부에 추가됐습니다.')).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: '신규회원' })).toBeVisible()

  await page.getByRole('row').filter({ hasText: '신규회원' }).getByRole('button', { name: '편집' }).click()
  // 편집 인라인 폼: 학번 / 이름 / 학부·학과 / 기수 / 전화번호 순.
  const editInputs = page.locator('td[colspan="6"]').locator('input')
  await editInputs.nth(1).fill('수정회원')
  await editInputs.nth(0).fill('2026123999')
  await editInputs.nth(2).fill('컴퓨터정보공학부')
  await editInputs.nth(3).fill('60')
  await editInputs.nth(4).fill('01099998888')
  await page.getByRole('button', { name: '저장' }).click()

  await expect.poll(() => updatePayload).toEqual({
    studentId: '2026123999',
    name: '수정회원',
    generation: '60',
    phone: '01099998888',
    department: '컴퓨터정보공학부',
  })
  await expect(page.getByRole('row').filter({ hasText: '수정회원' })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: '수정회원' })).toContainText('컴퓨터정보공학부')

  await page.getByRole('row').filter({ hasText: '수정회원' }).getByRole('button', { name: '삭제' }).click()

  await expect.poll(() => deletedId).toBe(2)
  await expect(page.getByRole('row').filter({ hasText: '수정회원' })).toHaveCount(0)
})

test('admin ban tab can ban and unban student ids', async ({ page }) => {
  await mockAdminApis(page)
  let bannedStudents = [
    {
      id: 1,
      studentId: '2025123456',
      bannedAt: '2026-06-15T03:00:00',
      expiresAt: '2026-06-16T03:00:00',
    },
  ]
  let banPayload = null
  let unbannedStudentId = null

  await autoDriveModals(page)
  await page.route('**/api/admin/banned-students', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, json: bannedStudents })
    }
    if (route.request().method() === 'POST') {
      banPayload = route.request().postDataJSON()
      bannedStudents = [
        ...bannedStudents,
        {
          id: 2,
          studentId: banPayload.studentId,
          bannedAt: '2026-06-15T04:00:00',
          expiresAt: '2026-06-16T04:00:00',
        },
      ]
      return route.fulfill({ status: 204 })
    }
    return route.fallback()
  })
  await page.route('**/api/admin/banned-students/*', async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback()
    unbannedStudentId = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1))
    bannedStudents = bannedStudents.filter((student) => student.studentId !== unbannedStudentId)
    return route.fulfill({ status: 204 })
  })

  await page.goto('/admin')
  await page.getByRole('tab', { name: '차단 관리' }).click()

  await expect(page.getByRole('row').filter({ hasText: '2025123456' })).toBeVisible()
  await page.getByPlaceholder('학번 10자리').fill('2026123456')
  await page.locator('form select').selectOption('24H')
  await page.getByRole('button', { name: '임시 차단' }).click()

  await expect.poll(() => banPayload).toEqual({
    studentId: '2026123456',
    duration: '24H',
  })
  await expect(page.getByRole('row').filter({ hasText: '2026123456' })).toBeVisible()

  await page.getByRole('row').filter({ hasText: '2026123456' }).getByRole('button', { name: '차단 해제' }).click()

  await expect.poll(() => unbannedStudentId).toBe('2026123456')
  await expect(page.getByRole('row').filter({ hasText: '2026123456' })).toHaveCount(0)
})

test('admin files tab can upload and delete archive files', async ({ page }) => {
  await mockAdminApis(page)
  let files = [
    {
      id: 1,
      originalName: '기존자료.pdf',
      uploadedBy: '관리자',
      fileSize: 2048,
    },
  ]
  let uploadPayload = null
  let deletedFileId = null

  await autoDriveModals(page)
  await page.route('**/api/files', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, json: files })
    }
    if (route.request().method() === 'POST') {
      const body = route.request().postData() || ''
      uploadPayload = {
        title: multipartField(body, 'title'),
        category: multipartField(body, 'category'),
        filenames: multipartFilenames(body),
      }
      files = [...files, archivePost(2, uploadPayload.title, uploadPayload.filenames)]
      return route.fulfill({ status: 200, json: files.at(-1) })
    }
    return route.fallback()
  })
  await page.route('**/api/files/*', async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback()
    deletedFileId = Number(new URL(route.request().url()).pathname.split('/').at(-1))
    files = files.filter((file) => file.id !== deletedFileId)
    return route.fulfill({ status: 204 })
  })

  await page.goto('/admin')
  await page.getByRole('tab', { name: '파일 관리' }).click()

  await expect(page.getByText('기존자료.pdf')).toBeVisible()
  await expect(page.getByText('관리자 · 2.0 KB')).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles({
    name: '회의록.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('pdfbody'),
  })

  await expect.poll(() => uploadPayload).toEqual({
    title: '회의록.pdf',
    category: 'GENERAL',
    filenames: ['회의록.pdf'],
  })
  await expect(page.getByText('회의록.pdf')).toBeVisible()

  await page.locator('.space-y-2 > .shape-cut-sm').filter({ hasText: '회의록.pdf' }).getByRole('button', { name: '삭제' }).click()

  await expect.poll(() => deletedFileId).toBe(2)
  await expect(page.getByText('회의록.pdf')).toHaveCount(0)
})

test('admin files tab creates one post with all selected attachments', async ({ page }) => {
  await mockAdminApis(page)
  const uploads = []
  let files = []
  await page.route('**/api/files', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: files })
    if (route.request().method() !== 'POST') return route.fallback()
    const body = route.request().postData() || ''
    const title = multipartField(body, 'title')
    const filenames = multipartFilenames(body)
    uploads.push({ title, category: multipartField(body, 'category'), filenames })
    const saved = archivePost(2, title, filenames)
    files = [...files, saved]
    return route.fulfill({ status: 201, json: saved })
  })

  await page.goto('/admin')
  await page.getByRole('tab', { name: '파일 관리' }).click()
  const input = page.locator('input[type="file"]')
  await expect(input).toHaveAttribute('multiple', '')
  await expect(input).toBeEnabled()
  await input.setInputFiles([
    { name: '회의록.pdf', mimeType: 'application/pdf', buffer: Buffer.from('first') },
    { name: '자료.zip', mimeType: 'application/zip', buffer: Buffer.from('second') },
  ])

  await expect.poll(() => uploads).toEqual([{ title: '회의록.pdf', category: 'GENERAL', filenames: ['회의록.pdf', '자료.zip'] }])
  await expect(page.getByText('2개 파일이 한 자료에 업로드되었습니다.')).toBeVisible()
  const row = page.locator('.space-y-2 > .shape-cut-sm').filter({ hasText: '회의록.pdf' })
  await expect(row).toHaveCount(1)
  await expect(row.getByText('회의록.pdf', { exact: true })).toBeVisible()
  await expect(row).toContainText('첨부파일 2개: 회의록.pdf, 자료.zip')
})

test('admin files tab retries the same attachment group after one rejected post', async ({ page }) => {
  await mockAdminApis(page)
  const uploads = []
  let files = []
  await page.route('**/api/files', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: files })
    if (route.request().method() !== 'POST') return route.fallback()
    const body = route.request().postData() || ''
    uploads.push({ title: multipartField(body, 'title'), filenames: multipartFilenames(body) })
    if (uploads.length === 1) return route.fulfill({ status: 400, json: { message: '첨부파일을 확인해주세요.' } })
    const saved = archivePost(3, '재시도.pdf', ['재시도.pdf', '부록.pdf'])
    files = [saved]
    return route.fulfill({ status: 201, json: saved })
  })

  await page.goto('/admin')
  await page.getByRole('tab', { name: '파일 관리' }).click()
  const input = page.locator('input[type="file"]')
  const selection = [
    { name: '재시도.pdf', mimeType: 'application/pdf', buffer: Buffer.from('pdf') },
    { name: '부록.pdf', mimeType: 'application/pdf', buffer: Buffer.from('appendix') },
  ]
  await expect(input).toBeEnabled()
  await input.setInputFiles(selection)
  await expect(page.getByText('첨부파일을 확인해주세요.')).toBeVisible()
  await expect(page.getByText('등록된 파일이 없습니다.')).toBeVisible()
  await expect(input).toHaveJSProperty('value', '')
  await input.setInputFiles(selection)
  await expect.poll(() => uploads).toEqual([
    { title: '재시도.pdf', filenames: ['재시도.pdf', '부록.pdf'] },
    { title: '재시도.pdf', filenames: ['재시도.pdf', '부록.pdf'] },
  ])
  await expect(page.getByText('2개 파일이 한 자료에 업로드되었습니다.')).toBeVisible()
  await expect(page.locator('.space-y-2 > .shape-cut-sm').filter({ hasText: '재시도.pdf' })).toHaveCount(1)
})

test('admin files tab waits for the initial list before accepting an upload', async ({ page }) => {
  await mockAdminApis(page)
  let releaseList
  const pendingList = new Promise(resolve => { releaseList = resolve })
  let listRequested
  const listStarted = new Promise(resolve => { listRequested = resolve })
  const uploads = []
  await page.route('**/api/files', async (route) => {
    if (route.request().method() === 'GET') {
      listRequested()
      await pendingList
      return route.fulfill({ json: [{ id: 1, originalName: '기존.pdf', uploadedBy: '관리자', fileSize: 7 }] })
    }
    if (route.request().method() !== 'POST') return route.fallback()
    uploads.push(multipartField(route.request().postData(), 'title'))
    return route.fulfill({ status: 201, json: archivePost(2, uploads.at(-1), [uploads.at(-1)]) })
  })

  await page.goto('/admin')
  await page.getByRole('tab', { name: '파일 관리' }).click()
  await listStarted
  await expect(page.getByRole('button', { name: '파일 업로드' })).toBeDisabled()
  await expect(page.locator('input[type="file"]')).toBeDisabled()

  releaseList()
  await expect(page.getByText('기존.pdf')).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles({ name: '신규.pdf', mimeType: 'application/pdf', buffer: Buffer.from('new') })
  await expect.poll(() => uploads).toEqual(['신규.pdf'])
  await expect(page.getByText('기존.pdf')).toBeVisible()
  await expect(page.getByText('신규.pdf')).toBeVisible()
})

test('admin files tab keeps an edited row while an attachment group uploads', async ({ page }) => {
  await mockAdminApis(page)
  let files = [archivePost(1, '기존 자료', ['기존.pdf'])]
  let releaseUpload
  const pendingUpload = new Promise(resolve => { releaseUpload = resolve })
  let notifyUploadStarted
  const uploadStarted = new Promise(resolve => { notifyUploadStarted = resolve })
  await page.route('**/api/files/1', (route) => {
    if (route.request().method() !== 'PUT') return route.fallback()
    files = files.map(file => file.id === 1 ? { ...file, title: multipartField(route.request().postData(), 'title') } : file)
    return route.fulfill({ json: files[0] })
  })
  await page.route('**/api/files', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: files })
    if (route.request().method() !== 'POST') return route.fallback()
    const body = route.request().postData() || ''
    const title = multipartField(body, 'title')
    const filenames = multipartFilenames(body)
    notifyUploadStarted()
    await pendingUpload
    const saved = archivePost(2, title, filenames)
    files = [...files, saved]
    return route.fulfill({ status: 201, json: saved })
  })

  await page.goto('/admin')
  await page.getByRole('tab', { name: '파일 관리' }).click()
  await expect(page.getByText('기존.pdf')).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles([
    { name: '첫째.pdf', mimeType: 'application/pdf', buffer: Buffer.from('first') },
    { name: '둘째.pdf', mimeType: 'application/pdf', buffer: Buffer.from('second') },
  ])
  await uploadStarted
  await page.locator('.space-y-2 > .shape-cut-sm').filter({ hasText: '기존.pdf' }).getByRole('button', { name: '수정' }).click()
  await page.getByPlaceholder('자료 제목').fill('수정된 자료')
  await expect(page.locator('[contenteditable="true"]').first()).toBeVisible()
  await page.getByRole('button', { name: '수정 저장' }).click()
  await expect(page.getByRole('button', { name: '수정 저장' })).toHaveCount(0)

  releaseUpload()
  await expect(page.getByText('2개 파일이 한 자료에 업로드되었습니다.')).toBeVisible()
  await expect(page.locator('.space-y-2 > .shape-cut-sm')).toHaveCount(2)
  const editedRow = page.locator('.space-y-2 > .shape-cut-sm').filter({ hasText: '수정된 자료' })
  await expect(editedRow).toHaveCount(1)
  await expect(editedRow).toContainText('기존.pdf')
  const newRow = page.locator('.space-y-2 > .shape-cut-sm').filter({ hasText: '첫째.pdf' })
  await expect(newRow).toHaveCount(1)
  await expect(newRow).toContainText('둘째.pdf')
  await editedRow.getByRole('button', { name: '수정' }).click()
  await expect(page.getByPlaceholder('자료 제목')).toHaveValue('수정된 자료')
})

test('archive write form saves remaining selected files as one post without changing its title', async ({ page }) => {
  await mockAdminApis(page)
  const uploads = []
  let files = []
  await page.route('**/api/files', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: files })
    if (route.request().method() !== 'POST') return route.fallback()
    const body = route.request().postData() || ''
    const filenames = multipartFilenames(body)
    uploads.push({ title: multipartField(body, 'title'), filenames })
    const saved = archivePost(1, '공통 제목', filenames)
    files = [saved]
    return route.fulfill({ status: 201, json: saved })
  })

  await page.goto('/resources')
  await page.getByRole('button', { name: '자료 올리기' }).click()
  await page.getByPlaceholder('자료 제목').fill('공통 제목')
  await page.getByLabel('파일 선택', { exact: true }).setInputFiles([
    { name: '첫째.pdf', mimeType: 'application/pdf', buffer: Buffer.from('first') },
    { name: '제외.pdf', mimeType: 'application/pdf', buffer: Buffer.from('remove') },
    { name: '둘째.pdf', mimeType: 'application/pdf', buffer: Buffer.from('second') },
  ])
  await page.getByRole('button', { name: '제외.pdf 제거' }).click()
  await expect(page.getByText('2개 파일 선택됨')).toBeVisible()
  await expect(page.locator('[contenteditable="true"]').first()).toBeVisible()
  await page.getByRole('button', { name: '등록', exact: true }).click()

  await expect.poll(() => uploads).toEqual([{ title: '공통 제목', filenames: ['첫째.pdf', '둘째.pdf'] }])
  const row = page.locator('tbody tr').filter({ hasText: '공통 제목' })
  await expect(row).toHaveCount(1)
  await expect(row.getByRole('button', { name: '첨부파일 2개' })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: '/tmp/coms-archive-grouped-list.png', animations: 'disabled' })
  await row.getByRole('button', { name: '첨부파일 2개' }).click()
  await expect(page.getByRole('heading', { name: '자료 상세' })).toBeVisible()
  await expect(page.getByRole('link', { name: /첫째\.pdf/ })).toHaveAttribute('href', '/api/files/1/attachments/10/download?v=v1')
  await expect(page.getByRole('link', { name: /둘째\.pdf/ })).toHaveAttribute('href', '/api/files/1/attachments/11/download?v=v2')
  await page.screenshot({ path: '/tmp/coms-archive-grouped-detail.png', fullPage: true, animations: 'disabled' })
})

test('archive write form keeps its attachment selection after a rejected post', async ({ page }) => {
  await mockAdminApis(page)
  const attempts = []
  await page.route('**/api/files', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] })
    if (route.request().method() !== 'POST') return route.fallback()
    const body = route.request().postData() || ''
    attempts.push(multipartFilenames(body))
    if (attempts.length === 1) return route.fulfill({ status: 400, json: { message: '첨부파일을 확인해주세요.' } })
    return route.fulfill({ status: 201, json: archivePost(4, '재시도 자료', attempts.at(-1)) })
  })

  await page.goto('/resources')
  await page.getByRole('button', { name: '자료 올리기' }).click()
  await page.getByPlaceholder('자료 제목').fill('재시도 자료')
  await page.getByLabel('파일 선택', { exact: true }).setInputFiles([
    { name: '하나.pdf', mimeType: 'application/pdf', buffer: Buffer.from('one') },
    { name: '둘.pdf', mimeType: 'application/pdf', buffer: Buffer.from('two') },
  ])
  await expect(page.locator('[contenteditable="true"]').first()).toBeVisible()
  await page.getByRole('button', { name: '등록', exact: true }).click()
  await expect(page.getByText('첨부파일을 확인해주세요.')).toBeVisible()
  await expect(page.getByText('2개 파일 선택됨')).toBeVisible()
  await page.getByRole('button', { name: '등록', exact: true }).click()
  await expect.poll(() => attempts).toEqual([['하나.pdf', '둘.pdf'], ['하나.pdf', '둘.pdf']])
  await expect(page.locator('tbody tr').filter({ hasText: '재시도 자료' })).toHaveCount(1)
})

test('archive edit replaces all attachments with one multipart request', async ({ page }) => {
  await mockAdminApis(page)
  let file = archivePost(10, '기존 자료', ['기존.pdf', '옛부록.pdf'])
  let replacement = null
  await page.route('**/api/files', route => route.fulfill({ json: [file] }))
  await page.route('**/api/files/10', (route) => {
    if (route.request().method() !== 'PUT') return route.fallback()
    const body = route.request().postData() || ''
    replacement = { title: multipartField(body, 'title'), filenames: multipartFilenames(body) }
    file = archivePost(10, replacement.title, replacement.filenames)
    return route.fulfill({ json: file })
  })

  await page.goto('/resources/10')
  await page.getByRole('button', { name: '수정', exact: true }).click()
  await page.getByLabel('파일 선택', { exact: true }).setInputFiles([
    { name: '새본문.pdf', mimeType: 'application/pdf', buffer: Buffer.from('new') },
    { name: '새부록.pdf', mimeType: 'application/pdf', buffer: Buffer.from('appendix') },
  ])
  await expect(page.locator('[contenteditable="true"]').first()).toBeVisible()
  await page.getByRole('button', { name: '수정 저장' }).click()

  await expect.poll(() => replacement).toEqual({ title: '기존 자료', filenames: ['새본문.pdf', '새부록.pdf'] })
  await expect(page.getByRole('link', { name: /새본문\.pdf/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /새부록\.pdf/ })).toBeVisible()
  await expect(page.getByText('옛부록.pdf')).toHaveCount(0)
})

test('archive metadata edit preserves existing attachments when no files are selected', async ({ page }) => {
  await mockAdminApis(page)
  let file = archivePost(11, '기존 자료', ['본문.pdf', '부록.pdf'])
  let editedFields = null
  await page.route('**/api/files', route => route.fulfill({ json: [file] }))
  await page.route('**/api/files/11', (route) => {
    if (route.request().method() !== 'PUT') return route.fallback()
    const body = route.request().postData() || ''
    editedFields = { title: multipartField(body, 'title'), filenames: multipartFilenames(body) }
    file = { ...file, title: editedFields.title }
    return route.fulfill({ json: file })
  })

  await page.goto('/resources/11')
  await page.getByRole('button', { name: '수정', exact: true }).click()
  await page.getByPlaceholder('자료 제목').fill('고친 제목')
  await expect(page.locator('[contenteditable="true"]').first()).toBeVisible()
  await page.getByRole('button', { name: '수정 저장' }).click()

  await expect.poll(() => editedFields).toEqual({ title: '고친 제목', filenames: [] })
  await expect(page.getByRole('heading', { name: '고친 제목' })).toBeVisible()
  await expect(page.getByRole('link', { name: /본문\.pdf/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /부록\.pdf/ })).toBeVisible()
})

test('admin font management explains availability and uses action labels', async ({ page }) => {
  await mockAdminApis(page)
  await page.route('**/api/fonts/*/file', (route) => route.fulfill({
    status: 200,
    contentType: 'font/woff2',
    body: '',
  }))
  await page.route('**/api/admin/fonts', (route) => route.fulfill({
    status: 200,
    json: [
      { id: 1, name: '활성 폰트', fileUrl: '/api/fonts/1/file', active: true, createdAt: '2026-06-15T03:30:00' },
      { id: 2, name: '비활성 폰트', fileUrl: '/api/fonts/2/file', active: false, createdAt: '2026-06-15T03:31:00' },
    ],
  }))

  await page.goto('/admin')
  await page.getByRole('tab', { name: '폰트 관리' }).click()

  await expect(page.getByText('활성 폰트만 사이트 폰트 선택 목록에 표시됩니다.')).toBeVisible()
  await expect(page.getByRole('button', { name: '활성 폰트 비활성화' })).toBeVisible()
  await expect(page.getByRole('button', { name: '비활성 폰트 활성화' })).toBeVisible()
  await expect(page.getByTestId('admin-font-preview-1')).toHaveCSS('font-family', /활성 폰트/)
  await expect(page.getByTestId('admin-font-preview-2')).toHaveCSS('font-family', /비활성 폰트/)
})

test('admin logs tab can expand log window and clear caches', async ({ page }) => {
  await mockAdminApis(page)
  const requestedLimits = []
  let cacheClearCalled = false

  await page.route('**/api/admin/audit-logs**', (route) => {
    const url = new URL(route.request().url())
    requestedLimits.push(url.searchParams.get('limit'))
    return route.fulfill({
      status: 200,
      json: [
        {
          id: 1,
          actorStudentId: '2020123456',
          actorName: '관리자',
          action: 'ADMIN_CACHE_CLEAR',
          targetType: 'CACHE',
          targetId: null,
          detail: 'clearedCount=1',
          ipAddress: null,
          createdAt: '2026-06-15T03:30:00',
        },
        {
          id: 2,
          actorStudentId: '2020123456',
          actorName: '관리자',
          action: 'COMMUNITY_POST_DELETE',
          targetType: 'COMMUNITY_POST',
          targetId: '77',
          detail: 'title=삭제 대상\ncontent=삭제된 게시글 원문입니다.\nreason=삭제 사유',
          ipAddress: null,
          createdAt: '2026-06-15T03:29:00',
        },
        {
          id: 3,
          actorStudentId: '2020123456',
          actorName: '관리자',
          action: 'COMMUNITY_REPORT_ACCEPT',
          targetType: 'COMMUNITY_POST_REPORT',
          targetId: '9',
          detail: 'postId=77\ntitle=신고된 게시글\nauthor=작성자(2025123456)\nreporter=2026123456\nresolvedBy=관리자(2020123456)\nreason=SPAM\nnote=게시글 삭제 완료',
          ipAddress: null,
          createdAt: '2026-06-15T03:28:00',
        },
        {
          id: 4,
          actorStudentId: '2020123456',
          actorName: '관리자',
          action: 'ADMIN_MEMBER_DELETE',
          targetType: 'MEMBER',
          targetId: '7',
          detail: 'studentId=2025222222\nname=삭제회원\nrole=USER\nemail=deleted@example.com',
          ipAddress: null,
          createdAt: '2026-06-15T03:27:00',
        },
        {
          id: 5,
          actorStudentId: '2020123456',
          actorName: '관리자',
          action: 'ADMIN_ELIGIBLE_MEMBER_DELETE',
          targetType: 'ELIGIBLE_MEMBER',
          targetId: '8',
          detail: 'studentId=2025333333\nname=명부대상\ngeneration=59\nphone=01012345678',
          ipAddress: null,
          createdAt: '2026-06-15T03:26:00',
        },
        {
          id: 6,
          actorStudentId: '2020123456',
          actorName: '관리자',
          action: 'COMMUNITY_COMMENT_DELETE',
          targetType: 'COMMUNITY_COMMENT',
          targetId: '11',
          detail: 'postId=77\ntitle=댓글 감사 대상\nauthor=댓글러(2025444444)\ndeletedBy=관리자(2020123456)\ndeletedByRole=ADMIN\ncontent=삭제될 댓글 내용입니다.',
          ipAddress: null,
          createdAt: '2026-06-15T03:25:00',
        },
      ],
    })
  })
  await page.route('**/api/admin/cache/clear', (route) => {
    cacheClearCalled = true
    expect(route.request().method()).toBe('POST')
    return route.fulfill({
      status: 200,
      json: {
        clearedCaches: ['fonts'],
        clearedCount: 1,
        clearedAt: '2026-06-15T03:31:00',
      },
    })
  })

  await page.goto('/admin')
  await page.getByRole('tab', { name: '로그' }).click()
  const auditTable = page.getByRole('table')
  await expect.poll(() => requestedLimits.at(-1)).toBe('1000')
  await expect(page.getByText('커뮤니티 글 삭제')).toBeVisible()
  await expect(auditTable.getByText('신고 처리 완료')).toBeVisible()

  await page.getByLabel('로그 종류').selectOption('COMMUNITY_REPORT_ACCEPT')
  await expect(auditTable.getByText('신고 처리 완료')).toBeVisible()
  await page.getByPlaceholder('사용자, 행위, 상세 검색').fill('신고된 게시글')
  await expect(page.getByText('title=신고된 게시글')).toBeVisible()

  await page.getByPlaceholder('사용자, 행위, 상세 검색').fill('명부대상')
  await page.getByLabel('로그 종류').selectOption('ADMIN_ELIGIBLE_MEMBER_DELETE')
  await expect(page.getByText('name=명부대상')).toBeVisible()

  await page.getByPlaceholder('사용자, 행위, 상세 검색').fill('삭제될 댓글')
  await page.getByLabel('로그 종류').selectOption('COMMUNITY_COMMENT_DELETE')
  await expect(page.getByText('content=삭제될 댓글 내용입니다.')).toBeVisible()

  await page.getByPlaceholder('사용자, 행위, 상세 검색').fill('')

  await page.getByLabel('로그 종류').selectOption('COMMUNITY_POST_DELETE')
  await expect(page.getByText('커뮤니티 글 삭제')).toBeVisible()
  await expect(page.getByText('캐시 초기화', { exact: true })).toHaveCount(1)

  await page.getByPlaceholder('사용자, 행위, 상세 검색').fill('삭제 사유')
  await expect(page.getByText('title=삭제 대상')).toBeVisible()
  await expect(page.getByText('content=삭제된 게시글 원문입니다.')).toBeVisible()
  await expect(page.getByText('clearedCount=1')).toHaveCount(0)

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'CSV' }).click()
  await expect.poll(async () => (await download).suggestedFilename()).toMatch(/coms-audit-logs-\d{4}-\d{2}-\d{2}\.csv/)

  await page.getByLabel('로그 표시 개수').selectOption('2000')
  await expect.poll(() => requestedLimits.at(-1)).toBe('2000')

  await page.getByRole('button', { name: '캐시 초기화' }).click()

  await expect.poll(() => cacheClearCalled).toBe(true)
  await expect(page.getByText('캐시 1개를 초기화했습니다.')).toBeVisible()
})

test('admin community reports tab resolves open reports', async ({ page }) => {
  await mockAdminApis(page)
  let reports = [
    {
      id: 9,
      postId: 77,
      postTitle: '신고된 게시글',
      postAuthorStudentId: '2025123456',
      postAuthorName: '작성자',
      reporterStudentId: '2026123456',
      reason: 'SPAM',
      detail: '홍보 링크 반복',
      status: 'OPEN',
      resolvedByStudentId: null,
      resolutionNote: null,
      createdAt: '2026-06-15T03:29:00',
      resolvedAt: null,
    },
  ]
  let resolvePayload = null

  await autoDriveModals(page)
  await page.route('**/api/admin/community/reports', (route) => route.fulfill({ status: 200, json: reports }))
  await page.route('**/api/admin/community/reports/9', async (route) => {
    expect(route.request().method()).toBe('PATCH')
    resolvePayload = route.request().postDataJSON()
    reports = []
    return route.fulfill({
      status: 200,
      json: {
        id: 9,
        postId: 77,
        postTitle: '신고된 게시글',
        postAuthorStudentId: '2025123456',
        postAuthorName: '작성자',
        reporterStudentId: '2026123456',
        reason: 'SPAM',
        detail: '홍보 링크 반복',
        status: 'ACCEPTED',
        resolvedByStudentId: '2020123456',
        resolutionNote: resolvePayload.note,
        createdAt: '2026-06-15T03:29:00',
        resolvedAt: '2026-06-15T03:35:00',
      },
    })
  })

  await page.goto('/admin')
  await page.getByRole('tab', { name: '커뮤니티 관리' }).click()

  await expect(page.getByRole('heading', { name: '커뮤니티 신고 큐' })).toBeVisible()
  await expect(page.getByText('신고된 게시글')).toBeVisible()
  await expect(page.getByText('스팸/홍보')).toBeVisible()
  await page.getByPlaceholder('운영 메모').fill('삭제 처리 완료')
  await page.getByRole('button', { name: '처리 완료' }).click()

  await expect.poll(() => resolvePayload).toEqual({ action: 'ACCEPT', note: '삭제 처리 완료' })
  await expect(page.getByText('처리 대기 중인 신고가 없습니다.')).toBeVisible()
})

test('admin deleted community posts tab preserves deletion evidence', async ({ page }) => {
  await mockAdminApis(page)
  await autoDriveModals(page)
  const onePixelPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'base64',
  )
  let restored = false
  await page.route('**/api/admin/community/deleted-posts/1/images/9', (route) => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: onePixelPng,
  }))
  await page.route('**/api/admin/community/deleted-posts/1/media/10', (route) => route.fulfill({
    status: 200,
    contentType: 'video/mp4',
    body: Buffer.from('video'),
  }))
  await page.route('**/api/admin/community/deleted-posts/1/media/11', (route) => route.fulfill({
    status: 200,
    contentType: 'application/zip',
    body: Buffer.from('zip'),
  }))
  await page.route('**/api/admin/community/deleted-posts/1/restore', (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    restored = true
    return route.fulfill({ status: 200, json: { restoredPostId: 88 } })
  })
  await page.route('**/api/admin/community/deleted-posts**', (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({
      status: 200,
      json: [
        {
          id: 1,
          originalPostId: 77,
          title: '삭제 보관 대상',
          content: '[{"type":"text","content":"관리자가 삭제한 게시글 원문입니다."},{"type":"image","mediaId":3,"name":"증거사진.png","width":75,"align":"center"},{"type":"poll","pollId":"poll-1","question":"점심 메뉴?","options":[{"label":"한식"},{"label":"중식"}]},{"type":"video","mediaId":4,"name":"증거영상.mp4","width":75,"align":"center"},{"type":"file","fileId":5,"name":"source.zip"}]',
          authorStudentId: '2025123456',
          authorName: '작성자',
          category: 'GENERAL',
          deletedByStudentId: '2020123456',
          deletedByName: '관리자',
          deletedByRole: 'ADMIN',
          deletionReason: '운영 규칙 위반',
          originalCreatedAt: '2026-06-15T03:00:00',
          deletedAt: '2026-06-15T03:31:00',
          imageInfos: [
            {
              id: 9,
              originalImageId: 3,
              kind: 'INLINE',
              url: '/api/admin/community/deleted-posts/1/images/9',
              originalName: '증거사진.png',
            },
          ],
          videoInfos: [
            {
              id: 10,
              originalMediaId: 4,
              kind: 'VIDEO',
              url: '/api/admin/community/deleted-posts/1/media/10',
              originalName: '증거영상.mp4',
            },
          ],
          fileInfos: [
            {
              id: 11,
              originalMediaId: 5,
              kind: 'FILE',
              url: '/api/admin/community/deleted-posts/1/media/11',
              originalName: 'source.zip',
            },
          ],
          commentCount: 2,
          commentInfos: [
            {
              originalCommentId: 21,
              originalParentCommentId: null,
              authorStudentId: '2025222222',
              authorName: '댓글러',
              content: '삭제 전 댓글입니다.',
              createdAt: '2026-06-15T03:10:00',
              edited: false,
            },
            {
              originalCommentId: 22,
              originalParentCommentId: 21,
              authorStudentId: '2025123456',
              authorName: '작성자',
              content: '삭제 전 답글입니다.',
              createdAt: '2026-06-15T03:12:00',
              edited: true,
            },
          ],
          restoredPostId: null,
          restoredAt: null,
        },
        {
          id: 2,
          originalPostId: 78,
          title: '복원된 보관 대상',
          content: '[{"type":"text","content":"이미 복원된 게시글입니다."}]',
          authorStudentId: '2025333333',
          authorName: '다른작성자',
          category: 'INFO',
          deletedByStudentId: '2020123456',
          deletedByName: '관리자',
          deletedByRole: 'ADMIN',
          deletionReason: '테스트 후 복원',
          originalCreatedAt: '2026-06-15T02:00:00',
          deletedAt: '2026-06-15T02:31:00',
          imageInfos: [],
          videoInfos: [],
          fileInfos: [],
          commentCount: 0,
          commentInfos: [],
          restoredPostId: 79,
          restoredAt: '2026-06-15T03:45:00',
        },
      ],
    })
  })
  page.on('dialog', (dialog) => dialog.accept())

  await page.goto('/admin')
  await page.getByRole('tab', { name: '삭제 보관함' }).click()

  await expect(page.getByRole('heading', { name: '커뮤니티 삭제 보관함' })).toBeVisible()
  await expect(page.getByText('삭제 보관 대상')).toBeVisible()
  await expect(page.getByText('관리자가 삭제한 게시글 원문입니다.')).toBeVisible()
  await expect(page.getByText('투표: 점심 메뉴?')).toBeVisible()
  await expect(page.getByText('한식 · 중식')).toBeVisible()
  await expect(page.getByRole('img', { name: '증거사진.png' })).toBeVisible()
  await expect(page.getByText('증거영상.mp4')).toBeVisible()
  await expect(page.getByRole('link', { name: /source\.zip/ })).toBeVisible()
  await expect(page.getByText('댓글 2개 보관됨')).toBeVisible()
  await expect(page.getByText('삭제 전 댓글입니다.')).toBeVisible()
  await expect(page.getByText('삭제 전 답글입니다.')).toBeVisible()
  await expect(page.getByRole('cell', { name: '작성자(2025123456)', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: '관리자(2020123456)', exact: true }).first()).toBeVisible()
  await expect(page.getByText('운영 규칙 위반')).toBeVisible()
  await page.getByPlaceholder('제목·작성자·댓글·첨부 검색').fill('삭제 전 댓글')
  await expect(page.getByText('삭제 보관 대상')).toBeVisible()
  await expect(page.getByText('복원된 보관 대상')).toBeHidden()
  await page.getByPlaceholder('제목·작성자·댓글·첨부 검색').fill('')
  await page.getByLabel('삭제 보관함 상태').selectOption('RESTORED')
  await expect(page.getByText('복원된 보관 대상')).toBeVisible()
  await expect(page.getByText('삭제 보관 대상')).toBeHidden()
  await page.getByLabel('삭제 보관함 상태').selectOption('OPEN')
  await page.getByLabel('삭제 보관함 증거 유형').selectOption('COMMENTS')
  await expect(page.getByText('삭제 보관 대상')).toBeVisible()
  await page.getByRole('button', { name: '되돌리기' }).click()
  await expect.poll(() => restored).toBe(true)
  await expect(page.getByRole('table').getByText('복원됨')).toBeVisible()
  await expect(page.getByRole('link', { name: '#88 열기' })).toHaveAttribute('href', '/community/88')
})

test('community exposes my deleted posts and restore appeal for members', async ({ page }) => {
  let appealPayload = null
  await page.route('**/api/auth/me', (route) => route.fulfill({
    status: 200,
    json: {
      id: 2,
      name: '작성자',
      studentId: '2025123456',
      role: 'USER',
      emailVerified: true,
    },
  }))
  await page.route('**/api/auth/refresh', (route) => route.fulfill({ status: 204 }))
  await page.route('**/api/community/posts/deleted/me', (route) => route.fulfill({
    status: 200,
    json: [
      {
        id: 5,
        originalPostId: 77,
        title: '삭제된 질문',
        content: '원문 질문 내용입니다.',
        authorStudentId: '2025123456',
        authorName: '작성자',
        category: 'QUESTION',
        deletedByStudentId: '2020123456',
        deletedByName: '관리자',
        deletionReason: '중복 게시글로 판단',
        deletedAt: '2026-06-18T04:30:00',
        commentCount: 1,
        commentInfos: [{ authorName: '댓글러', content: '댓글 증거', createdAt: '2026-06-18T04:00:00' }],
        imageInfos: [],
        videoInfos: [],
        fileInfos: [],
        restoredPostId: null,
        restoredAt: null,
        latestAppealStatus: null,
      },
    ],
  }))
  await page.route('**/api/community/posts/deleted/5/appeals', async (route) => {
    appealPayload = await route.request().postDataJSON()
    return route.fulfill({
      status: 201,
      json: {
        id: 9,
        deletedPostId: 5,
        requesterStudentId: '2025123456',
        requesterName: '작성자',
        message: appealPayload.message,
        status: 'OPEN',
        createdAt: '2026-06-18T04:40:00',
      },
    })
  })
  await page.route('**/api/community/posts{,?*}', (route) => route.fulfill({ status: 200, json: [] }))

  await page.goto('/community?view=deleted')

  await expect(page.getByRole('heading', { name: '내 삭제 기록' })).toBeVisible()
  await expect(page.getByText('삭제된 질문')).toBeVisible()
  await expect(page.getByText('중복 게시글로 판단')).toBeVisible()
  await expect(page.getByText('관리자(2020123456)')).toBeVisible()
  await expect(page.getByText('원문 질문 내용입니다.')).toBeVisible()
  await page.getByRole('button', { name: '복원 요청' }).click()
  await page.getByPlaceholder('복원이 필요한 이유를 적어주세요.').fill('삭제 기준을 다시 확인해주세요.')
  await page.getByRole('button', { name: '요청 보내기' }).click()

  expect(appealPayload).toEqual({ message: '삭제 기준을 다시 확인해주세요.' })
  await expect(page.getByText('복원 요청 접수됨', { exact: true })).toBeVisible()
})

test('community composer creates a post with editor text and file blocks', async ({ page }) => {
  await mockAdminApis(page)
  const posts = []
  let createPayload = null
  let updatePayload = null
  let fileUploaded = false
  let savedPost = null

  await page.route('**/api/community/posts{,?*}', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, json: posts })
      return
    }
    createPayload = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      json: {
        id: 88,
        title: createPayload.title,
        content: createPayload.content,
        category: createPayload.category,
        authorName: '관리자',
        authorDisplayName: '관리자',
        authorStudentId: '2020123456',
        editable: true,
        createdAt: '2026-06-21T13:00:00',
        viewCount: 0,
        upvotes: 0,
        downvotes: 0,
        myVote: 0,
        commentCount: 0,
      },
    })
  })
  await page.route('**/api/community/posts/88/files', async (route) => {
    fileUploaded = route.request().method() === 'POST'
    await route.fulfill({ status: 200, json: 901 })
  })
  await page.route('**/api/community/posts/88', async (route) => {
    if (route.request().method() === 'PATCH') {
      updatePayload = route.request().postDataJSON()
      savedPost = {
        id: 88,
        title: updatePayload.title,
        content: updatePayload.content,
        category: updatePayload.category,
        authorName: '관리자',
        authorDisplayName: '관리자',
        authorStudentId: '2020123456',
        editable: true,
        createdAt: '2026-06-21T13:00:00',
        updatedAt: '2026-06-21T13:01:00',
        viewCount: 0,
        upvotes: 0,
        downvotes: 0,
        myVote: 0,
        commentCount: 0,
        fileInfos: [{ id: 901, originalName: 'source.zip', url: '/api/community/posts/88/files/901' }],
      }
      await route.fulfill({ status: 200, json: savedPost })
      return
    }
    await route.fulfill({ status: 200, json: savedPost })
  })
  await page.route('**/api/community/posts/88/comments', (route) => route.fulfill({ status: 200, json: [] }))

  await page.goto('/community')
  await page.getByRole('button', { name: '글쓰기' }).click()

  await page.locator('.community-compose-title').fill('구조 분리 글쓰기 테스트')
  await page.locator('.community-compose-editor [contenteditable="true"]').fill('구조 분리 테스트 본문')
  await page.locator('input[type="file"][accept*=".zip"]').setInputFiles({
    name: 'source.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('zip-body'),
  })
  await page.getByRole('button', { name: '글 등록' }).click()

  expect(createPayload).toMatchObject({
    title: '구조 분리 글쓰기 테스트',
    content: '구조 분리 테스트 본문',
    category: 'GENERAL',
  })
  await expect.poll(() => fileUploaded).toBe(true)
  await expect.poll(() => Boolean(updatePayload)).toBe(true)
  const blocks = JSON.parse(updatePayload.content)
  expect(blocks).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'text', content: '구조 분리 테스트 본문' }),
    expect.objectContaining({ type: 'file', fileId: 901, name: 'source.zip' }),
  ]))
  await expect(page.getByRole('heading', { name: '구조 분리 글쓰기 테스트' })).toBeVisible()
  await expect(page.getByRole('link', { name: /source\.zip/ })).toBeVisible()
})

test('community detail supports comment add, reply, edit, and delete', async ({ page }) => {
  await mockAdminApis(page)
  await autoDriveModals(page)

  const post = {
    id: 77,
    title: '댓글 테스트 글',
    content: '댓글 기능 점검 본문',
    category: 'GENERAL',
    authorName: '작성자',
    authorDisplayName: '작성자',
    authorStudentId: '2025123456',
    authorAdmin: false,
    editable: true,
    createdAt: '2026-06-21T12:00:00',
    updatedAt: null,
    viewCount: 3,
    upvotes: 0,
    downvotes: 0,
    myVote: 0,
    commentCount: 2,
  }
  let comments = [
    {
      id: 1,
      authorName: '댓글러',
      authorStudentId: '2025123456',
      content: '첫 댓글입니다.',
      parentCommentId: null,
      deletable: true,
      edited: false,
      createdAt: '2026-06-21T12:01:00',
    },
    {
      id: 2,
      authorName: '답글러',
      authorStudentId: '2025123457',
      content: '첫 답글입니다.',
      parentCommentId: 1,
      deletable: false,
      edited: false,
      createdAt: '2026-06-21T12:02:00',
    },
  ]
  const createdCommentPayloads = []
  let updatedCommentPayload = null
  let deletedCommentId = null

  await page.route('**/api/community/posts{,?*}', (route) => route.fulfill({ status: 200, json: [post] }))
  await page.route('**/api/community/posts/77', (route) => route.fulfill({ status: 200, json: post }))
  await page.route('**/api/community/posts/77/comments', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, json: comments })
      return
    }
    const payload = route.request().postDataJSON()
    createdCommentPayloads.push(payload)
    const comment = {
      id: 10 + createdCommentPayloads.length,
      authorName: payload.anonymousName || '관리자',
      authorStudentId: '2020123456',
      content: payload.content,
      parentCommentId: payload.parentCommentId,
      deletable: true,
      edited: false,
      createdAt: '2026-06-21T12:10:00',
    }
    comments = [...comments, comment]
    await route.fulfill({ status: 200, json: comment })
  })
  await page.route('**/api/community/posts/77/comments/*', async (route) => {
    const commentId = Number(route.request().url().split('/').pop())
    if (route.request().method() === 'PATCH') {
      updatedCommentPayload = route.request().postDataJSON()
      const updated = {
        ...comments.find((comment) => comment.id === commentId),
        content: updatedCommentPayload.content,
        edited: true,
        updatedAt: '2026-06-21T12:20:00',
      }
      comments = comments.map((comment) => comment.id === commentId ? updated : comment)
      await route.fulfill({ status: 200, json: updated })
      return
    }
    deletedCommentId = commentId
    await route.fulfill({ status: 204 })
  })

  await page.goto('/community/77')

  await expect(page.getByRole('heading', { name: '댓글 테스트 글' })).toBeVisible()
  await expect(page.getByText('댓글 2')).toBeVisible()
  await expect(page.getByText('첫 댓글입니다.')).toBeVisible()
  await expect(page.getByText('첫 답글입니다.')).toBeVisible()

  await page.getByPlaceholder('댓글을 입력하세요').fill('새 댓글입니다.')
  await page.getByRole('button', { name: '등록' }).click()
  expect(createdCommentPayloads[0]).toMatchObject({ content: '새 댓글입니다.', parentCommentId: null })
  await expect(page.getByText('새 댓글입니다.')).toBeVisible()

  const firstComment = page.locator('#comment-1')
  await firstComment.getByRole('button', { name: '댓글 달기' }).click()
  await firstComment.locator('textarea[placeholder="댓글을 입력하세요"]').fill('답글 내용')
  await firstComment.getByRole('button', { name: '등록' }).click()
  expect(createdCommentPayloads[1]).toMatchObject({ content: '@댓글러 답글 내용', parentCommentId: 1 })
  await expect(page.getByText('@댓글러 답글 내용')).toBeVisible()

  await firstComment.getByRole('button', { name: '수정' }).click()
  await firstComment.locator('textarea').fill('수정된 댓글입니다.')
  await firstComment.getByRole('button', { name: '저장' }).click()
  expect(updatedCommentPayload).toMatchObject({ content: '수정된 댓글입니다.' })
  await expect(page.getByText('수정된 댓글입니다.')).toBeVisible()

  await firstComment.getByRole('button', { name: '삭제' }).click()
  await expect.poll(() => deletedCommentId).toBe(1)
  await expect(page.locator('#comment-1')).toHaveCount(0)
})

test('admin tracks recruit applications from overview to status update', async ({ page }) => {
  await mockAdminApis(page)
  let savedStatus = 'RECEIVED'
  let savedNote = ''

  await page.route('**/api/admin/recruit-applications', (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({
      status: 200,
      json: [
        {
          id: 7,
          name: '김지원',
          studentId: '2026123000',
          department: '컴퓨터정보공학부',
          grade: '1학년',
          phone: '01012345678',
          email: 'apply@example.com',
          interests: '웹, 알고리즘',
          motive: '같이 만들고 싶습니다.',
          experience: '',
          expectation: '스터디와 프로젝트를 기대합니다.',
          status: savedStatus,
          adminNote: savedNote,
          clientIp: '203.0.113.7',
          submittedAt: '2026-06-15T09:00:00',
          updatedAt: '2026-06-15T09:00:00',
        },
      ],
    })
  })
  await page.route('**/api/admin/recruit-applications/7/status', async (route) => {
    expect(route.request().method()).toBe('PATCH')
    const payload = JSON.parse(route.request().postData())
    savedStatus = payload.status
    savedNote = payload.adminNote
    return route.fulfill({
      status: 200,
      json: {
        id: 7,
        name: '김지원',
        studentId: '2026123000',
        department: '컴퓨터정보공학부',
        grade: '1학년',
        phone: '01012345678',
        email: 'apply@example.com',
        interests: '웹, 알고리즘',
        motive: '같이 만들고 싶습니다.',
        experience: '',
        expectation: '스터디와 프로젝트를 기대합니다.',
        status: savedStatus,
        adminNote: savedNote,
        clientIp: '203.0.113.7',
        submittedAt: '2026-06-15T09:00:00',
        updatedAt: '2026-06-15T09:05:00',
      },
    })
  })

  await page.goto('/admin')

  await expect(page.getByRole('heading', { name: '운영 요약' })).toBeVisible()
  await expect(page.getByText('처리 대기 지원')).toBeVisible()
  await expect(page.getByText('1건')).toBeVisible()

  await page.getByRole('tab', { name: '모집 관리', exact: true }).click()
  await expect(page.getByRole('heading', { name: '모집 지원 관리' })).toBeVisible()
  await expect(page.getByText('김지원')).toBeVisible()
  await expect(page.getByText('같이 만들고 싶습니다.')).toBeVisible()

  await page.getByLabel('김지원 지원 상태').selectOption('REVIEWING')
  await page.getByLabel('김지원 운영 메모').fill('면담 일정 조율 중')
  await page.getByRole('button', { name: '김지원 저장' }).click()

  await expect(page.getByText('김지원 지원서를 저장했습니다.')).toBeVisible()
  await expect(page.locator('article').filter({ hasText: '김지원' }).locator('span').filter({ hasText: '검토중' })).toBeVisible()
})

// Quick jump ("빠른 이동"): one box, opened with Ctrl+K, "/" or the header button, that goes to
// any page and, for a member, to a notice, a post, an archive entry or a meeting poll by its
// title. The titles are made up.
test('quick jump opens with Ctrl+K, finds pages and member content, and goes there', async ({ page }) => {
  await mockAdminApis(page)
  await page.route('**/api/notices', route => route.fulfill({
    json: [
      { id: 31, title: '2학기 웹 세미나 일정 안내', content: '', createdAt: '2026-10-08T10:00:00' },
      { id: 30, title: '개강 총회 공지', content: '', createdAt: '2026-09-01T10:00:00' },
    ],
  }))
  await page.route('**/api/notices/31', route => route.fulfill({ json: { id: 31, title: '2학기 웹 세미나 일정 안내', content: '<p>일정</p>', createdAt: '2026-10-08T10:00:00' } }))
  await page.route('**/api/community/posts{,?*}', route => route.fulfill({ json: [{ id: 77, title: '알고리즘 세미나 후기', category: 'GENERAL', createdAt: '2026-10-10T21:00:00' }] }))
  await page.route('**/api/files', route => route.fulfill({ json: [{ id: 12, title: '웹 세미나 1주차 발표 자료', originalName: 'web-seminar-1.pdf', createdAt: '2026-09-15T20:00:00' }] }))
  await page.route('**/api/meeting-polls', route => route.fulfill({
    json: [{ id: 5, title: '세미나 뒤풀이 날짜', creatorName: '관리자', mine: true, canDelete: true, dates: ['2026-10-16'], startMinute: 1080, endMinute: 1320, slotMinutes: 30, participantCount: 6, answered: true }],
  }))

  await page.goto('/about')
  const dialog = page.getByRole('dialog', { name: '빠른 이동' })
  await expect(dialog).toHaveCount(0)
  // The header is on screen: the app has mounted and is listening for the shortcut.
  await expect(page.getByRole('button', { name: '빠른 이동 열기' })).toBeVisible()
  await page.keyboard.press('Control+k')
  const box = dialog.getByRole('combobox', { name: '어디로 갈까요?' })
  const options = dialog.getByRole('option')
  await expect(box).toBeFocused()
  // With nothing typed it is a menu of the pages, the first one highlighted.
  await expect(options.first()).toContainText('홈')
  // Circuit Lab is found once: its only page entry is the Lab item of the 배움 group.
  await box.fill('circuit lab')
  await expect(options).toHaveCount(1)
  await expect(options.first()).toContainText('Lab')
  await box.fill('')
  await expect(options.first()).toHaveAttribute('aria-selected', 'true')
  await expect(dialog.getByRole('option', { name: /운영 패널/ })).toHaveCount(1)
  await expect(dialog.getByRole('option', { name: /로그인/ })).toHaveCount(0)

  // Titles from every kind of place, each under its own heading.
  await box.fill('세미나')
  await expect(dialog.getByRole('group', { name: '페이지' }).getByRole('option')).toHaveText([/활동/])
  await expect(dialog.getByRole('group', { name: '공지사항' }).getByRole('option')).toHaveText([/2학기 웹 세미나 일정 안내/])
  await expect(dialog.getByRole('group', { name: '커뮤니티' }).getByRole('option')).toHaveText([/알고리즘 세미나 후기/])
  await expect(dialog.getByRole('group', { name: '자료실' }).getByRole('option')).toHaveText([/웹 세미나 1주차 발표 자료/])
  await expect(dialog.getByRole('group', { name: '일정 조율' }).getByRole('option')).toHaveText([/세미나 뒤풀이 날짜/])
  await expect(options).toHaveCount(5)

  // The arrow keys walk the one list across the headings and wrap round; Enter goes.
  await expect(options.first()).toHaveAttribute('aria-selected', 'true')
  await box.press('ArrowUp')
  await expect(options.last()).toHaveAttribute('aria-selected', 'true')
  await expect(box).toHaveAttribute('aria-activedescendant', 'quick-option-4')
  await box.press('ArrowDown')
  await box.press('ArrowDown')
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true')
  await box.press('Enter')
  await expect(page).toHaveURL(/\/notices\/31$/)
  await expect(dialog).toHaveCount(0)

  // Initial consonants are enough.
  await page.keyboard.press('Control+k')
  await box.fill('ㅊㅎ ㄱㅈ')
  await expect(options).toHaveText([/개강 총회 공지/])
  await box.fill('없는말없는말')
  await expect(dialog.getByText('"없는말없는말"에 맞는 곳이 없습니다.')).toBeVisible()
  // Ctrl+K again closes it.
  await page.keyboard.press('Control+k')
  await expect(dialog).toHaveCount(0)
})

test('quick jump opens from the header and lists only pages for a guest', async ({ page }) => {
  await mockOptionalApis(page)
  const asked = []
  page.on('request', request => { if (/\/api\/(community|files|meeting-polls)/.test(request.url())) asked.push(request.url()) })

  await page.goto('/about')
  const opener = page.getByRole('button', { name: '빠른 이동 열기' })
  await opener.click()
  const dialog = page.getByRole('dialog', { name: '빠른 이동' })
  const box = dialog.getByRole('combobox', { name: '어디로 갈까요?' })
  await expect(box).toBeFocused()
  await expect(dialog.getByRole('status')).toHaveText('로그인하면 공지와 글도 찾을 수 있습니다.')
  await expect(dialog.getByRole('option', { name: /로그인/ })).toHaveCount(1)
  await expect(dialog.getByRole('option', { name: /운영 패널|계정 설정/ })).toHaveCount(0)

  // Escape closes it and hands focus back to where it was.
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()

  // "/" opens it while nothing is being typed; inside the box it is just a character.
  await page.keyboard.press('/')
  await expect(box).toBeFocused()
  await box.press('/')
  await expect(box).toHaveValue('/')

  // A page is found by what the menu calls it, too.
  await box.fill('about')
  await expect(dialog.getByRole('option')).toHaveText([/동아리 소개/])
  await box.fill('프로')
  await box.press('Enter')
  await expect(page).toHaveURL(/\/projects$/)
  await expect(dialog).toHaveCount(0)
  // A guest's box asks nothing about member content.
  expect(asked).toEqual([])
})

test('quick jump leaves "/" alone while something is being typed', async ({ page }) => {
  await mockOptionalApis(page)
  await page.goto('/login')
  const field = page.getByRole('textbox').first()
  await field.click()
  await page.keyboard.type('a/b')
  await expect(field).toHaveValue('a/b')
  await expect(page.getByRole('dialog', { name: '빠른 이동' })).toHaveCount(0)
})

test('quick jump is offered beside the menu button on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockOptionalApis(page)
  await page.goto('/about')
  await page.getByRole('button', { name: '빠른 이동 열기' }).click()
  const dialog = page.getByRole('dialog', { name: '빠른 이동' })
  await dialog.getByRole('combobox', { name: '어디로 갈까요?' }).fill('ㅎㄷ')
  await expect(dialog.getByRole('option')).toHaveText([/활동/, /활동 기록/, /순서 지키는 신호등/])
  // A tap goes there. The page is for members, so a guest lands on its guide screen (not a redirect).
  await dialog.getByRole('option', { name: /활동 기록/ }).click()
  await expectMembersGate(page, '/activity-log')
  await expect(dialog).toHaveCount(0)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})

// The site font (Pretendard, display: swap) as a reader on a slow link sees it: its font files are held for 1.5 s, so the page is
// drawn in the metric-matched fallback first and the real font swaps in later. Returns a check that the font really was pending.
const holdSiteFont = async (page) => {
  await page.route(/pretendard.*\.woff2/i, async (route) => { await new Promise((resolve) => setTimeout(resolve, 1500)); await route.continue() })
}
const siteFontStatuses = (page) => page.evaluate(() => [...document.fonts].filter((f) => f.family.includes('Pretendard Variable')).map((f) => f.status))
const siteFontLoaded = async (page) => {
  await page.waitForFunction(() => [...document.fonts].some((f) => f.family.includes('Pretendard Variable') && f.status === 'loaded'))
  await page.evaluate(() => document.fonts.ready) // and every other slice it has started
}
const expectSiteFontPending = async (page) => {
  await expect.poll(async () => (await siteFontStatuses(page)).length, { message: 'a Pretendard Variable FontFace is declared' }).toBeGreaterThan(0)
  const statuses = await siteFontStatuses(page)
  expect(statuses.some((status) => status === 'loading' || status === 'unloaded') && !statuses.includes('loaded'), `the site font is still pending (${statuses.join(', ')})`).toBe(true)
}

// The brand and the first nav item must keep a real gap at the tightest desktop widths with whichever face is drawn: the
// metric-matched fallback at first paint (site font held), the site font after it has arrived, or the fallback for good when
// the font request fails. First paint is measured while the font is pending, never after waiting for document.fonts.
const HEADER_MIN_GAP = 12
for (const siteFont of ['arriving', 'blocked']) {
  for (const [theme, who] of [['light', 'member'], ['dark', 'member'], ['light', 'guest']]) {
    // The guest variant swaps the account cluster for the 로그인 button.
    test(`header brand keeps a gap to the desktop nav at 1024, 1152 and 1280, ${theme}, site font ${siteFont}${who === 'guest' ? ', guest' : ''}`, async ({ page }) => {
      await page.addInitScript((mode) => {
        try { sessionStorage.setItem('coms.intro.played:v1', '1') } catch { /* ignore */ }
        try { localStorage.setItem('kwcoms-theme-mode:v2', mode) } catch { /* ignore */ }
      }, theme)
      if (who === 'guest') await mockOptionalApis(page)
      else await mockAdminApis(page)
      if (siteFont === 'blocked') await page.route(/pretendard/i, (route) => route.abort())
      else await holdSiteFont(page)
      for (const width of [1024, 1152, 1280]) {
        await page.setViewportSize({ width, height: 800 })
        await page.goto('/')
        const brand = page.locator('header').getByRole('button', { name: '홈으로 이동' })
        const firstItem = page.locator('header nav').first().getByRole('button').first()
        await expect(firstItem).toBeVisible()
        if (who === 'guest') await expect(page.locator('header').getByRole('button', { name: '로그인', exact: true })).toBeVisible()
        const gap = async () => {
          const b = await brand.boundingBox()
          return (await firstItem.boundingBox()).x - (b.x + b.width)
        }
        if (siteFont === 'arriving') await expectSiteFontPending(page)
        expect(await gap(), `brand vs nav at ${width}px, first paint${siteFont === 'arriving' ? ' (fallback face)' : ''}`).toBeGreaterThanOrEqual(HEADER_MIN_GAP)
        if (siteFont === 'arriving') await siteFontLoaded(page)
        else await page.waitForTimeout(800)
        expect(await gap(), `brand vs nav at ${width}px, after the swap`).toBeGreaterThanOrEqual(HEADER_MIN_GAP)
      }
    })
  }
}

// A long display name widens the account cluster: the brand never shrinks and the nav keeps its gap, so the cluster must
// stay inside the bar (and the nav be pushed, not painted over) - in the fallback face and in the site font.
for (const siteFont of ['arriving', 'blocked']) {
  test(`header with a 20-character Korean name stays inside the bar at 1280 and 1366, site font ${siteFont}`, async ({ page }) => {
    await page.addInitScript(() => { try { sessionStorage.setItem('coms.intro.played:v1', '1') } catch { /* ignore */ } })
    await mockAdminApis(page)
    await page.route('**/api/auth/me', (route) => route.fulfill({ status: 200, json: { id: 1, name: '가나다라마바사아자차카타파하거너더러머버', studentId: '2020123456', role: 'ADMIN', emailVerified: true } }))
    if (siteFont === 'blocked') await page.route(/pretendard/i, (route) => route.abort())
    else await holdSiteFont(page)
    for (const width of [1280, 1366]) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/')
      const firstItem = page.locator('header nav').first().getByRole('button').first()
      await expect(firstItem).toBeVisible()
      await expect(page.locator('header').getByText('가나다라마바사아자차카타파하거너더러머버').first()).toBeAttached()
      const measure = () => page.evaluate(() => {
        const bar = document.querySelector('header [class*="lg:grid"]')
        const [brand, nav, cluster] = [...bar.children].map((el) => el.getBoundingClientRect())
        return { gap: nav.left - brand.right, clusterRight: cluster.right, barRight: bar.getBoundingClientRect().right, scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth }
      })
      const check = async (when) => {
        const m = await measure()
        expect(m.gap, `brand vs nav at ${width}px, ${when}`).toBeGreaterThanOrEqual(HEADER_MIN_GAP)
        expect(m.clusterRight, `account cluster inside the bar at ${width}px, ${when}`).toBeLessThanOrEqual(m.barRight)
        expect(m.scroll, `no horizontal scroll at ${width}px, ${when}`).toBeLessThanOrEqual(1)
      }
      if (siteFont === 'arriving') await expectSiteFontPending(page)
      await check('first paint')
      if (siteFont === 'arriving') { await siteFontLoaded(page); await check('after the swap') }
    }
  })
}

// Layout shift while the site font arrives late (held 1.5 s, so it is still pending when a loaded CI machine shows the page): the
// fallback face is metric-matched to Pretendard, so the swap must not reflow the page. Shifts caused by the reader's own input
// are excluded by the API (hadRecentInput).
for (const path of ['/', '/study/arduino']) {
  test(`the site font swapping in late shifts nothing on ${path}`, async ({ page }) => {
    await page.addInitScript(() => {
      try { sessionStorage.setItem('coms.intro.played:v1', '1') } catch { /* ignore */ }
      window.__shifts = []
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) window.__shifts.push({ value: e.value, at: Math.round(e.startTime), sources: e.sources.map((s) => `${s.node?.nodeName}.${s.node?.className?.toString().slice(0, 30)}`) })
      }).observe({ type: 'layout-shift', buffered: true })
    })
    await mockAdminApis(page)
    await holdSiteFont(page)
    await page.goto(path)
    // Shifts while the page itself is still arriving (lazy chunks, the footer) are not the font's; count from the first heading on,
    // and make sure a Pretendard FontFace is declared and not yet loaded then, or there would be no swap to measure.
    await page.locator('h1').first().waitFor()
    const at = await page.evaluate(() => performance.now())
    await expectSiteFontPending(page)
    await siteFontLoaded(page)
    await page.waitForTimeout(1000)
    const shifts = (await page.evaluate(() => window.__shifts)).filter((s) => s.at >= at)
    const cls = shifts.reduce((sum, s) => sum + s.value, 0)
    expect(cls, `layout shift: ${JSON.stringify(shifts)}`).toBeLessThan(0.02)
  })
}

// The four group buttons draw the accent underline on the pages of their group (detail routes too).
test('group buttons show the active underline on their pages', async ({ page }) => {
  await mockAdminApis(page)
  await page.route(/pretendard/i, (route) => route.abort()) // one face for every page, so widths are comparable
  await page.setViewportSize({ width: 1280, height: 800 })
  const bar = page.locator('header nav.nav-groups')
  const toggle = (name) => bar.getByRole('button', { name, exact: true })
  const underline = (name) => toggle(name).evaluate((button) => Number(getComputedStyle(button.querySelector('[data-nav-label]'), '::after').opacity))
  const groups = { club: '동아리', learn: '배움', members: '멤버', tools: '도구' }
  const widths = {}
  for (const [path, active] of [
    ['/about', 'club'], ['/sponsors', 'club'], ['/study', 'learn'],
    ['/activity-log', 'members'], ['/monthly-calendar', 'members'], ['/activity-events', 'members'],
    ['/meet', 'tools'], ['/meet/1', 'tools'], ['/gatherings/1', 'tools'], ['/attendance', 'tools'], ['/draw', 'tools'], ['/apps', 'tools'],
  ]) {
    await page.goto(path)
    await expect(toggle(groups[active]), path).toHaveAttribute('data-active', 'true')
    await expect(toggle(groups[active]), path).toHaveAttribute('aria-current', 'true')
    await page.evaluate(() => document.fonts.ready)
    for (const [id, name] of Object.entries(groups)) {
      // The underline fades in (transition), so poll until it settles.
      await expect.poll(() => underline(name), { message: `${path}: ${name} underline` }).toBe(id === active ? 1 : 0)
      if (id !== active) await expect(toggle(name)).not.toHaveAttribute('data-active', 'true')
      const box = await toggle(name).boundingBox()
      expect(box, `${name} box on ${path}`).not.toBeNull()
      widths[id] ??= box.width
      expect(Math.abs(box.width - widths[id]), `${name} width on ${path}`).toBeLessThanOrEqual(0.5)
    }
  }
  // The underline is centred on its label and hangs at the same height under every group button.
  await page.goto('/about')
  await expect(toggle('동아리')).toHaveAttribute('data-active', 'true')
  await page.evaluate(() => document.fonts.ready)
  const lines = []
  for (const name of Object.values(groups)) {
    const label = toggle(name).locator('[data-nav-label]')
    await expect(label).toBeVisible()
    const geometry = await label.evaluate((el) => {
      const text = el.getBoundingClientRect()
      const after = getComputedStyle(el, '::after')
      const width = parseFloat(after.width)
      const left = text.left + parseFloat(after.left) // left: 50% resolves to px, so the centre is left + width / 2 under translateX(-50%)
      return { labelCentre: text.left + text.width / 2, lineCentre: left, lineBottom: text.top + parseFloat(after.top) + parseFloat(after.height), width }
    })
    expect(Math.abs(geometry.lineCentre - geometry.labelCentre), `${name} underline centred`).toBeLessThanOrEqual(1)
    lines.push(geometry.lineBottom)
  }
  for (const y of lines) expect(Math.abs(y - lines[0]), 'underline height').toBeLessThanOrEqual(1)
  // No group is active on the home page.
  await page.goto('/')
  for (const name of Object.values(groups)) await expect(toggle(name)).not.toHaveAttribute('data-active', 'true')
})

test('top navigation shows four groups and one panel with the whole sitemap', async ({ page }) => {
  await mockAdminApis(page)
  await page.goto('/')

  const bar = page.locator('header nav.nav-groups')
  const group = (name) => bar.getByRole('button', { name, exact: true })
  for (const name of ['동아리', '배움', '멤버', '도구']) await expect(group(name)).toBeVisible()
  await expect(bar.getByRole('button')).toHaveCount(4)
  // Closed: no single page is listed in the bar.
  await expect(page.locator('#nav-panel')).toHaveCount(0)
  await expect(page.locator('header').getByRole('button', { name: /활동 기록/ })).toHaveCount(0)
  // No group is active on the home page.
  for (const name of ['동아리', '배움', '멤버', '도구']) await expect(group(name)).not.toHaveAttribute('data-active', 'true')

  await group('멤버').click()
  const panel = page.getByRole('navigation', { name: '전체 메뉴' })
  await expect(panel).toBeVisible()
  // All four groups are in the panel at once, whichever one was opened.
  for (const name of ['동아리', '배움', '멤버', '도구']) await expect(panel.getByRole('region', { name })).toBeVisible()
  await expect(panel.getByRole('region', { name: '멤버' }).getByRole('button', { name: /활동 기록/ })).toBeVisible()
  await expect(panel.getByRole('region', { name: '멤버' }).getByRole('button', { name: /월별 일정/ })).toBeVisible()
  await expect(panel.getByRole('region', { name: '도구' }).getByRole('button', { name: /모임 신청/ })).toBeVisible()
  await expect(panel.getByRole('region', { name: '멤버' }).getByRole('button', { name: /모임 신청/ })).toHaveCount(0)
  // Only the opened group is emphasised, and it follows the button that is pressed.
  await expect(panel.locator('[data-open="true"]')).toHaveCount(1)
  await expect(panel.getByRole('region', { name: '멤버' })).toHaveAttribute('data-open', 'true')
  await group('도구').click()
  await expect(panel.getByRole('region', { name: '도구' })).toHaveAttribute('data-open', 'true')
  await expect(panel.getByRole('region', { name: '멤버' })).not.toHaveAttribute('data-open', 'true')
  // Each row fills its column, so the whole row is the hit target.
  const logRow = panel.getByRole('button', { name: /활동 기록/ })
  const [rowBox, columnBox] = await Promise.all([logRow.boundingBox(), logRow.evaluate((el) => el.closest('ul').getBoundingClientRect().toJSON())])
  expect(rowBox.width).toBeGreaterThanOrEqual(columnBox.width - 2)
  await logRow.click()
  await expect(page).toHaveURL(/\/activity-log$/)
  await expect(panel).toHaveCount(0)
  // The button of the group that holds the current page is the active one, and only that one.
  await expect(group('멤버')).toHaveAttribute('data-active', 'true')
  await expect(group('멤버')).toHaveAttribute('aria-current', 'true')
  await expect(group('도구')).not.toHaveAttribute('data-active', 'true')
  await expect(group('도구')).not.toHaveAttribute('aria-current')
  await page.goto('/draw')
  await expect(group('도구')).toHaveAttribute('data-active', 'true')
  await expect(group('멤버')).not.toHaveAttribute('data-active', 'true')
  await page.goto('/')

  await group('멤버').click()
  await panel.getByRole('button', { name: /월별 일정/ }).click()
  await expect(page).toHaveURL(/\/monthly-calendar$/)
  await page.goto('/')
  await group('도구').click()
  await panel.getByRole('button', { name: /^앱/ }).click()
  await expect(page).toHaveURL(/\/apps$/)
  await page.goto('/')

  await expect(page.getByRole('heading', { name: "오늘의 COM's" })).toBeVisible()
  const today = page.locator('#members')
  await expect(today.getByRole('button', { name: /Activity log/ })).toHaveCount(0)
  await expect(today.getByRole('button', { name: /Monthly calendar/ })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '실제로 이어지는 활동 기록' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '동아리 일정 캘린더' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '공지사항' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '커뮤니티' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '자료실' })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByLabel('메뉴 열기').click()
  const mobileMenu = page.getByRole('navigation', { name: '모바일 메뉴' })
  // Every group is open at once: nothing hides behind a second tap. Look inside the four group
  // sections: once enough visits are counted the "자주 가는 곳" row repeats some of these entries.
  const groupSections = mobileMenu.getByRole('region', { name: /동아리|배움|멤버|도구/ })
  for (const name of [/^공지/, /^활동 기록/, /^월별 일정/, /^모임 신청/, /^출석 체크/, /^회로 Lab/, /^소개/]) await expect(groupSections.getByRole('button', { name })).toBeVisible()
  await expect(mobileMenu.getByRole('button', { name: /Circuit Lab/ })).toHaveCount(0)
  for (const name of ['동아리', '배움', '멤버', '도구']) await expect(mobileMenu.getByRole('region', { name })).toBeVisible()
  const mobileRowBox = await groupSections.getByRole('button', { name: /^활동 기록/ }).boundingBox()
  expect(mobileRowBox.height).toBeGreaterThanOrEqual(44)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
})

// Lab sits next to Study in the 배움 column. At every desktop width the bar must fit:
// brand, the four groups and the account cluster do not overlap, nothing is clipped and nothing wraps.
for (const width of [1024, 1100, 1280, 1440]) {
  test(`header shows four groups, Lab sits next to Study in the panel, and the bar fits at ${width}px`, async ({ page }) => {
    await mockAdminApis(page)
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    const bar = page.locator('header > div').first()
    const nav = page.locator('header nav.nav-groups')
    const boxes = await Promise.all([
      bar.locator('> button').first().boundingBox(),
      nav.boundingBox(),
      bar.locator(':scope > div.lg\\:justify-self-end').boundingBox(),
    ])
    const [brand, navBox, cluster] = boxes
    const items = await nav.locator(':scope > button').evaluateAll((els) => els.map((el) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, mid: (r.top + r.bottom) / 2, clipped: el.scrollWidth > el.clientWidth + 1 }
    }))
    expect(items).toHaveLength(4)
    const first = items[0]
    const last = items[items.length - 1]
    expect(brand.x + brand.width, 'brand ends before the first group').toBeLessThanOrEqual(first.left)
    expect(last.right, 'last group ends before the account cluster').toBeLessThanOrEqual(cluster.x)
    for (const item of items) {
      expect(item.left).toBeGreaterThanOrEqual(0)
      expect(item.right).toBeLessThanOrEqual(width)
      expect(item.clipped).toBe(false)
      // one line: every item sits on the same row as the first one
      expect(Math.abs(item.mid - first.mid)).toBeLessThan(4)
      expect(item.bottom - item.top).toBeLessThan(48)
    }
    expect(cluster.x + cluster.width).toBeLessThanOrEqual(width)
    expect(navBox.height).toBeLessThan(48)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)

    await nav.getByRole('button', { name: '배움', exact: true }).click()
    const panel = page.getByRole('navigation', { name: '전체 메뉴' })
    const study = await panel.getByRole('button', { name: /^스터디 자료/ }).boundingBox()
    const lab = panel.getByRole('button', { name: /^회로 Lab/ })
    const labBox = await lab.boundingBox()
    expect(Math.abs(study.x - labBox.x), 'same column').toBeLessThan(2)
    expect(labBox.y).toBeGreaterThan(study.y)
    // The panel fits the viewport and runs under the bar.
    const panelBox = await panel.boundingBox()
    expect(panelBox.x).toBeGreaterThanOrEqual(0)
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(width)
    const labRequest = page.waitForRequest((request) => request.isNavigationRequest() && new URL(request.url()).pathname === '/lab/')
    await lab.click()
    await labRequest
  })
}

test('mobile menu lists Lab at 375px without horizontal overflow and opens it with a full page load', async ({ page }) => {
  await mockAdminApis(page)
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await page.getByLabel('메뉴 열기').click()
  const mobileMenu = page.getByRole('navigation', { name: '모바일 메뉴' })
  await expect(mobileMenu.getByRole('button', { name: /^회로 Lab/ })).toBeVisible()
  const [panelBox, labItemBox] = await Promise.all([mobileMenu.boundingBox(), mobileMenu.getByRole('button', { name: /^회로 Lab/ }).boundingBox()])
  expect(labItemBox.x).toBeGreaterThanOrEqual(panelBox.x)
  expect(labItemBox.x + labItemBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width + 1)
  expect(labItemBox.y).toBeGreaterThanOrEqual(panelBox.y)
  expect(labItemBox.y + labItemBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height + 1)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  const labRequest = page.waitForRequest((request) => request.isNavigationRequest() && new URL(request.url()).pathname === '/lab/')
  await mobileMenu.getByRole('button', { name: /^회로 Lab/ }).click()
  await labRequest
})

test('study hub has no Circuit Lab card and the Arduino page has no banner', async ({ page }) => {
  await mockAdminApis(page)
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/study')
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(page.locator('a[href="/lab/"]')).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    await page.goto('/study/arduino')
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /Circuit Lab에서 열기/ })).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  }
})

test('only the nav Lab button and the Arduino code-block buttons lead to /lab/', async ({ page }) => {
  await mockAdminApis(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  for (const path of ['/', '/study', '/study/arduino']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    // Playground buttons are injected imperatively after render: wait for them before counting.
    if (path === '/study/arduino') await expect(page.getByRole('button', { name: 'Circuit Lab에서 열기' }).first()).toBeVisible()
    await expect(page.locator('a[href*="/lab"]')).toHaveCount(0)
    // The nav entry lives in the panel: open it.
    await page.getByRole('button', { name: '배움', exact: true }).click()
    await expect(page.locator('#nav-panel')).toBeVisible()
    const names = await page.getByRole('button', { name: /Lab/ }).evaluateAll(
      (els) => els.filter((el) => el.getClientRects().length > 0).map((el) => (el.querySelector('.nav-item-label') ?? el).textContent.trim()))
    const open = names.filter((name) => name !== '회로 Lab')
    expect(names.filter((name) => name === '회로 Lab'), `${path}: nav Lab button`).toHaveLength(1)
    if (path === '/study/arduino') {
      expect(open.length, `${path}: playground buttons`).toBeGreaterThan(0)
      expect(open.every((name) => name.includes('Circuit Lab에서 열기'))).toBe(true)
    } else {
      expect(open, `${path}: no other Lab buttons`).toEqual([])
    }
  }
})

test('community list stays dense but readable on mobile', async ({ page }) => {
  await mockAdminApis(page)
  await page.route('**/api/community/posts{,?*}', (route) => route.fulfill({
    status: 200,
    json: Array.from({ length: 12 }, (_, index) => ({
      id: index + 1,
      title: `아주 긴 모바일 게시글 제목입니다 ${index + 1}번째 항목에서 줄바꿈과 카드 폭을 같이 확인합니다`,
      content: '모바일 카드 폭 점검용 본문',
      category: index % 2 === 0 ? 'QUESTION' : 'GENERAL',
      authorName: '모바일작성자',
      authorDisplayName: '모바일작성자',
      authorStudentId: '2025123456',
      authorAdmin: false,
      createdAt: '2026-06-21T12:00:00',
      updatedAt: '2026-06-21T12:00:00',
      viewCount: 20 + index,
      upvoteCount: index,
      downvoteCount: 0,
      commentCount: index % 3,
      pinned: index === 0,
      imageInfos: index % 4 === 0 ? [{ id: index + 10, url: '/image.png', originalName: 'image.png' }] : [],
      videoInfos: [],
      fileInfos: [],
    })),
  }))

  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto('/community')

  await expect(page.locator('.community-post-card-mobile').first()).toBeVisible()
  await expect(page.locator('.community-pagination-pages').first()).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  const firstCardBox = await page.locator('.community-post-card-mobile').first().boundingBox()
  expect(firstCardBox.width).toBeLessThanOrEqual(360)
})

// Draw ("뽑기"): names typed into the page are split into teams, put in an order or picked
// from. The outcome is random, so these check what has to hold whatever it is. The people are
// made up.
test.describe('draw page', () => {
  const people = ['홍길동', '김철수', '이영희', '박민수', '최가람', '정하늘', '강바다']

  test('splits names into even teams, puts them in an order and copies the result', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    // What the page hands to the clipboard, kept where the test can read it.
    await page.addInitScript(() => {
      window.__copied = []
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (text) => { window.__copied.push(text); return Promise.resolve() } } })
    })
    await mockOptionalApis(page)
    await page.goto('/draw')
    await expect(page.getByRole('heading', { level: 1, name: '뽑기' })).toBeVisible()
    // It is in the 도구 column of the menu, and a guest may use it.
    await page.getByRole('button', { name: '도구', exact: true }).click()
    await expect(page.getByRole('navigation', { name: '전체 메뉴' }).getByRole('region', { name: '도구' }).getByRole('button', { name: /^조 편성/ })).toBeVisible()
    await page.keyboard.press('Escape')

    const names = page.getByRole('textbox', { name: /^이름/ })
    await expect(page.getByRole('button', { name: '섞어서 나누기' })).toBeDisabled()
    await expect(page.getByText('이름을 두 명 이상 넣어 주세요.')).toBeVisible()
    await names.fill(people.join('\n'))
    await expect(page.getByText('7명을 2조로 나눕니다.')).toBeVisible()
    // Splitting by roles and rules is the club's TeamMate app; this page says so and links to it.
    const teamMate = page.getByRole('link', { name: 'TeamMate' })
    await expect(teamMate).toHaveAttribute('href', 'https://coms.kw.ac.kr/team-randomizer/')
    await expect(teamMate).toHaveAttribute('target', '_blank')
    const stepper = page.getByRole('group', { name: '조 개수' })
    await expect(stepper.getByRole('button', { name: '조 개수 줄이기' })).toBeDisabled()
    await stepper.getByRole('button', { name: '조 개수 늘리기' }).click()
    await expect(stepper.getByRole('status')).toHaveText('3조')

    await page.getByRole('button', { name: '섞어서 나누기' }).click()
    const teams = page.getByRole('list', { name: '조 편성 결과' }).locator('> li')
    await expect(teams).toHaveCount(3)
    // Everyone is in exactly one team, and the teams differ by one at most.
    const members = await teams.evaluateAll(items => items.map(item => [...item.querySelectorAll('.coms-draw-chip')].map(chip => chip.textContent)))
    expect(members.map(team => team.length).sort()).toEqual([2, 2, 3])
    expect(members.flat().sort()).toEqual([...people].sort())

    await page.getByRole('button', { name: '결과 복사' }).click()
    await expect(page.getByText('결과를 복사했습니다.')).toBeVisible()
    const copied = await page.evaluate(() => window.__copied)
    expect(copied).toHaveLength(1)
    expect(copied[0].split('\n').map(line => line.slice(0, 4))).toEqual(['1조: ', '2조: ', '3조: '])

    await page.getByRole('button', { name: '순서 정하기' }).click()
    await expect(teamMate).toHaveCount(0)
    await page.getByRole('button', { name: '순서 섞기' }).click()
    const order = page.getByRole('list', { name: '정해진 순서' }).getByRole('listitem')
    await expect(order).toHaveCount(7)
    const ordered = await order.evaluateAll(items => items.map(item => item.lastElementChild.textContent))
    expect([...ordered].sort()).toEqual([...people].sort())
  })

  test('picks without repeating until everyone has been picked', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockOptionalApis(page)
    await page.goto('/draw')
    const three = people.slice(0, 3)
    await page.getByRole('textbox', { name: /^이름/ }).fill(three.join(', '))
    await page.getByRole('button', { name: '뽑기', exact: true }).click()
    const start = page.getByRole('button', { name: '뽑기 시작' })
    const picked = page.getByRole('list', { name: '뽑힌 사람' }).getByRole('listitem')
    const seen = []
    for (let round = 0; round < 3; round += 1) {
      await expect(page.getByText(`남은 사람 ${3 - round}명`)).toBeVisible()
      await start.click()
      await expect(page.getByText(round === 2 ? '모두 뽑혔습니다.' : `남은 사람 ${2 - round}명`)).toBeVisible()
      await expect(picked).toHaveCount(1)
      seen.push(await picked.first().textContent())
    }
    expect([...seen].sort()).toEqual([...three].sort())

    // Everyone has had a turn: the button starts over.
    await page.getByRole('button', { name: '처음부터 다시' }).click()
    await expect(page.getByText('남은 사람 3명')).toBeVisible()
    // Two at once.
    await page.getByRole('group', { name: '뽑을 인원' }).getByRole('button', { name: '뽑을 인원 늘리기' }).click()
    await start.click()
    await expect(picked).toHaveCount(2)
    await expect(page.getByText('남은 사람 1명')).toBeVisible()
    // Without "뽑힌 사람은 빼고" anyone can come up again, so nobody runs out.
    await page.getByRole('checkbox', { name: '뽑힌 사람은 빼고' }).uncheck()
    await start.click()
    await expect(picked).toHaveCount(2)
    await expect(page.getByText(/남은 사람/)).toHaveCount(0)
  })

  test('points out a name written twice, and fills and clears the list', async ({ page }) => {
    await mockOptionalApis(page)
    await page.goto('/draw')
    const names = page.getByRole('textbox', { name: /^이름/ })
    await names.fill('김민수\n김민수\n이영희')
    await expect(page.getByText('같은 이름이 여러 번 있습니다: 김민수')).toBeVisible()
    await expect(page.getByText('이름 3명')).toBeVisible()
    await page.getByRole('button', { name: '예시 넣기' }).click()
    await expect(names).toHaveValue(/홍길동/)
    await expect(page.getByText(/같은 이름이 여러 번/)).toHaveCount(0)
    await page.getByRole('button', { name: '지우기' }).click()
    await expect(names).toHaveValue('')
    await expect(page.getByText('결과가 여기에 나옵니다.')).toBeVisible()
  })

  test('tumbles the names before the result settles', async ({ page }) => {
    await mockOptionalApis(page)
    await page.goto('/draw')
    await page.getByRole('textbox', { name: /^이름/ }).fill(people.join('\n'))
    const run = page.getByRole('button', { name: '섞어서 나누기' })
    await run.click()
    const result = page.locator('.coms-draw-result')
    await expect(result).toHaveAttribute('aria-busy', 'true')
    await expect(page.getByRole('button', { name: '섞는 중...' })).toBeDisabled()
    await expect(result).toHaveAttribute('aria-busy', 'false')
    await expect(run).toBeEnabled()
    const settled = await page.locator('.coms-draw-chip').allTextContents()
    expect([...settled].sort()).toEqual([...people].sort())
  })
})

test('activities page does not embed the activity log or monthly calendar', async ({ page }) => {
  await page.goto('/activities')

  await expect(page.getByRole('heading', { name: '배움이 매주 쌓이고, 서로에게 남습니다.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '실제로 이어지는 활동 기록' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '동아리 일정 캘린더' })).toHaveCount(0)
})

test('activity records and calendar show guests the members-only guide', async ({ page }) => {
  const requests = trackRequests(page, /\/api\/club-activities/)
  await page.goto('/activity-log')
  await expectMembersGate(page, '/activity-log')
  await expect(page.getByText('등록된 활동 기록이 없습니다.')).toHaveCount(0)
  await expect(page.getByText('알고리즘 스터디 진행')).toHaveCount(0)
  await expect(page.getByText('웹 프로젝트 발표회')).toHaveCount(0)

  await page.goto('/monthly-calendar')
  await expectMembersGate(page, '/monthly-calendar')
  expect(requests).toEqual([])
})

test('signed-in members see real activity records and schedule events', async ({ page }) => {
  // Pin "today" to June 2026 so the seeded June events stay current regardless of
  // when this runs (the activity log + calendar default to the current month).
  await page.clock.setFixedTime(new Date('2026-06-19T09:00:00'))
  await mockAdminApis(page)
  await page.route('**/api/club-activities/1/image', (route) => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64'),
  }))
  await page.route('**/api/club-activities', (route) => route.fulfill({
    status: 200,
    json: [
      {
        id: 1,
        kind: 'ACTIVITY',
        category: 'SEMINAR',
        title: '운영진 등록 세미나',
        description: '관리자가 등록한 실제 활동 기록',
        eventDate: '2026-06-18',
        imageUrl: '/api/club-activities/1/image',
        imageOriginalName: 'seminar.jpg',
        createdByName: '관리자',
      },
      {
        id: 2,
        kind: 'SCHEDULE',
        category: 'MEETING',
        title: '운영진 등록 회의',
        description: '',
        eventDate: '2026-06-20',
        imageUrl: null,
        imageOriginalName: null,
        createdByName: '관리자',
      },
      {
        id: 3,
        kind: 'SCHEDULE',
        category: 'PROJECT',
        title: '다음 해 프로젝트 발표회',
        description: '',
        eventDate: '2027-07-15',
        imageUrl: null,
        imageOriginalName: null,
        createdByName: '관리자',
      },
    ],
  }))

  await page.goto('/activity-log')

  await expect(page.getByRole('heading', { name: '운영진 등록 세미나' })).toBeVisible()
  await expect(page.getByText('관리자가 등록한 실제 활동 기록')).toBeVisible()
  await expect(page.getByText('운영진 등록 회의')).toHaveCount(0)

  await page.goto('/monthly-calendar')
  await expect(page.locator('.club-calendar-event-title').filter({ hasText: '운영진 등록 회의' })).toBeVisible()
  await expect(page.getByText('다음 해 프로젝트 발표회')).toHaveCount(0)
  await page.getByLabel('년도 선택').fill('2027')
  await page.getByLabel('월 선택', { exact: true }).selectOption({ label: '7월' })
  await expect(page.locator('.club-calendar-title').getByText('2027년 7월')).toBeVisible()
  await expect(page.locator('.club-calendar-event-title').filter({ hasText: '다음 해 프로젝트 발표회' })).toBeVisible()
  await expect(page.getByText('운영진 등록 회의')).toHaveCount(0)
  await expect(page.getByText('로그인 하세요')).toHaveCount(0)
})

test('admin can add a schedule directly from the monthly calendar', async ({ page }) => {
  // Pin the clock so the calendar defaults to June 2026 and the seeded
  // 2026-06-11 schedule counts as an upcoming event in the month summary,
  // independent of when this test actually runs.
  await page.clock.setFixedTime(new Date('2026-06-10T09:00:00'))
  await mockAdminApis(page)
  await autoDriveModals(page)
  let createdPayload = null
  let updatedPayload = null
  let deletedId = null
  let activities = [{
    id: 41,
    kind: 'SCHEDULE',
    category: 'GENERAL',
    title: '수정 전 회의',
    eventDate: '2026-06-11',
    endDate: '2026-06-11',
    startTime: '17:00',
    endTime: '18:00',
    description: null,
    imageUrl: null,
    imageOriginalName: null,
    createdByName: '관리자',
  }]
  await page.route(/\/api\/club-activities\/\d+$/, async (route) => {
    const id = Number(new URL(route.request().url()).pathname.split('/').pop())
    if (route.request().method() === 'PATCH') {
      const body = route.request().postData() || ''
      updatedPayload = {
        title: multipartField(body, 'title'),
        eventDate: multipartField(body, 'eventDate'),
        endDate: multipartField(body, 'endDate'),
        startTime: multipartField(body, 'startTime'),
        endTime: multipartField(body, 'endTime'),
        colorHex: multipartField(body, 'colorHex'),
      }
      activities = activities.map((item) => item.id === id ? { ...item, ...updatedPayload } : item)
      await route.fulfill({ status: 200, json: activities.find((item) => item.id === id) })
      return
    }
    if (route.request().method() === 'DELETE') {
      deletedId = id
      activities = activities.filter((item) => item.id !== id)
      await route.fulfill({ status: 204, body: '' })
      return
    }
    await route.fulfill({ status: 200, json: activities.find((item) => item.id === id) })
  })
  await page.route('**/api/club-activities', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postData() || ''
      const form = {
        title: multipartField(body, 'title'),
        kind: multipartField(body, 'kind'),
        category: multipartField(body, 'category'),
        eventDate: multipartField(body, 'eventDate'),
        endDate: multipartField(body, 'endDate'),
        startTime: multipartField(body, 'startTime'),
        endTime: multipartField(body, 'endTime'),
        description: multipartField(body, 'description'),
        colorHex: multipartField(body, 'colorHex'),
      }
      createdPayload = form
      const created = {
        id: 20,
        kind: form.kind,
        category: form.category,
        title: form.title,
        description: form.description,
        eventDate: form.eventDate,
        endDate: form.endDate,
        startTime: form.startTime,
        endTime: form.endTime,
        colorHex: form.colorHex,
        imageUrl: null,
        imageOriginalName: null,
        createdByName: '관리자',
      }
      activities = [created, ...activities]
      await route.fulfill({
        status: 200,
        json: created,
      })
      return
    }
    await route.fulfill({ status: 200, json: activities })
  })

  await page.goto('/monthly-calendar')
  await expect(page.getByText('이번 달 예정 일정')).toBeVisible()
  await expect(page.locator('.calendar-month-summary').getByText('수정 전 회의')).toBeVisible()

  await page.getByLabel('일정 제목').fill('캘린더 직접 등록 회의')
  await page.getByLabel('시작일').fill('2026-06-24')
  await page.getByLabel('종료일 (선택)').fill('2026-06-26')
  await page.getByLabel('시작 시간 (선택)').fill('18:00')
  await page.getByLabel('종료 시간 (선택)').fill('19:30')
  await page.getByLabel('일정 색상').fill('#ff9f0a')
  await page.getByRole('button', { name: '날짜 일정 추가' }).click()

  await expect.poll(() => createdPayload).toMatchObject({
    title: '캘린더 직접 등록 회의',
    kind: 'SCHEDULE',
    category: 'GENERAL',
    eventDate: '2026-06-24',
    endDate: '2026-06-26',
    startTime: '18:00',
    endTime: '19:30',
    colorHex: '#ff9f0a',
  })
  const createdEvent = page.locator('.club-calendar-event').filter({ hasText: '캘린더 직접 등록 회의' })
  await expect(createdEvent).toBeVisible()
  await expect(createdEvent).toHaveAttribute('style', /--calendar-event-color: #ff9f0a/)

  await page.getByRole('button', { name: '11일 일정 보기' }).click()
  await page.getByRole('button', { name: '날짜 일정 수정 시작' }).click()
  await page.getByLabel('일정 제목').fill('수정 후 회의')
  await page.getByLabel('시작 시간 (선택)').fill('18:30')
  await page.getByLabel('종료 시간 (선택)').fill('19:30')
  await page.getByLabel('일정 색상').fill('#34c759')
  await page.getByRole('button', { name: '날짜 일정 수정', exact: true }).click()
  await expect.poll(() => updatedPayload).toMatchObject({
    title: '수정 후 회의',
    eventDate: '2026-06-11',
    endDate: '2026-06-11',
    startTime: '18:30',
    endTime: '19:30',
    colorHex: '#34c759',
  })
  await expect(page.locator('.club-calendar-event-title').filter({ hasText: '수정 후 회의' })).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '날짜 일정 삭제' }).click()
  await expect.poll(() => deletedId).toBe(41)
  await expect(page.getByText('수정 후 회의')).toHaveCount(0)
})

test('admin can bulk import semester schedules from CSV', async ({ page }) => {
  await mockAdminApis(page)
  const createdDateSchedules = []
  const createdRecurringSchedules = []

  await page.route('**/api/club-activities', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postData() || ''
      const form = {
        title: multipartField(body, 'title'),
        kind: multipartField(body, 'kind'),
        eventDate: multipartField(body, 'eventDate'),
        endDate: multipartField(body, 'endDate'),
        startTime: multipartField(body, 'startTime'),
        endTime: multipartField(body, 'endTime'),
        colorHex: multipartField(body, 'colorHex'),
      }
      createdDateSchedules.push(form)
      await route.fulfill({
        status: 200,
        json: {
          id: 80 + createdDateSchedules.length,
          category: 'GENERAL',
          description: '',
          imageUrl: null,
          imageOriginalName: null,
          createdByName: '관리자',
          ...form,
        },
      })
      return
    }
    await route.fulfill({ status: 200, json: [] })
  })
  await page.unroute('**/api/admin/recurring-schedules**')
  await page.route('**/api/admin/recurring-schedules**', async (route) => {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON()
      createdRecurringSchedules.push(payload)
      await route.fulfill({ status: 201, json: { id: 90 + createdRecurringSchedules.length, ...payload } })
      return
    }
    await route.fulfill({ status: 200, json: [] })
  })

  await page.goto('/monthly-calendar')
  await page.getByLabel('학기 일정 CSV').fill(`종류,제목,시작일,종료일,시작시간,종료시간,요일,색상
날짜,개강 총회,2026-03-04,2026-03-04,18:00,19:00,,#ff9f0a
정기,알고리즘 스터디,2026-03-10,2026-06-20,19:00,21:00,MON|WED,#34c759`)
  await page.getByRole('button', { name: 'CSV 일정 가져오기' }).click()

  await expect.poll(() => createdDateSchedules).toEqual([
    {
      title: '개강 총회',
      kind: 'SCHEDULE',
      eventDate: '2026-03-04',
      endDate: '2026-03-04',
      startTime: '18:00',
      endTime: '19:00',
      colorHex: '#ff9f0a',
    },
  ])
  await expect.poll(() => createdRecurringSchedules).toEqual([
    {
      title: '알고리즘 스터디',
      description: null,
      startDate: '2026-03-10',
      endDate: '2026-06-20',
      daysOfWeek: ['MON', 'WED'],
      startTime: '19:00',
      endTime: '21:00',
      location: null,
      category: null,
      colorHex: '#34c759',
    },
  ])
  await expect(page.getByText('CSV에서 일정 2개를 가져왔습니다.')).toBeVisible()
})

test('calendar admin composer uses horizontal space for schedule controls', async ({ page }) => {
  await mockAdminApis(page)

  await page.goto('/monthly-calendar')

  const composer = page.locator('.calendar-admin-composer')
  const composerBox = await composer.boundingBox()
  const modeTabsBox = await page.locator('.calendar-admin-mode-tabs').boundingBox()
  expect(composerBox).not.toBeNull()
  expect(modeTabsBox).not.toBeNull()
  expect(modeTabsBox.width).toBeGreaterThan(composerBox.width * 0.85)
  await expect(page.locator('.calendar-admin-mode-tabs button.is-active').filter({ hasText: '날짜 일정' }).locator('.calendar-admin-mode-badge')).toHaveText('선택 중')

  await page.getByRole('button', { name: '정기 모임' }).click()
  await expect(page.locator('.calendar-admin-mode-tabs button.is-active').filter({ hasText: '정기 모임' }).locator('.calendar-admin-mode-badge')).toHaveText('선택 중')
  const weekdayPickerBox = await page.locator('.recurring-weekday-picker').boundingBox()
  expect(weekdayPickerBox).not.toBeNull()
  expect(weekdayPickerBox.width).toBeGreaterThan(composerBox.width * 0.85)
  expect(weekdayPickerBox.height).toBeLessThan(72)
})

test('admin can write an activity log entry directly from the activity log page', async ({ page }) => {
  await mockAdminApis(page)
  let createdPayload = null
  let uploadedImageFields = 0
  let uploadedFileFields = 0
  let categories = [
    { id: 1, key: 'GENERAL', name: '일반', position: 0, activityCount: 0 },
    { id: 2, key: 'SEMINAR', name: '세미나', position: 1, activityCount: 0 },
    { id: 3, key: 'STUDY', name: '스터디', position: 2, activityCount: 0 },
    { id: 4, key: 'PROJECT', name: '프로젝트', position: 3, activityCount: 0 },
    { id: 5, key: 'MEETING', name: '회의', position: 4, activityCount: 0 },
  ]
  const onePixelPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'base64',
  )
  const textFile = Buffer.from('activity appendix')
  let activities = []
  await page.route('**/api/club-activities/30/images/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: onePixelPng,
    })
  })
  await page.route('**/api/club-activities/categories', async (route) => {
    await route.fulfill({ status: 200, json: categories })
  })
  await page.route('**/api/admin/club-activity-categories', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}')
    const created = {
      id: 6,
      key: 'HACKATHON',
      name: payload.name,
      position: categories.length,
      activityCount: 0,
    }
    categories = [...categories, created]
    await route.fulfill({ status: 201, json: created })
  })
  await page.route('**/api/club-activities/30/images', async (route) => {
    const body = route.request().postDataBuffer()?.toString('latin1') || ''
    uploadedImageFields = (body.match(/name="images"/g) || []).length
    activities = activities.map((item) => item.id === 30 ? {
      ...item,
      imageUrl: '/api/club-activities/30/images/101',
      imageInfos: [
        { id: 101, url: '/api/club-activities/30/images/101', originalName: 'first.png' },
        { id: 102, url: '/api/club-activities/30/images/102', originalName: 'second.png' },
      ],
    } : item)
    await route.fulfill({ status: 201, json: [101, 102] })
  })
  await page.route('**/api/club-activities/30/files', async (route) => {
    const body = route.request().postDataBuffer()?.toString('latin1') || ''
    uploadedFileFields += (body.match(/name="file"/g) || []).length
    const nextId = 200 + uploadedFileFields
    activities = activities.map((item) => item.id === 30 ? {
      ...item,
      fileInfos: [
        ...(item.fileInfos || []),
        { id: nextId, url: `/api/club-activities/30/files/${nextId}/download`, originalName: `appendix-${uploadedFileFields}.zip` },
      ],
    } : item)
    await route.fulfill({ status: 201, json: nextId })
  })
  await page.route('**/api/club-activities', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postData() || ''
      const form = {
        title: multipartField(body, 'title'),
        kind: multipartField(body, 'kind'),
        category: multipartField(body, 'category'),
        eventDate: multipartField(body, 'eventDate'),
        description: multipartField(body, 'description'),
      }
      createdPayload = form
      const created = {
        id: 30,
        kind: form.kind,
        category: form.category,
        title: form.title,
        description: form.description,
        eventDate: form.eventDate,
        imageUrl: null,
        imageOriginalName: null,
        imageInfos: [],
        fileInfos: [],
        createdByName: '관리자',
      }
      activities = [created, ...activities]
      await route.fulfill({ status: 200, json: created })
      return
    }
    await route.fulfill({ status: 200, json: activities })
  })

  await page.goto('/activity-log')
  await page.getByRole('button', { name: '분류 관리' }).click()
  await expect(page.locator('.activity-category-manager')).toBeVisible()
  await page.getByPlaceholder('예: 해커톤').fill('해커톤')
  await page.getByRole('button', { name: '분류 추가' }).click()
  await expect(page.getByText('분류를 추가했습니다.')).toBeVisible()
  await page.getByRole('button', { name: '글쓰기' }).click()
  await expect(page.locator('.activity-community-compose')).toBeVisible()
  await expect(page.locator('.activity-community-compose .community-compose-editor')).toBeVisible()
  const activityTitleInput = page.locator('.activity-community-compose .community-compose-title')
  const activityTitleBox = await activityTitleInput.boundingBox()
  const activityEditorBox = await page.locator('.activity-community-compose .community-compose-editor').boundingBox()
  expect(activityTitleBox).not.toBeNull()
  expect(activityEditorBox).not.toBeNull()
  expect(activityEditorBox.y - (activityTitleBox.y + activityTitleBox.height)).toBeLessThan(36)
  await page.getByLabel('제목').fill('활동 로그 직접 작성')
  await page.getByLabel('활동 날짜').fill('2026-06-25')
  await page.getByLabel('분류').selectOption('HACKATHON')
  await page.getByLabel('이미지').setInputFiles([
    { name: 'first.png', mimeType: 'image/png', buffer: onePixelPng },
    { name: 'second.png', mimeType: 'image/png', buffer: onePixelPng },
  ])
  await page.getByLabel('첨부파일').setInputFiles([
    { name: 'appendix-1.zip', mimeType: 'application/zip', buffer: textFile },
    { name: 'appendix-2.zip', mimeType: 'application/zip', buffer: textFile },
  ])
  const activityEditor = page.getByLabel('본문')
  await activityEditor.fill('프로젝트 발표 후기와 사진 기록')
  await activityEditor.press('ControlOrMeta+A')
  await page.getByRole('button', { name: '굵게' }).click()
  await page.getByRole('button', { name: '글 등록' }).click()

  await expect.poll(() => createdPayload).toMatchObject({
    title: '활동 로그 직접 작성',
    kind: 'ACTIVITY',
    category: 'HACKATHON',
    eventDate: '2026-06-25',
  })
  await expect.poll(() => createdPayload?.description || '').toMatch(/<(b|strong)>프로젝트 발표 후기와 사진 기록<\/(b|strong)>/)
  await expect.poll(() => uploadedImageFields).toBe(2)
  await expect.poll(() => uploadedFileFields).toBe(2)
  await expect(page.locator('.activity-community-list')).toBeVisible()
  await expect(page.locator('.activity-community-table-head')).toContainText('작성자')
  await expect(page.locator('.activity-community-table-head')).toContainText('반응')
  await expect(page.getByRole('heading', { name: '활동 로그 직접 작성' })).toBeVisible()
  await expect(page.getByText('사진 2장')).toBeVisible()
  await expect(page.getByText('첨부 2개')).toBeVisible()
  const createdActivityRow = page.locator('.activity-community-row').filter({ hasText: '활동 로그 직접 작성' })
  await expect(createdActivityRow.locator('.activity-community-row-author')).toHaveText('관리자')
  await expect(createdActivityRow.locator('.activity-community-row-reactions')).toContainText('조회 0')
  const createdThumbBox = await createdActivityRow.locator('.activity-community-row-thumb').boundingBox()
  expect(createdThumbBox).not.toBeNull()
  expect(createdThumbBox.width).toBeLessThan(96)
})

test('admin can write an event entry with the community-style composer and multiple files', async ({ page }) => {
  await mockAdminApis(page)
  let entryPayload = null
  let eventDetail = {
    id: 1,
    title: '회지 인기투표',
    description: '가장 좋았던 회지를 골라주세요.',
    startsAt: '2026-06-21T00:00:00',
    endsAt: '2026-06-30T23:59:00',
    votingOpen: true,
    totalVotes: 7,
    myEntryId: 2,
    entryCount: 2,
    createdByName: '관리자',
    createdAt: '2026-06-21T12:00:00',
    updatedAt: '2026-06-21T12:10:00',
    entries: [],
  }
  const pdfFile = Buffer.from('%PDF-1.4 test')
  const zipFile = Buffer.from('zip fixture')
  const imageFile = Buffer.from('event image fixture')
  await page.route('**/api/club-events/1', async (route) => {
    await route.fulfill({ status: 200, json: eventDetail })
  })
  await page.route('**/api/club-events/1/entries', async (route) => {
    const body = route.request().postData() || ''
    const rawBody = route.request().postDataBuffer()?.toString('latin1') || ''
    entryPayload = {
      title: multipartField(body, 'title'),
      authorName: multipartField(body, 'authorName'),
      description: multipartField(body, 'description'),
      workType: multipartField(body, 'workType'),
      summary: multipartField(body, 'summary'),
      tags: multipartField(body, 'tags'),
      externalUrl: multipartField(body, 'externalUrl'),
      fileFields: (rawBody.match(/name="files"/g) || []).length,
    }
    const createdEntry = {
      id: 9,
      title: entryPayload.title,
      authorName: entryPayload.authorName,
      description: entryPayload.description,
      workType: entryPayload.workType,
      summary: entryPayload.summary,
      tags: entryPayload.tags,
      externalUrl: entryPayload.externalUrl,
      downloadUrl: '/api/club-events/1/entries/9/download',
      originalName: 'autumn.pdf',
      mimeType: 'application/pdf',
      fileSize: pdfFile.length,
      files: [
        { id: 901, downloadUrl: '/api/club-events/1/entries/9/files/901/download', originalName: 'cover.png', mimeType: 'image/png', fileSize: imageFile.length },
        { id: 902, downloadUrl: '/api/club-events/1/entries/9/files/902/download', originalName: 'autumn.pdf', mimeType: 'application/pdf', fileSize: pdfFile.length },
        { id: 903, downloadUrl: '/api/club-events/1/entries/9/files/903/download', originalName: 'autumn-source.zip', mimeType: 'application/zip', fileSize: zipFile.length },
      ],
      voteCount: 0,
      myVote: false,
      rank: 3,
      createdAt: '2026-06-22T02:30:00',
    }
    eventDetail = {
      ...eventDetail,
      entryCount: 3,
      entries: [createdEntry],
    }
    await route.fulfill({
      status: 200,
      json: createdEntry,
    })
  })

  await page.goto('/activity-events')
  await page.locator('.club-event-list-button').filter({ hasText: '회지 인기투표' }).click()

  const composer = page.locator('.club-event-entry-form.community-compose-form')
  await expect(composer).toBeVisible()
  await expect(composer.locator('.community-compose-editor')).toBeVisible()
  await composer.getByLabel('글 제목').fill('가을호')
  const titleBox = await composer.getByLabel('글 제목').boundingBox()
  const editorBox = await composer.locator('.community-compose-editor').boundingBox()
  expect(titleBox).not.toBeNull()
  expect(editorBox).not.toBeNull()
  expect(editorBox.y - (titleBox.y + titleBox.height)).toBeLessThan(36)
  await composer.getByLabel('작성자/팀').fill('편집팀')
  await composer.getByLabel('작품 종류').selectOption('WEBZINE')
  await composer.getByLabel('한줄 소개').fill('가을 활동을 웹진으로 정리한 회지입니다.')
  await composer.getByLabel('태그').fill('가을호, 웹진, 소스포함')
  await composer.getByLabel('관련 링크').fill('https://coms.kw.ac.kr/archive/autumn')
  await composer.getByLabel('이벤트 이미지 파일').setInputFiles([
    { name: 'cover.png', mimeType: 'image/png', buffer: imageFile },
  ])
  await composer.getByLabel('회지 작품 첨부파일').setInputFiles([
    { name: 'autumn.pdf', mimeType: 'application/pdf', buffer: pdfFile },
    { name: 'autumn-source.zip', mimeType: 'application/zip', buffer: zipFile },
  ])
  await expect(composer.getByText('이미지 1개').first()).toBeVisible()
  await expect(composer.getByText('파일 2개').first()).toBeVisible()
  await expect(composer.getByText('선택한 첨부 3개')).toBeVisible()
  const eventEditor = composer.getByLabel('본문')
  await eventEditor.fill('가을 활동 회지와 제작 파일입니다.')
  await eventEditor.press('ControlOrMeta+A')
  await composer.getByRole('button', { name: '밑줄' }).click()
  await composer.getByRole('button', { name: '작품 등록' }).click()

  await expect.poll(() => entryPayload).toMatchObject({
    title: '가을호',
    authorName: '편집팀',
    workType: 'WEBZINE',
    summary: '가을 활동을 웹진으로 정리한 회지입니다.',
    tags: '가을호, 웹진, 소스포함',
    externalUrl: 'https://coms.kw.ac.kr/archive/autumn',
    fileFields: 3,
  })
  await expect.poll(() => entryPayload?.description || '').toContain('<u>가을 활동 회지와 제작 파일입니다.</u>')
  await expect(page.getByText('작품을 이벤트에 등록했습니다.')).toBeVisible()
  await expect(page.getByText('가을 활동을 웹진으로 정리한 회지입니다.')).toBeVisible()
  await expect(page.getByText('소스포함')).toBeVisible()
  await expect(page.getByRole('link', { name: '관련 링크' })).toHaveAttribute('href', 'https://coms.kw.ac.kr/archive/autumn')
  await expect(page.getByText('autumn-source.zip')).toBeVisible()
})

test('admin can register a club activity record', async ({ page }) => {
  await mockAdminApis(page)
  let createdPayload = null
  await page.route('**/api/club-activities', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postData() || ''
      const form = {
        title: multipartField(body, 'title'),
        kind: multipartField(body, 'kind'),
        category: multipartField(body, 'category'),
        eventDate: multipartField(body, 'eventDate'),
        description: multipartField(body, 'description'),
      }
      createdPayload = {
        title: form.title,
        kind: form.kind,
        category: form.category,
        eventDate: form.eventDate,
      }
      await route.fulfill({
        status: 200,
        json: {
          id: 10,
          kind: form.kind,
          category: form.category,
          title: form.title,
          description: form.description,
          eventDate: form.eventDate,
          imageUrl: null,
          imageOriginalName: null,
          createdByName: '관리자',
        },
      })
      return
    }
    await route.fulfill({ status: 200, json: [] })
  })

  await page.goto('/admin')
  await page.getByRole('tab', { name: '활동 관리' }).click()
  await page.getByLabel('활동 제목').fill('운영진 등록 활동')
  await page.getByLabel('활동 날짜').fill('2026-06-18')
  await page.getByLabel('활동 종류').selectOption('ACTIVITY')
  await page.getByLabel('활동 분류').selectOption('SEMINAR')
  await page.getByRole('button', { name: '활동 등록' }).click()

  await expect.poll(() => createdPayload).toMatchObject({
    title: '운영진 등록 활동',
    kind: 'ACTIVITY',
    category: 'SEMINAR',
    eventDate: '2026-06-18',
  })
})

test('notice detail registers a view and toggles the upvote count', async ({ page }) => {
  await mockAdminApis(page)
  let viewRegistered = false
  let voteValue = null
  let upvotes = 4

  await page.route('**/api/notices', (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({
      status: 200,
      json: [
        {
          id: 7,
          category: 'GENERAL',
          title: '조회수 검증 공지',
          content: '공지 본문 내용입니다.',
          author: '관리자',
          createdAt: '2026-06-15T03:30:00',
          viewCount: 11,
          upvotes,
          myVote: 0,
        },
      ],
    })
  })
  await page.route('**/api/notices/7', (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    viewRegistered = true
    return route.fulfill({
      status: 200,
      json: {
        id: 7,
        category: 'GENERAL',
        title: '조회수 검증 공지',
        content: '공지 본문 내용입니다.',
        author: '관리자',
        createdAt: '2026-06-15T03:30:00',
        viewCount: 12,
        upvotes,
        myVote: 0,
      },
    })
  })
  await page.route('**/api/notices/7/vote', async (route) => {
    expect(route.request().method()).toBe('POST')
    voteValue = route.request().postDataJSON().value
    upvotes = voteValue === 1 ? 5 : 4
    return route.fulfill({
      status: 200,
      json: {
        id: 7,
        category: 'GENERAL',
        title: '조회수 검증 공지',
        content: '공지 본문 내용입니다.',
        author: '관리자',
        createdAt: '2026-06-15T03:30:00',
        viewCount: 12,
        upvotes,
        myVote: voteValue,
      },
    })
  })

  await page.goto('/notices/7')

  await expect.poll(() => viewRegistered).toBe(true)
  await expect(page.getByRole('heading', { name: '조회수 검증 공지' })).toBeVisible()
  await expect(page.getByText('조회 12')).toBeVisible()

  const voteButton = page.getByRole('button', { name: /추천 4/ })
  await voteButton.click()
  await expect.poll(() => voteValue).toBe(1)
  await expect(page.getByRole('button', { name: /추천 5/ })).toBeVisible()
})

test('club activity detail registers view, vote, edit, and delete only after opening', async ({ page }) => {
  await mockAdminApis(page)
  await autoDriveModals(page)
  let viewRegistered = false
  let voteValue = null
  let upvotes = 2
  let updatedPayload = null
  let deletedId = null

  await page.unroute('**/api/club-activities')
  await page.route('**/api/club-activities', (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({
      status: 200,
      json: [
        {
          id: 5,
          kind: 'ACTIVITY',
          category: 'SEMINAR',
          title: '조회 검증 세미나',
          description: '활동 기록 본문입니다.',
          eventDate: '2026-06-18',
          imageUrl: null,
          imageOriginalName: null,
          imageInfos: [
            { id: 51, url: '/api/club-activities/5/images/51', originalName: 'first.png' },
            { id: 52, url: '/api/club-activities/5/images/52', originalName: 'second.png' },
          ],
          fileInfos: [],
          createdByName: '관리자',
          viewCount: 8,
          upvotes,
          myVote: 0,
        },
      ],
    })
  })
  await page.route('**/api/club-activities/5', async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postData() || ''
      updatedPayload = {
        title: multipartField(body, 'title'),
        category: multipartField(body, 'category'),
        eventDate: multipartField(body, 'eventDate'),
        description: multipartField(body, 'description'),
      }
      await route.fulfill({
        status: 200,
        json: {
          id: 5,
          kind: 'ACTIVITY',
          category: updatedPayload.category,
          title: updatedPayload.title,
          description: updatedPayload.description,
          eventDate: updatedPayload.eventDate,
          imageUrl: '/api/club-activities/5/images/51',
          imageOriginalName: 'first.png',
          imageInfos: [
            { id: 51, url: '/api/club-activities/5/images/51', originalName: 'first.png' },
            { id: 52, url: '/api/club-activities/5/images/52', originalName: 'second.png' },
          ],
          fileInfos: [],
          createdByName: '관리자',
          viewCount: 9,
          upvotes,
          myVote: 0,
        },
      })
      return
    }
    if (route.request().method() === 'DELETE') {
      deletedId = 5
      await route.fulfill({ status: 204, body: '' })
      return
    }
    if (route.request().method() !== 'GET') return route.fallback()
    viewRegistered = true
    return route.fulfill({
      status: 200,
      json: {
        id: 5,
        kind: 'ACTIVITY',
        category: 'SEMINAR',
        title: '조회 검증 세미나',
        description: '활동 기록 본문입니다.',
        eventDate: '2026-06-18',
        imageUrl: '/api/club-activities/5/images/51',
        imageOriginalName: 'first.png',
        imageInfos: [
          { id: 51, url: '/api/club-activities/5/images/51', originalName: 'first.png' },
          { id: 52, url: '/api/club-activities/5/images/52', originalName: 'second.png' },
        ],
        fileInfos: [],
        createdByName: '관리자',
        viewCount: 9,
        upvotes,
        myVote: 0,
      },
    })
  })
  await page.route('**/api/club-activities/5/vote', async (route) => {
    expect(route.request().method()).toBe('POST')
    voteValue = route.request().postDataJSON().value
    upvotes = voteValue === 1 ? 3 : 2
    return route.fulfill({
      status: 200,
      json: {
        id: 5,
        kind: 'ACTIVITY',
        category: 'SEMINAR',
        title: '조회 검증 세미나',
        description: '활동 기록 본문입니다.',
        eventDate: '2026-06-18',
        imageUrl: '/api/club-activities/5/images/51',
        imageOriginalName: 'first.png',
        imageInfos: [
          { id: 51, url: '/api/club-activities/5/images/51', originalName: 'first.png' },
          { id: 52, url: '/api/club-activities/5/images/52', originalName: 'second.png' },
        ],
        fileInfos: [],
        createdByName: '관리자',
        viewCount: 9,
        upvotes,
        myVote: voteValue,
      },
    })
  })

  await page.goto('/activity-log')

  const card = page.locator('article.activity-log-card').filter({ hasText: '조회 검증 세미나' })
  await expect(card).toBeVisible()
  await expect(card.locator('img')).toHaveAttribute('src', /\/api\/club-activities\/5\/images\/51/)
  await expect(card.getByText('조회 8')).toBeVisible()
  await expect(card.getByText('추천 2')).toBeVisible()
  await expect(card.getByRole('button', { name: /추천/ })).toHaveCount(0)

  await card.hover()
  await expect.poll(() => viewRegistered).toBe(false)

  await card.getByRole('button', { name: '조회 검증 세미나 내용 보기' }).click()
  await expect.poll(() => viewRegistered).toBe(true)
  const dialog = page.getByRole('dialog', { name: /조회 검증 세미나/ })
  await expect(dialog.getByText('조회 9')).toBeVisible()
  await expect(dialog.locator('.activity-detail-gallery img')).toHaveCount(2)

  await dialog.getByRole('button', { name: /추천 2/ }).click()
  await expect.poll(() => voteValue).toBe(1)
  await expect(dialog.getByRole('button', { name: /추천 3/ })).toBeVisible()

  await dialog.getByRole('button', { name: '수정' }).click()
  await dialog.getByLabel('활동 제목').fill('수정된 세미나')
  await dialog.getByLabel('활동 내용').fill('수정된 활동 본문입니다.')
  await dialog.getByRole('button', { name: '수정 저장' }).click()
  await expect.poll(() => updatedPayload).toMatchObject({
    title: '수정된 세미나',
    category: 'SEMINAR',
    eventDate: '2026-06-18',
    description: '<p>수정된 활동 본문입니다.</p>',
  })
  await expect(page.getByRole('dialog', { name: /수정된 세미나/ })).toBeVisible()

  page.once('dialog', (dialogPrompt) => dialogPrompt.accept())
  await page.getByRole('dialog', { name: /수정된 세미나/ }).getByRole('button', { name: '삭제' }).click()
  await expect.poll(() => deletedId).toBe(5)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('admin deleted post full view modal renders title, body, image, and comments', async ({ page }) => {
  await mockAdminApis(page)
  const onePixelPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'base64',
  )
  const summaryRow = {
    id: 1,
    originalPostId: 77,
    title: '원문 보기 대상',
    content: '[{"type":"text","content":"요약 목록 본문"}]',
    authorStudentId: '2025123456',
    authorName: '작성자',
    category: 'GENERAL',
    deletedByStudentId: '2020123456',
    deletedByName: '관리자',
    deletedByRole: 'ADMIN',
    deletionReason: '운영 규칙 위반',
    originalCreatedAt: '2026-06-15T03:00:00',
    deletedAt: '2026-06-15T03:31:00',
    imageInfos: [],
    videoInfos: [],
    fileInfos: [],
    commentCount: 2,
    commentInfos: [],
    restoredPostId: null,
    restoredAt: null,
  }
  // Register the broad list route first; the more specific detail/image routes
  // are registered afterwards so Playwright (last-match-wins) routes them.
  await page.route('**/api/admin/community/deleted-posts**', (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({ status: 200, json: [summaryRow] })
  })
  await page.route('**/api/admin/community/deleted-posts/1', (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({
      status: 200,
      json: {
        ...summaryRow,
        content: '[{"type":"text","content":"삭제된 게시글 원문 전체입니다."},{"type":"image","mediaId":3,"name":"증거.png","width":75,"align":"center"}]',
        imageInfos: [
          {
            id: 9,
            originalImageId: 3,
            kind: 'INLINE',
            url: '/api/admin/community/deleted-posts/1/images/9',
            originalName: '증거.png',
          },
        ],
        commentInfos: [
          {
            originalCommentId: 21,
            originalParentCommentId: null,
            authorStudentId: '2025222222',
            authorName: '댓글러',
            content: '원문 댓글입니다.',
            createdAt: '2026-06-15T03:10:00',
            edited: false,
          },
          {
            originalCommentId: 22,
            originalParentCommentId: 21,
            authorStudentId: '2025123456',
            authorName: '작성자',
            content: '원문 답글입니다.',
            createdAt: '2026-06-15T03:12:00',
            edited: true,
          },
        ],
      },
    })
  })
  await page.route('**/api/admin/community/deleted-posts/1/images/9', (route) => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: onePixelPng,
  }))

  await page.goto('/admin')
  await page.getByRole('tab', { name: '삭제 보관함' }).click()

  await expect(page.getByRole('heading', { name: '커뮤니티 삭제 보관함' })).toBeVisible()
  await page.getByRole('button', { name: '원문 보기' }).click()

  const modal = page.getByRole('dialog')
  await expect(modal.getByText('삭제 보관함 · 원문 보기')).toBeVisible()
  await expect(modal.getByRole('heading', { name: '원문 보기 대상' })).toBeVisible()
  await expect(modal.getByText('삭제된 게시글 원문 전체입니다.')).toBeVisible()
  await expect(modal.getByRole('img', { name: '증거.png' })).toBeVisible()
  await expect(modal.getByText('댓글 2개')).toBeVisible()
  await expect(modal.getByText('원문 댓글입니다.')).toBeVisible()
  await expect(modal.getByText('원문 답글입니다.')).toBeVisible()

  await modal.getByLabel('닫기').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('apps page renders DB-driven club projects grouped by category', async ({ page }) => {
  await page.route('**/api/club-projects/categories', (route) => route.fulfill({
    status: 200,
    json: [
      { id: 1, key: 'WEBSITE', name: '웹사이트', position: 0 },
      { id: 2, key: 'APP', name: '앱', position: 1 },
    ],
  }))
  await page.route('**/api/club-projects', (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({
      status: 200,
      json: [
        {
          id: 11,
          category: 'WEBSITE',
          categoryName: '웹사이트',
          title: 'COM\'s 포털',
          description: '동아리 포털 사이트',
          eyebrow: 'Web',
          madeBy: '김개발',
          linkUrl: 'https://portal.example.com/',
          displayUrl: 'portal.example.com',
          files: [],
        },
        {
          id: 12,
          category: 'APP',
          categoryName: '앱',
          title: '출석 체크 앱',
          description: '세미나 출석 관리 앱',
          eyebrow: 'App',
          madeBy: '이모바일',
          linkUrl: null,
          displayUrl: null,
          files: [{ id: 99, url: '/api/club-projects/12/files/99', originalName: 'attend.apk' }],
        },
      ],
    })
  })

  await page.goto('/apps')

  await expect(page.getByRole('heading', { name: "COM's Apps" })).toBeVisible()
  await expect(page.getByRole('heading', { name: '웹사이트', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '앱', exact: true })).toBeVisible()

  const portalCard = page.locator('a.apple-product-panel').filter({ hasText: "COM's 포털" })
  await expect(portalCard).toHaveAttribute('href', 'https://portal.example.com/')
  await expect(portalCard.getByText('만든 사람')).toHaveCount(0)
  await expect(portalCard.getByText('열기')).toBeVisible()

  const attendCard = page.locator('.apple-product-panel').filter({ hasText: '출석 체크 앱' })
  await expect(attendCard.getByText('만든 사람')).toHaveCount(0)
  await expect(attendCard.getByText('attend.apk')).toBeVisible()
  await expect(attendCard.getByRole('link', { name: /다운로드/ })).toBeVisible()
  await expect(page.locator('.site-stats')).toContainText('프로젝트')
  await expect(page.locator('.site-stats')).toContainText('카테고리')
  await expect(page.locator('.site-stats')).not.toContainText('만든 사람')
})

test('apps page cards keep one size whatever the text length or section count', async ({ page }) => {
  const long = '아주 긴 제목 '.repeat(20)
  const longDesc = '아주 긴 설명이 들어가도 카드 크기는 변하지 않아야 합니다. '.repeat(12)
  const project = (id, category, title, description, extra = {}) => ({
    id, category, categoryName: category === 'WEBSITE' ? '웹사이트' : '앱',
    title, description, eyebrow: 'Web', madeBy: '홍길동',
    linkUrl: 'https://example.com/', displayUrl: 'a-very-long-domain-name.example.com/path', files: [], ...extra,
  })
  const longFile = (id, name) => ({ id, url: `/api/club-projects/4/files/${id}`, originalName: name })
  const fixture = (withFiles) => [
    project(1, 'WEBSITE', long, longDesc),
    project(2, 'WEBSITE', '짧은 제목', '짧은 설명', { eyebrow: '' }),
    project(3, 'WEBSITE', '세 번째', '', { displayUrl: null }),
    project(4, 'APP', long, longDesc, {
      linkUrl: null,
      files: withFiles ? [longFile(9, `${'긴파일이름'.repeat(10)}.apk`), longFile(10, 'second.zip'), longFile(11, 'third.zip')] : [],
    }),
    project(5, 'APP', '두 번째 앱', '설명'),
  ]
  await page.route('**/api/club-projects/categories', (route) => route.fulfill({
    status: 200,
    json: [{ id: 1, key: 'WEBSITE', name: '웹사이트', position: 0 }, { id: 2, key: 'APP', name: '앱', position: 1 }],
  }))
  let withFiles = true
  await page.route('**/api/club-projects', (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({ status: 200, json: fixture(withFiles) })
  })

  const heights = {}
  for (const files of [true, false]) {
    withFiles = files
    for (const viewport of [{ width: 1280, height: 900 }, { width: 800, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport)
      await page.goto('/apps')
      await expect(page.locator('.app-card')).toHaveCount(5)
      // One size across the whole page, sections included: the file row is reserved page-wide.
      const boxes = await page.locator('.app-card').evaluateAll((els) => els.map((el) => {
        const r = el.getBoundingClientRect()
        return { w: r.width, h: r.height }
      }))
      for (const box of boxes) {
        expect(Math.abs(box.w - boxes[0].w)).toBeLessThanOrEqual(1)
        expect(Math.abs(box.h - boxes[0].h)).toBeLessThanOrEqual(1)
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(0)
      heights[`${files}-${viewport.width}`] = boxes[0].h
      // Every author is the same here: the old page showed a 만든 사람 stat in this case.
      await expect(page.locator('.site-stats')).not.toContainText('만든 사람')
      await expect(page.locator('.app-card').filter({ hasText: '만든 사람' })).toHaveCount(0)

      if (files && viewport.width === 1280) {
        // The 2px focus ring of a file link must fit inside the clipping slot.
        const link = page.locator('.app-card-files a').first()
        await link.focus()
        const ok = await page.evaluate(() => {
          const a = document.activeElement
          const slot = a.closest('.app-card-more').getBoundingClientRect()
          const scroller = a.closest('.app-card-files').getBoundingClientRect()
          const r = a.getBoundingClientRect()
          return [slot, scroller].every((c) => r.top - 2 >= c.top && r.bottom + 2 <= c.bottom && r.left - 2 >= c.left)
        })
        expect(ok).toBe(true)
        await expect(link).toHaveAttribute('title', /긴파일이름/)
        // The filter keeps the page-wide size: one section alone is as tall as the whole page was.
        await page.getByRole('button', { name: /^웹사이트/ }).click()
        await expect(page.locator('.app-card')).toHaveCount(3)
        const filtered = await page.locator('.app-card').first().evaluate((el) => el.getBoundingClientRect().height)
        expect(Math.abs(filtered - boxes[0].h)).toBeLessThanOrEqual(1)
      }
    }
  }
  // No file row reserved when no card has files: the cards are shorter.
  for (const width of [1280, 800, 390]) {
    expect(heights[`false-${width}`]).toBeLessThan(heights[`true-${width}`])
  }
})

test('admin Apps management shows public-card previews with status badges', async ({ page }) => {
  await mockAdminApis(page)
  await page.route('**/api/club-projects/categories', (route) => route.fulfill({
    status: 200,
    json: [
      { id: 1, key: 'WEBSITE', name: '웹사이트', position: 0 },
      { id: 2, key: 'APP', name: '앱', position: 1 },
    ],
  }))
  let createdProjectPayload = null
  const uploadedProjectFiles = []
  const projects = [
    {
      id: 11,
      category: 'WEBSITE',
      categoryName: '웹사이트',
      title: "COM's 포털",
      description: '부원용 서비스 허브',
      eyebrow: 'Portal',
      madeBy: '김개발',
      linkUrl: 'https://coms.kw.ac.kr/portal/',
      displayUrl: 'coms.kw.ac.kr/portal',
      files: [],
    },
    {
      id: 12,
      category: 'APP',
      categoryName: '앱',
      title: '출석 체크 앱',
      description: '세미나 출석 관리 앱',
      eyebrow: 'App',
      madeBy: '이모바일',
      linkUrl: null,
      displayUrl: null,
      files: [{ id: 99, url: '/api/club-projects/12/files/99', originalName: 'attend.apk' }],
    },
  ]
  await page.route('**/api/club-projects/21/files', (route) => {
    const body = route.request().postDataBuffer()?.toString('latin1') || ''
    const nameMatch = /filename="([^"]+)"/.exec(body)
    uploadedProjectFiles.push(nameMatch?.[1] || `file-${uploadedProjectFiles.length + 1}`)
    projects[2] = {
      ...projects[2],
      files: uploadedProjectFiles.map((name, index) => ({
        id: 200 + index,
        url: `/api/club-projects/21/files/${200 + index}/download`,
        originalName: name,
        fileSize: 2048 + index,
      })),
    }
    return route.fulfill({ status: 201, json: 200 + uploadedProjectFiles.length })
  })
  await page.route('**/api/club-projects', (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({ status: 200, json: projects })
  })
  await page.route('**/api/club-projects', (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const body = route.request().postData() || ''
    createdProjectPayload = {
      title: multipartField(body, 'title'),
      category: multipartField(body, 'category'),
      linkUrl: multipartField(body, 'linkUrl'),
    }
    const created = {
      id: 21,
      category: createdProjectPayload.category,
      categoryName: '앱',
      title: createdProjectPayload.title,
      description: '새 앱 설명',
      eyebrow: 'App',
      madeBy: '관리자',
      linkUrl: createdProjectPayload.linkUrl,
      displayUrl: 'example.com/new-app',
      files: [],
    }
    projects.push(created)
    return route.fulfill({ status: 201, json: created })
  })

  await page.goto('/admin')
  await page.getByRole('tab', { name: 'Apps 관리' }).click()

  const portalPreview = page.getByTestId('admin-app-preview-11')
  await expect(portalPreview.getByText("COM's 포털")).toBeVisible()
  await expect(portalPreview.getByText('열기 가능')).toBeVisible()
  await expect(portalPreview.getByText('COMS 호스팅')).toBeVisible()

  const appPreview = page.getByTestId('admin-app-preview-12')
  await expect(appPreview.getByText('출석 체크 앱')).toBeVisible()
  await expect(appPreview.getByLabel('앱 상태').getByText('다운로드')).toBeVisible()

  await page.getByLabel('제목').fill('새 앱')
  await page.getByLabel('분류').selectOption('APP')
  await page.getByLabel('링크 URL (선택)').fill('https://example.com/new-app')
  await page.getByLabel('배포 파일 (apk/zip 등, 여러 개 선택 가능)').setInputFiles([
    { name: 'new-app.apk', mimeType: 'application/vnd.android.package-archive', buffer: Buffer.from('apk') },
    { name: 'new-app-symbols.zip', mimeType: 'application/zip', buffer: Buffer.from('zip') },
  ])
  const draftPreview = page.getByTestId('admin-app-preview-draft')
  await expect(draftPreview.getByText('새 앱')).toBeVisible()
  await expect(draftPreview.getByText('외부 링크')).toBeVisible()
  await expect(draftPreview.getByText('new-app.apk')).toBeVisible()
  await expect(page.getByText('선택한 파일 2개')).toBeVisible()

  await page.getByRole('button', { name: 'Apps 항목 등록' }).click()
  await expect.poll(() => createdProjectPayload).toMatchObject({
    title: '새 앱',
    category: 'APP',
    linkUrl: 'https://example.com/new-app',
  })
  await expect.poll(() => uploadedProjectFiles).toEqual(['new-app.apk', 'new-app-symbols.zip'])
})

test('monthly calendar renders recurring schedule occurrences for the selected month', async ({ page }) => {
  await mockAdminApis(page)
  // The month summary / mobile agenda only lists events on or after "today",
  // and the mocked occurrences are fixed July 2026 dates — freeze the clock so
  // the test doesn't rot as the real date moves past them.
  await page.clock.setFixedTime(new Date('2026-07-01T09:00:00'))
  // The calendar requests occurrences for the visible month; only July 2026
  // (year=2026&month=7) returns recurring occurrences. Other months are empty.
  await page.unroute('**/api/club-activities/schedule**')
  await page.route('**/api/club-activities/schedule**', (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('year') !== '2026' || url.searchParams.get('month') !== '7') {
      return route.fulfill({ status: 200, json: [] })
    }
    return route.fulfill({
      status: 200,
      json: [
        {
          recurringScheduleId: 3,
          date: '2026-07-06',
          title: '정기 회의',
          category: 'MEETING',
          startTime: '18:00',
          endTime: '19:00',
          location: '동아리방',
        },
        {
          recurringScheduleId: 3,
          date: '2026-07-13',
          title: '정기 회의',
          category: 'MEETING',
          startTime: '18:00',
          endTime: '19:00',
          location: '동아리방',
        },
        {
          recurringScheduleId: 3,
          exceptionId: 9,
          date: '2026-07-20',
          title: '정기 회의',
          category: 'MEETING',
          startTime: '18:00',
          endTime: '19:00',
          canceled: true,
        },
      ],
    })
  })

  await page.goto('/monthly-calendar')
  await page.getByLabel('년도 선택').fill('2026')
  await page.getByLabel('월 선택', { exact: true }).selectOption({ label: '7월' })

  await expect(page.locator('.club-calendar-title').getByText('2026년 7월')).toBeVisible()
  const recurringEvents = page.locator('.club-calendar-event-recurring').filter({ hasText: '정기 회의' })
  await expect(recurringEvents).toHaveCount(3)
  await expect(recurringEvents.first().getByText('18:00~19:00')).toBeVisible()
  await expect(recurringEvents.first().getByText('@동아리방')).toHaveCount(0)
  await expect(page.locator('.club-calendar-event-badge', { hasText: '취소됨' })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('calendar-mobile-agenda')).toBeVisible()
  await expect(page.getByTestId('calendar-mobile-agenda')).toContainText('정기 회의')
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
})

test('monthly calendar paints the selected date and recurring occurrence', async ({ page }) => {
  await mockAdminApis(page)
  await page.unroute('**/api/club-activities/schedule**')
  await page.route('**/api/club-activities/schedule**', (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('year') !== '2026' || url.searchParams.get('month') !== '7') {
      return route.fulfill({ status: 200, json: [] })
    }
    return route.fulfill({
      status: 200,
      json: [
        {
          recurringScheduleId: 3,
          date: '2026-07-13',
          title: '정기 회의',
          category: 'MEETING',
          startTime: '18:00',
          endTime: '19:00',
        },
      ],
    })
  })

  await page.goto('/monthly-calendar')
  await page.getByLabel('년도 선택').fill('2026')
  await page.getByLabel('월 선택', { exact: true }).selectOption({ label: '7월' })

  const dayButton = page.getByRole('button', { name: '13일 일정 보기' })
  await dayButton.click()
  await expect(dayButton.locator('..')).toHaveClass(/club-calendar-day-selected/)
  await expect(dayButton.locator('..').locator('.club-calendar-day-selected-label')).toHaveText('선택한 날짜')

  const recurringEvent = page.locator('.club-calendar-event-recurring').filter({ hasText: '정기 회의' })
  await recurringEvent.click()
  await expect(recurringEvent).toHaveAttribute('aria-pressed', 'true')
  await expect(recurringEvent).toHaveClass(/club-calendar-event-selected/)
  await expect(recurringEvent.locator('.club-calendar-event-selected-mark')).toHaveText('선택됨')
  await expect(page.locator('.calendar-day-detail-selected').filter({ hasText: '정기 회의' })).toBeVisible()
  await expect(page.locator('.calendar-day-detail-selected').locator('.calendar-day-detail-selected-badge')).toHaveText('선택한 일정')
})

test('admin can set and clear one-date recurring schedule exceptions', async ({ page }) => {
  await mockAdminApis(page)
  const exceptionWrites = []
  let exceptionDelete = null

  await page.unroute('**/api/club-activities/schedule**')
  await page.route('**/api/club-activities/schedule**', (route) => route.fulfill({
    status: 200,
    json: [
      {
        recurringScheduleId: 3,
        date: '2026-07-13',
        title: '정기 회의',
        category: 'MEETING',
        startTime: '18:00',
        endTime: '19:00',
      },
      {
        recurringScheduleId: 3,
        exceptionId: 9,
        date: '2026-07-20',
        title: '정기 회의',
        category: 'MEETING',
        startTime: '18:00',
        endTime: '19:00',
        canceled: true,
      },
    ],
  }))
  await page.route(/\/api\/admin\/recurring-schedules\/3\/exceptions\/2026-07-\d+$/, async (route) => {
    const url = new URL(route.request().url())
    if (route.request().method() === 'PUT') {
      exceptionWrites.push({ path: url.pathname, payload: route.request().postDataJSON() })
      await route.fulfill({ status: 200, json: { id: 77, recurringScheduleId: 3, exceptionDate: url.pathname.split('/').pop(), ...route.request().postDataJSON() } })
      return
    }
    if (route.request().method() === 'DELETE') {
      exceptionDelete = url.pathname
      await route.fulfill({ status: 204, body: '' })
      return
    }
    await route.fallback()
  })

  await page.goto('/monthly-calendar')
  await page.getByLabel('년도 선택').fill('2026')
  await page.getByLabel('월 선택', { exact: true }).selectOption({ label: '7월' })

  await page.getByRole('button', { name: '13일 일정 보기' }).click()
  await page.getByRole('button', { name: '시간 변경' }).click()
  await page.getByLabel('예외 시작 시간').fill('20:00')
  await page.getByLabel('예외 종료 시간').fill('21:30')
  await page.getByRole('button', { name: '시간 변경 저장' }).click()
  await expect.poll(() => exceptionWrites.at(-1)).toEqual({
    path: '/api/admin/recurring-schedules/3/exceptions/2026-07-13',
    payload: { canceled: false, startTime: '20:00', endTime: '21:30' },
  })

  await page.getByRole('button', { name: '20일 일정 보기' }).click()
  await page.getByRole('button', { name: '예외 해제' }).click()
  await expect.poll(() => exceptionDelete).toBe('/api/admin/recurring-schedules/3/exceptions/2026-07-20')
})

test('guest visiting notices sees the members-only guide', async ({ page }) => {
  const requests = trackRequests(page, /\/api\/notices/)
  await page.goto('/notices')
  const gate = await expectMembersGate(page, '/notices')
  await expect(gate.getByText('공지, 홍보, 소모임, 취업공고를 한곳에서 볼 수 있어요.')).toBeVisible()
  await expect(page.getByText('조회수 검증 공지')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '공지사항', exact: true })).toHaveCount(0)
  expect(requests).toEqual([])
})

test('archive highlights repeat-visit search and category controls', async ({ page }) => {
  await mockAdminApis(page)
  await page.route('**/api/files', (route) => route.fulfill({
    status: 200,
    json: [
      {
        id: 3,
        title: 'React 세미나 자료',
        originalName: 'react-seminar.pdf',
        description: '컴포넌트 기초 세미나',
        category: 'GENERAL',
        fileSize: 2048,
        uploadedBy: '2020123456',
        uploaderName: '관리자',
        uploadedAt: '2026-06-15T10:00:00',
      },
    ],
  }))

  await page.goto('/resources')

  await expect(page.getByText('다시 찾는 자료실')).toBeVisible()
  await expect(page.getByPlaceholder('세미나, 프로젝트, 작성자 검색')).toBeVisible()
  await expect(page.getByRole('button', { name: /전체/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /React 세미나 자료/ })).toBeVisible()
  // 자료를 열면 /resources/:id 로 이동하고, 브라우저 뒤로가기는 자료실 목록으로 돌아온다.
  await page.getByRole('button', { name: /React 세미나 자료/ }).click()
  await expect(page).toHaveURL(/\/resources\/\d+$/)
  await expect(page.getByRole('heading', { name: '자료 상세' })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/\/resources$/)
  await expect(page.getByRole('button', { name: /React 세미나 자료/ })).toBeVisible()
})

test('sponsors page renders tiers, anonymises, and hides the amount note from guests', async ({ page }) => {
  // routes are LIFO, so these win over the mockOptionalApis defaults registered in beforeEach.
  await page.route('**/api/sponsors/page', (route) => route.fulfill({
    status: 200,
    json: {
      settings: {
        heroTitle: '후원해주신 분들',
        heroSubtitle: '함께 만들어주셔서 고맙습니다.',
        bannerImageId: null,
        introHtml: '',
        accentColor: '#7c3aed',
        layout: 'grid',
        showTierLabels: true,
        thankYouMessage: '앞으로도 잘 부탁드립니다.',
        howToSection: {
          title: '후원 안내',
          bodyHtml: '연락 주시면 안내드립니다.',
          contactEmail: 'kwcoms69@gmail.com',
          contactLink: '',
          bankNote: '광운은행 000-000-000',
        },
        showCounts: true,
      },
      bannerImageUrl: null,
      sponsorCount: 2,
      tierCount: 1,
    },
  }))
  await page.route('**/api/sponsors', (route) => route.fulfill({
    status: 200,
    json: [
      {
        id: 1,
        name: '골드',
        color: '#d4a017',
        description: '정기 후원',
        sortOrder: 1,
        sponsors: [
          {
            id: 10,
            name: '광운 후원사',
            tierId: 1,
            logoUrl: null,
            linkUrl: 'https://example.com',
            description: '동아리 활동을 후원합니다.',
            sinceDate: '2026-03-01',
            untilDate: null,
            anonymous: false,
          },
          {
            id: 11,
            name: '익명 후원자',
            tierId: 1,
            logoUrl: null,
            linkUrl: null,
            description: null,
            sinceDate: null,
            untilDate: null,
            anonymous: true,
          },
        ],
      },
    ],
  }))

  await page.goto('/sponsors')

  await expect(page.getByRole('heading', { name: '후원해주신 분들' })).toBeVisible()
  await expect(page.getByText('광운 후원사')).toBeVisible()
  await expect(page.getByText('익명 후원자')).toBeVisible()
  await expect(page.getByRole('link', { name: /바로가기/ })).toHaveAttribute('rel', /noreferrer/)
  await expect(page.getByText('총 후원자 수')).toBeVisible()
  await expect(page.getByText('광운은행 000-000-000')).toBeVisible()
  // 금액 메모는 공개 응답에 없으므로 어떤 형태로도 화면에 나타나지 않는다.
  await expect(page.locator('body')).not.toContainText('금액 메모')
  await expect(page.getByText('문제가 발생했습니다.')).toHaveCount(0)
})

// Gatherings ("모임 신청"): a member opens one, others put their names down, everyone sees who
// is coming, and whoever opened it manages it. The people are made up.
test.describe('gatherings', () => {
  const asMember = async (page) => {
    await mockAdminApis(page)
    await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 5, studentId: '2023000002', name: '홍길동', role: 'USER', emailVerified: true } }))
    await page.route('**/api/permissions/me', route => route.fulfill({ json: { role: 'USER', permissions: [] } }))
  }
  const sheet = (over = {}) => ({ id: 7, title: '알고리즘 스터디', description: '매주 화요일 저녁, 세미나실', creatorName: '김철수', mine: false, canManage: false, capacity: 3, noteLabel: '하고 싶은 주제', closesAt: null, open: true, full: false, participantCount: 1, joined: false, createdAt: '2026-10-12T10:00:00', ...over })
  const person = (id, name, over = {}) => ({ id, name, mine: false, note: null, signedUpAt: '2026-10-12T19:05:00', ...over })

  test('the list shows what is open, full and closed, and a new one is opened from it', async ({ page }) => {
    await asMember(page)
    let list = [
      sheet({ id: 3, title: '가을 MT', capacity: null, noteLabel: null, participantCount: 14, joined: true, closesAt: '2026-11-01T18:00:00' }),
      sheet({ id: 2, title: '웹 스터디', capacity: 4, participantCount: 4, full: true }),
      sheet({ id: 1, title: '개강 회식', capacity: null, participantCount: 21, open: false }),
    ]
    let created = null
    await page.route('**/api/gatherings', async route => {
      if (route.request().method() !== 'POST') return route.fulfill({ json: list })
      created = route.request().postDataJSON()
      const made = sheet({ id: 7, title: created.title, description: created.description, creatorName: '홍길동', mine: true, canManage: true, capacity: created.capacity, noteLabel: created.noteLabel, participantCount: 0 })
      list = [made, ...list]
      await route.fulfill({ status: 201, json: { gathering: made, participants: [] } })
    })

    await page.goto('/gatherings')
    await expect(page.getByRole('heading', { level: 1, name: '모임 신청' })).toBeVisible()
    const cards = page.getByRole('list', { name: '모임 목록' }).getByRole('listitem')
    await expect(cards).toHaveCount(3)
    await expect(cards.nth(0)).toContainText('가을 MT')
    await expect(cards.nth(0)).toContainText('받는 중')
    await expect(cards.nth(0)).toContainText('신청함')
    await expect(cards.nth(0)).toContainText('14명')
    await expect(cards.nth(0)).toContainText('11월 1일 18:00까지')
    await expect(cards.nth(1)).toContainText('정원 마감')
    await expect(cards.nth(1)).toContainText('4 / 4명')
    await expect(cards.nth(2)).toContainText('마감')
    await expect(cards.nth(2)).not.toContainText('신청함')

    await page.getByRole('button', { name: '새 모임 열기' }).click()
    const form = page.getByRole('form', { name: '새 모임 열기' })
    await form.getByRole('button', { name: '모임 열기' }).click()
    await expect(form.getByRole('alert')).toHaveText('제목을 입력해 주세요.')
    await form.getByLabel('제목').fill('알고리즘 스터디')
    await form.getByLabel(/^설명/).fill('매주 화요일 저녁, 세미나실')
    await form.getByLabel(/^정원/).fill('0')
    await form.getByRole('button', { name: '모임 열기' }).click()
    await expect(form.getByRole('alert')).toHaveText('정원은 1명에서 500명 사이로 적거나 비워 두세요.')
    await form.getByLabel(/^정원/).fill('8')
    await form.getByLabel(/^신청할 때 물어볼 것/).fill('하고 싶은 주제')
    await form.getByRole('button', { name: '모임 열기' }).click()
    await expect.poll(() => created).toEqual({ title: '알고리즘 스터디', description: '매주 화요일 저녁, 세미나실', capacity: 8, noteLabel: '하고 싶은 주제', closesAt: null })
    // Straight to the new gathering, which nobody has signed up to yet.
    await expect(page).toHaveURL(/\/gatherings\/7$/)
    await expect(page.getByRole('heading', { level: 1, name: '알고리즘 스터디' })).toBeVisible()
    await expect(page.getByText('아직 신청한 사람이 없습니다.')).toBeVisible()
  })

  test('a member signs up with an answer, changes it and cancels', async ({ page }) => {
    await asMember(page)
    let detail = { gathering: sheet(), participants: [person(1, '이영희')] }
    const sent = []
    await page.route('**/api/gatherings/7', route => route.fulfill({ json: detail }))
    await page.route('**/api/gatherings/7/signups', async route => {
      const { note } = route.request().postDataJSON()
      sent.push(note)
      detail = { gathering: sheet({ joined: true, participantCount: 2 }), participants: [person(1, '이영희'), person(2, '홍길동', { mine: true, note })] }
      await route.fulfill({ json: detail })
    })
    let left = false
    await page.route('**/api/gatherings/7/signups/me', async route => {
      left = true
      detail = { gathering: sheet(), participants: [person(1, '이영희')] }
      await route.fulfill({ json: detail })
    })

    await page.goto('/gatherings/7')
    await expect(page.getByRole('heading', { level: 1, name: '알고리즘 스터디' })).toBeVisible()
    await expect(page.getByText('김철수 님이 열었습니다')).toBeVisible()
    await expect(page.getByText('1 / 3명')).toBeVisible()
    // Someone who did not open it is not offered its management.
    await expect(page.getByRole('button', { name: /지금 마감|모임 지우기|명단 내보내기|빼기/ })).toHaveCount(0)

    const join = page.getByRole('form', { name: '신청하기' })
    await join.getByLabel('하고 싶은 주제').fill('그래프')
    await join.getByRole('button', { name: '신청하기' }).click()
    await expect(page.getByText('신청했습니다', { exact: true }).first()).toBeVisible()
    const people = page.getByRole('list', { name: '신청한 사람' }).getByRole('listitem')
    await expect(people).toHaveCount(2)
    await expect(people.nth(1)).toContainText('홍길동')
    await expect(people.nth(1)).toContainText('그래프')
    await expect(page.getByText('2 / 3명')).toBeVisible()

    // The answer can be changed while the gathering is open.
    const mine = page.getByRole('form', { name: '내 신청' })
    const fix = mine.getByRole('button', { name: '답 고치기' })
    await expect(fix).toBeDisabled()
    await mine.getByLabel('하고 싶은 주제').fill('DP')
    await fix.click()
    await expect(people.nth(1)).toContainText('DP')
    expect(sent).toEqual(['그래프', 'DP'])

    // Cancelling asks first, in words that cannot be read the wrong way round.
    await mine.getByRole('button', { name: '신청 취소' }).click()
    const confirm = page.getByRole('dialog', { name: '신청을 취소할까요?' })
    await confirm.getByRole('button', { name: '그대로 두기' }).click()
    expect(left).toBe(false)
    await mine.getByRole('button', { name: '신청 취소' }).click()
    await confirm.getByRole('button', { name: '신청 취소' }).click()
    await expect.poll(() => left).toBe(true)
    await expect(people).toHaveCount(1)
    await expect(page.getByRole('form', { name: '신청하기' })).toBeVisible()
  })

  test('a full or closed gathering takes nobody', async ({ page }) => {
    await asMember(page)
    await page.route('**/api/gatherings/7', route => route.fulfill({ json: { gathering: sheet({ full: true, participantCount: 3 }), participants: [person(1, '이영희'), person(2, '박민수'), person(3, '최가람')] } }))
    await page.route('**/api/gatherings/8', route => route.fulfill({ json: { gathering: sheet({ id: 8, open: false, joined: true, closesAt: '2026-10-10T18:00:00' }), participants: [person(4, '홍길동', { mine: true, note: '그래프' })] } }))

    await page.goto('/gatherings/7')
    await expect(page.getByText('정원이 찼습니다. 자리가 나면 신청할 수 있습니다.')).toBeVisible()
    await expect(page.getByRole('button', { name: '신청하기' })).toHaveCount(0)

    await page.goto('/gatherings/8')
    await expect(page.getByText('신청한 채로 마감되었습니다.')).toBeVisible()
    await expect(page.getByText('10월 10일 18:00 마감')).toBeVisible()
    await expect(page.getByRole('button', { name: /신청하기|신청 취소|답 고치기/ })).toHaveCount(0)
  })

  test('whoever opened a gathering reads the answers, exports the list, takes a name off, closes and deletes it', async ({ page }) => {
    await asMember(page)
    const mineSheet = (over = {}) => sheet({ creatorName: '홍길동', mine: true, canManage: true, participantCount: 2, ...over })
    let detail = { gathering: mineSheet(), participants: [person(1, '이영희', { note: '그래프' }), person(2, '박민수', { note: 'DP', signedUpAt: '2026-10-13T08:00:00' })] }
    const calls = []
    await page.route('**/api/gatherings', route => route.fulfill({ json: [] }))
    await page.route('**/api/gatherings/7', async route => {
      if (route.request().method() === 'DELETE') {
        calls.push('delete')
        return route.fulfill({ status: 204 })
      }
      await route.fulfill({ json: detail })
    })
    await page.route('**/api/gatherings/7/signups/2', async route => {
      calls.push('remove 2')
      detail = { gathering: mineSheet({ participantCount: 1 }), participants: [detail.participants[0]] }
      await route.fulfill({ json: detail })
    })
    await page.route('**/api/gatherings/7/close', async route => {
      calls.push('close')
      detail = { gathering: mineSheet({ participantCount: 1, open: false }), participants: detail.participants }
      await route.fulfill({ json: detail })
    })

    await page.goto('/gatherings/7')
    const people = page.getByRole('list', { name: '신청한 사람' }).getByRole('listitem')
    await expect(people).toHaveText([/이영희.*그래프/, /박민수.*DP/])

    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: '명단 내보내기' }).click()
    const download = await downloading
    expect(download.suggestedFilename()).toMatch(/^coms-gathering-7-\d{4}-\d{2}-\d{2}\.csv$/)
    const chunks = []
    for await (const chunk of await download.createReadStream()) chunks.push(chunk)
    const text = Buffer.concat(chunks).toString('utf8')
    expect(text.charCodeAt(0)).toBe(0xfeff)
    expect(text.slice(1).split('\r\n')).toEqual([
      '"순서","이름","하고 싶은 주제","신청 시각"',
      '"1","이영희","그래프","10월 12일 19:05"',
      '"2","박민수","DP","10월 13일 08:00"',
      '',
    ])

    await page.getByRole('button', { name: '박민수 님을 명단에서 빼기' }).click()
    await page.getByRole('dialog', { name: '박민수 님을 명단에서 뺄까요?' }).getByRole('button', { name: '확인' }).click()
    await expect(people).toHaveCount(1)

    await page.getByRole('button', { name: '지금 마감' }).click()
    await page.getByRole('dialog', { name: /지금 마감할까요/ }).getByRole('button', { name: '확인' }).click()
    await expect(page.getByText('마감되었습니다.')).toBeVisible()
    await expect(page.getByRole('button', { name: '지금 마감' })).toHaveCount(0)

    await page.getByRole('button', { name: '모임 지우기' }).click()
    await page.getByRole('dialog', { name: /"알고리즘 스터디" 모임과 1명의 신청을 지울까요/ }).getByRole('button', { name: '확인' }).click()
    await expect(page).toHaveURL(/\/gatherings$/)
    expect(calls).toEqual(['remove 2', 'close', 'delete'])
  })

  test('a guest sees the members-only guide', async ({ page }) => {
    const requests = trackRequests(page, /\/api\/gatherings/)
    await page.goto('/gatherings/7')
    await expectMembersGate(page, '/gatherings/7')
    await expect(page.getByRole('heading', { name: '모임 신청' })).toHaveCount(0)
    expect(requests).toEqual([])
  })
})

// Attendance ("출석 체크"): a member checks in with the code on the screen; whoever runs the
// check opens it, shows the code, sees who came and closes it. The people are made up.
test('a member checks in to attendance with the code', async ({ page }) => {
  await mockAdminApis(page)
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 5, studentId: '2023000002', name: '홍길동', role: 'USER', emailVerified: true } }))
  await page.route('**/api/permissions/me', route => route.fulfill({ json: { role: 'USER', permissions: [] } }))
  let sessions = [{ id: 3, title: '웹 세미나 3주차', openedByName: '운영진', openedAt: '2026-10-12T19:00:00', closesAt: '2026-10-12T19:30:00', open: true, remainingSeconds: 1500, attendeeCount: 4, attended: false, code: null }]
  const tries = []
  await page.route('**/api/attendance/sessions', route => route.fulfill({ json: sessions }))
  await page.route('**/api/attendance/check-in', async route => {
    const { code } = route.request().postDataJSON()
    tries.push(code)
    if (code !== '4821') return route.fulfill({ status: 404, json: { message: '코드가 맞지 않거나 출석이 마감되었습니다.' } })
    sessions = [{ ...sessions[0], attended: true, attendeeCount: 5 }]
    await route.fulfill({ json: { sessionId: 3, title: '웹 세미나 3주차', checkedAt: '2026-10-12T19:05:00', alreadyChecked: false } })
  })

  await page.goto('/attendance')
  await expect(page.getByRole('heading', { level: 1, name: '출석 체크' })).toBeVisible()
  await expect(page.getByText('아직 출석한 기록이 없습니다.')).toBeVisible()
  // A member is not offered the tools for running a check.
  await expect(page.getByRole('heading', { name: '출석 진행' })).toHaveCount(0)
  // What can be checked in to right now is named, without its code.
  const openNow = page.getByRole('list', { name: '지금 받고 있는 출석' }).getByRole('listitem')
  await expect(openNow).toHaveCount(1)
  await expect(openNow).toContainText('웹 세미나 3주차')
  await expect(openNow).toContainText('받는 중')

  const form = page.getByRole('form', { name: '출석하기' })
  const code = form.getByLabel('출석 코드')
  const submit = form.getByRole('button', { name: '출석하기' })
  await expect(submit).toBeDisabled()
  // The box keeps digits only, four at most.
  await code.fill('코드 12 34 5')
  await expect(code).toHaveValue('1234')
  await submit.click()
  await expect(form.getByRole('status')).toHaveText('코드가 맞지 않거나 출석이 마감되었습니다.')

  await code.fill('4821')
  await submit.click()
  await expect(form.getByRole('status')).toHaveText('"웹 세미나 3주차" 출석이 기록되었습니다.')
  await expect(code).toHaveValue('')
  expect(tries).toEqual(['1234', '4821'])
  await expect(openNow).toContainText('출석 완료')
  await expect(page.getByRole('heading', { name: /내 출석 1회/ })).toBeVisible()
  await expect(page.getByRole('list', { name: '내 출석 기록' }).getByRole('listitem')).toHaveText([/웹 세미나 3주차/])
})

test('a member is told when no attendance is being taken', async ({ page }) => {
  await mockAdminApis(page)
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 5, studentId: '2023000002', name: '홍길동', role: 'USER', emailVerified: true } }))
  await page.route('**/api/permissions/me', route => route.fulfill({ json: { role: 'USER', permissions: [] } }))
  await page.route('**/api/attendance/sessions', route => route.fulfill({ json: [] }))
  await page.goto('/attendance')
  await expect(page.getByText('지금 받고 있는 출석이 없습니다.')).toBeVisible()
  await expect(page.getByRole('list', { name: '지금 받고 있는 출석' })).toHaveCount(0)
})

test('whoever runs attendance opens a check, shows the code, sees who came and closes it', async ({ page }) => {
  await mockAdminApis(page)
  let sessions = [{ id: 2, title: '지난 세미나', openedByName: '관리자', openedAt: '2026-10-05T19:00:00', closesAt: '2026-10-05T19:30:00', open: false, remainingSeconds: 0, attendeeCount: 7, attended: true, code: null }]
  let opened = null
  let closedId = null
  const local = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19)
  await page.route('**/api/attendance/sessions', async route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: sessions })
    opened = route.request().postDataJSON()
    // The viewer's clock plays no part: closesAt is long past, the seconds left are what count.
    const session = { id: 3, title: opened.title, openedByName: '관리자', openedAt: local(new Date()), closesAt: '2020-01-01T00:00:00', open: true, remainingSeconds: opened.minutes * 60, attendeeCount: 0, attended: false, code: '4821' }
    sessions = [session, ...sessions]
    await route.fulfill({ status: 201, json: session })
  })
  await page.route('**/api/attendance/sessions/3', route => route.fulfill({ json: { session: sessions[0], attendees: [{ name: '홍길동', checkedAt: local(new Date()) }, { name: '김철수', checkedAt: local(new Date()) }] } }))
  await page.route('**/api/attendance/sessions/3/close', async route => {
    closedId = 3
    sessions = sessions.map((session) => (session.id === 3 ? { ...session, open: false, remainingSeconds: 0, code: null, attendeeCount: 2 } : session))
    await route.fulfill({ json: sessions[0] })
  })

  await page.goto('/attendance')
  await expect(page.getByRole('heading', { name: '출석 진행' })).toBeVisible()
  const form = page.getByRole('form', { name: '출석 열기' })
  await form.getByRole('button', { name: '출석 열기' }).click()
  await expect(page.getByRole('alert')).toHaveText('출석 이름을 입력해 주세요.')
  await form.getByLabel('출석 이름').fill('웹 세미나 3주차')
  await form.getByLabel('받는 시간').selectOption('20')
  await form.getByRole('button', { name: '출석 열기' }).click()
  await expect.poll(() => opened).toEqual({ title: '웹 세미나 3주차', minutes: 20 })

  // The code, large, with the time left counting down from what the server said.
  await expect(page.getByLabel('출석 코드 4 8 2 1')).toHaveText('4821')
  await expect(page.getByText(/남은 시간 (19:5\d|20:00)/)).toBeVisible()

  await page.getByRole('button', { name: '명단 보기' }).click()
  const roster = page.getByRole('region', { name: '출석한 사람' })
  await expect(roster).toContainText('웹 세미나 3주차 · 2명')
  await expect(roster.getByRole('listitem')).toHaveText(['홍길동', '김철수'])

  await page.getByRole('button', { name: '지금 마감' }).click()
  await expect.poll(() => closedId).toBe(3)
  await expect(page.getByLabel('출석 코드 4 8 2 1')).toHaveCount(0)
  const past = page.getByRole('list', { name: '지난 출석' }).getByRole('listitem')
  await expect(past).toHaveCount(2)
  await expect(past.first()).toContainText('웹 세미나 3주차')
  await expect(past.first()).toContainText('2명')
})

test('an open attendance check can fill the screen for a projector', async ({ page }) => {
  // The Fullscreen API is replaced by a stand-in that records the element: whether a headless
  // browser grants real fullscreen differs, and the card's own behaviour is what is pinned here.
  await page.addInitScript(() => {
    let current = null
    const changed = () => document.dispatchEvent(new Event('fullscreenchange'))
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', { configurable: true, get: () => true })
    Object.defineProperty(Document.prototype, 'fullscreenElement', { configurable: true, get: () => current })
    Element.prototype.requestFullscreen = function requestFullscreen() { current = this; changed(); return Promise.resolve() }
    Document.prototype.exitFullscreen = function exitFullscreen() { current = null; changed(); return Promise.resolve() }
  })
  await mockAdminApis(page)
  await page.route('**/api/attendance/sessions', route => route.fulfill({
    json: [{ id: 3, title: '웹 세미나 3주차', openedByName: '관리자', openedAt: '2026-10-12T19:00:00', closesAt: '2026-10-12T19:30:00', open: true, remainingSeconds: 900, attendeeCount: 12, attended: false, code: '4821' }],
  }))

  await page.goto('/attendance')
  const card = page.getByRole('listitem').filter({ has: page.getByLabel('출석 코드 4 8 2 1') })
  await expect(card).toContainText('12명')
  await card.getByRole('button', { name: '크게 보기' }).click()
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.className ?? '')).toContain('coms-attend-live')
  // The list of who came opens below the card, so it is not offered while the card fills the screen.
  await expect(card.getByRole('button', { name: '명단 보기' })).toHaveCount(0)
  await expect(card.getByRole('button', { name: '지금 마감' })).toBeVisible()
  await card.getByRole('button', { name: '작게 보기' }).click()
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true)
  await expect(card.getByRole('button', { name: '명단 보기' })).toBeVisible()
})

test('whoever runs attendance sees how often each member came and exports it', async ({ page }) => {
  await mockAdminApis(page)
  const past = (id, title, openedAt, attendeeCount) => ({ id, title, openedByName: '관리자', openedAt, closesAt: openedAt, open: false, remainingSeconds: 0, attendeeCount, attended: false, code: null })
  await page.route('**/api/attendance/sessions', route => route.fulfill({
    json: [past(3, '웹 세미나 3주차', '2026-10-12T19:00:00', 2), past(2, '알고리즘 스터디', '2026-10-05T19:00:00', 2), past(1, '개강 총회', '2026-09-02T18:00:00', 2)],
  }))
  let summaryRequests = 0
  await page.route('**/api/attendance/summary', route => {
    summaryRequests += 1
    return route.fulfill({
      json: {
        sessions: [
          { id: 3, title: '웹 세미나 3주차', openedAt: '2026-10-12T19:00:00', attendeeCount: 2 },
          { id: 2, title: '알고리즘 스터디', openedAt: '2026-10-05T19:00:00', attendeeCount: 2 },
          { id: 1, title: '개강 총회', openedAt: '2026-09-02T18:00:00', attendeeCount: 2 },
        ],
        members: [
          { name: '홍길동', count: 3, sessionIds: [1, 2, 3] },
          { name: '김철수', count: 2, sessionIds: [1, 3] },
          { name: '이영희', count: 1, sessionIds: [2] },
        ],
      },
    })
  })

  await page.goto('/attendance')
  await expect(page.getByRole('heading', { name: '출석 현황' })).toBeVisible()
  // The summary is asked for when it is opened, not with the page.
  expect(summaryRequests).toBe(0)
  await page.getByRole('button', { name: '현황 보기' }).click()
  const summary = page.getByRole('region', { name: '출석 현황' })
  const rows = summary.getByRole('row')
  await expect(rows).toHaveCount(4)
  await expect(rows.nth(1)).toContainText('홍길동')
  await expect(rows.nth(1)).toContainText('3회')
  await expect(rows.nth(1).getByRole('img', { name: '최근 3회 중 3회 출석' })).toBeVisible()
  await expect(rows.nth(3)).toContainText('이영희')
  await expect(rows.nth(3).getByRole('img', { name: '최근 3회 중 1회 출석' })).toBeVisible()

  // Ordered by a column, and narrowed by name.
  await summary.getByRole('button', { name: '이름' }).click()
  await expect(rows.nth(1)).toContainText('김철수')
  await expect(rows.nth(3)).toContainText('홍길동')
  const search = summary.getByRole('searchbox', { name: '출석 현황에서 이름으로 찾기' })
  await search.fill('없는사람')
  await expect(summary.getByText('찾는 이름이 없습니다.')).toBeVisible()
  await expect(summary.getByRole('button', { name: 'CSV 내보내기' })).toBeDisabled()
  await search.fill('영희')
  await expect(rows).toHaveCount(2)
  await expect(summary.getByRole('status')).toHaveText('3명 중 1명')
  await search.fill('')
  await expect(rows).toHaveCount(4)

  // The file holds what the table shows, in its order: checks oldest to newest, left to right.
  const downloading = page.waitForEvent('download')
  await summary.getByRole('button', { name: 'CSV 내보내기' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toMatch(/^coms-attendance-\d{4}-\d{2}-\d{2}\.csv$/)
  const chunks = []
  for await (const chunk of await download.createReadStream()) chunks.push(chunk)
  const text = Buffer.concat(chunks).toString('utf8')
  expect(text.charCodeAt(0)).toBe(0xfeff)
  expect(text.slice(1).split('\r\n')).toEqual([
    '"이름","출석 횟수","9/2 개강 총회","10/5 알고리즘 스터디","10/12 웹 세미나 3주차"',
    '"김철수","2","O","","O"',
    '"이영희","1","","O",""',
    '"홍길동","3","O","O","O"',
    '',
  ])

  await page.getByRole('button', { name: '현황 닫기' }).click()
  await expect(summary).toHaveCount(0)
})

test('guest visiting attendance sees the members-only guide', async ({ page }) => {
  const requests = trackRequests(page, /\/api\/attendance/)
  await page.goto('/attendance')
  await expectMembersGate(page, '/attendance')
  await expect(page.getByRole('heading', { name: '출석 체크' })).toHaveCount(0)
  expect(requests).toEqual([])
})

// Meeting polls ("일정 조율"): open one from the list, paint free time with the mouse, the
// keyboard and a day heading, save it, and read the overlap back. The people are made up.
test('a member paints free time on a meeting poll and saves it', async ({ page }) => {
  await mockAdminApis(page)
  // Two days, 10:00 to 12:00: four half hours a day, eight slots in all.
  const poll = { id: 7, title: '웹 스터디 첫 모임', description: '동아리방에서 모입니다.', creatorName: '홍길동', mine: false, canDelete: false, dates: ['2026-10-14', '2026-10-15'], startMinute: 600, endMinute: 720, slotMinutes: 30, createdAt: '2026-10-12T10:00:00', participantCount: 1, answered: false }
  let participants = [{ name: '홍길동', mine: false, slots: '11000011' }]
  const saved = []
  const detail = () => ({ poll: { ...poll, participantCount: participants.length, answered: participants.some((p) => p.mine) }, participants })
  await page.route('**/api/meeting-polls', route => route.fulfill({ json: [detail().poll] }))
  await page.route('**/api/meeting-polls/7', route => route.fulfill({ json: detail() }))
  await page.route('**/api/meeting-polls/7/availability', async route => {
    expect(route.request().method()).toBe('PUT')
    const { slots } = route.request().postDataJSON()
    saved.push(slots)
    participants = [participants[0], { name: '관리자', mine: true, slots }]
    await route.fulfill({ json: detail() })
  })

  await page.goto('/meet')
  await expect(page.getByRole('heading', { level: 1, name: '일정 조율' })).toBeVisible()
  await page.getByRole('button', { name: /웹 스터디 첫 모임/ }).click()
  await expect(page).toHaveURL(/\/meet\/7$/)
  await expect(page.getByRole('heading', { level: 1, name: '웹 스터디 첫 모임' })).toBeVisible()

  const mine = page.getByRole('table', { name: '내 가능 시간' })
  const everyone = page.getByRole('table', { name: '모두의 가능 시간' })
  const myCell = (day, slot) => mine.locator(`[data-cell="${day}-${slot}"]`)

  // One click of the mouse paints one cell, once.
  await myCell(0, 0).click()
  await expect(myCell(0, 0)).toHaveAttribute('aria-pressed', 'true')
  // The keyboard toggles a cell and the arrow keys move between cells.
  await myCell(0, 1).focus()
  await page.keyboard.press('Enter')
  await expect(myCell(0, 1)).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('ArrowDown')
  await expect(myCell(0, 2)).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(myCell(1, 2)).toBeFocused()
  // A day's heading fills the whole day.
  await page.getByRole('button', { name: '10월 15일 (목) 전체 바꾸기' }).click()
  await expect(mine.locator('[aria-pressed="true"]')).toHaveCount(6)
  await expect(page.getByText('저장하지 않은 변경이 있습니다.')).toBeVisible()

  // The overlap follows what is being painted, before it is saved.
  await expect(everyone.locator('[data-cell="0-0"]')).toHaveAccessibleName(/2명 중 2명 가능/)
  await expect(everyone.locator('[data-cell="0-2"]')).toHaveAccessibleName(/2명 중 0명 가능/)

  await page.getByRole('button', { name: '내 시간 저장' }).click()
  await expect.poll(() => saved).toEqual(['11001111'])
  await expect(page.getByRole('button', { name: '저장됨' })).toBeDisabled()
  await expect(page.getByText('저장하지 않은 변경이 있습니다.')).toBeHidden()

  // Who can make a slot, and the stretches the most people can make.
  await everyone.locator('[data-cell="1-3"]').click()
  await expect(page.locator('.coms-meet-info')).toContainText('2명 중 2명 가능')
  await expect(page.locator('.coms-meet-info')).toContainText('홍길동, 관리자')
  const best = page.locator('ol li')
  await expect(best.first()).toContainText('10월 14일 (수)')
  await expect(best.first()).toContainText('10:00 ~ 11:00')
  await expect(best.first()).toContainText('2명 모두 가능')
  await expect(best.nth(1)).toContainText('10월 15일 (목)')
  await expect(best.nth(1)).toContainText('11:00 ~ 12:00')
})

test('a new meeting poll is sent with its dates and time window', async ({ page }) => {
  await mockAdminApis(page)
  let created = null
  await page.route('**/api/meeting-polls', async route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: [] })
    created = route.request().postDataJSON()
    await route.fulfill({ status: 201, json: { poll: { id: 9, title: created.title, description: '', creatorName: '관리자', mine: true, canDelete: true, dates: created.dates, startMinute: created.startMinute, endMinute: created.endMinute, slotMinutes: 30, participantCount: 0, answered: false }, participants: [] } })
  })
  await page.route('**/api/meeting-polls/9', route => route.fulfill({ json: { poll: { id: 9, title: created.title, description: '', creatorName: '관리자', mine: true, canDelete: true, dates: created.dates, startMinute: created.startMinute, endMinute: created.endMinute, slotMinutes: 30, participantCount: 0, answered: false }, participants: [] } }))

  await page.goto('/meet')
  await expect(page.getByText('아직 열린 일정 조율이 없습니다.')).toBeVisible()
  await page.getByRole('button', { name: '새 일정 조율' }).click()
  const form = page.getByRole('form', { name: '새 일정 조율' })

  // Nothing is sent until the form is complete.
  await form.getByRole('button', { name: '만들기' }).click()
  await expect(form.getByRole('alert')).toHaveText('제목을 입력해 주세요.')
  await form.getByLabel('제목').fill('알고리즘 스터디')
  await form.getByRole('button', { name: '만들기' }).click()
  await expect(form.getByRole('alert')).toHaveText('날짜를 하나 이상 골라 주세요.')
  expect(created).toBeNull()

  // Next month, so the days are selectable whatever today is.
  await form.getByRole('button', { name: '다음 달' }).click()
  const days = form.locator('.coms-meet-day:not(:disabled)')
  await days.nth(2).click()
  await days.nth(0).click()
  await expect(form.locator('.coms-meet-day[aria-pressed="true"]')).toHaveCount(2)
  await form.getByLabel('하루 중 시작').selectOption('840')
  await form.getByLabel('하루 중 끝').selectOption('1080')
  await form.getByRole('button', { name: '만들기' }).click()

  await expect(page).toHaveURL(/\/meet\/9$/)
  expect(created.title).toBe('알고리즘 스터디')
  expect(created.startMinute).toBe(840)
  expect(created.endMinute).toBe(1080)
  expect(created.dates).toHaveLength(2)
  // Sent in date order although they were picked the other way round.
  expect([...created.dates].sort()).toEqual(created.dates)
  await expect(page.getByRole('table', { name: '내 가능 시간' }).locator('[data-cell]')).toHaveCount(16)
})

test('guest visiting the meeting polls sees the members-only guide', async ({ page }) => {
  const requests = trackRequests(page, /\/api\/meeting-polls/)
  await page.goto('/meet')
  await expectMembersGate(page, '/meet')
  expect(requests).toEqual([])
})

test('a best time of a meeting poll can be put on the club calendar by whoever may write to it', async ({ page }) => {
  await mockAdminApis(page)
  const poll = { id: 7, title: '웹 스터디 첫 모임', description: '', creatorName: '홍길동', mine: false, canDelete: false, dates: ['2026-10-14'], startMinute: 600, endMinute: 720, slotMinutes: 30, participantCount: 2, answered: false }
  const participants = [{ name: '홍길동', mine: false, slots: '1100' }, { name: '김철수', mine: false, slots: '1110' }]
  await page.route('**/api/meeting-polls/7', route => route.fulfill({ json: { poll, participants } }))
  let registered = null
  await page.route('**/api/club-activities', async route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: [] })
    registered = route.request().postData()
    await route.fulfill({ status: 201, json: { id: 99, kind: 'SCHEDULE', title: poll.title, eventDate: '2026-10-14' } })
  })
  await autoDriveModals(page)

  await page.goto('/meet/7')
  // The stretch both can make comes first.
  await page.getByRole('button', { name: '10월 14일 (수) 10:00 캘린더에 등록' }).click()
  await expect.poll(() => registered).not.toBeNull()
  expect(multipartField(registered, 'kind')).toBe('SCHEDULE')
  expect(multipartField(registered, 'title')).toBe('웹 스터디 첫 모임')
  expect(multipartField(registered, 'eventDate')).toBe('2026-10-14')
  expect(multipartField(registered, 'startTime')).toBe('10:00')
  expect(multipartField(registered, 'endTime')).toBe('11:00')
  await expect(page.getByText('캘린더에 등록했습니다.')).toBeVisible()
})

test('a member without calendar rights is not offered the calendar button', async ({ page }) => {
  await mockAdminApis(page)
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 5, studentId: '2023000002', name: '홍길동', role: 'USER', emailVerified: true } }))
  await page.route('**/api/permissions/me', route => route.fulfill({ json: { role: 'USER', permissions: [] } }))
  const poll = { id: 7, title: '웹 스터디 첫 모임', description: '', creatorName: '김철수', mine: false, canDelete: false, dates: ['2026-10-14'], startMinute: 600, endMinute: 720, slotMinutes: 30, participantCount: 1, answered: false }
  await page.route('**/api/meeting-polls/7', route => route.fulfill({ json: { poll, participants: [{ name: '김철수', mine: false, slots: '1110' }] } }))

  await page.goto('/meet/7')
  await expect(page.getByRole('heading', { level: 1, name: '웹 스터디 첫 모임' })).toBeVisible()
  await expect(page.locator('ol li').first()).toContainText('10:00 ~ 11:30')
  await expect(page.getByRole('button', { name: /캘린더에 등록/ })).toHaveCount(0)
})

// A throwaway glass element (Tailwind's backdrop-blur-md, as the Login/Sponsors panels use).
const glassBlur = async (page) => page.evaluate(() => {
  const el = document.createElement('div')
  el.className = 'backdrop-blur-md'
  document.body.append(el)
  const value = getComputedStyle(el).backdropFilter
  el.remove()
  return value
})

test.describe('lite rendering mode', () => {
  test('forcing lite sets data-perf and drops the glass blur', async ({ page }) => {
    await mockOptionalApis(page)
    await page.addInitScript(() => {
      window.sessionStorage.setItem('coms.intro.played:v1', '1')
      window.localStorage.setItem('kwcoms-perf-mode:v1', 'lite')
    })
    await page.goto('/activities')
    await expect(page.locator('html')).toHaveAttribute('data-perf', 'lite')
    expect(await glassBlur(page)).toBe('none')
    // Auto chose nothing here, so the "we switched" notice stays away.
    await expect(page.getByText('가벼운 화면으로 바꿨어요')).toHaveCount(0)
  })

  test('the screen-effects setting switches the look live and is remembered', async ({ page }) => {
    await mockOptionalApis(page)
    await page.addInitScript(() => window.sessionStorage.setItem('coms.intro.played:v1', '1'))
    await page.goto('/activities')
    await expect(page.locator('html')).toHaveAttribute('data-perf', 'full')
    expect(await glassBlur(page)).toContain('blur')

    await openAppearance(page)
    const group = page.getByRole('radiogroup', { name: '화면 효과' })
    await group.getByRole('radio', { name: '가볍게' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-perf', 'lite')
    await expect(group.getByRole('radio', { name: '가볍게' })).toHaveAttribute('aria-checked', 'true')
    expect(await glassBlur(page)).toBe('none')

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-perf', 'lite')
    await openAppearance(page)

    // Roving tabindex: only the chosen option is a tab stop, arrows move and apply.
    const lite = group.getByRole('radio', { name: '가볍게' })
    await expect(lite).toHaveAttribute('tabindex', '0')
    await expect(group.getByRole('radio', { name: '자동' })).toHaveAttribute('tabindex', '-1')
    await lite.focus()
    await page.keyboard.press('ArrowRight')
    await expect(group.getByRole('radio', { name: '화려하게' })).toBeFocused()
    await expect(page.locator('html')).toHaveAttribute('data-perf', 'full')
    await page.keyboard.press('ArrowLeft')
    await expect(page.locator('html')).toHaveAttribute('data-perf', 'lite')
    await group.getByRole('radio', { name: '화려하게' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-perf', 'full')
    expect(await glassBlur(page)).toContain('blur')
  })

  test('auto without graphics acceleration picks lite and tells the visitor once', async ({ page }) => {
    await mockOptionalApis(page)
    await page.addInitScript(() => {
      window.sessionStorage.setItem('coms.intro.played:v1', '1')
      window.localStorage.setItem('kwcoms-perf-mode:v1', 'auto')
      // A browser that cannot give a hardware WebGL context.
      const real = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (type, opts) {
        return type === 'webgl' && opts?.failIfMajorPerformanceCaveat ? null : real.call(this, type, opts)
      }
    })
    await page.goto('/activities')
    await expect(page.locator('html')).toHaveAttribute('data-perf', 'lite')
    const notice = page.locator('.coms-perf-notice').filter({ hasText: '가벼운 화면으로 바꿨어요' })
    await expect(notice).toBeVisible()
    await notice.getByRole('button', { name: '확인' }).click()
    await expect(notice).toHaveCount(0)
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-perf', 'lite')
    await expect(page.getByText('가벼운 화면으로 바꿨어요')).toHaveCount(0)
  })
})

// /study/arduino draws each wiring table as an interactive circuit (separate chunk, loaded when the page has one).
test.describe('arduino study circuits', () => {
  // The study is for members; the file-wide beforeEach signs nobody in.
  test.beforeEach(async ({ page }) => { await asMember(page) })
  const circuit = (page, id) => page.locator(`figure.circuit[data-circuit="${id}"]`)
  // The real site-wide screen-effects setting (perfMode.ts, in the footer): it sets <html data-perf> while the page is open.
  const setPerf = async (page, mode) => {
    await openAppearance(page)
    await page.getByRole('radiogroup', { name: '화면 효과' }).getByRole('radio', { name: mode === 'lite' ? '가볍게' : '화려하게' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-perf', mode)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: '화면 설정' })).toHaveCount(0)
  }

  test('the LED blink simulation toggles the LED like the sketch', async ({ page }) => {
    await page.goto('/study/arduino')
    const fig = circuit(page, 'led-blink')
    await fig.scrollIntoViewIfNeeded()
    await expect(fig).toHaveClass(/is-live/)
    await fig.getByRole('button', { name: '▶ 시뮬레이션' }).click()
    // delay(500) on, delay(500) off: both states show up within a few seconds
    await expect(fig).toHaveAttribute('data-led', 'on')
    await expect(fig).toHaveAttribute('data-led', 'off')
    await expect(fig).toHaveAttribute('data-led', 'on')
    await fig.getByRole('button', { name: '■ 정지' }).click()
    await expect(fig).toHaveAttribute('data-led', 'off')
    await expect(fig).toHaveAttribute('data-sim', 'off')
  })

  test('the potentiometer figure shows analogRead and the PWM duty', async ({ page }) => {
    await page.goto('/study/arduino')
    const fig = circuit(page, 'pot-led')
    await fig.scrollIntoViewIfNeeded()
    await expect(fig).toHaveClass(/is-live/)
    await fig.getByRole('button', { name: '▶ 시뮬레이션' }).click()
    await fig.getByRole('slider', { name: /가변저항 값/ }).fill('800')
    await expect(fig.locator('.circuit-status')).toContainText('analogRead(A0) = 800')
    await expect(fig.locator('.circuit-status')).toContainText('analogWrite(9, 199)') // map(800, 0, 1023, 0, 255) = 199
    await expect(fig).toHaveAttribute('data-led', 'on')
  })

  test('the button figure follows INPUT_PULLUP: pressed reads LOW and lights the LED', async ({ page }) => {
    await page.goto('/study/arduino')
    const fig = circuit(page, 'button-led')
    await fig.scrollIntoViewIfNeeded()
    await expect(fig).toHaveClass(/is-live/)
    await fig.getByRole('button', { name: '▶ 시뮬레이션' }).click()
    const key = fig.getByRole('button', { name: /택트 스위치/ })
    await key.focus()
    await page.keyboard.down('Space')
    await expect(fig.locator('.circuit-status')).toContainText('D2 = LOW')
    await expect(fig).toHaveAttribute('data-led', 'on')
    await page.keyboard.up('Space')
    await expect(fig.locator('.circuit-status')).toContainText('D2 = HIGH')
    await expect(fig).toHaveAttribute('data-led', 'off')
  })

  test('the CDS night light turns the LED on below the dark threshold, with hysteresis', async ({ page }) => {
    await page.goto('/study/arduino')
    const fig = circuit(page, 'cds-night')
    await fig.scrollIntoViewIfNeeded()
    await expect(fig).toHaveClass(/is-live/)
    await fig.getByRole('button', { name: '▶ 시뮬레이션' }).click()
    const light = fig.getByRole('slider', { name: /주변 밝기/ })
    await light.fill('100') // CDS 1 kohm -> analogRead 930
    await expect(fig.locator('.circuit-status')).toContainText('light = 930  LED OFF')
    await expect(fig).toHaveAttribute('data-led', 'off')
    await light.fill('0') // CDS 200 kohm -> analogRead about 49
    await expect(fig.locator('.circuit-status')).toContainText('LED ON')
    await expect(fig).toHaveAttribute('data-led', 'on')
  })

  test('the joystick figure prints the sketch line and the direction', async ({ page }) => {
    await page.goto('/study/arduino')
    const fig = circuit(page, 'joystick')
    await fig.scrollIntoViewIfNeeded()
    await expect(fig).toHaveClass(/is-live/)
    await fig.getByRole('button', { name: '▶ 시뮬레이션' }).click()
    await expect(fig.locator('.circuit-status')).toHaveText('X=512 Y=512 vx=0 SW=- -> CENTER')
    await fig.getByRole('slider', { name: /X축/ }).fill('118')
    await expect(fig.locator('.circuit-status')).toHaveText('X=118 Y=512 vx=-77 SW=- -> LEFT')
    await fig.getByRole('slider', { name: /X축/ }).fill('512')
    await fig.getByRole('slider', { name: /Y축/ }).fill('14')
    await expect(fig.locator('.circuit-status')).toContainText('-> UP')
    const sw = fig.getByRole('button', { name: /스틱 누르기/ })
    await sw.focus()
    await page.keyboard.down('Space')
    await expect(fig.locator('.circuit-status')).toContainText('SW=PRESSED')
    await page.keyboard.up('Space')
    await expect(fig.locator('.circuit-status')).toContainText('SW=-')
  })

  test('low-power mode starts flat and drops the SVG filters, live', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('kwcoms-perf-mode:v1', 'lite')) // the stored screen-effects choice
    await page.goto('/study/arduino')
    await expect(page.locator('html')).toHaveAttribute('data-perf', 'lite')
    const fig = circuit(page, 'led-blink')
    await fig.scrollIntoViewIfNeeded()
    await expect(fig).toHaveClass(/is-live/)
    await expect(fig.locator('svg.circuit-svg')).toHaveCount(1)
    await expect(fig.locator('.circuit-stage')).toHaveClass(/is-flat/)
    const filtered = () => fig.locator('.circuit-svg [filter]').evaluateAll((els) => els.filter((e) => getComputedStyle(e).filter !== 'none').length)
    expect(await filtered()).toBe(0)
    // back to the full mode: the tilt returns and filters are applied again
    await setPerf(page, 'full')
    await expect(fig.locator('.circuit-stage')).not.toHaveClass(/is-flat/)
    expect(await filtered()).toBeGreaterThan(0)
    // an explicit 평면/3D choice survives later mode flips
    await fig.getByRole('button', { name: '평면으로 보기' }).click()
    await expect(fig.locator('.circuit-stage')).toHaveClass(/is-flat/)
    await setPerf(page, 'lite')
    await setPerf(page, 'full')
    await expect(fig.locator('.circuit-stage')).toHaveClass(/is-flat/)
  })

  test('scenes are built only when their figure nears the viewport; the rest of each figure is there from the start', async ({ page }) => {
    await page.goto('/study/arduino')
    await expect(page.locator('figure.circuit[data-circuit]')).toHaveCount(14)
    await expect(page.locator('figure.circuit.is-live')).toHaveCount(14) // bar, controls, status line: all rendered at once
    expect(await page.locator('svg.circuit-svg').count(), 'no scene is drawn at the top of the page').toBe(0)
    const far = circuit(page, 'dc-motor')
    await expect(far.getByRole('button', { name: '▶ 시뮬레이션' })).toBeAttached()
    await expect(far.locator('svg.circuit-svg')).toHaveCount(0)
    await far.scrollIntoViewIfNeeded()
    await expect(far.locator('svg.circuit-svg')).toHaveCount(1)
    expect(await page.locator('svg.circuit-svg').count(), 'only the figures that were reached are built').toBeLessThan(14)
  })

  test('the sim clock stops while the figure is off screen and resumes afterwards', async ({ page }) => {
    await page.goto('/study/arduino')
    const fig = circuit(page, 'led-blink')
    await fig.scrollIntoViewIfNeeded()
    await expect(fig).toHaveClass(/is-live/)
    await fig.getByRole('button', { name: '▶ 시뮬레이션' }).click()
    await expect(fig).toHaveAttribute('data-led', 'on')
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await expect(fig).toHaveAttribute('data-offscreen', '')
    const frozen = await fig.getAttribute('data-led')
    await page.waitForTimeout(1300) // more than two blink periods
    expect(await fig.getAttribute('data-led')).toBe(frozen)
    await fig.scrollIntoViewIfNeeded()
    await expect(fig).not.toHaveAttribute('data-offscreen', '')
    await expect(fig).toHaveAttribute('data-led', frozen === 'on' ? 'off' : 'on')
  })

  // Building a scene must never move anything: the stage box has its final size (the scene's viewBox) before the SVG exists.
  for (const view of [
    { name: '375px', width: 375 }, { name: '768px', width: 768 }, { name: '1024px', width: 1024 }, { name: '1280px', width: 1280 }, { name: '1440px', width: 1440 },
    { name: '125% text size', width: 1024, fontSize: '125%' },
  ]) {
    for (const anchoring of ['native scroll anchoring', 'no scroll anchoring']) {
      test(`scrolling up through figures moves nothing: ${view.name}, ${anchoring}`, async ({ page }) => {
        await page.setViewportSize({ width: view.width, height: 800 })
        await page.goto('/study/arduino')
        await expect(page.locator('figure.circuit.is-live')).toHaveCount(14)
        await siteFontLoaded(page) // the swap (a caption can still re-wrap once on it) is not what this measures, so it lands first
        if (anchoring === 'no scroll anchoring') await page.addStyleTag({ content: 'html, body, * { overflow-anchor: none !important; }' })
        if (view.fontSize) await page.evaluate((fs) => { document.documentElement.style.fontSize = fs }, view.fontSize)
        await page.waitForTimeout(200)
        expect(await page.locator('svg.circuit-svg').count()).toBe(0)
        const heights = () => page.evaluate(() => [...document.querySelectorAll('figure.circuit')].map((f) => f.getBoundingClientRect().height))
        const before = await heights()
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
        await page.waitForTimeout(300)
        const probe = () => page.evaluate(() => ({ top: document.querySelector('#next h2').getBoundingClientRect().top, y: window.scrollY }))
        const start = await probe()
        let steps = 0
        for (let y = start.y; y > 0 && steps < 150; steps += 1) {
          await page.evaluate(() => window.scrollBy(0, -700))
          await page.waitForTimeout(70)
          const now = await probe()
          expect(Math.abs(now.top - (start.top + (start.y - now.y))), `probe drift at scroll ${Math.round(now.y)}`).toBeLessThanOrEqual(1)
          y = now.y
        }
        await page.waitForTimeout(200)
        const after = await heights()
        expect(await page.locator('svg.circuit-svg').count(), 'every figure was reached and built').toBe(14)
        after.forEach((h, i) => expect(Math.abs(h - before[i]), `figure ${i} height before/after its scene was built`).toBeLessThanOrEqual(1))
      })
    }
  }

  // The circuit code is a separate chunk loaded after the page is shown. Holding it shows the page as a reader sees it
  // before any circuit script runs: every figure must already have its final height then (Safari has no scroll anchoring).
  const holdCircuitChunk = async (page) => {
    let release
    const gate = new Promise((resolve) => { release = resolve })
    await page.route('**/study-content-circuits-*.js', async (route) => { await gate; await route.continue() })
    return release
  }
  const noAnchoring = 'html, body, * { overflow-anchor: none !important; }'

  for (const how of ['deep link', 'table-of-contents jump']) {
    test(`a ${how} keeps its heading in place while the circuits come to life, without scroll anchoring`, async ({ page }) => {
      const release = await holdCircuitChunk(page)
      await page.goto(how === 'deep link' ? '/study/arduino#mod-motor' : '/study/arduino')
      await expect(page.locator('figure.circuit[data-circuit]')).toHaveCount(14)
      await siteFontLoaded(page) // the swap (a paragraph above can still re-wrap once on it: 28px on CI) is not what this measures, so it lands first
      await page.addStyleTag({ content: noAnchoring })
      // Chromium performs the #fragment scroll only once nothing is pending, i.e. after the held chunk; land on it as it would
      if (how === 'deep link') await page.evaluate(() => document.getElementById(location.hash.slice(1)).scrollIntoView())
      else await page.locator('nav.toc a[href="#mod-motor"]').click()
      const top = () => page.evaluate(() => document.getElementById('mod-motor').getBoundingClientRect().top)
      await expect.poll(top, { timeout: 8000 }).toBeLessThan(160)
      let last = await top()
      await expect.poll(async () => { const t = await top(); const still = Math.abs(t - last) < 0.5; last = t; return still }, { intervals: [150] }).toBe(true)
      expect(await page.locator('figure.circuit.is-live').count(), 'no circuit code has run yet').toBe(0)
      const above = await page.evaluate(() => [...document.querySelectorAll('figure.circuit')].filter((f) => f.getBoundingClientRect().bottom < 0).length)
      expect(above, 'the heading is below several figures').toBeGreaterThan(8)
      release()
      await expect(page.locator('figure.circuit.is-live')).toHaveCount(14)
      await page.waitForTimeout(400)
      expect(Math.abs((await top()) - last), 'the heading did not move').toBeLessThanOrEqual(1)
      await expect(page.locator('figure.circuit[data-circuit="dc-motor"] svg.circuit-svg')).toHaveCount(1) // the scene next to the heading was built meanwhile
    })
  }

  // Each figure's height comes from the page's markup and CSS alone: it is the same before the circuit code runs, after it
  // runs, with the scene built, while a sim runs, in flat and 3D view, in the stepper, and when the low-power mode flips.
  for (const view of [
    { name: '375px', width: 375 }, { name: '768px', width: 768 }, { name: '1024px', width: 1024 }, { name: '1280px', width: 1280 }, { name: '1440px', width: 1440 },
    { name: '125% text size', width: 1024, fontSize: '125%' },
  ]) {
    test(`every figure keeps one height from first paint through every state: ${view.name}`, async ({ page }) => {
      test.setTimeout(120_000)
      await page.setViewportSize({ width: view.width, height: 800 })
      await page.addInitScript((fontSize) => {
        // every height a figure's own rows (all of it but the prose caption) ever have, from the moment it is in the page.
        // The caption is left out: the fallback face is metric-matched to Pretendard, not identical, so when the site font
        // arrives a caption can still re-wrap by a line where its text sits on a wrap point (joystick at 375px, 22.75px, with WenQuanYi
        // and with Noto Sans CJK KR alike - re-checked: whole-figure heights from first paint fail only there)
        const seen = new WeakSet()
        window.__figureHeights = {}
        const rows = (f) => f.getBoundingClientRect().height - f.querySelector('figcaption').getBoundingClientRect().height
        const ro = new ResizeObserver((entries) => entries.forEach((e) => { (window.__figureHeights[e.target.dataset.circuit] ||= []).push(rows(e.target)) }))
        new MutationObserver(() => document.querySelectorAll('figure.circuit').forEach((f) => { if (!seen.has(f)) { seen.add(f); ro.observe(f) } }))
          .observe(document, { childList: true, subtree: true })
        if (fontSize) new MutationObserver((_m, o) => { if (document.documentElement) { document.documentElement.style.fontSize = fontSize; o.disconnect() } }).observe(document, { childList: true })
      }, view.fontSize || '')
      const release = await holdCircuitChunk(page)
      await page.goto('/study/arduino')
      await expect(page.locator('figure.circuit[data-circuit]')).toHaveCount(14)
      await siteFontLoaded(page)
      await page.waitForTimeout(200)
      expect(await page.locator('figure.circuit.is-live').count(), 'no circuit code has run yet').toBe(0)
      // whole figures, caption included, from here on (the site font has settled)
      const heights = () => page.evaluate(() => [...document.querySelectorAll('figure.circuit')].map((f) => f.getBoundingClientRect().height))
      const first = await heights()
      const same = async (state) => (await heights()).forEach((h, i) => expect(Math.abs(h - first[i]), `figure ${i}: static vs ${state}`).toBeLessThanOrEqual(1))
      const perfFlip = async () => { // the site-wide low-power switch flips every figure to flat (and back) without touching it
        for (const mode of ['lite', 'full']) {
          await setPerf(page, mode)
          await page.waitForTimeout(100)
          await same(`${mode} mode`)
        }
      }

      release()
      await expect(page.locator('figure.circuit.is-live')).toHaveCount(14)
      await same('live, no scene')
      await perfFlip()

      // nothing a figure prints or shows may outgrow the room its static markup reserved
      const overflow = (fig) => fig.evaluate((f) => [f.querySelector('.circuit-bar'), f.querySelector('.circuit-status')]
        .filter((e) => e.scrollHeight > e.clientHeight + 1).map((e) => `${e.className}: ${e.textContent}`))
      const fits = async (fig, what) => expect(await overflow(fig), what).toEqual([])
      for (const fig of await page.locator('figure.circuit[data-circuit]').all()) {
        const id = await fig.getAttribute('data-circuit')
        await fig.scrollIntoViewIfNeeded()
        await expect(fig.locator('svg.circuit-svg')).toHaveCount(1)
        await fig.locator('.cb-play').click()
        await expect(fig).toHaveAttribute('data-sim', 'on')
        await fits(fig, `${id} running`)
        for (const slider of await fig.getByRole('slider').all()) {
          for (const v of [await slider.getAttribute('min'), await slider.getAttribute('max'), await slider.getAttribute('min')]) {
            await slider.fill(v)
            await fits(fig, `${id} slider at ${v}`)
          }
        }
        for (const b of await fig.locator('.cb-mode').all()) {
          await b.click()
          await page.waitForTimeout(150)
          await fits(fig, `${id} mode on`)
          await b.click()
        }
        if (id === 'button-led') {
          await fig.getByRole('button', { name: /택트 스위치/ }).focus()
          await page.keyboard.down('Space')
          await fits(fig, `${id} pressed`)
          await page.keyboard.up('Space')
        }
        if (['led-blink', 'buzzer', 'alarm'].includes(id)) {
          const alarmAt = id === 'alarm' ? fig.getByRole('slider') : null
          for (let i = 0; i < 12; i += 1) { // three seconds of the running sim (the alarm also walks through its three zones)
            if (alarmAt && i % 4 === 0) await alarmAt.fill(['5', '50', '150'][i / 4])
            await page.waitForTimeout(250)
            await fits(fig, `${id} after ${(i + 1) * 250} ms`)
          }
        }
        await fig.locator('.cb-view').click()
        await fig.locator('.cb-view').click()
        await fig.locator('.cb-steps').click()
        await expect(fig.locator('.circuit-stepper')).toBeVisible()
        await fits(fig, `${id} stepper`)
        await fig.locator('.cb-next').click()
        await fig.locator('.cb-all').click()
      }
      await same('scenes built, sims running, views and stepper toggled')
      await perfFlip()
      for (const fig of await page.locator('figure.circuit[data-circuit]').all()) if ((await fig.getAttribute('data-sim')) === 'on') await fig.locator('.cb-play').click()
      await same('sims stopped')
      const seen = await page.evaluate(() => window.__figureHeights)
      expect(Object.keys(seen)).toHaveLength(14)
      for (const [id, hs] of Object.entries(seen)) expect(Math.max(...hs) - Math.min(...hs), `${id}: its rows changed height at some point: ${hs.map(Math.round).join(', ')}`).toBeLessThanOrEqual(1)
    })
  }

  // A site font chosen in the footer (fontPreferences.ts) arrives with font-display: swap, after the figures are shown.
  // Text width must not decide how many rows the bar, the sliders or the status line take.
  for (const width of [375, 1280]) {
    test(`swapping to a wider font after load moves no figure row: ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/study/arduino')
      await expect(page.locator('figure.circuit.is-live')).toHaveCount(14)
      // the figure without its caption (the caption is prose and reflows with the font like every paragraph)
      const rows = () => page.evaluate(() => [...document.querySelectorAll('figure.circuit')].map((f) => f.getBoundingClientRect().height - f.querySelector('figcaption').getBoundingClientRect().height))
      const label = () => page.evaluate(() => { // the label text's own width (its box is a fixed grid column)
        const r = document.createRange()
        r.selectNodeContents(document.querySelector('figure.circuit[data-circuit="pot-led"] .circuit-range-label'))
        return r.getBoundingClientRect().width
      })
      const before = await rows()
      const narrow = await label()
      await page.evaluate(() => document.documentElement.style.setProperty('--apple-font-family', "'Courier New', 'Nanum Myeongjo', serif"))
      // whatever fonts this machine has, make the swapped labels and buttons much wider (Hangul has no Courier glyphs)
      await page.addStyleTag({ content: '.study-page .circuit :is(.cb, .circuit-range-label) { letter-spacing: .25em; }' })
      await page.waitForTimeout(300)
      expect(await label(), 'the swapped font is wider').toBeGreaterThan(narrow)
      ;(await rows()).forEach((h, i) => expect(Math.abs(h - before[i]), `figure ${i} rows after the font swap`).toBeLessThanOrEqual(1))
    })
  }

  test('text-only scaling (minimum font size, large OS text) grows the bar and the status line instead of clipping them', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/study/arduino')
    await expect(page.locator('figure.circuit.is-live')).toHaveCount(14)
    await page.addStyleTag({ content: '.study-page .circuit :is(.cb, .circuit-range, .circuit-status-box) { font-size: 22px !important; }' })
    for (const fig of await page.locator('figure.circuit[data-circuit]').all()) await fig.locator('.cb-steps').click() // the widest bar
    const clipped = await page.evaluate(() => [...document.querySelectorAll('figure.circuit')].flatMap((f) =>
      [f.querySelector('.circuit-bar'), f.querySelector('.circuit-status')].filter((e) => e.scrollHeight > e.clientHeight + 1).map((e) => `${f.dataset.circuit}: ${e.className}`)))
    expect(clipped).toEqual([])
  })

  test('when the circuit code cannot be loaded, each figure says so in the room it already has', async ({ page }) => {
    // the app reloads on a failed chunk (pwaAutoUpdate.ts, for stale deploys); keep this page to see what a lasting failure shows
    await page.addInitScript(() => window.addEventListener('vite:preloadError', (e) => e.stopImmediatePropagation()))
    let release
    const gate = new Promise((resolve) => { release = resolve })
    await page.route('**/study-content-circuits-*.js', async (route) => { await gate; await route.abort() })
    await page.goto('/study/arduino')
    await expect(page.locator('figure.circuit[data-circuit]')).toHaveCount(14)
    await siteFontLoaded(page) // the site font has replaced the fallback (captions reflow with it)
    const heights = () => page.evaluate(() => [...document.querySelectorAll('figure.circuit')].map((f) => f.getBoundingClientRect().height))
    const before = await heights()
    const fig = circuit(page, 'led-blink')
    await expect(fig.locator('.circuit-failed')).toBeHidden()
    await expect(fig.getByRole('button', { name: '▶ 시뮬레이션' })).toBeDisabled()
    release()
    await expect(page.locator('figure.circuit[data-failed]')).toHaveCount(14)
    await expect(fig.locator('.circuit-failed')).toBeVisible()
    await expect(fig.locator('.circuit-failed')).toHaveText('그림을 불러오지 못했어요. 새로고침해 보세요.')
    await expect(fig.locator('.circuit-status')).toBeHidden()
    await expect(fig.getByRole('button', { name: '▶ 시뮬레이션' })).toBeDisabled()
    ;(await heights()).forEach((h, i) => expect(Math.abs(h - before[i]), `figure ${i} with the failure note`).toBeLessThanOrEqual(1))
  })

  test('a table-of-contents jump past many unbuilt scenes still lands on its heading', async ({ page }) => {
    await page.goto('/study/arduino')
    await expect(page.locator('figure.circuit.is-live')).toHaveCount(14)
    await page.locator('nav.toc a[href="#mod-motor"]').click()
    const top = () => page.evaluate(() => Math.round(document.getElementById('mod-motor').getBoundingClientRect().top))
    await expect.poll(top, { timeout: 8000 }).toBeLessThan(160)
    await page.waitForTimeout(700) // figures near the target are built while it settles
    const settled = await top()
    expect(settled).toBeGreaterThan(-2)
    expect(settled).toBeLessThan(160)
  })

  test('a resumed sim continues from where it stopped', async ({ page }) => {
    await page.goto('/study/arduino')
    const fig = circuit(page, 'led-blink')
    await fig.scrollIntoViewIfNeeded()
    await expect(fig).toHaveClass(/is-live/)
    await fig.getByRole('button', { name: '▶ 시뮬레이션' }).click()
    await expect(fig).toHaveAttribute('data-led', 'on')
    await expect(fig).toHaveAttribute('data-led', 'off') // just flipped: about 500 ms of this phase are left
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await expect(fig).toHaveAttribute('data-offscreen', '')
    await page.waitForTimeout(1500) // three blink periods pass while it is off screen
    const wait = page.evaluate(() => new Promise((resolve) => {
      const el = document.querySelector('figure.circuit[data-circuit="led-blink"]')
      const t0 = performance.now()
      const start = el.getAttribute('data-led')
      const mo = new MutationObserver(() => { if (el.getAttribute('data-led') !== start) { mo.disconnect(); resolve(performance.now() - t0) } })
      mo.observe(el, { attributes: true, attributeFilter: ['data-led'] })
    }))
    await fig.scrollIntoViewIfNeeded()
    const after = await wait
    expect(after, 'the next flip is the rest of the interrupted half period').toBeGreaterThan(100)
    expect(after).toBeLessThan(750)
  })

  test('leaving the page and coming back leaves no duplicates or leftovers', async ({ page }) => {
    await page.goto('/study/arduino')
    for (const id of ['led-blink', 'cds-night']) await circuit(page, id).scrollIntoViewIfNeeded()
    await expect(circuit(page, 'cds-night')).toHaveClass(/is-live/)
    await page.getByRole('link', { name: /스터디 목록/ }).click()
    await expect(page.locator('figure.circuit')).toHaveCount(0)
    await page.locator('a[href="/study/arduino"]').first().click()
    await expect(page.locator('figure.circuit[data-circuit]')).toHaveCount(14)
    await expect(page.locator('figure.circuit.is-live')).toHaveCount(14)
    expect(await page.locator('svg.circuit-svg').count(), 'a fresh page builds no scene until figures are reached').toBe(0)
    for (const id of ['led-blink', 'cds-night']) await circuit(page, id).scrollIntoViewIfNeeded()
    await expect(circuit(page, 'cds-night')).toHaveClass(/is-live/)
    for (const id of ['led-blink', 'cds-night']) await expect(circuit(page, id).locator('svg.circuit-svg')).toHaveCount(1)
    await expect(page.locator('figure.circuit-live, svg.circuit-svg')).toHaveCount(await page.locator('svg.circuit-svg').count())
    // unmounting restores the static page: nothing left behind on the table rows or the figures
    await page.getByRole('link', { name: /스터디 목록/ }).click()
    await page.locator('a[href="/study/arduino"]').first().click()
    await expect(page.locator('figure.circuit[data-circuit]')).toHaveCount(14)
    // a second visit renders exactly one set of chrome per figure and one scene per reached figure
    await expect(page.locator('.circuit-bar')).toHaveCount(14)
    await expect(page.locator('.circuit-live')).toHaveCount(14)
    await expect(page.locator('tr[tabindex="0"]')).toHaveCount(14)
    await expect(page.locator('svg.circuit-svg')).toHaveCount(0)
  })

  test('a table has one tab stop and arrow keys move between its rows', async ({ page }) => {
    await page.goto('/study/arduino')
    const fig = circuit(page, 'pot-led')
    await fig.scrollIntoViewIfNeeded()
    await expect(fig).toHaveClass(/is-live/)
    await expect(fig.locator('svg.circuit-svg')).toHaveCount(1)
    const table = fig.locator('xpath=preceding-sibling::div[contains(@class,"table-wrap")][1]')
    const rows = table.locator('tr.circuit-row')
    await expect(rows).toHaveCount(4)
    await expect(table.locator('tr[tabindex="0"]')).toHaveCount(1)
    await rows.first().focus()
    await page.keyboard.press('ArrowDown')
    await expect(rows.nth(1)).toBeFocused()
    await expect(rows.nth(1)).toHaveAttribute('tabindex', '0')
    await expect(rows.first()).toHaveAttribute('tabindex', '-1')
    await expect(fig.locator('.cw.is-hl')).not.toHaveCount(0)
    await page.keyboard.press('End')
    await expect(rows.nth(3)).toBeFocused()
    await page.keyboard.press('Home')
    await expect(rows.first()).toBeFocused()
  })

  test('a row focused before its scene exists lights up its wire once the scene is built', async ({ page }) => {
    await page.goto('/study/arduino')
    const fig = circuit(page, 'dc-motor')
    await expect(fig).toHaveClass(/is-live/)
    await expect(fig.locator('svg.circuit-svg')).toHaveCount(0)
    const row = fig.locator('xpath=preceding-sibling::div[contains(@class,"table-wrap")][1]').locator('tr.circuit-row').first()
    await row.evaluate((r) => r.focus({ preventScroll: true }))
    await expect(row).toHaveClass(/circuit-row-on/)
    await fig.locator('.circuit-stage').scrollIntoViewIfNeeded()
    await expect(fig.locator('svg.circuit-svg')).toHaveCount(1)
    await expect(row).toBeFocused()
    await expect(fig.locator('.cw.is-hl')).toHaveCount(1) // the battery (+) wire of the first wiring step
  })

  test('results reach screen readers through a debounced live region, not the frame loop', async ({ page }) => {
    await page.goto('/study/arduino')
    const fig = circuit(page, 'pot-led')
    await fig.scrollIntoViewIfNeeded()
    await expect(fig).toHaveClass(/is-live/)
    await expect(fig.locator('.circuit-status')).not.toHaveAttribute('role', 'status')
    const live = fig.locator('.circuit-live')
    await expect(live).toHaveAttribute('aria-live', 'polite')
    await fig.getByRole('button', { name: '▶ 시뮬레이션' }).click()
    await fig.getByRole('slider', { name: /가변저항 값/ }).fill('800')
    await expect(live).toContainText('analogRead(A0) = 800')
  })

  test('wiring table rows highlight their wire, and the stepper reveals parts in table order', async ({ page }) => {
    await page.goto('/study/arduino')
    const fig = circuit(page, 'led-blink')
    await fig.scrollIntoViewIfNeeded()
    await expect(fig).toHaveClass(/is-live/)
    for (const f of await page.locator('figure.circuit[data-circuit]').all()) { // scenes are built lazily: reach every figure
      await f.scrollIntoViewIfNeeded()
      await expect(f).toHaveClass(/is-live/)
    }
    await fig.scrollIntoViewIfNeeded()
    const rows = page.locator('table.ref tr.circuit-row')
    await expect(rows).toHaveCount(3 + 3 + 4 + 4 + 3 + 2 + 8 + 6 + 4 + 5 + 3 + 2 + 5 + 5) // every circuit's table is linked
    const first = fig.locator('xpath=preceding-sibling::div[contains(@class,"table-wrap")][1]').locator('tr.circuit-row').first()
    await first.focus()
    await expect(fig.locator('.cw.is-hl')).toHaveCount(1)
    await expect(first).toHaveClass(/circuit-row-on/)

    await fig.getByRole('button', { name: '조립 순서 보기' }).click()
    await expect(fig.locator('.circuit-progress')).toHaveText('1 / 3')
    await expect(fig.locator('.cstep-off')).not.toHaveCount(0) // LED and the GND wire are still hidden
    await fig.getByRole('button', { name: '다음 단계' }).click()
    await fig.getByRole('button', { name: '다음 단계' }).click()
    await expect(fig.locator('.circuit-progress')).toHaveText('3 / 3')
    await expect(fig.locator('.cstep-off')).toHaveCount(0)
    await fig.getByRole('button', { name: '전체 보기' }).click()
    await expect(fig.locator('.circuit-stepper')).toBeHidden()
  })
})
