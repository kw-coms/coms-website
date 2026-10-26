// setupDom first: AuthProvider and ToastHost need a document to mount into.
import './setupDom.mjs'
import assert from 'node:assert/strict'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

import { AuthProvider } from '../src/contexts/AuthContext.tsx'
import { useAuth } from '../src/contexts/useAuth.ts'
import { ToastHost } from '../src/components/common/Toast.tsx'
import { request } from '../src/services/apiClient.ts'
import { queryClient } from '../src/services/queryClient.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// Toasts arm a 3.2s auto-dismiss timer. Nothing below waits for one, so keep them from holding
// the process open once the assertions are done.
const realSetTimeout = globalThis.setTimeout
globalThis.setTimeout = (...args) => {
  const timer = realSetTimeout(...args)
  timer.unref?.()
  return timer
}

const USER = { id: 7, studentId: '2026000001', name: '홍길동', role: 'USER', emailVerified: true }
const CACHE_KEY = ['community', 'posts']

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
})

// The fake backend. `sessionDead` models a session the server has already ended: protected
// endpoints answer 401 and the refresh is refused, exactly what the real one does after a
// password change.
let sessionDead = false
let answerLogout = () => new Response(null, { status: 204 })
const calls = []
globalThis.fetch = async (url, options = {}) => {
  const path = String(url)
  calls.push(`${options.method || 'GET'} ${path}`)
  if (path === '/api/auth/logout') return answerLogout()
  if (path === '/api/auth/refresh') return sessionDead ? json(401, {}) : new Response(null, { status: 204 })
  if (sessionDead) return json(401, { error: 'Unauthorized' })
  if (path === '/api/auth/me') return json(200, USER)
  if (path === '/api/permissions/me') return json(200, { role: USER.role, permissions: ['community.read'] })
  return json(200, [])
}

let auth
function Probe() {
  auth = useAuth()
  return null
}

// Lets pending fetches land inside act() until `ready()` holds.
async function settle(ready, label) {
  for (let turn = 0; turn < 100; turn += 1) {
    if (ready()) return
    await act(async () => { await new Promise((resolve) => setImmediate(resolve)) })
  }
  assert.fail(`timed out waiting for ${label}`)
}

const signedIn = () => auth.user?.studentId === USER.studentId && Array.isArray(auth.permissions)
const toastCount = (text) => [...document.querySelectorAll('.coms-toast')]
  .filter((toast) => toast.textContent.includes(text)).length

async function signIn() {
  sessionDead = false
  await act(async () => { await auth.login({ studentId: USER.studentId, name: USER.name }) })
  await settle(signedIn, 'the session to load')
  queryClient.setQueryData(CACHE_KEY, [{ id: 1 }])
  calls.length = 0
}

const container = document.createElement('div')
document.body.appendChild(container)
const root = createRoot(container)
await act(async () => {
  root.render(createElement(AuthProvider, null, createElement(Probe), createElement(ToastHost)))
})
await settle(signedIn, 'the initial session')
queryClient.setQueryData(CACHE_KEY, [{ id: 1 }])

// ─── 1. A logout the server never confirmed leaves the member signed in ──────
//        The cookies are HttpOnly, so the session is still valid and a reload
//        would restore it: the screen must not claim otherwise.

let failures = 0
for (const [label, answer] of [
  ['a network failure', () => { throw new TypeError('Failed to fetch') }],
  ['a 5xx', () => json(503, { message: '요청 처리 중 오류가 발생했습니다.' })],
]) {
  answerLogout = answer
  let result
  await act(async () => { result = await auth.logout() })
  failures += 1

  assert.equal(result, false, `${label}: logout() reports the failure instead of throwing`)
  assert.equal(auth.user?.studentId, USER.studentId, `${label}: still signed in on screen, as on the server`)
  assert.deepEqual(auth.permissions, ['community.read'], `${label}: permissions untouched`)
  assert.deepEqual(queryClient.getQueryData(CACHE_KEY), [{ id: 1 }], `${label}: cached data untouched`)
  assert.equal(toastCount('로그아웃하지 못했습니다'), failures, `${label}: the member is told`)
}

// ─── 2. A logout the server confirmed ends the session locally ───────────────

{
  answerLogout = () => new Response(null, { status: 204 })
  let result
  await act(async () => { result = await auth.logout() })

  assert.equal(result, true)
  assert.equal(auth.user, null)
  assert.equal(auth.permissions, null)
  assert.equal(queryClient.getQueryData(CACHE_KEY), undefined, 'the next account must not see cached data')
  assert.equal(toastCount('로그아웃하지 못했습니다'), failures, 'no failure toast on success')
}

// ─── 3. clearSession: the server already ended the session (password change) ──
//        Local only, and silent — the caller says why. A request that fails
//        before React re-renders must not add "로그인이 만료되었습니다" on top.

{
  await signIn()
  await act(async () => {
    auth.clearSession()
    sessionDead = true
    await request('/api/notices').catch(() => {})
  })

  assert.equal(auth.user, null)
  assert.equal(auth.permissions, null)
  assert.equal(queryClient.getQueryData(CACHE_KEY), undefined)
  assert.ok(!calls.includes('POST /api/auth/logout'), 'clearSession does not ask the server')
  assert.equal(toastCount('로그인이 만료되었습니다'), 0, 'no expiry toast over the caller\'s own message')
}

// ─── 4. Control: a live session the server drops is still announced ──────────
//        (Shows the "no expiry toast" assertion above is not vacuous.)

{
  await signIn()
  sessionDead = true
  await act(async () => { await request('/api/notices').catch(() => {}) })

  assert.equal(auth.user, null)
  assert.equal(toastCount('로그인이 만료되었습니다'), 1)
}

await act(async () => { root.unmount() })

console.log('auth session contract passed')
