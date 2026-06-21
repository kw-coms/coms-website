import { expect, test } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { mockAdminApis, mockOptionalApis } from './visualSupport.js'

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

function multipartField(body, name) {
  const match = new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]+)`).exec(body || '')
  return match?.[1] || ''
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

test('appearance panel explains guest font persistence scope', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('[aria-label="폰트 설정"]')).toBeVisible()
  await expect(page.getByText('이 브라우저에 임시 적용')).toBeVisible()
})

test('apps page surfaces companion service links away from the home dashboard', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: "COM's Apps" })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '동아리 일정 캘린더' })).toBeVisible()

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

  const fontSettings = page.locator('[aria-label="폰트 설정"]')
  await expect(fontSettings).toContainText('내 계정에 저장됨')
  await fontSettings.getByRole('button', { name: '계정 설정에서 폰트 변경' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(fontSettings.getByRole('combobox', { name: '사이트 폰트 선택' })).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--apple-font-family'))).toBe('')
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
  await expect(page.getByText('1. 가입 정보 작성')).toBeVisible()
  await expect(page.getByText('2. 명부 확인 및 계정 생성')).toBeVisible()
  await expect(page.getByText('3. 이메일 인증 후 로그인')).toBeVisible()

  for (const interest of ['웹', '앱', '보안', '알고리즘', '아두이노', '디자인', '기타']) {
    await expect(page.getByRole('button', { name: interest })).toBeVisible()
  }
})

test('admin exposes a pre-deploy screen check panel', async ({ page }) => {
  await mockAdminApis(page)

  await page.goto('/admin')
  await page.getByRole('button', { name: '화면 점검' }).click()

  await expect(page.getByRole('heading', { name: '배포 전 화면 점검' })).toBeVisible()
  await expect(page.getByText('Smoke 대상 경로')).toBeVisible()
  const routePanel = page.getByTestId('screen-check-routes')
  for (const path of ['/', '/activities', '/projects', '/notices', '/login', '/signup', '/recruit']) {
    await expect(routePanel.locator(`a[href="${path}"]`)).toBeVisible()
  }
  await expect(page.getByText('/api/auth/me')).toBeVisible()
  await expect(page.getByText('/api/fonts')).toBeVisible()
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
  await page.addInitScript(() => {
    window.__adminPromptMessages = []
    window.prompt = (message) => {
      window.__adminPromptMessages.push(message)
      return 'temp1'
    }
    window.alert = () => {}
  })

  await page.goto('/admin')
  await page.getByRole('button', { name: '회원 관리' }).click()
  await page.getByRole('button', { name: '비번 초기화' }).click()
  promptMessage = await page.evaluate(() => window.__adminPromptMessages[0] || '')

  expect(promptMessage).not.toContain('특수문자')
  expect(promptMessage).not.toContain('8자')
  await expect.poll(() => resetPayload).toEqual({ password: 'temp1' })
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
  await page.getByRole('button', { name: '폰트 관리' }).click()

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
  await page.getByRole('button', { name: '로그' }).click()
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

  await page.addInitScript(() => { window.confirm = () => true })
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
  await page.getByRole('button', { name: '커뮤니티 관리' }).click()

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
  await page.getByRole('button', { name: '삭제 보관함' }).click()

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
  await page.route('**/api/community/posts', (route) => route.fulfill({ status: 200, json: [] }))

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

  await page.getByRole('button', { name: '모집 관리', exact: true }).click()
  await expect(page.getByRole('heading', { name: '모집 지원 관리' })).toBeVisible()
  await expect(page.getByText('김지원')).toBeVisible()
  await expect(page.getByText('같이 만들고 싶습니다.')).toBeVisible()

  await page.getByLabel('김지원 지원 상태').selectOption('REVIEWING')
  await page.getByLabel('김지원 운영 메모').fill('면담 일정 조율 중')
  await page.getByRole('button', { name: '김지원 저장' }).click()

  await expect(page.getByText('김지원 지원서를 저장했습니다.')).toBeVisible()
  await expect(page.locator('article').filter({ hasText: '김지원' }).locator('span').filter({ hasText: '검토중' })).toBeVisible()
})

test('top navigation groups activity log and monthly calendar under Activity', async ({ page }) => {
  await mockAdminApis(page)
  await page.goto('/')

  const desktopNav = page.locator('header nav').first()
  await expect(desktopNav.getByRole('button', { name: 'Notices' })).toBeVisible()
  await expect(desktopNav.getByRole('button', { name: 'Activity' })).toBeVisible()
  await expect(desktopNav.getByRole('button', { name: 'Activity log' })).toHaveCount(0)
  await expect(desktopNav.getByRole('button', { name: 'Monthly calendar' })).toHaveCount(0)

  await desktopNav.getByRole('button', { name: 'Activity' }).click()
  const activityMenu = page.getByRole('menu').filter({ hasText: 'Activity log' })
  await expect(activityMenu.getByRole('button', { name: /Activity log/ })).toBeVisible()
  await expect(activityMenu.getByRole('button', { name: /Monthly calendar/ })).toBeVisible()
  const activityMenuBox = await activityMenu.boundingBox()
  const activityLogBox = await activityMenu.getByRole('button', { name: /Activity log/ }).boundingBox()
  expect(activityLogBox.width).toBeGreaterThanOrEqual((activityMenuBox.width || 0) - 2)
  await activityMenu.getByRole('button', { name: /Activity log/ }).click()
  await expect(page).toHaveURL(/\/activity-log$/)
  await page.goto('/')

  await desktopNav.getByRole('button', { name: 'Activity' }).click()
  await page.getByRole('menu').filter({ hasText: 'Monthly calendar' }).getByRole('button', { name: /Monthly calendar/ }).click()
  await expect(page).toHaveURL(/\/monthly-calendar$/)
  await page.goto('/')
  await desktopNav.getByRole('button', { name: 'Apps' }).click()
  await expect(page).toHaveURL(/\/apps$/)
  await page.goto('/')

  await expect(page.getByRole('heading', { name: '활동 허브' })).toBeVisible()
  await expect(page.locator('section').filter({ has: page.getByRole('heading', { name: '활동 허브' }) }).getByRole('button', { name: /Activity log/ })).toHaveCount(0)
  await expect(page.locator('section').filter({ has: page.getByRole('heading', { name: '활동 허브' }) }).getByRole('button', { name: /Monthly calendar/ })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '실제로 이어지는 활동 기록' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '동아리 일정 캘린더' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '공지사항' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '커뮤니티' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '자료실' })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByLabel('메뉴 열기').click()
  await expect(page.getByRole('menu').getByRole('button', { name: /^Notices/ })).toBeVisible()
  await expect(page.getByRole('menu').getByRole('button', { name: /^Activity/ })).toBeVisible()
  await expect(page.getByRole('menu').getByRole('button', { name: /Activity log/ })).toHaveCount(0)
  await page.getByRole('menu').getByRole('button', { name: /^Activity/ }).click()
  await expect(page.getByRole('menu').getByRole('button', { name: /Activity log/ })).toBeVisible()
  await expect(page.getByRole('menu').getByRole('button', { name: /Monthly calendar/ })).toBeVisible()
})

test('activities page does not embed the activity log or monthly calendar', async ({ page }) => {
  await page.goto('/activities')

  await expect(page.getByRole('heading', { name: '배움이 매주 쌓이고, 서로에게 남습니다.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '실제로 이어지는 활동 기록' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '동아리 일정 캘린더' })).toHaveCount(0)
})

test('activity records and calendar redirect guests to login', async ({ page }) => {
  await page.goto('/activity-log')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText('등록된 활동 기록이 없습니다.')).toHaveCount(0)
  await expect(page.getByText('알고리즘 스터디 진행')).toHaveCount(0)
  await expect(page.getByText('웹 프로젝트 발표회')).toHaveCount(0)

  await page.goto('/monthly-calendar')
  await expect(page).toHaveURL(/\/login$/)
})

test('signed-in members see real activity records and schedule events', async ({ page }) => {
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
  await mockAdminApis(page)
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
  await page.getByRole('button', { name: '활동 관리' }).click()
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

  const voteButton = page.getByRole('button', { name: /개추 4/ })
  await voteButton.click()
  await expect.poll(() => voteValue).toBe(1)
  await expect(page.getByRole('button', { name: /개추 5/ })).toBeVisible()
})

test('club activity detail registers view, vote, edit, and delete only after opening', async ({ page }) => {
  await mockAdminApis(page)
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
  await expect(card.getByText('개추 2')).toBeVisible()
  await expect(card.getByRole('button', { name: /개추/ })).toHaveCount(0)

  await card.hover()
  await expect.poll(() => viewRegistered).toBe(false)

  await card.getByRole('button', { name: '조회 검증 세미나 내용 보기' }).click()
  await expect.poll(() => viewRegistered).toBe(true)
  const dialog = page.getByRole('dialog', { name: /조회 검증 세미나/ })
  await expect(dialog.getByText('조회 9')).toBeVisible()
  await expect(dialog.locator('.activity-detail-gallery img')).toHaveCount(2)

  await dialog.getByRole('button', { name: /개추 2/ }).click()
  await expect.poll(() => voteValue).toBe(1)
  await expect(dialog.getByRole('button', { name: /개추 3/ })).toBeVisible()

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
  await page.getByRole('button', { name: '삭제 보관함' }).click()

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
  await expect(portalCard.getByText('만든 사람: 김개발')).toBeVisible()
  await expect(portalCard.getByText('열기')).toBeVisible()

  const attendCard = page.locator('.apple-product-panel').filter({ hasText: '출석 체크 앱' })
  await expect(attendCard.getByText('만든 사람: 이모바일')).toBeVisible()
  await expect(attendCard.getByText('attend.apk')).toBeVisible()
  await expect(attendCard.getByRole('link', { name: /다운로드/ })).toBeVisible()
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
  await page.getByRole('button', { name: 'Apps 관리' }).click()

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

  await expect(page.getByText('2026년 7월')).toBeVisible()
  const recurringEvents = page.locator('.club-calendar-event-recurring').filter({ hasText: '정기 회의' })
  await expect(recurringEvents).toHaveCount(3)
  await expect(recurringEvents.first().getByText('18:00~19:00')).toBeVisible()
  await expect(recurringEvents.first().getByText('@동아리방')).toHaveCount(0)
  await expect(page.locator('.club-calendar-event-badge', { hasText: '취소됨' })).toBeVisible()
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

test('guest visiting notices is redirected to login', async ({ page }) => {
  await page.goto('/notices')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText('조회수 검증 공지')).toHaveCount(0)
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
})
