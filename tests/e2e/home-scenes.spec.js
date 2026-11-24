import { expect, test } from '@playwright/test'
import { mockAdminApis, mockOptionalApis } from './visualSupport.js'

// The home page is a film in scenes (docs/design/specs/2026-11-10-cinematic-redesign.md).
// These checks cover what a visitor sees and what must hold under every switch: reduced
// motion and lite mode show every scene's text at once, and no width overflows the page.

const skipIntro = (page) => page.addInitScript(() => {
  try { sessionStorage.setItem('coms.intro.played:v1', '1') } catch { /* ignore */ }
})

const forceLite = (page) => page.addInitScript(() => {
  try { localStorage.setItem('kwcoms-perf-mode:v1', 'lite') } catch { /* ignore */ }
})

// Every element of the page that carries its own text, with how visible it is: the product of
// its own and its ancestors' opacity, and whether a transform or clip-path still hides it.
const hiddenTextElements = (page) => page.evaluate(() => {
  const hidden = []
  for (const el of document.querySelectorAll('main *')) {
    const ownText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim())
    // Screen-reader-only text is meant to be 1px; a hidden duplicate (a marquee copy) is not shown on purpose.
    if (!ownText || el.closest('.sr-only') || (el.hasAttribute('aria-hidden') && getComputedStyle(el).display === 'none')) continue
    let opacity = 1
    let clipped = false
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const cs = getComputedStyle(node)
      opacity *= Number(cs.opacity)
      if (cs.clipPath !== 'none') clipped = true
    }
    const rect = el.getBoundingClientRect()
    const mask = el.closest('.cine-m')
    const risen = !mask || getComputedStyle(el.closest('.cine-m > span') ?? el).transform === 'none'
    if (opacity < 0.99 || clipped || !risen || rect.width < 2 || rect.height < 2) {
      hidden.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} "${el.textContent.trim().slice(0, 24)}" opacity=${opacity} clipped=${clipped} risen=${risen} ${Math.round(rect.width)}x${Math.round(rect.height)}`)
    }
  }
  return hidden
})

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

test.describe('the next activity strip', () => {
  test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' })

  for (const layout of ['scenes', 'compact']) {
    test(`shows a dated ${layout === 'compact' ? 'live' : 'confirmed'} activity in ${layout} home`, async ({ page }) => {
      await mockOptionalApis(page)
      await page.clock.setFixedTime(new Date('2026-11-24T00:00:00+09:00'))
      await page.addInitScript((value) => localStorage.setItem('kwcoms-home-layout:v1', value), layout)
      let requests = 0
      await page.route('**/api/club-activities/timeline', (route) => {
        requests += 1
        return route.fulfill({ json: [{
          id: 101, kind: 'ACTIVITY', title: '정기 세미나', eventDate: '2026-11-24',
          resolvedStatus: layout === 'compact' ? 'LIVE' : 'CONFIRMED',
        }] })
      })
      await page.goto('/')
      const strip = page.getByRole('link', { name: /다음 일정.*정기 세미나/ })
      await expect(strip).toContainText(layout === 'compact' ? '진행 중' : '오늘')
      expect(requests).toBe(1)
      await strip.click()
      await expect(page).toHaveURL(/\/activities#act-upcoming$/)
      const upcoming = page.locator('#act-upcoming')
      await expect(upcoming).toContainText('정기 세미나')
      await expect(upcoming).toBeInViewport()
    })
  }

  test('refreshes the D-day when KST midnight passes without navigation', async ({ page }) => {
    await mockOptionalApis(page)
    await page.clock.install({ time: new Date('2026-11-23T23:50:00+09:00') })
    let requests = 0
    await page.route('**/api/club-activities/timeline', (route) => {
      requests += 1
      return route.fulfill({ json: [{
        id: 101, kind: 'ACTIVITY', title: '정기 세미나', eventDate: '2026-11-24',
        resolvedStatus: 'CONFIRMED',
      }] })
    })

    await page.goto('/')
    const strip = page.getByRole('link', { name: /다음 일정.*정기 세미나/ })
    await expect(strip).toContainText('D-1')
    await page.clock.pauseAt(new Date('2026-11-23T23:59:58+09:00'))
    await page.clock.runFor(2500)
    await expect(strip).toContainText('오늘')
    await expect.poll(() => requests).toBe(2)
    await expect(page).toHaveURL('/')
  })

  test('keeps the last good activity when the midnight refresh fails', async ({ page }) => {
    await mockOptionalApis(page)
    await page.clock.install({ time: new Date('2026-11-23T23:50:00+09:00') })
    let requests = 0
    await page.route('**/api/club-activities/timeline', (route) => {
      requests += 1
      if (requests === 2) return route.fulfill({ status: 503, body: '' })
      return route.fulfill({ json: [{
        id: 101, kind: 'ACTIVITY', title: '정기 세미나', eventDate: '2026-11-24',
        resolvedStatus: 'CONFIRMED',
      }] })
    })

    await page.goto('/')
    const strip = page.getByRole('link', { name: /다음 일정.*정기 세미나/ })
    await expect(strip).toContainText('D-1')
    const failedRefresh = page.waitForResponse((response) =>
      response.url().includes('/api/club-activities/timeline') && response.status() === 503,
    )
    await page.clock.pauseAt(new Date('2026-11-23T23:59:58+09:00'))
    await page.clock.runFor(2500)
    await (await failedRefresh).finished()
    await expect.poll(() => requests).toBe(2)
    await page.clock.runFor(100)
    await expect(strip).toContainText('오늘')
  })

  test('a failed fetch stays quiet and does not retry', async ({ page }) => {
    await mockOptionalApis(page)
    let requests = 0
    await page.route('**/api/club-activities/timeline', (route) => {
      requests += 1
      return route.fulfill({ status: 503, body: '' })
    })
    const response = page.waitForResponse('**/api/club-activities/timeline')
    await page.goto('/')
    await response
    await expect(page.getByRole('link', { name: /다음 일정/ })).toHaveCount(0)
    await expect(page.getByText('활동 일정을 불러오지 못했습니다', { exact: false })).toHaveCount(0)
    expect(requests).toBe(1)
  })
})

test.describe('a visitor on the home page', () => {
  test.beforeEach(async ({ page }) => {
    await mockOptionalApis(page)
    await skipIntro(page)
    await page.goto('/')
  })

  test('sees the story, "멤버가 되면", and neither a calendar nor a member shortcut grid', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: "COM's" })).toBeVisible()
    await expect(page.getByRole('heading', { name: '멤버가 되면' })).toBeAttached()
    await expect(page.getByRole('heading', { name: '동아리 일정 캘린더' })).toHaveCount(0)
    await expect(page.locator('.coms-tools-grid')).toHaveCount(0)
    // The scenes come in the story's order, with the members scene just before the finale.
    const ids = await page.locator('main > section').evaluateAll((els) => els.map((el) => el.id))
    expect(ids).toEqual(['opening', 'about', 'activities', 'projects', 'members', 'recruit'])
  })

  test('can be linked to by the four section hashes', async ({ page }) => {
    for (const id of ['about', 'activities', 'projects', 'recruit']) {
      await expect(page.locator(`section#${id}`)).toHaveCount(1)
    }
  })

  test('shows the public recruitment notice on the opening screen without loading member notices', async ({ page }) => {
    const memberNoticeRequests = []
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/notices') memberNoticeRequests.push(request)
    })
    for (const [width, height] of [[1280, 720], [390, 844]]) {
      await page.setViewportSize({ width, height })
      await page.goto('/')
      const notice = page.locator('#opening').getByRole('button', { name: '공지 모집 일정 및 지원 안내' })
      await expect(notice).toBeInViewport({ ratio: 1 })
      await notice.click()
      await expect(page).toHaveURL(/\/recruit-notice$/)
    }
    expect(memberNoticeRequests).toHaveLength(0)
  })

  test('opens a compact home index, jumps to a scene, and dismisses', async ({ page }) => {
    const rail = page.getByRole('navigation', { name: '장면 이동' })
    const toggle = rail.getByRole('button', { name: '홈 목차' })
    const list = rail.getByRole('list', { name: '홈 구간', exact: true })
    const markers = rail.getByRole('list', { name: '홈 구간 바로가기' })
    const progress = rail.getByRole('progressbar', { name: '홈 스크롤 진행률' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(toggle).toHaveAccessibleDescription('홈')
    await expect(progress).toHaveAttribute('aria-valuenow', '0')
    await expect(markers.getByRole('button')).toHaveCount(6)
    await expect(markers.getByRole('button', { name: '홈', exact: true })).toHaveAttribute('aria-current', 'true')
    await expect(list).toBeHidden()
    await expect.poll(async () => {
      const { y, height } = await rail.boundingBox()
      return y + height / 2
    }).toBeCloseTo(page.viewportSize().height / 2, 0)
    const [scene, position] = await Promise.all([
      page.locator('#activities .scene-inner').boundingBox(),
      rail.boundingBox(),
    ])
    expect(scene.x + scene.width).toBeLessThan(position.x)
    await toggle.click()
    await expect(list.getByRole('button')).toHaveCount(6)
    await expect(list.getByRole('button', { name: '모집' })).toBeVisible()
    await list.getByRole('button', { name: '프로젝트' }).click()
    await expect(page.locator('#projects')).toBeInViewport()
    await expect(list).toBeHidden()
    await expect(toggle).toBeFocused()
    await expect(toggle).toHaveAccessibleDescription('프로젝트')
    await expect(markers.getByRole('button', { name: '프로젝트' })).toHaveAttribute('aria-current', 'true')
    await expect(markers.getByRole('button', { name: '동아리 활동' })).toHaveAttribute('data-passed', '')
    await expect.poll(async () => Number(await progress.getAttribute('aria-valuenow'))).toBeGreaterThan(0)
    await toggle.click()
    await expect(list.getByRole('button', { name: '프로젝트' })).toHaveAttribute('aria-current', 'true')
    await page.keyboard.press('Escape')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(toggle).toBeFocused()
    await toggle.click()
    await page.mouse.click(48, 180)
    await expect(list).toBeHidden()
    await markers.getByRole('button', { name: '모집' }).click()
    await expect(toggle).toHaveAccessibleDescription('모집')
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await expect(progress).toHaveAttribute('aria-valuenow', '100')
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect(progress).toHaveAttribute('aria-valuenow', '0')
    await expect(toggle).toHaveAccessibleDescription('홈')
  })

  test('native wheel scroll reveals a chapter divider and a brief backdrop cue', async ({ page }) => {
    const divider = page.locator('.scene-divider').first()
    const signal = divider.locator('.scene-divider__signal')
    const about = page.locator('#about')
    await expect(page.locator('.cine-root.cine-ready #opening h1')).toBeVisible()
    await page.mouse.move(400, 400)
    await page.mouse.wheel(0, 670)
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(450)
    await expect(divider).toHaveClass(/is-revealed/)
    await expect.poll(() => divider.evaluate((el) => getComputedStyle(el, '::after').animationName))
      .toBe('chapter-divider-entry')
    await expect(signal).toBeVisible()
    await expect(signal).not.toHaveCSS('transform', 'none')
    await expect(about).toHaveClass(/is-onscreen/)
    const backdrop = about.locator('.scene-bg')
    await expect.poll(() => backdrop.evaluate((el) => getComputedStyle(el, '::after').animationName)).toBe('chapter-backdrop-entry')
    await expect.poll(() => backdrop.evaluate((el) => getComputedStyle(el, '::after').animationIterationCount)).toBe('1')
    await expect.poll(() => backdrop.evaluate((el) => getComputedStyle(el, '::after').opacity)).toBe('0')

    const rail = page.getByRole('navigation', { name: '장면 이동' })
    const toggle = rail.getByRole('button', { name: '홈 목차' })
    await toggle.focus()
    await page.keyboard.press('Enter')
    const projects = rail.getByRole('list', { name: '홈 구간', exact: true }).getByRole('button', { name: '프로젝트' })
    await projects.focus()
    await page.keyboard.press('Enter')
    await expect(toggle).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(projects).toHaveAttribute('aria-current', 'true')

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect.poll(() => divider.evaluate((el) => getComputedStyle(el, '::after').animationName)).toBe('none')
    await expect.poll(() => backdrop.evaluate((el) => getComputedStyle(el, '::after').animationName)).toBe('none')
    await expect(signal).toBeHidden()
  })

  test('has no horizontal overflow at 1440 and 390', async ({ page }) => {
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      await page.setViewportSize({ width, height })
      await page.goto('/')
      await page.evaluate(async () => {
        for (let y = 0; y <= document.body.scrollHeight; y += 700) {
          window.scrollTo(0, y)
          await new Promise((resolve) => setTimeout(resolve, 40))
        }
      })
      expect(await overflow(page), `${width}px`).toBeLessThanOrEqual(0)
    }
  })

  test('says the new manifesto sentence, word by word', async ({ page }) => {
    const title = page.locator('.scene-about__pin h2')
    await expect(title).toHaveText('배운 건 만들어 보고, 만든 건 함께 나눕니다.')
    expect(await page.locator('.scene-about__pin .cine-w').count()).toBe(8)
  })

  test('restores the original wordmark and wireframe accent with Korean activity cues', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    const activities = page.getByRole('list', { name: '주요 활동' })
    await expect(activities).toBeVisible()
    await expect(activities.getByRole('listitem')).toHaveText(['정기 세미나', '팀 프로젝트', '부원 교류'])
    const opening = page.locator('#opening')
    await expect(opening.getByRole('heading', { name: "COM's" })).toBeVisible()
    await expect(opening.locator('.scene-opening__cube')).toBeVisible()
    await expect(opening.getByRole('img')).toHaveCount(0)
    await expect(page.locator('.scene-opening__art')).toBeHidden()
    const lede = await opening.locator('.scene-opening__lede').boundingBox()
    const [intro, join] = await Promise.all([
      opening.getByRole('button', { name: '동아리 소개' }).boundingBox(),
      opening.getByRole('button', { name: '지원하기' }).boundingBox(),
    ])
    expect(lede.x + lede.width / 2).toBeCloseTo(720, 0)
    expect((intro.x + join.x + join.width) / 2).toBeCloseTo(720, 0)
  })

  test('loops run only while their scene is on screen', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    const state = (selector) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).animationPlayState)
    await expect.poll(() => state('.floor__plane i')).toBe('running')
    await expect.poll(() => state('.coms-os-ring')).toBe('paused')
    await page.locator('.scene-about__visual').scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollBy(0, 200))
    await expect.poll(() => state('.coms-os-ring')).toBe('running')
    await expect.poll(() => state('.floor__plane i')).toBe('paused')
  })

  test('no running loop belongs to a scene that is off screen, wherever the page is scrolled', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    const strays = () => page.evaluate(() => {
      const bad = []
      let loops = 0
      for (const a of document.getAnimations()) {
        const target = a.effect?.target
        if (!(a instanceof CSSAnimation) || !target || !target.closest('.cine-root')) continue
        if (a.effect.getComputedTiming().iterations !== Infinity || a.playState !== 'running') continue
        loops += 1
        const off = target.closest('[data-scene]:not(.is-onscreen)') || !target.closest('[data-scene]')
        if (off) bad.push(`${a.animationName} on ${target.tagName.toLowerCase()}.${String(target.className).slice(0, 30)}`)
      }
      return { bad, loops }
    })
    for (const selector of ['#opening', '.scene-about__visual', '#activities', '#projects', '#members', '#recruit']) {
      await page.locator(selector).first().scrollIntoViewIfNeeded()
      await page.evaluate(() => window.scrollBy(0, 120))
      await page.waitForTimeout(400)
      const { bad } = await strays()
      expect(bad, `at ${selector}`).toEqual([])
    }
    // The check is not vacuous: back at the top the opening's own loops are running.
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(400)
    expect((await strays()).loops).toBeGreaterThan(3)
  })

  test('a figure that is mid-count when calm turns on at runtime shows its final value', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    const figure = page.locator('#activities .scene-stats dt').first()
    await expect(figure.locator('[aria-hidden]')).toHaveText('00')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(figure.locator('[aria-hidden]')).toHaveText('01')
  })

  test('standard dividers are thin full-width rules without repeated chapter words', async ({ page }) => {
    for (const [width, height] of [[1440, 900], [390, 844], [1920, 1080]]) {
      await page.setViewportSize({ width, height })
      await page.goto('/')
      const dividers = page.locator('.scene-divider')
      await expect(dividers).toHaveCount(5)
      await expect(dividers.first().locator('.scene-divider__text')).toBeHidden()
      for (const divider of await dividers.all()) {
        const bounds = await divider.boundingBox()
        expect(bounds.width, `${width}px`).toBeGreaterThanOrEqual(width - 1)
        expect(bounds.height).toBeLessThanOrEqual(3)
      }
    }
  })

  test('the wordmark sheen peak and bottom tone stay at 3:1 or better in both themes for any accent', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    for (const theme of ['light', 'dark']) {
      for (const accent of ['#0071e3', '#3c3c43', '#d70015', '#ff9f0a', '#8e5cf7', '#ffd60a', '#ffffff', '#f5f5f0', '#000000']) {
        const page2 = await page.context().newPage()
        await page2.addInitScript(([t, value]) => {
          localStorage.setItem('kwcoms-theme-mode:v2', t)
          localStorage.setItem('kwcoms-accent-color', value)
          sessionStorage.setItem('coms.intro.played:v1', '1')
        }, [theme, accent])
        await mockOptionalApis(page2)
        await page2.goto('/')
        await expect(page2.locator('.scene-wordmark')).toBeAttached()
        const ratios = await page2.evaluate(() => {
          const rgb = (css) => {
            const ctx = document.createElement('canvas').getContext('2d')
            ctx.fillStyle = css
            ctx.fillRect(0, 0, 1, 1)
            return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3))
          }
          const lum = ([r, g, b]) => [r, g, b].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0)
          const bg = lum(rgb(getComputedStyle(document.querySelector('.scenes')).backgroundColor))
          const ratio = (css) => {
            const probe = document.createElement('i')
            probe.style.color = css
            document.querySelector('.scene-wordmark').append(probe)
            const fg = lum(rgb(getComputedStyle(probe).color))
            probe.remove()
            return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)
          }
          return { peak: ratio('var(--sheen-hi)'), tone: ratio('color-mix(in srgb, var(--app-text) 70%, var(--app-accent))') }
        })
        await page2.close()
        expect(ratios.peak, `${theme} ${accent} peak`).toBeGreaterThanOrEqual(3)
        expect(ratios.tone, `${theme} ${accent} tone`).toBeGreaterThanOrEqual(3)
      }
    }
  })

  test('turning reduced motion on drops the pointer offsets left on the opening', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    // The listener is attached once the scenes are ready; keep moving until it has answered.
    await expect(page.locator('.cine-root')).toHaveClass(/cine-ready/)
    let x = 900
    await expect.poll(async () => {
      await page.mouse.move((x += 7), 300)
      return page.locator('#opening').evaluate((el) => el.style.getPropertyValue('--px'))
    }).not.toBe('')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect.poll(() => page.locator('#opening').evaluate((el) => el.style.getPropertyValue('--px'))).toBe('')
  })

  test('keeps each backdrop without displaying decorative chapter numbers', async ({ page }) => {
    await expect(page.locator('.scene-divider')).toHaveCount(5)
    for (const id of ['about', 'activities', 'projects', 'members', 'recruit']) {
      await expect(page.locator(`#${id} .scene-bg`)).toHaveCount(1)
      await expect(page.locator(`#${id} .scene-bg__numeral`)).toBeHidden()
    }
  })

  test('the manifesto stays pinned while its words light up, then lets go', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    const track = page.locator('.scene-about__track')
    const title = page.locator('.scene-about__pin h2')
    const logo = page.locator('#about .scene-bg__logo')
    const first = page.locator('.scene-about__pin .cine-w').first()
    const last = page.locator('.scene-about__pin .cine-w').last()
    const top = await track.evaluate((el) => el.getBoundingClientRect().top + window.scrollY)
    const span = await track.evaluate((el) => el.offsetHeight - window.innerHeight)
    const at = async (progress) => {
      await page.evaluate((y) => window.scrollTo(0, y), top + progress * span)
      await page.waitForTimeout(150)
    }
    await at(0.05)
    // The web font can arrive after first paint and change the line height by a pixel: wait for it.
    await page.evaluate(() => document.fonts.ready)
    // The title rises into place when it first appears: measure once that entrance has finished.
    await title.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}))))
    const y1 = (await title.boundingBox()).y
    const earlyLast = await last.evaluate((el) => getComputedStyle(el).color)
    const earlyLogo = await logo.evaluate((el) => getComputedStyle(el).transform)
    await at(0.6)
    const y2 = (await title.boundingBox()).y
    expect(Math.abs(y1 - y2)).toBeLessThanOrEqual(1)
    await expect(logo).not.toHaveCSS('transform', earlyLogo)
    await at(1)
    const lateLast = await last.evaluate((el) => getComputedStyle(el).color)
    const firstColor = await first.evaluate((el) => getComputedStyle(el).color)
    expect(lateLast).not.toBe(earlyLast)
    expect(lateLast).toBe(firstColor)
  })
})

for (const [label, setup] of [
  ['reduced motion', async (page) => { await page.emulateMedia({ reducedMotion: 'reduce' }) }],
  ['lite mode', async (page) => { await forceLite(page) }],
]) {
  test.describe(`with ${label}`, () => {
    test('every scene is plain flow with all its text visible, no scrolling tricks needed', async ({ page }) => {
      await setup(page)
      await mockOptionalApis(page)
      await skipIntro(page)
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto('/')
      await page.waitForTimeout(500)
      // No pin: the manifesto's track is as tall as its content, not 180vh.
      expect(await page.locator('.scene-about__pin').evaluate((el) => getComputedStyle(el).position)).toBe('static')
      // Straight from load, without scrolling an inch: nothing is left transparent, clipped or lowered.
      expect(await hiddenTextElements(page)).toEqual([])
      // The default opening keeps the wordmark and pauses the decorative effects.
      await expect(page.locator('#opening').getByRole('heading', { name: "COM's" })).toBeVisible()
      await expect(page.locator('.scene-opening__cube')).toBeHidden()
      await expect(page.locator('.scene-opening__art')).toBeHidden()
      await expect(page.locator('.cine-grain')).toBeHidden()
      await expect(page.locator('.scene-opening__floor')).toBeHidden()
      await expect(page.locator('.scene-opening__ticker')).toBeHidden()
      await expect(page.getByRole('list', { name: '주요 활동' })).toContainText('정기 세미나')
      // Numbers are finished figures, not mid-count.
      await expect(page.locator('#activities .scene-stats dt').first()).toContainText('01')
      expect(await overflow(page)).toBeLessThanOrEqual(0)
      // Nothing animates anywhere on the page: no running CSS animation, however far it is scrolled.
      await page.evaluate(async () => {
        for (let y = 0; y <= document.body.scrollHeight; y += 600) {
          window.scrollTo(0, y)
          await new Promise((resolve) => setTimeout(resolve, 30))
        }
      })
      const running = await page.evaluate(() =>
        document.getAnimations().filter((a) => a instanceof CSSAnimation && a.playState === 'running' && a.effect?.target?.closest('.cine-root')).map((a) => a.animationName),
      )
      expect(running).toEqual([])
    })
  })
}


test('a member\'s latest-notice buttons appear after a slow notices response', async ({ page }) => {
  await mockAdminApis(page)
  await skipIntro(page)
  // Later routes win: the notices arrive well after the first scan of reveal elements.
  await page.route('**/api/notices', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200))
    await route.fulfill({ json: [{ id: 3, title: '늦게 도착한 공지', content: '', category: 'GENERAL', createdAt: '2026-11-01T10:00:00' }] })
  })
  await page.goto('/')
  const openingNotice = page.locator('#opening').getByRole('button', { name: '공지 늦게 도착한 공지' })
  await expect(openingNotice).toBeInViewport({ ratio: 1 })
  const lead = page.locator('.scene-notice--lead')
  await expect(lead).toBeAttached({ timeout: 8000 })
  await lead.scrollIntoViewIfNeeded()
  await expect(lead).toHaveCSS('opacity', '1')
  await expect(openingNotice).toHaveCSS('opacity', '1')
  await openingNotice.click()
  await expect(page).toHaveURL(/\/notices\/3$/)
})

// The rail names the scene under the middle of the viewport, scrolling down and back up, with the
// tall pinned manifesto and with the member's order (the members scene second).
for (const [width, height] of [[1440, 900], [1280, 720]]) {
  for (const who of ['guest', 'member']) {
    test(`the scene rail follows the middle of the viewport at ${width}x${height}, ${who}`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      if (who === 'member') await mockAdminApis(page)
      else await mockOptionalApis(page)
      await skipIntro(page)
      await page.goto('/')
      const rail = page.getByRole('navigation', { name: '장면 이동' })
      await rail.getByRole('button', { name: '홈 목차' }).click()
      const menu = rail.getByRole('list', { name: '홈 구간', exact: true })
      const chapters = menu.getByRole('button')
      await expect(chapters).toHaveCount(6)
      if (who === 'member') await expect(chapters.nth(1)).toHaveAccessibleName('오늘의 COM’s')
      const ids = await page.locator('main > section').evaluateAll((els) => els.map((el) => el.id))
      const total = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
      const stops = []
      for (let y = 0; y <= total; y += 240) stops.push(y)
      stops.push(total)
      const seen = new Set()
      for (const y of [...stops, ...[...stops].reverse()]) {
        await page.evaluate((to) => window.scrollTo(0, to), y)
        // The scene whose box holds the middle line.
        const expected = await page.evaluate(() => {
          const middle = window.innerHeight / 2
          return [...document.querySelectorAll('main > section')].find((el) => { const r = el.getBoundingClientRect(); return r.top <= middle && middle < r.bottom })?.id
        })
        if (!expected) continue
        seen.add(expected)
        const index = ids.indexOf(expected)
        await expect(chapters.nth(index), `y=${y} scene ${expected}`).toHaveAttribute('aria-current', 'true')
        await expect(menu.locator('[aria-current="true"]')).toHaveCount(1)
        await expect(rail.locator('.scene-rail__marker[aria-current="true"]')).toHaveAccessibleName(await chapters.nth(index).textContent())
      }
      expect([...seen].sort()).toEqual([...ids].sort())
    })
  }
}
