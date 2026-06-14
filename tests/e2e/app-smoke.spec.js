import { expect, test } from '@playwright/test'
import { mockAdminApis, mockOptionalApis } from './visualSupport.js'

const routeExpectations = [
  ['/', /KW COM's/],
  ['/activities', /배움이 매주 쌓이고,\s*서로에게 남습니다\./],
  ['/projects', /아이디어를 실제 서비스와 제작물로\./],
  ['/notices', /공지사항|등록된 공지/],
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
  await expect.poll(() => requestedLimits.at(-1)).toBe('1000')

  await page.getByLabel('로그 표시 개수').selectOption('2000')
  await expect.poll(() => requestedLimits.at(-1)).toBe('2000')

  await page.getByRole('button', { name: '캐시 초기화' }).click()

  await expect.poll(() => cacheClearCalled).toBe(true)
  await expect(page.getByText('캐시 1개를 초기화했습니다.')).toBeVisible()
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

test('activity hub points members back to notices community and archive', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: '활동 허브' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '공지사항' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '커뮤니티' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '자료실' })).toBeVisible()
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
