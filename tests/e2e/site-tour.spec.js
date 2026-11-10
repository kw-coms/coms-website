import { expect, test } from '@playwright/test'
import { mockAdminApis, mockOptionalApis } from './visualSupport.js'

// The PWA service worker precaches the TourOverlay chunk. Once it controls the page, the chunk is
// served from its cache and page.route never sees the request, so the chunk-failure tests would
// depend on how fast the worker installs. The tour does not depend on the worker: keep it off here.
test.use({ serviceWorkers: 'block' })

// The site tour ("튜토리얼"): a guest tour and a member tour, each starting by itself once on
// the home page and on request from the footer, quick jump and the mobile menu.
//
// Self-starting is off in automated browsers (navigator.webdriver) so it cannot cover other
// specs' pages; these tests switch it back on with the same localStorage key the app reads.
const FORCE_AUTO = 'coms.tour.force-auto:v1'

const tour = (page) => page.locator('[data-site-tour][role="dialog"]')
// The overlay's chunk (and its stylesheet): hashed under /assets/ in the build, a plain module path in the dev server.
const TOUR_CHUNK = /\/(assets\/)?TourOverlay[-.].*\.(js|css)|\/TourOverlay\.(tsx|css)/
const footerStart = (page) => page.getByRole('button', { name: '튜토리얼 시작' })

const skipIntro = (page) => page.addInitScript(() => window.sessionStorage.setItem('coms.intro.played:v1', '1'))
const forceAuto = (page) => page.addInitScript((key) => window.localStorage.setItem(key, '1'), FORCE_AUTO)

const asMember = async (page) => {
  await mockAdminApis(page)
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { id: 5, studentId: '2023000002', name: '홍길동', role: 'USER', emailVerified: true } }))
}

// "The tour does not start": wait out more than the auto-start's three 300 ms polls and see that
// no tour dialog appears. Bounded, and it waits on the dialog itself rather than on a bare timer.
const neverAppears = async (page, ms = 2500) => {
  const appeared = await tour(page).waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false)
  expect(appeared).toBe(false)
}
// The home page is "done": the boot intro is gone, the hero's entrance has finished, the footer is there.
const homeSettled = async (page) => {
  await expect(page.getByRole('button', { name: '화면 설정', exact: true })).toBeVisible()
  await page.waitForFunction(() => !document.querySelector('[data-coms-intro]') && !document.documentElement.classList.contains('coms-booted'))
}

const noHorizontalOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

test.describe('starting', () => {
  test('starts by itself on the first visit to "/", once', async ({ page }) => {
    await mockOptionalApis(page)
    await skipIntro(page)
    await forceAuto(page)
    await page.goto('/')
    await expect(tour(page)).toBeVisible({ timeout: 10_000 })
    await expect(tour(page)).toContainText("COM's는 이런 동아리예요")
    await expect(tour(page)).toContainText('1 / 6')
    await page.keyboard.press('Escape')
    await expect(tour(page)).toHaveCount(0)

    // A second visit (the flag is in localStorage) stays quiet.
    await page.reload()
    await homeSettled(page)
    await neverAppears(page)
  })

  test('never starts by itself on a deep link', async ({ page }) => {
    await mockOptionalApis(page)
    await skipIntro(page)
    await forceAuto(page)
    await page.goto('/about')
    await homeSettled(page)
    await neverAppears(page)
  })

  test('does not start by itself in an automated browser unless asked to', async ({ page }) => {
    await mockOptionalApis(page)
    await skipIntro(page)
    await page.goto('/')
    await homeSettled(page)
    await neverAppears(page)
  })

  test('self-start waits while a dialog is open, then starts', async ({ page }) => {
    await mockOptionalApis(page)
    await skipIntro(page)
    await forceAuto(page)
    // A modal that is there from the first paint, as an open confirmation would be.
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const modal = document.createElement('div')
        modal.id = 'fake-modal'
        modal.setAttribute('role', 'dialog')
        modal.setAttribute('aria-modal', 'true')
        modal.setAttribute('aria-label', '확인')
        document.body.appendChild(modal)
      })
    })
    await page.goto('/')
    await homeSettled(page)
    await neverAppears(page)
    await page.evaluate(() => document.getElementById('fake-modal')?.remove())
    await expect(tour(page)).toBeVisible({ timeout: 10_000 })
  })

  test('a reload does not start it again when localStorage cannot be written', async ({ page }) => {
    await mockOptionalApis(page)
    await skipIntro(page)
    await forceAuto(page)
    await page.addInitScript(() => {
      const setItem = Storage.prototype.setItem
      Storage.prototype.setItem = function (key, value) {
        if (this === window.localStorage && String(key).startsWith('coms.tour.')) throw new Error('QuotaExceededError')
        return setItem.call(this, key, value)
      }
    })
    await page.goto('/')
    await expect(tour(page)).toBeVisible({ timeout: 10_000 })
    await page.keyboard.press('Escape')
    await page.reload()
    await homeSettled(page)
    await neverAppears(page)
  })

  test('the app stays usable when the tour chunk cannot be loaded', async ({ page }) => {
    await mockOptionalApis(page)
    await skipIntro(page)
    await page.route(TOUR_CHUNK, (route) => route.abort())
    await page.goto('/about')
    await footerStart(page).click()
    await neverAppears(page, 1500)
    await expect(page.getByText('문제가 발생했습니다.')).toHaveCount(0)
    await expect(page.locator('#root')).not.toHaveAttribute('inert', '')
    // The rest of the page still answers.
    await page.getByRole('button', { name: '빠른 이동 열기' }).click()
    await expect(page.getByRole('dialog', { name: '빠른 이동' })).toBeVisible()
  })

  test('a failed chunk load does not use up the tour: the next start retries and opens it', async ({ page }) => {
    await mockOptionalApis(page)
    await skipIntro(page)
    let aborted = 0
    await page.route(TOUR_CHUNK, (route) => {
      aborted += 1
      return route.abort()
    })
    await page.goto('/about')
    await footerStart(page).click()
    await neverAppears(page, 1500)
    expect(aborted).toBeGreaterThan(0)
    // The tour was not marked seen by the failed attempt.
    expect(await page.evaluate(() => window.localStorage.getItem('coms.tour.guest.seen:v1'))).toBeNull()
    await page.unroute(TOUR_CHUNK)
    await footerStart(page).click()
    await expect(tour(page)).toBeVisible({ timeout: 10_000 })
    // Now it is seen.
    expect(await page.evaluate(() => window.localStorage.getItem('coms.tour.guest.seen:v1'))).toBe('1')
  })

  test('starts from the footer, and Esc gives focus back to the button', async ({ page }) => {
    await mockOptionalApis(page)
    await skipIntro(page)
    await page.goto('/about')
    const start = footerStart(page)
    await expect(start).toBeVisible()
    // Next to "화면 설정".
    await expect(page.getByRole('button', { name: '화면 설정', exact: true })).toBeVisible()
    await start.focus()
    await start.click()
    await expect(tour(page)).toBeVisible()
    await expect(tour(page)).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(tour(page)).toHaveCount(0)
    await expect(start).toBeFocused()
  })

  test('starts from quick jump', async ({ page }) => {
    await mockOptionalApis(page)
    await skipIntro(page)
    await page.goto('/about')
    await expect(page.getByRole('button', { name: '빠른 이동 열기' })).toBeVisible()
    await page.keyboard.press('Control+k')
    const box = page.getByRole('dialog', { name: '빠른 이동' }).getByRole('combobox', { name: '어디로 갈까요?' })
    await box.fill('튜토리얼')
    await box.press('Enter')
    await expect(page.getByRole('dialog', { name: '빠른 이동' })).toHaveCount(0)
    await expect(tour(page)).toBeVisible()
    await expect(page).toHaveURL(/\/about$/)
  })

  test('a start asked for while auth is still loading opens the member tour', async ({ page }) => {
    await asMember(page)
    await skipIntro(page)
    await page.route('**/api/auth/me', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await route.fulfill({ json: { id: 5, studentId: '2023000002', name: '홍길동', role: 'USER', emailVerified: true } })
    })
    await page.goto('/about')
    await footerStart(page).click()
    await expect(tour(page)).toContainText('공지사항', { timeout: 8000 })
    await expect(tour(page)).toContainText('1 / 8')
  })

  test('waits while quick jump is open, then starts', async ({ page }) => {
    await mockOptionalApis(page)
    await skipIntro(page)
    await page.goto('/about')
    await expect(page.getByRole('button', { name: '빠른 이동 열기' })).toBeVisible()
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('dialog', { name: '빠른 이동' })).toBeVisible()
    await page.evaluate(() => window.dispatchEvent(new Event('coms:start-tour')))
    await neverAppears(page, 1000)
    await page.keyboard.press('Escape')
    await expect(tour(page)).toBeVisible()
  })
})

test.describe('navigation', () => {
  test('Back closes the tour, lifts the inert page and does not scroll the new page', async ({ page }) => {
    await asMember(page)
    await skipIntro(page)
    await page.goto('/about')
    await page.locator('[data-tour="nav-club"]').click()
    await page.locator('#nav-panel').getByRole('button', { name: /^프로젝트/ }).click()
    await expect(page).toHaveURL(/\/projects$/)
    await footerStart(page).click()
    await expect(tour(page)).toBeVisible()
    // The footer step scrolls the page down.
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('button', { name: '화면 설정', exact: true })).toBeInViewport()
    await page.goBack()
    await expect(page).toHaveURL(/\/about$/)
    await expect(tour(page)).toHaveCount(0)
    await expect(page.locator('#root')).not.toHaveAttribute('inert', '')
    // The new page is at the top, not at the old page's offset.
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(50)
  })
})

test.describe('guest tour', () => {
  test.beforeEach(async ({ page }) => {
    await mockOptionalApis(page)
    await skipIntro(page)
    await page.goto('/about')
    await footerStart(page).click()
    await expect(tour(page)).toBeVisible()
  })

  test('steps with the buttons and the arrow keys, and finishes with 완료', async ({ page }) => {
    const card = tour(page)
    const spot = page.locator('.coms-tour-spot')
    await expect(card).toHaveAccessibleName("COM's는 이런 동아리예요")
    await expect(card).toHaveAttribute('aria-modal', 'true')
    await expect(page.getByRole('button', { name: '이전' })).toBeDisabled()
    // The nav is on screen at 1280px: the spotlight sits on the 동아리 group, which holds About.
    await expect(spot).not.toHaveClass(/is-none/)
    const about = await page.locator('[data-tour="nav-club"]').boundingBox()
    const lit = await spot.boundingBox()
    expect(Math.abs(lit.x + lit.width / 2 - (about.x + about.width / 2))).toBeLessThan(2)

    await page.getByRole('button', { name: '다음' }).click()
    await expect(card).toContainText('2 / 6')
    await expect(page.getByRole('status').filter({ hasText: /^2 \/ 6 · / })).toHaveCount(1)
    await page.keyboard.press('ArrowRight')
    await expect(card).toContainText('읽고, 풀고, 만들어 봐요')
    await page.keyboard.press('ArrowLeft')
    await expect(card).toContainText('2 / 6')
    await page.getByRole('button', { name: '이전' }).click()
    await expect(card).toContainText('1 / 6')
    // Focus stays in the card even though 이전 has just been disabled.
    await expect(card.locator(':focus')).toHaveCount(1)

    for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowRight')
    await expect(card).toContainText('6 / 6')
    await expect(card).toContainText('이미 동아리원이라면')
    await expect(page.getByRole('button', { name: '건너뛰기' })).toBeVisible()
    await page.getByRole('button', { name: '완료' }).click()
    await expect(card).toHaveCount(0)
  })

  test('건너뛰기 ends it; a click on the dimmed page does not', async ({ page }) => {
    await page.mouse.click(8, 500)
    await expect(tour(page)).toBeVisible()
    await page.getByRole('button', { name: '다음' }).click()
    await page.getByRole('button', { name: '건너뛰기' }).click()
    await expect(tour(page)).toHaveCount(0)
    // The page under it works again.
    await expect(page.getByRole('button', { name: '빠른 이동 열기' })).toBeEnabled()
  })

  test('Tab stays inside the card and the page is inert', async ({ page }) => {
    await expect(page.locator('#root')).toHaveAttribute('inert', '')
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('Tab')
    await expect(tour(page).locator(':focus')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(page.locator('#root')).not.toHaveAttribute('inert', '')
  })

  test('no horizontal overflow on any step', async ({ page }) => {
    for (let i = 0; i < 6; i += 1) {
      expect(await noHorizontalOverflow(page)).toBeLessThanOrEqual(1)
      const box = await tour(page).boundingBox()
      const view = page.viewportSize()
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(view.width)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.y + box.height).toBeLessThanOrEqual(view.height)
      if (i < 5) await page.keyboard.press('ArrowRight')
    }
  })
})

test.describe('member tour', () => {
  test('starts by itself after login even if the guest tour was seen, and ends on account settings', async ({ page }) => {
    await asMember(page)
    await skipIntro(page)
    await forceAuto(page)
    await page.addInitScript(() => window.localStorage.setItem('coms.tour.guest.seen:v1', '1'))
    await page.goto('/')
    const card = tour(page)
    await expect(card).toBeVisible({ timeout: 10_000 })
    await expect(card).toContainText('공지사항')
    await expect(card).toContainText('1 / 8')

    const titles = []
    for (let i = 0; i < 8; i += 1) {
      titles.push(await card.locator('.coms-tour-title').innerText())
      if (i < 7) await page.keyboard.press('ArrowRight')
    }
    expect(titles).toEqual(['공지사항', '커뮤니티', '자료실', '활동 기록과 일정', '푼 문제가 쌓여요', 'Lab', '화면 설정', '계정 설정'])
    // The last step points at the account button and offers 완료.
    await expect(page.locator('.coms-tour-spot')).not.toHaveClass(/is-none/)
    await page.getByRole('button', { name: '완료' }).click()
    await expect(card).toHaveCount(0)

    // Seen as a member now: not again.
    await page.reload()
    await homeSettled(page)
    await neverAppears(page)
  })

  test('the footer step scrolls "화면 설정" into view and lights it', async ({ page }) => {
    await asMember(page)
    await skipIntro(page)
    await page.goto('/about')
    await footerStart(page).click()
    const card = tour(page)
    await expect(card).toBeVisible()
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowRight')
    await expect(card).toContainText('화면 설정')
    const trigger = page.getByRole('button', { name: '화면 설정', exact: true })
    await expect(trigger).toBeInViewport()
    await expect.poll(async () => {
      const [lit, target] = await Promise.all([page.locator('.coms-tour-spot').boundingBox(), trigger.boundingBox()])
      return Math.abs(lit.y + lit.height / 2 - (target.y + target.height / 2))
    }).toBeLessThan(3)
  })
})

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('opens from the mobile menu, falls back to centred cards and never overflows', async ({ page }) => {
    await mockOptionalApis(page)
    await skipIntro(page)
    await page.goto('/about')
    await page.getByRole('button', { name: '메뉴 열기' }).click()
    await page.locator('#mobile-menu').getByRole('button', { name: /튜토리얼 시작/ }).click()
    await expect(page.locator('#mobile-menu')).toHaveCount(0)
    const card = tour(page)
    await expect(card).toBeVisible()
    // The nav is collapsed at this width: no spotlight, a centred card.
    await expect(page.locator('.coms-tour-spot')).toHaveClass(/is-none/)
    for (let i = 0; i < 6; i += 1) {
      expect(await noHorizontalOverflow(page)).toBeLessThanOrEqual(1)
      const box = await card.boundingBox()
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(390)
      expect(box.y + box.height).toBeLessThanOrEqual(844)
      if (i < 5) await page.getByRole('button', { name: '다음' }).click()
    }
    await page.getByRole('button', { name: '완료' }).click()
    await expect(card).toHaveCount(0)
  })

  test('the member footer step stays on screen at 390px', async ({ page }) => {
    await asMember(page)
    await skipIntro(page)
    await page.goto('/about')
    await footerStart(page).scrollIntoViewIfNeeded()
    await footerStart(page).click()
    const card = tour(page)
    for (let i = 0; i < 6; i += 1) await page.getByRole('button', { name: '다음' }).click()
    await expect(card).toContainText('화면 설정')
    await expect(page.getByRole('button', { name: '화면 설정', exact: true })).toBeInViewport()
    const box = await card.boundingBox()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    expect(await noHorizontalOverflow(page)).toBeLessThanOrEqual(1)
  })
})
