import { expect, test } from '@playwright/test'

// "직접 해보기" against the REAL stack: the production frontend container, the real backend (login) and the
// real study runner (C / Java / Python compiled and run in its sandbox). Nothing about /study/api/run is mocked.
// Registered only with E2E_STACK=1 (playwright.config.js); needs the admin of a freshly bootstrapped stack:
//   E2E_STACK_ADMIN_ID, E2E_STACK_ADMIN_PASSWORD   (and optionally E2E_STACK_URL / E2E_STACK_BACKEND)
//
// The frontend container serves the site but not /api (the host nginx does that in production), so every
// /api/** request of the page is forwarded to the backend here, and the session is created through the
// backend's login endpoint and handed to the browser as cookies.

const FRONTEND = process.env.E2E_STACK_URL || 'http://127.0.0.1:3000'
const BACKEND = process.env.E2E_STACK_BACKEND || 'http://127.0.0.1:8080'
const ADMIN = { identifier: process.env.E2E_STACK_ADMIN_ID, password: process.env.E2E_STACK_ADMIN_PASSWORD }

async function signIn(context, request) {
  expect(ADMIN.identifier && ADMIN.password, 'E2E_STACK_ADMIN_ID / E2E_STACK_ADMIN_PASSWORD').toBeTruthy()
  const login = await request.post(`${BACKEND}/api/auth/login`, {
    headers: { Origin: 'https://coms.kw.ac.kr' },
    data: { identifier: ADMIN.identifier, password: ADMIN.password, rememberMe: false },
  })
  expect(login.status()).toBe(200)
  const cookies = login.headersArray()
    .filter((header) => header.name.toLowerCase() === 'set-cookie')
    .map((header) => header.value.split(';')[0])
    .map((pair) => ({ name: pair.slice(0, pair.indexOf('=')), value: pair.slice(pair.indexOf('=') + 1), url: FRONTEND }))
  expect(cookies.map((cookie) => cookie.name)).toContain('token')
  await context.addCookies(cookies)
}

async function forwardApi(page) {
  // Only the site's own /api/ (not /study/api/run, which the frontend container serves itself).
  await page.route((url) => url.origin === new URL(FRONTEND).origin && url.pathname.startsWith('/api/'), (route) => {
    const url = new URL(route.request().url())
    return route.continue({ url: `${BACKEND}${url.pathname}${url.search}` })
  })
}

test.beforeEach(async ({ page, context, request }) => {
  await signIn(context, request)
  await forwardApi(page)
})

const editorOf = (page, n) => page.locator(`#code-${n} .cm-content`)
const runBtn = (page, n) => page.locator(`#code-${n}`).getByRole('button', { name: /실행/ }).first()
async function openEditor(page, study, n) {
  await page.goto(`/study/${study}`)
  await expect(page.locator('.pg-stage').first()).toBeAttached()
  await page.locator(`#code-${n}`).getByRole('button', { name: /직접 해보기/ }).click()
  await expect(page.locator(`#code-${n} .cm-editor`)).toBeVisible()
}
async function replaceCode(page, n, text) {
  await editorOf(page, n).click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText(text)
}

// The input box lives in the result panel, which appears with the first run: run once, open the box, type, run again.
async function runWithInput(page, n, input) {
  await runBtn(page, n).click()
  const box = page.locator(`#code-${n} .pg-stdin textarea`)
  await expect(page.locator(`#code-${n} .pg-out`)).toBeVisible({ timeout: 40_000 })
  if (!(await box.isVisible())) await page.locator(`#code-${n}`).getByRole('button', { name: '입력(stdin)' }).click()
  await box.fill(input)
  await runBtn(page, n).click()
}

test('C: the first example compiles and runs in the real sandbox and matches its expected output', async ({ page }) => {
  await openEditor(page, 'c', 0)
  await runBtn(page, 0).click()
  const out = page.locator('#code-0 .pg-out')
  await expect(out.locator('.pg-stdout')).toContainText('Hello', { timeout: 30_000 })
  await expect(out).toContainText('종료 코드 0')
  await out.getByRole('button', { name: '예상 출력과 비교' }).click()
  await expect(out.locator('.pg-compare-result')).toContainText('✅')
})

test('C compile error: real gcc diagnostics with line, Korean hint and a marker on the line', async ({ page }) => {
  await openEditor(page, 'c', 0)
  await replaceCode(page, 0, '#include <stdio.h>\nint main(void) {\n    printf("hi\\n")\n    return 0;\n}\n')
  await runBtn(page, 0).click()
  const out = page.locator('#code-0 .pg-out')
  await expect(out).toContainText('컴파일 오류', { timeout: 30_000 })
  await expect(out.locator('.pg-diag-hint').first()).toBeVisible()
  await expect(page.locator('#code-0 .cm-lintRange-error').first()).toBeVisible()
  // gcc points at the end of line 3 (where the ';' is missing): the marker must be on that line, not one off.
  await out.locator('.pg-diag button, button.pg-diag').first().click().catch(() => {})
  await expect(page.locator('#code-0 .cm-activeLine')).toContainText('printf')
})

test('C with stdin: scanf reads the input box', async ({ page }) => {
  await openEditor(page, 'c', 8)
  await replaceCode(page, 8, '#include <stdio.h>\nint main(void) { int a, b; scanf("%d %d", &a, &b); printf("sum=%d\\n", a + b); return 0; }\n')
  await runWithInput(page, 8, '20 22\n')
  await expect(page.locator('#code-8 .pg-stdout')).toHaveText('sum=42\n', { timeout: 30_000 })
})

test('Java: a Scanner program reads the input box; a missing semicolon is reported on its line', async ({ page }) => {
  await openEditor(page, 'java', 9)
  await replaceCode(page, 9, 'import java.util.Scanner;\npublic class Greeter {\n  public static void main(String[] args) {\n    Scanner in = new Scanner(System.in);\n    System.out.println("안녕, " + in.nextLine());\n  }\n}\n')
  await runWithInput(page, 9, 'COM\n')
  await expect(page.locator('#code-9 .pg-stdout')).toHaveText('안녕, COM\n', { timeout: 40_000 })

  await replaceCode(page, 9, 'public class Broken {\n  public static void main(String[] args) {\n    System.out.println("x")\n  }\n}\n')
  await runBtn(page, 9).click()
  const out = page.locator('#code-9 .pg-out')
  await expect(out).toContainText('컴파일 오류', { timeout: 40_000 })
  await expect(out.locator('.pg-diag-hint').first()).toContainText('세미콜론')
  await expect(page.locator('#code-9 .cm-lintRange-error').first()).toBeVisible()
  await page.locator('#code-9').getByRole('button', { name: /3번째 줄/ }).click()
  await expect(page.locator('#code-9 .cm-activeLine')).toContainText('System.out.println')
})

test('Python: input() reads the input box; an exception shows the traceback', async ({ page }) => {
  await page.goto('/study/python')
  const n = 9 // `name = input(...)`: a Python block that reads input
  await openEditor(page, 'python', n)
  await replaceCode(page, n, 'name = input()\nprint("hello,", name)\n')
  await runWithInput(page, n, 'world\n')
  await expect(page.locator(`#code-${n} .pg-stdout`)).toHaveText('hello, world\n', { timeout: 30_000 })

  await replaceCode(page, n, 'print(1 / 0)\n')
  await runBtn(page, n).click()
  await expect(page.locator(`#code-${n} .pg-out`)).toContainText('ZeroDivisionError', { timeout: 30_000 })
})

test('signed out: the run button asks to log in instead of showing an error', async ({ page, context }) => {
  await context.clearCookies()
  await openEditor(page, 'c', 0)
  await runBtn(page, 0).click()
  await expect(page.locator('#code-0 a[data-pg="login"]')).toBeVisible({ timeout: 15_000 })
})
