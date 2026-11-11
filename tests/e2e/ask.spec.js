import { expect, test } from '@playwright/test'
import { mockOptionalApis } from './visualSupport.js'
import { RECRUIT_FACTS } from '../../src/data/recruitFacts'

test.use({ serviceWorkers: 'block' })

async function openFaq(page, enabled = true) {
  await mockOptionalApis(page)
  await page.route('**/api/site-settings', (route) => route.fulfill({ json: { askEnabled: enabled } }))
  await page.goto('/about')
  await page.getByRole('button', { name: '질문하기' }).click()
  return page.getByRole('dialog', { name: "COM's 질문하기" })
}

async function openAsk(page) {
  const dialog = await openFaq(page)
  await dialog.getByRole('button', { name: '다른 질문 보내기' }).click()
  return dialog
}

for (const enabled of [true, false]) {
  test(`three FAQ answers stay local with email contact ${enabled ? 'enabled' : 'disabled'}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    let posts = 0
    await page.route('**/api/ask', (route) => { posts += 1; return route.fulfill({ status: 204 }) })
    const dialog = await openFaq(page, enabled)
    const faqs = dialog.getByRole('group', { name: '자주 묻는 질문' }).getByRole('button')
    await expect(faqs).toHaveText(['어떻게 가입하나요?', '코딩을 처음 해도 괜찮나요?', '회비와 동아리방이 궁금해요'])
    const groupWidth = (await dialog.getByRole('group', { name: '자주 묻는 질문' }).boundingBox()).width
    for (const width of await faqs.evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().width))) expect(width).toBeGreaterThanOrEqual(groupWidth - 1)
    for (const [index, expected] of [[0, '로그인 없이'], [1, '코딩이 처음이어도 괜찮'], [2, `${RECRUIT_FACTS.fee}, 동아리방은 ${RECRUIT_FACTS.room}`]]) {
      await faqs.nth(index).click()
      await expect(dialog.locator('.coms-ask-bubble--club').last()).toContainText(expected)
      await expect(dialog.locator('.coms-ask-bubble--club').last()).toBeFocused()
      await expect(dialog.getByRole('link', { name: /안내 보기/ })).toHaveAttribute('href', '/recruit')
      await dialog.getByRole('button', { name: '자주 묻는 질문으로' }).click()
    }
    expect(posts).toBe(0)
    if (!enabled) {
      await expect(dialog.getByRole('button', { name: '다른 질문 보내기' })).toBeDisabled()
      await expect(dialog).toContainText('지금은 이메일 문의를 받지 않고 있어요.')
    }
  })
}

test('guest question and reply email reach the mail endpoint', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  let sent
  await page.route('**/api/ask', async (route) => {
    sent = route.request().postDataJSON()
    await route.fulfill({ status: 204 })
  })
  const dialog = await openAsk(page)
  await expect(dialog).toContainText('사람이 직접 읽고 메일로 답해 드려요.')
  await dialog.getByRole('textbox', { name: '질문' }).fill('스터디는 언제 시작하나요?')
  await dialog.getByRole('button', { name: '다음' }).click()
  await expect(dialog).toContainText('스터디는 언제 시작하나요?')
  await dialog.getByRole('textbox', { name: '답장받을 이메일' }).fill('test@example.com')
  await dialog.getByRole('textbox', { name: '이름 (선택)' }).fill('Test Member')
  await expect(dialog.getByRole('textbox', { name: '답장받을 이메일' })).toHaveValue('test@example.com')
  await expect(dialog.getByRole('textbox', { name: '이름 (선택)' })).toHaveValue('Test Member')
  await dialog.getByRole('button', { name: '질문 보내기' }).click()
  await expect(dialog).toContainText('답변은 이메일로 도착할 거예요.')
  await expect(dialog.getByRole('button', { name: '질문 창 닫기' })).toBeFocused()
  expect(sent).toEqual({ question: '스터디는 언제 시작하나요?', replyEmail: 'test@example.com', name: 'Test Member', honeypot: '', pagePath: '/about' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
})

test('member email is prefilled and can be changed', async ({ page }) => {
  let sent
  await page.route('**/api/ask', async (route) => {
    sent = route.request().postDataJSON()
    await route.fulfill({ status: 204 })
  })
  await mockOptionalApis(page)
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { id: 7, studentId: '2026000000', name: 'Test Member', email: 'test@example.com', role: 'USER', emailVerified: true } }))
  await page.route('**/api/site-settings', (route) => route.fulfill({ json: { askEnabled: true } }))
  await page.goto('/about')
  const dialog = await page.getByRole('button', { name: '질문하기' }).click().then(() => page.getByRole('dialog', { name: "COM's 질문하기" }))
  await dialog.getByRole('button', { name: '다른 질문 보내기' }).click()
  await dialog.getByRole('textbox', { name: '질문' }).fill('부원도 참여할 수 있나요?')
  await dialog.getByRole('button', { name: '다음' }).click()
  await expect(dialog.getByRole('textbox', { name: '답장받을 이메일' })).toHaveValue('test@example.com')
  await dialog.getByRole('textbox', { name: '답장받을 이메일' }).fill('other@example.com')
  await dialog.getByRole('button', { name: '질문 보내기' }).click()
  await expect(dialog).toContainText('답변은 이메일로 도착할 거예요.')
  expect(sent.replyEmail).toBe('other@example.com')
  expect(sent.name).toBeUndefined()
  expect(sent.studentId).toBeUndefined()
})

test('rate-limit error appears as a bubble and retry succeeds', async ({ page }) => {
  let calls = 0
  await page.route('**/api/ask', async (route) => {
    calls += 1
    await route.fulfill(calls === 1 ? { status: 429, json: { message: '질문이 너무 많습니다.' } } : { status: 204 })
  })
  const dialog = await openAsk(page)
  await dialog.getByRole('textbox', { name: '질문' }).fill('답장을 받을 수 있나요?')
  await dialog.getByRole('button', { name: '다음' }).click()
  await dialog.getByRole('textbox', { name: '답장받을 이메일' }).fill('test@example.com')
  await dialog.getByRole('button', { name: '질문 보내기' }).click()
  await expect(dialog.locator('.coms-ask-bubble--error')).toContainText('잠시 동안 질문을 너무 많이 보내셨어요.')
  await expect(dialog.locator('.coms-ask-bubble--error')).toBeInViewport()
  await dialog.getByRole('button', { name: '다시 시도' }).click()
  await expect(dialog).toContainText('답변은 이메일로 도착할 거예요.')
  expect(calls).toBe(2)
})

test('question validation stays in the chat and can be corrected', async ({ page }) => {
  const dialog = await openAsk(page)
  await dialog.getByRole('textbox', { name: '질문' }).fill('짧음')
  await dialog.getByRole('button', { name: '다음' }).click()
  await expect(dialog.locator('.coms-ask-bubble--error')).toContainText('5자 이상')
  await dialog.getByRole('textbox', { name: '질문' }).fill('질문을 더 길게 씁니다.')
  await dialog.getByRole('button', { name: '다시 시도' }).click()
  await expect(dialog.getByRole('textbox', { name: '답장받을 이메일' })).toBeVisible()
})

test('disabled mail endpoint reports 503 and can retry', async ({ page }) => {
  let calls = 0
  await page.route('**/api/ask', async (route) => {
    calls += 1
    await route.fulfill(calls === 1 ? { status: 503, json: { message: '질문 기능을 사용할 수 없습니다.' } } : { status: 204 })
  })
  const dialog = await openAsk(page)
  await dialog.getByRole('textbox', { name: '질문' }).fill('운영 시간은 언제인가요?')
  await dialog.getByRole('button', { name: '다음' }).click()
  await dialog.getByRole('textbox', { name: '답장받을 이메일' }).fill('test@example.com')
  await dialog.getByRole('button', { name: '질문 보내기' }).click()
  await expect(dialog.locator('.coms-ask-bubble--error')).toContainText('지금은 질문을 받지 못하고 있어요.')
  await dialog.getByRole('button', { name: '다시 시도' }).click()
  await expect(dialog).toContainText('답변은 이메일로 도착할 거예요.')
})

test('network failure is announced and retry succeeds', async ({ page }) => {
  let calls = 0
  await page.route('**/api/ask', async (route) => {
    calls += 1
    if (calls === 1) await route.abort('failed')
    else await route.fulfill({ status: 204 })
  })
  const dialog = await openAsk(page)
  await dialog.getByRole('textbox', { name: '질문' }).fill('문의 접수 가능할까요?')
  await dialog.getByRole('button', { name: '다음' }).click()
  await dialog.getByRole('textbox', { name: '답장받을 이메일' }).fill('test@example.com')
  await dialog.getByRole('button', { name: '질문 보내기' }).click()
  await expect(dialog.locator('.coms-ask-bubble--error')).toContainText('연결을 확인하고 다시 시도해 주세요.')
  await dialog.getByRole('button', { name: '다시 시도' }).click()
  await expect(dialog).toContainText('답변은 이메일로 도착할 거예요.')
})

test('keyboard focus stays in the dialog and Escape restores the opener', async ({ page }) => {
  await mockOptionalApis(page)
  await page.route('**/api/site-settings', (route) => route.fulfill({ json: { askEnabled: true } }))
  await page.goto('/about')
  const opener = page.getByRole('button', { name: '질문하기' })
  await opener.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: "COM's 질문하기" })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '어떻게 가입하나요?' })).toBeFocused()
  await dialog.getByRole('button', { name: '다른 질문 보내기' }).click()
  await expect(dialog.getByRole('textbox', { name: '질문' })).toBeFocused()
  await expect(opener).toBeHidden()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: '다음' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: '질문 창 닫기' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
})

test('Escape restores the opener after sending on reduced-motion home', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    localStorage.setItem('coms.tour.guest.seen:v1', '1')
    sessionStorage.setItem('coms.intro.played:v1', '1')
  })
  await page.route('**/api/**', (route) => route.fulfill({ json: [] }))
  await mockOptionalApis(page)
  await page.route('**/api/site-settings', (route) => route.fulfill({ json: { askEnabled: true } }))
  await page.route('**/api/ask', (route) => route.fulfill({ status: 204 }))
  await page.goto('/')
  const opener = page.getByRole('button', { name: '질문하기' })
  await opener.click()
  const dialog = page.getByRole('dialog', { name: "COM's 질문하기" })
  await dialog.getByRole('button', { name: '다른 질문 보내기' }).click()
  await dialog.getByRole('textbox', { name: '질문' }).fill('스터디에 참여할 수 있나요?')
  await dialog.getByRole('button', { name: '다음' }).click()
  await dialog.getByRole('textbox', { name: '답장받을 이메일' }).fill('reply@example.com')
  await dialog.getByRole('button', { name: '질문 보내기' }).click()
  await expect(dialog).toContainText('질문을 보냈어요.')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
})

test('new messages use one polite announcement region and controls meet touch size', async ({ page }) => {
  const dialog = await openAsk(page)
  const messages = dialog.locator('.coms-ask-messages')
  await expect(dialog.getByRole('banner')).toHaveCount(0)
  await expect(messages).toHaveAttribute('aria-live', 'polite')
  await dialog.getByRole('textbox', { name: '질문' }).fill('짧음')
  await dialog.getByRole('button', { name: '다음' }).click()
  await expect(dialog.locator('.coms-ask-bubble--error')).toBeVisible()
  expect(await messages.locator('[aria-live], [role="status"]').count()).toBe(0)
  const controls = dialog.locator('button, textarea, input:not([tabindex="-1"])')
  for (let i = 0; i < await controls.count(); i += 1) {
    const box = await controls.nth(i).boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(44)
    expect(box?.height).toBeGreaterThanOrEqual(44)
  }
})

test('floating button clears footer controls and stays focusable after late scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockOptionalApis(page)
  await page.route('**/api/site-settings', (route) => route.fulfill({ json: { askEnabled: true } }))
  await page.goto('/about')
  const opener = page.getByRole('button', { name: '질문하기' })
  await expect(opener).toBeVisible()
  await opener.click()
  const dialog = page.getByRole('dialog', { name: "COM's 질문하기" })
  await page.locator('.appearance-actions').scrollIntoViewIfNeeded()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
  await expect(opener).toBeVisible()
  const button = await opener.boundingBox()
  const controls = await page.locator('.appearance-actions').boundingBox()
  expect(button.y + button.height <= controls.y || button.y >= controls.y + controls.height).toBe(true)
})

test('phone keyboard leaves the reply controls in the visible viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: Object.assign(new EventTarget(), { height: 420, offsetTop: 0 }),
    })
  })
  const dialog = await openAsk(page)
  await dialog.getByRole('textbox', { name: '질문' }).fill('답장받을 수 있나요?')
  await dialog.getByRole('button', { name: '다음' }).click()
  const box = await dialog.boundingBox()
  expect(box.y).toBeGreaterThanOrEqual(80)
  expect(box.y + box.height).toBeLessThanOrEqual(420)
  const title = await dialog.getByRole('heading', { name: "COM's 질문하기" }).boundingBox()
  const close = await dialog.getByRole('button', { name: '질문 창 닫기' }).boundingBox()
  expect(title.y).toBeGreaterThanOrEqual(box.y)
  expect(close.y).toBeGreaterThanOrEqual(box.y)
  await dialog.getByRole('button', { name: '질문 보내기' }).scrollIntoViewIfNeeded()
  const send = await dialog.getByRole('button', { name: '질문 보내기' }).boundingBox()
  expect(send.y).toBeGreaterThanOrEqual(box.y)
  expect(send.y + send.height).toBeLessThanOrEqual(420)
  await expect(dialog.getByRole('textbox', { name: '답장받을 이메일' })).toBeFocused()
})

test('blank inbox keeps FAQ available while direct mail is disabled', async ({ page }) => {
  const dialog = await openFaq(page, false)
  await expect(page.getByRole('button', { name: '질문하기' })).toBeHidden()
  await expect(dialog.getByRole('group', { name: '자주 묻는 질문' }).getByRole('button')).toHaveCount(3)
  await expect(dialog.getByRole('button', { name: '다른 질문 보내기' })).toBeDisabled()
})

for (const mode of ['lite', 'reduced motion']) {
  test(`ask controls do not animate in ${mode}`, async ({ page }) => {
    if (mode === 'lite') {
      await page.addInitScript(() => localStorage.setItem('kwcoms-perf-mode:v1', 'lite'))
    } else {
      await page.emulateMedia({ reducedMotion: 'reduce' })
    }
    const dialog = await openAsk(page)
    for (const control of [
      page.locator('.coms-ask-trigger'),
      dialog,
      dialog.getByRole('button', { name: '질문 창 닫기' }),
      dialog.getByRole('textbox', { name: '질문' }),
      dialog.getByRole('button', { name: '다음' }),
    ]) {
      const motion = await control.evaluate((element) => {
        const style = getComputedStyle(element)
        return [style.animationName, style.transitionProperty]
      })
      expect(motion).toEqual(['none', 'none'])
    }
  })
}


test('phone launcher stays above a keyboard opened in another form', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: Object.assign(new EventTarget(), { height: 844, offsetTop: 0 }),
    })
  })
  await mockOptionalApis(page)
  await page.route('**/api/site-settings', (route) => route.fulfill({ json: { askEnabled: true } }))
  await page.goto('/about')
  const opener = page.getByRole('button', { name: '질문하기' })
  await expect(opener).toBeVisible()
  await page.evaluate(() => {
    window.visualViewport.height = 420
    window.visualViewport.dispatchEvent(new Event('resize'))
  })
  await expect.poll(async () => {
    const box = await opener.boundingBox()
    return box.y + box.height
  }).toBeLessThanOrEqual(420)
  const box = await opener.boundingBox()
  expect(box.y).toBeGreaterThanOrEqual(104)
  expect(box.y + box.height).toBeLessThanOrEqual(420)
  await opener.click()
  await expect(page.getByRole('dialog', { name: "COM's 질문하기" })).toBeVisible()
})

async function expectClearRightCorner(page, width) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const trigger = page.locator('.coms-ask-trigger')
  await expect(trigger).toBeVisible()
  await expect.poll(() => trigger.evaluate((element) => {
    const box = element.getBoundingClientRect()
    return innerWidth - box.right
  })).toBeLessThanOrEqual(24)
  const overlaps = () => trigger.evaluate((element) => {
    const box = element.getBoundingClientRect()
    return [...document.querySelectorAll('.coms-to-top.is-visible, .scene-rail, .scene-opening__br, .scene-opening__ticker, .apple-mobile-tabs, .appearance-actions, .coms-toast, .coms-perf-notice')].filter((other) => {
      const style = getComputedStyle(other)
      const rect = other.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0
        && box.left < rect.right && box.right > rect.left && box.top < rect.bottom && box.bottom > rect.top
    }).map((other) => other.className)
  })
  await expect.poll(overlaps).toEqual([])
  const box = await trigger.boundingBox()
  expect(box.x + box.width).toBeLessThanOrEqual(width)
  expect(box.y).toBeGreaterThanOrEqual(0)
}

for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
  test.describe(`${width} ${theme} layout`, () => {
    test.use({ isMobile: width === 390, hasTouch: width === 390 })
    test(`right corner clears page controls at ${width} in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      await page.addInitScript(({ theme, width }) => {
        localStorage.setItem('kwcoms-theme-mode:v2', theme)
        localStorage.setItem('coms.tour.guest.seen:v1', '1')
        localStorage.setItem('coms.tour.member.seen:v1', '1')
        sessionStorage.setItem('coms.intro.played:v1', '1')
        if (width === 390) Object.defineProperty(window, 'visualViewport', {
          configurable: true,
          value: Object.assign(new EventTarget(), { height: 844, offsetTop: 0 }),
        })
      }, { theme, width })
      await page.route('**/api/**', (route) => route.fulfill({ json: [] }))
      await mockOptionalApis(page)
      await page.route('**/api/club-projects', (route) => route.fulfill({ json: [] }))
      await page.route('**/api/site-settings', (route) => route.fulfill({ json: { askEnabled: true } }))
      for (const path of ['/', '/activities', '/community', '/admin']) {
        const role = path === '/admin' ? 'ADMIN' : 'USER'
        await page.route('**/api/auth/me', (route) => route.fulfill({ json: { id: 71, studentId: '2026000071', name: 'Test Account', role, emailVerified: true } }))
        await page.route('**/api/permissions/me', (route) => route.fulfill({ json: { role, permissions: role === 'ADMIN' ? ['operations.panel'] : [] } }))
        await page.goto(path)
        await expect(page.locator('html')).toHaveAttribute('data-theme-mode', theme)
        await expectClearRightCorner(page, width)
        for (const fraction of [0.5, 1]) {
          await page.evaluate((fraction) => window.scrollTo({ top: (document.documentElement.scrollHeight - innerHeight) * fraction, behavior: 'instant' }), fraction)
          await expectClearRightCorner(page, width)
        }
        await page.locator('.appearance-actions').scrollIntoViewIfNeeded()
        await expectClearRightCorner(page, width)
        const trigger = page.locator('.coms-ask-trigger')
        await trigger.click()
        const dialog = page.getByRole('dialog', { name: "COM's 질문하기" })
        await expect(dialog).toBeVisible()
        const panel = await dialog.boundingBox()
        expect(width - panel.x - panel.width).toBeGreaterThanOrEqual(0)
        expect(width - panel.x - panel.width).toBeLessThanOrEqual(24)
        expect(panel.x).toBeGreaterThanOrEqual(0)
        expect(panel.y).toBeGreaterThanOrEqual(0)
        expect(panel.y + panel.height).toBeLessThanOrEqual(width === 390 ? 844 : 900)
        if (width === 390) {
          await dialog.getByRole('textbox', { name: '질문' }).fill('참여 방법을 알려 주세요.')
          await dialog.getByRole('button', { name: '다음' }).click()
          await page.evaluate(() => {
            window.visualViewport.height = 420
            window.visualViewport.dispatchEvent(new Event('resize'))
          })
          await expect.poll(async () => {
            const box = await dialog.boundingBox()
            return box.y + box.height
          }).toBeLessThanOrEqual(420)
          const box = await dialog.boundingBox()
          expect(box.y).toBeGreaterThanOrEqual(104)
          const email = await dialog.getByRole('textbox', { name: '답장받을 이메일' }).boundingBox()
          expect(email.y).toBeGreaterThanOrEqual(box.y)
          expect(email.y + email.height).toBeLessThanOrEqual(420)
          await dialog.getByRole('button', { name: '질문 보내기' }).scrollIntoViewIfNeeded()
          await expect(dialog.getByRole('button', { name: '질문 보내기' })).toBeInViewport()
          await page.evaluate(() => {
            window.visualViewport.height = 844
            window.visualViewport.dispatchEvent(new Event('resize'))
          })
        }
        await page.keyboard.press('Escape')
      }
      await page.evaluate(() => {
        localStorage.setItem('kwcoms-perf-mode:v1', 'auto')
        localStorage.removeItem('kwcoms-perf-notice:v1')
        sessionStorage.setItem('kwcoms-perf-probe:v1', JSON.stringify({ accelerated: false, renderer: '' }))
      })
      await page.reload()
      await expect(page.locator('.coms-perf-notice')).toBeVisible()
      await expectClearRightCorner(page, width)
      // Use the production toast styles without an auto-dismiss timer.
      await page.evaluate(() => {
        const host = document.createElement('div')
        host.className = 'coms-toast-host'
        const toast = document.createElement('div')
        toast.className = 'coms-toast'
        toast.setAttribute('role', 'status')
        toast.textContent = '확인했습니다.'
        host.append(toast)
        document.body.append(host)
      })
      await expect(page.locator('.coms-toast')).toBeVisible()
      await expectClearRightCorner(page, width)
    })
  })
}

test('crowded phone keyboard keeps the launcher below the header and clears stacked toasts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: Object.assign(new EventTarget(), { height: 844, offsetTop: 0 }),
  }))
  await mockOptionalApis(page)
  await page.route('**/api/site-settings', (route) => route.fulfill({ json: { askEnabled: true } }))
  await page.goto('/activities')
  await expect(page.locator('.coms-ask-trigger')).toBeVisible()
  await page.locator('.appearance-actions').scrollIntoViewIfNeeded()
  await page.evaluate(() => {
    document.body.style.paddingBottom = '500px'
    const controls = document.querySelector('.appearance-actions')
    window.scrollBy({ top: controls.getBoundingClientRect().top - 369, behavior: 'instant' })
    const host = document.createElement('div')
    host.className = 'coms-toast-host'
    for (let index = 0; index < 4; index += 1) {
      const toast = document.createElement('div')
      toast.className = 'coms-toast'
      toast.setAttribute('role', 'status')
      toast.textContent = '확인했습니다.'
      host.append(toast)
    }
    document.body.append(host)
    window.visualViewport.height = 420
    window.visualViewport.dispatchEvent(new Event('resize'))
  })
  await expectClearRightCorner(page, 390)
  const box = await page.locator('.coms-ask-trigger').boundingBox()
  expect(box.y).toBeGreaterThanOrEqual(104)
  expect(box.y + box.height).toBeLessThanOrEqual(420)
  await expect(page.getByRole('button', { name: '맨 위로' })).toBeHidden()
  await page.locator('.coms-ask-trigger').click()
  await expect(page.getByRole('dialog', { name: "COM's 질문하기" })).toBeVisible()
})
