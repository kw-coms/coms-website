#!/usr/bin/env node
// Real-backend e2e runner.
//
// 1. Boots the Spring Boot backend on in-memory H2 using the exact invocation
//    from .github/workflows/openapi-drift.yml (dev profile, H2 PostgreSQL mode,
//    create-drop). Adds BOOTSTRAP_SECRET so the test can seed a verified admin.
// 2. Waits for health via `curl --retry` against /v3/api-docs (no fixed sleeps).
// 3. Runs the `backend-auth` Playwright project (E2E_BACKEND=1 switches the
//    Playwright webServer to `npm run dev`, which proxies /api -> :8080).
// 4. Tears the backend down on exit (success, failure, or signal).
//
// Usage: node scripts/e2e-backend.mjs   (or: npm run test:e2e:backend)

import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const backendDir = resolve(repoRoot, 'backend')

const JWT_SECRET = 'coms-dev-only-secret-key-do-not-use-in-production!!'
const BOOTSTRAP_SECRET =
  process.env.BOOTSTRAP_SECRET || 'coms-e2e-bootstrap-secret-please-change-32+'
const HEALTH_URL = 'http://127.0.0.1:8080/v3/api-docs'

let backend = null

function killBackend() {
  if (backend && backend.pid && backend.exitCode === null) {
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
  const child = spawn(
    './gradlew',
    [
      'bootRun',
      "--args=--spring.profiles.active=dev --spring.datasource.url=jdbc:h2:mem:comsdb;MODE=PostgreSQL --spring.jpa.hibernate.ddl-auto=create-drop",
    ],
    {
      cwd: backendDir,
      env: {
        ...process.env,
        JWT_SECRET,
        BOOTSTRAP_SECRET,
        // Log the verification code instead of throwing when no SMTP is set,
        // so /signup returns success and the UI reaches the verify step.
        MAIL_LOG_VERIFICATION_CODES: 'true',
      },
      stdio: ['ignore', 'inherit', 'inherit'],
      detached: true, // own process group, so killBackend can take the whole tree
    },
  )
  child.on('exit', (code, signal) => {
    if (code && code !== 0) {
      console.error(`[e2e-backend] Backend process exited early (code=${code}, signal=${signal}).`)
    }
  })
  return child
}

// Health-check loop using curl --retry (no fixed sleeps). Each attempt retries
// internally; we also bail immediately if the backend process died.
function waitForHealth(timeoutMs = 180_000) {
  console.log(`[e2e-backend] Waiting for ${HEALTH_URL} ...`)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (backend.exitCode !== null) {
      throw new Error('Backend process exited before becoming ready.')
    }
    const res = spawnSync(
      'curl',
      ['-fsS', '--retry', '5', '--retry-delay', '2', '--retry-connrefused', '-o', '/dev/null', HEALTH_URL],
      { stdio: 'ignore' },
    )
    if (res.status === 0) {
      console.log('[e2e-backend] Backend is up.')
      return
    }
  }
  throw new Error(`Timed out waiting for ${HEALTH_URL}.`)
}

function runPlaywright() {
  // No SPA build needed: in E2E_BACKEND mode Playwright's webServer runs
  // `npm run dev` (Vite dev server), which serves from source and proxies /api.
  console.log('[e2e-backend] Running backend-auth project against the dev server...')
  const test = spawnSync(
    'npx',
    ['playwright', 'test', '--project=backend-auth'],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      env: { ...process.env, E2E_BACKEND: '1', BOOTSTRAP_SECRET },
    },
  )
  return test.status ?? 1
}

let exitCode = 1
try {
  backend = bootBackend()
  process.on('SIGINT', () => { killBackend(); process.exit(130) })
  process.on('SIGTERM', () => { killBackend(); process.exit(143) })

  waitForHealth()
  exitCode = runPlaywright()
} catch (err) {
  console.error(`[e2e-backend] ${err.message}`)
  exitCode = 1
} finally {
  console.log('[e2e-backend] Tearing down backend...')
  killBackend()
}

process.exit(exitCode)
