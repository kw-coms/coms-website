#!/usr/bin/env node
// Real-backend e2e runner.
//
// 1. Boots the Spring Boot backend on in-memory H2 using the exact invocation
//    from .github/workflows/openapi-drift.yml (dev profile, H2 PostgreSQL mode,
//    create-drop). Adds BOOTSTRAP_SECRET so the test can seed a verified admin.
// 2. Waits for health via Node fetch against /v3/api-docs.
// 3. Runs the `backend-auth` Playwright project (E2E_BACKEND=1 switches the
//    Playwright webServer to `npm run dev`, which proxies /api -> :8080).
// 4. Tears the backend down on exit (success, failure, or signal).
//
// Usage: node scripts/e2e-backend.mjs   (or: npm run test:e2e:backend)

import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const backendDir = resolve(repoRoot, 'backend')

const JWT_SECRET = randomBytes(48).toString('base64url')
const BOOTSTRAP_SECRET = randomBytes(48).toString('base64url')
const ADMIN_PASSWORD = randomBytes(24).toString('base64url')
const HEALTH_URL = 'http://127.0.0.1:8080/v3/api-docs'

let backend = null
let backendError = null

function killBackend() {
  if (backend && backend.pid && backend.exitCode === null) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(backend.pid), '/T', '/F'], { stdio: 'ignore' })
      return
    }
    try {
      // Kill the whole process group so the forked Gradle/JVM dies too.
      process.kill(-backend.pid, 'SIGTERM')
    } catch {
      try {
        backend.kill('SIGTERM')
      } catch {
        // already gone
      }
    }
  }
}

function bootBackend() {
  console.log('[e2e-backend] Booting backend on H2 (dev profile, create-drop)...')
  const appArgs = '--spring.profiles.active=dev --spring.datasource.url=jdbc:h2:mem:comsdb;MODE=PostgreSQL --spring.jpa.hibernate.ddl-auto=create-drop'
  const child = spawn(
    process.platform === 'win32' ? 'gradlew.bat' : './gradlew',
    [
      'bootRun',
      process.platform === 'win32' ? `--args="${appArgs}"` : `--args=${appArgs}`,
    ],
    {
      cwd: backendDir,
      env: {
        ...process.env,
        JWT_SECRET,
        BOOTSTRAP_SECRET,
        COMS_DEV_ADMIN_PASSWORD: ADMIN_PASSWORD,
        // Log the verification code instead of throwing when no SMTP is set,
        // so /signup returns success and the UI reaches the verify step.
        MAIL_LOG_VERIFICATION_CODES: 'true',
      },
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: process.platform === 'win32',
      windowsHide: true,
      detached: process.platform !== 'win32', // own process group on Unix; taskkill handles the tree on Windows
    },
  )
  child.on('error', (error) => { backendError = error })
  child.on('exit', (code, signal) => {
    if (code && code !== 0) {
      console.error(`[e2e-backend] Backend process exited early (code=${code}, signal=${signal}).`)
    }
  })
  return child
}

// Health-check loop uses Node fetch so it works on Windows and Linux.
async function waitForHealth(timeoutMs = 180_000) {
  console.log(`[e2e-backend] Waiting for ${HEALTH_URL} ...`)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (backendError) throw new Error(`Backend process failed to start: ${backendError.message}`)
    if (backend.exitCode !== null) {
      throw new Error('Backend process exited before becoming ready.')
    }
    try {
      const response = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(3000) })
      await response.body?.cancel()
      if (response.ok) {
        console.log('[e2e-backend] Backend is up.')
        return
      }
    } catch { /* backend still starting */ }
    await delay(1500)
  }
  throw new Error(`Timed out waiting for ${HEALTH_URL}.`)
}

function runPlaywright() {
  // No SPA build needed: in E2E_BACKEND mode Playwright's webServer runs
  // `npm run dev` (Vite dev server), which serves from source and proxies /api.
  console.log('[e2e-backend] Running backend-auth project against the dev server...')
  const test = spawnSync(
    process.execPath,
    [resolve(repoRoot, 'node_modules', '@playwright', 'test', 'cli.js'), 'test', '--project=backend-auth'],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      env: { ...process.env, E2E_BACKEND: '1', BOOTSTRAP_SECRET,
        COMS_E2E_ADMIN_PASSWORD: ADMIN_PASSWORD },
    },
  )
  return test.status ?? 1
}

let exitCode = 1
try {
  backend = bootBackend()
  process.on('SIGINT', () => { killBackend(); process.exit(130) })
  process.on('SIGTERM', () => { killBackend(); process.exit(143) })

  await waitForHealth()
  exitCode = runPlaywright()
} catch (err) {
  console.error(`[e2e-backend] ${err.message}`)
  exitCode = 1
} finally {
  console.log('[e2e-backend] Tearing down backend...')
  killBackend()
}

process.exit(exitCode)
