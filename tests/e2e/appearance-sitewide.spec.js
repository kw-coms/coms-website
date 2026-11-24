import { expect, test } from '@playwright/test'
import { mockActivityTimeline, mockAdminApis, mockOptionalApis } from './visualSupport.js'

const routes = ['/', '/activities', '/study', '/recruit', '/login', '/admin?tab=files']
const themes = ['standard', 'terminal', 'retro', 'blueprint']
const modes = ['light', 'dark']

// Resolve semantic tokens in the browser, so color-mix() and user accents are measured after cascading.
async function contrastRatios(page) {
  return page.evaluate(() => {
    const probe = document.createElement('span')
    document.body.append(probe)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const pixel = canvas.getContext('2d', { willReadFrequently: true })
    const color = (token) => {
      probe.style.color = `var(${token})`
      return getComputedStyle(probe).color
    }
    const luminance = (cssColor) => {
      pixel.clearRect(0, 0, 1, 1)
      pixel.fillStyle = cssColor
      pixel.fillRect(0, 0, 1, 1)
      const rgb = pixel.getImageData(0, 0, 1, 1).data
      const [red, green, blue] = Array.from(rgb, (channel) => {
        const value = channel / 255
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
      })
      return red * 0.2126 + green * 0.7152 + blue * 0.0722
    }
    const ratio = (foreground, background) => {
      const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
      return (values[0] + 0.05) / (values[1] + 0.05)
    }
    const tokenRatio = (foreground, background) => ratio(color(foreground), color(background))
    const body = getComputedStyle(document.body)
    const primary = document.querySelector('#main-content .apple-action-primary')
    const measured = {
      body: ratio(body.color, body.backgroundColor),
      bodyOnCard: tokenRatio('--app-text', '--app-surface'),
      muted: tokenRatio('--app-muted', '--app-bg'),
      mutedOnCard: tokenRatio('--app-muted', '--app-surface'),
      link: tokenRatio('--app-accent-text', '--app-bg'),
      primaryButton: tokenRatio('--app-accent-on', '--app-accent'),
      badge: tokenRatio('--app-accent-text', '--app-accent-soft'),
    }
    if (primary) {
      const button = getComputedStyle(primary)
      // App-specific hero links can be transparent and use a separate artwork palette.
      if (button.backgroundColor !== 'rgba(0, 0, 0, 0)') measured.paintedPrimary = ratio(button.color, button.backgroundColor)
    }
    probe.remove()
    return measured
  })
}

for (const theme of themes) {
  for (const mode of modes) {
    for (const route of routes) {
    test(`${theme} ${mode} styles shared controls on ${route}`, async ({ page }) => {
      test.setTimeout(60_000)
      await page.addInitScript(({ appearance, brightness }) => {
        localStorage.setItem('kwcoms-appearance-theme:v1', appearance)
        localStorage.setItem('kwcoms-theme-mode:v2', brightness)
        localStorage.setItem('kwcoms-intro-style:v1', 'off')
        sessionStorage.setItem('coms.intro.played:v1', '1')
      }, { appearance: theme, brightness: mode })
      await mockOptionalApis(page)
      await mockActivityTimeline(page)
      await page.route('**/api/site-settings', (request) => request.fulfill({ json: {} }))
      await page.route('**/api/files', (request) => request.fulfill({ json: [] }))

      {
        if (route.startsWith('/admin')) await mockAdminApis(page)
        await page.goto(route)
        await expect(page.locator('html')).toHaveAttribute('data-appearance-theme', theme)
        await expect(page.locator('html')).toHaveAttribute('data-theme-mode', mode)

        const heading = page.locator('#main-content h1').first()
        await expect(heading).toBeVisible()
        const styles = await page.evaluate(() => {
          const body = getComputedStyle(document.body)
          const heading = getComputedStyle(document.querySelector('#main-content h1'))
          const button = getComputedStyle(document.querySelector('header button'))
          return {
            backgroundImage: body.backgroundImage,
            headingFont: heading.fontFamily,
            buttonFont: button.fontFamily,
          }
        })
        const cardSelector = {
          '/activities': '.act-card',
          '/study': '.study-card',
          '/recruit': '.apple-board-shell',
          '/login': '.appearance-auth-panel',
        }[route]
        if (cardSelector && theme !== 'standard') {
          const card = page.locator(`#main-content ${cardSelector}`).first()
          await expect(card).toHaveCSS('border-top-left-radius', { terminal: '0px', retro: '4px', blueprint: '2px' }[theme])
          await expect(card).toHaveCSS('box-shadow', theme === 'retro' ? /0px 0px 0px 2px inset.*3px 3px 0px/ : /0px 0px 0px 1px inset/)
        }

        if (theme === 'terminal') {
          expect(styles.headingFont, route).toMatch(/mono/i)
          expect(styles.buttonFont, route).toMatch(/mono/i)
          if (route === '/login') {
            const field = page.locator('#main-content input[type="password"]').first()
            await field.focus()
            await expect(field).toHaveCSS('outline-style', 'solid')
            await expect(field).toHaveCSS('animation-name', 'appearance-caret')
            await page.emulateMedia({ reducedMotion: 'reduce' })
            await expect(field).toHaveCSS('animation-name', 'none')
            await page.emulateMedia({ reducedMotion: 'no-preference' })
            await field.blur()
          }
        }
        if (theme === 'blueprint') {
          expect(styles.backgroundImage, route).toContain('linear-gradient')
          expect(styles.headingFont, route).toMatch(/Arial Narrow|Aptos Narrow|Roboto Condensed/i)
          if (route !== '/') await expect(page.locator('.page-crumb').first()).toHaveCSS('text-transform', 'uppercase')
          if (route === '/recruit') {
            const buttonBackground = await page.locator('.apple-action-primary').first().evaluate((element) => getComputedStyle(element).backgroundColor)
            const surfaceBackground = await page.evaluate(() => {
              const probe = document.createElement('span')
              probe.style.backgroundColor = 'var(--app-surface)'
              document.body.append(probe)
              const value = getComputedStyle(probe).backgroundColor
              probe.remove()
              return value
            })
            expect(buttonBackground, route).toBe(surfaceBackground)
          }
        }

        if (route === '/activities' && theme !== 'standard') {
          const badge = page.locator('.act-status').first()
          await expect(badge).toBeAttached()
          await expect(badge).toHaveCSS('border-top-left-radius', theme === 'terminal' ? '0px' : theme === 'retro' ? '3px' : '2px')
        }

        if (theme === 'standard') {
          // Baseline measured on a build of origin/main (3d4cc2af) with the same probe: the standard look must not move.
          const baseline = { '/activities': ['.act-card', { radius: '18px', shadow: 'none', background: { light: 'color(srgb 1 1 1 / 0.78)', dark: 'color(srgb 0.109804 0.113725 0.133333 / 0.78)' } }],
            '/recruit': ['.apple-action-primary', { radius: '9999px', shadow: 'none', background: 'rgb(0, 113, 227)' }] }[route]
          if (baseline) {
            const [selector, expected] = baseline
            const target = page.locator(`#main-content ${selector}`).first()
            await expect(target).toHaveCSS('border-top-left-radius', expected.radius)
            await expect(target).toHaveCSS('box-shadow', expected.shadow)
            await expect(target).toHaveCSS('background-color', expected.background[mode] ?? expected.background)
            await expect(target).toHaveCSS('background-image', 'none')
            await expect(target).toHaveCSS('font-family', /^"Pretendard Variable", "Pretendard Fallback Latin"/)
          }
        }

        if (theme === 'retro' && route === '/activities') {
          // Window title bar painted on the card heading, and a hard (blur-free) offset shadow on the card.
          await expect(page.locator('#main-content .act-card-title').first()).not.toHaveCSS('background-image', 'none')
          const shadow = await page.locator('#main-content .act-card').first().evaluate((element) => getComputedStyle(element).boxShadow)
          // offset-x offset-y blur spread: the outer shadow has zero blur.
          expect(shadow).toMatch(/ 3px 3px 0px 0px$/)
        }

        if ((theme === 'blueprint' || theme === 'retro') && route === '/login') {
          const field = page.locator('#main-content input[type="password"]').first()
          await field.focus()
          await expect(field).toHaveCSS('outline-style', 'solid')
          await expect(field).toHaveCSS('outline-width', '2px')
          await field.blur()
        }

        const contrast = await contrastRatios(page)
        for (const [name, value] of Object.entries(contrast)) {
          expect(value, `${theme} ${mode} ${route} ${name} contrast`).toBeGreaterThanOrEqual(4.5)
        }
      }
    })
    }
  }
}
