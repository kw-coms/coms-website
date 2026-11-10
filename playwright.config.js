import { defineConfig, devices } from '@playwright/test'

const PORT = process.env.PLAYWRIGHT_PORT || 4173

// Real-backend lane. When E2E_BACKEND=1 (set by scripts/e2e-backend.mjs) the
// suite runs against the Vite dev server instead of `vite preview`, because the
// dev server proxies /api -> http://localhost:8080 (see vite.config.js) while
// preview serves a static SPA with no proxy. The backend itself is booted and
// torn down by the runner, NOT by Playwright's webServer.
//
// The host is `localhost` (not 127.0.0.1) so browser requests carry an Origin
// the backend's dev cors.allowed-origins allow-list trusts
// (http://localhost:3000); the OriginValidationFilter rejects unsafe requests
// from untrusted origins.
// Production-image lane. When E2E_STACK=1 (CI's "Production images build & boot" job, or a local stack) the
// suite runs against the real frontend container (E2E_STACK_URL, default http://127.0.0.1:3000) with the
// real backend and the real study runner behind it: no webServer is started and only the `stack` project is
// registered. The frontend container does not proxy /api (the host nginx does), so the spec forwards
// /api/** to E2E_STACK_BACKEND (default http://127.0.0.1:8080) itself.
const STACK_MODE = process.env.E2E_STACK === '1'
const STACK_URL = process.env.E2E_STACK_URL || 'http://127.0.0.1:3000'
const ORIGIN_FOR_STORAGE = STACK_MODE ? new URL(STACK_URL).origin : process.env.E2E_BACKEND === '1' ? `http://localhost:${process.env.PLAYWRIGHT_DEV_PORT || 3000}` : `http://127.0.0.1:${PORT}`
const perfStorage = (value) => ({
  cookies: [],
  origins: [{ origin: ORIGIN_FOR_STORAGE, localStorage: [{ name: 'kwcoms-perf-mode:v1', value }] }],
})
const BACKEND_MODE = process.env.E2E_BACKEND === '1'
const DEV_PORT = process.env.PLAYWRIGHT_DEV_PORT || 3000

const webServer = STACK_MODE
  ? undefined
  : BACKEND_MODE
  ? {
      command: `npm run dev -- --host localhost --port ${DEV_PORT}`,
      url: `http://localhost:${DEV_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    }
  : {
      command: `npm run preview -- --host 127.0.0.1 --port ${PORT}`,
      url: `http://127.0.0.1:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    }

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.03,
    },
  },
  use: {
    baseURL: STACK_MODE ? STACK_URL : BACKEND_MODE ? `http://localhost:${DEV_PORT}` : `http://127.0.0.1:${PORT}`,
    // CI browsers have no GPU, so "auto" would pick the lite look and move every visual
    // baseline. Pin the full look (and with nothing stored, automated browsers default to full anyway); suites of the
    // lite look pin 'lite' themselves.
    storageState: perfStorage('full'),
    trace: 'on-first-retry',
  },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  webServer,
  projects: [
    // Real frontend container + backend + study runner (see STACK_MODE above).
    ...(STACK_MODE
      ? [
          {
            name: 'stack',
            testMatch: /study-runner-stack\.spec\.js/,
            use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
          },
        ]
      : []),
    // Real-backend auth lane. Only registered when E2E_BACKEND=1 so a plain
    // `playwright test` / `npm run e2e` never tries to run real-auth.spec.js
    // (which needs a live backend + dev proxy). Selected by the runner via
    // `playwright test --project=backend-auth`.
    ...(BACKEND_MODE
      ? [
          {
            name: 'backend-auth',
            testMatch: /real-auth\.spec\.js/,
            use: {
              ...devices['Desktop Chrome'],
              viewport: { width: 1280, height: 900 },
            },
          },
        ]
      : []),
    {
      name: 'smoke',
      testMatch: [/app-smoke\.spec\.js/, /home-scenes\.spec\.js/, /activities-timeline\.spec\.js/, /appearance\.spec\.js/, /community-flows\.spec\.js/, /study-playground\.spec\.js/, /study-exercises\.spec\.js/, /study-exercises-web-answers\.spec\.js/, /study-frames\.spec\.js/, /site-tour\.spec\.js/, /guest-gating\.spec\.js/, /nav-groups\.spec\.js/, /sponsor-viewer\.spec\.js/],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: 'accessibility',
      testMatch: /accessibility\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
      },
    },
    // The accessibility suite again in the lite look (no blur, flat tints): contrast must hold
    // without the backdrop. The first-visit intro does not play in lite, so its test is left out.
    {
      name: 'accessibility-lite',
      testMatch: /accessibility\.spec\.js/,
      grepInvert: /first-visit intro/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
        storageState: perfStorage('lite'),
      },
    },
    {
      name: 'lite-visual',
      testMatch: /lite\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
        storageState: perfStorage('lite'),
      },
    },
    {
      name: 'mobile-visual',
      testMatch: /visual\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
      },
    },
  ],
})
