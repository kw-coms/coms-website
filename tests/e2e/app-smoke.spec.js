import { expect, test } from '@playwright/test'
import { mockOptionalApis } from './visualSupport.js'

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
