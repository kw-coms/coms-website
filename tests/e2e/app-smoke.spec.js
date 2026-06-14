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
