import { expect, test } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { mockAdminApis, mockOptionalApis } from './visualSupport.js'

const routeExpectations = [
  ['/', /KW COM's/],
  ['/activities', /배움이 매주 쌓이고,\s*서로에게 남습니다\./],
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
  await expect(page.getByText('게스트 임시 적용')).toBeVisible()
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
  ]) {
    await expect(page.getByRole('link', { name: new RegExp(`${name}.*열기`) })).toHaveAttribute('href', href)
  }
})

test('appearance panel directs signed-in users to account-saved font settings', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('kwcoms-font-id', 'b:noto-sans-kr'))
  await mockAdminApis(page)
  await page.goto('/')

  const fontSettings = page.locator('[aria-label="폰트 설정"]')
  await expect(fontSettings).toContainText('계정 저장 설정')
  await fontSettings.getByRole('button', { name: '계정 설정에서 변경' }).click()
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
  await expect(page.getByText('운영진 등록 회의')).toBeVisible()
  await expect(page.getByText('다음 해 프로젝트 발표회')).toHaveCount(0)
  await page.getByLabel('년도 선택').fill('2027')
  await page.getByLabel('월 선택', { exact: true }).selectOption({ label: '7월' })
  await expect(page.getByText('2027년 7월')).toBeVisible()
  await expect(page.getByText('다음 해 프로젝트 발표회')).toBeVisible()
  await expect(page.getByText('운영진 등록 회의')).toHaveCount(0)
  await expect(page.getByText('로그인 하세요')).toHaveCount(0)
})

test('admin can add a schedule directly from the monthly calendar', async ({ page }) => {
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
      createdPayload = form
      await route.fulfill({
        status: 200,
        json: {
          id: 20,
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

  await page.goto('/monthly-calendar')
  await page.getByLabel('일정 제목').fill('캘린더 직접 등록 회의')
  await page.getByLabel('일정 날짜').fill('2026-06-24')
  await page.getByLabel('일정 분류').selectOption('MEETING')
  await page.getByRole('button', { name: '일정 추가' }).click()

  await expect.poll(() => createdPayload).toMatchObject({
    title: '캘린더 직접 등록 회의',
    kind: 'SCHEDULE',
    category: 'MEETING',
    eventDate: '2026-06-24',
  })
  await expect(page.getByText('캘린더 직접 등록 회의')).toBeVisible()
})

test('admin can write an activity log entry directly from the activity log page', async ({ page }) => {
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
      createdPayload = form
      await route.fulfill({
        status: 200,
        json: {
          id: 30,
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

  await page.goto('/activity-log')
  await page.getByLabel('활동 제목').fill('활동 로그 직접 작성')
  await page.getByLabel('활동 날짜').fill('2026-06-25')
  await page.getByLabel('활동 분류').selectOption('PROJECT')
  await page.getByLabel('활동 내용').fill('프로젝트 발표 후기와 사진 기록')
  await page.getByRole('button', { name: '활동 기록 추가' }).click()

  await expect.poll(() => createdPayload).toMatchObject({
    title: '활동 로그 직접 작성',
    kind: 'ACTIVITY',
    category: 'PROJECT',
    eventDate: '2026-06-25',
    description: '프로젝트 발표 후기와 사진 기록',
  })
  await expect(page.getByRole('heading', { name: '활동 로그 직접 작성' })).toBeVisible()
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
