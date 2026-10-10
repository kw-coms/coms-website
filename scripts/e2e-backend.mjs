#!/usr/bin/env node
// Real-backend e2e runner.
//
// 1. Starts a local SMTP sink and boots Spring Boot on in-memory H2 using the exact invocation
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
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
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
// A fixed path inside Playwright's ignored test output avoids accepting a file
// path from an environment variable in the test process.
const mailboxPath = resolve(repoRoot, 'test-results', 'coms-e2e-mailbox.json')

let backend = null
let backendError = null
let smtpServer = null
let smtpPort = null

function readVerificationCode(message) {
  const bodies = [message]
  for (const match of message.matchAll(/Content-Transfer-Encoding:\s*base64\r?\n\r?\n([A-Za-z0-9+/=\r\n]+)/gi)) {
    bodies.push(Buffer.from(match[1].replace(/\s/g, ''), 'base64').toString('utf8'))
  }
  for (const body of bodies) {
    const code = body.match(/(?:^|\D)(\d{6})(?!\d)/)?.[1]
    if (code) return code
  }
  throw new Error('SMTP test message did not contain a six-digit verification code')
}

async function startSmtpSink() {
  smtpServer = createServer((socket) => {
    socket.setEncoding('utf8')
    socket.write('220 localhost ESMTP test sink\r\n')
    let buffer = ''
    let dataLines = []
    let readingData = false
    let recipient = ''

    socket.on('data', (chunk) => {
      buffer += chunk
      let newline
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, '')
        buffer = buffer.slice(newline + 1)
        if (readingData) {
          if (line === '.') {
            readingData = false
            try {
              const code = readVerificationCode(dataLines.join('\r\n'))
              mkdirSync(dirname(mailboxPath), { recursive: true })
              writeFileSync(mailboxPath, JSON.stringify({ to: recipient, code }))
              socket.write('250 2.0.0 queued\r\n')
            } catch (error) {
              console.error(`[e2e-backend] ${error.message}`)
              socket.write('554 5.6.0 invalid test message\r\n')
            }
            dataLines = []
          } else {
            dataLines.push(line.startsWith('..') ? line.slice(1) : line)
          }
          continue
        }
        const command = line.split(' ', 1)[0].toUpperCase()
        if (command === 'EHLO' || command === 'HELO') socket.write('250-localhost\r\n250-8BITMIME\r\n250 SIZE 1048576\r\n')
        else if (command === 'MAIL') socket.write('250 2.1.0 OK\r\n')
        else if (command === 'RCPT') { recipient = line.match(/<([^>]+)>/)?.[1] || ''; socket.write('250 2.1.5 OK\r\n') }
        else if (command === 'DATA') { readingData = true; socket.write('354 End data with <CR><LF>.<CR><LF>\r\n') }
        else if (command === 'RSET' || command === 'NOOP') socket.write('250 2.0.0 OK\r\n')
        else if (command === 'QUIT') { socket.write('221 2.0.0 Bye\r\n'); socket.end() }
        else socket.write('502 5.5.1 Command not implemented\r\n')
      }
    })
  })
  await new Promise((resolveListen, rejectListen) => {
    smtpServer.once('error', rejectListen)
    smtpServer.listen(0, '127.0.0.1', resolveListen)
  })
  smtpPort = smtpServer.address().port
  console.log('[e2e-backend] Local SMTP sink ready.')
}

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
        MAIL_ENABLED: 'true',
        MAIL_LOG_VERIFICATION_CODES: 'false',
        MAIL_FROM: 'coms-e2e@example.com',
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: String(smtpPort),
        SMTP_AUTH: 'false',
        SMTP_STARTTLS: 'false',
        SMTP_USERNAME: '',
        SMTP_PASSWORD: '',
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

async function runPlaywright() {
  // No SPA build needed: in E2E_BACKEND mode Playwright's webServer runs
  // `npm run dev` (Vite dev server), which serves from source and proxies /api.
  console.log('[e2e-backend] Running backend-auth project against the dev server...')
  const test = spawn(
    process.execPath,
    [resolve(repoRoot, 'node_modules', '@playwright', 'test', 'cli.js'), 'test', '--project=backend-auth'],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      env: { ...process.env, E2E_BACKEND: '1', BOOTSTRAP_SECRET,
        COMS_E2E_ADMIN_PASSWORD: ADMIN_PASSWORD },
    },
  )
  return await new Promise((resolveExit) => {
    test.on('error', () => resolveExit(1))
    test.on('exit', (code) => resolveExit(code ?? 1))
  })
}

let exitCode = 1
try {
  await startSmtpSink()
  backend = bootBackend()
  process.on('SIGINT', () => { killBackend(); process.exit(130) })
  process.on('SIGTERM', () => { killBackend(); process.exit(143) })

  await waitForHealth()
  exitCode = await runPlaywright()
} catch (err) {
  console.error(`[e2e-backend] ${err.message}`)
  exitCode = 1
} finally {
  console.log('[e2e-backend] Tearing down backend...')
  killBackend()
  smtpServer?.close()
  rmSync(mailboxPath, { force: true })
}

process.exit(exitCode)
