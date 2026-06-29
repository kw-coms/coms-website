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
const BACKEND_MODE = process.env.E2E_BACKEND === '1'
const DEV_PORT = process.env.PLAYWRIGHT_DEV_PORT || 3000

const webServer = BACKEND_MODE
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
    baseURL: BACKEND_MODE ? `http://localhost:${DEV_PORT}` : `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  webServer,
  projects: [
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
      testMatch: [/app-smoke\.spec\.js/, /community-flows\.spec\.js/],
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
