import assert from 'node:assert/strict'

import { request } from '../src/services/apiClient.ts'

// Minimal Response stand-in — apiClient only reads ok/status/json()/text().
function response(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body },
    async text() { return JSON.stringify(body) },
  }
}

// Installs a fetch stub and returns the call log it appends to.
function stubFetch(handler) {
  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    const call = { url: String(url), method: options.method || 'GET' }
    calls.push(call)
    return handler(call.url, options)
  }
  return calls
}

const refreshCalls = (calls) => calls.filter((call) => call.url.endsWith('/api/auth/refresh'))

// ─── 1. Concurrent 401s share ONE refresh, and each request retries once ─────

{
  let refreshed = false
  const calls = stubFetch(async (url) => {
    if (url.endsWith('/api/auth/refresh')) {
      // Hold the refresh open long enough for all three 401s to pile onto the
      // same in-flight promise instead of each starting its own.
      await new Promise((resolve) => setTimeout(resolve, 10))
      refreshed = true
      return response(200, {})
    }
    return refreshed ? response(200, { ok: true }) : response(401, { message: '만료' })
  })

  const results = await Promise.all([
    request('/api/community/posts?page=0'),
    request('/api/community/posts?page=1'),
    request('/api/community/posts?page=2'),
  ])

  assert.deepEqual(results, [{ ok: true }, { ok: true }, { ok: true }], 'all three requests resolve after the refresh')
  assert.equal(refreshCalls(calls).length, 1, 'exactly one POST /api/auth/refresh for three concurrent 401s')
  assert.equal(refreshCalls(calls)[0].method, 'POST')
  const dataCalls = calls.filter((call) => call.url.includes('/api/community/posts'))
  assert.equal(dataCalls.length, 6, 'three initial requests + three retries')
}

// ─── 2. A 401 that lands AFTER someone else refreshed retries without a second
//        refresh (this is the generation guard; without it the slow request
//        would kick off refresh #2 and rotate a session that is already fresh) ─

{
  const seen = new Set()
  const calls = stubFetch(async (url) => {
    if (url.endsWith('/api/auth/refresh')) return response(200, {})
    const isFirstAttempt = !seen.has(url)
    seen.add(url)
    // The slow request is still in flight while the fast one refreshes, so its
    // 401 comes from the token it was SENT with, not from the current one.
    if (url.includes('/slow')) await new Promise((resolve) => setTimeout(resolve, 25))
    return isFirstAttempt ? response(401, { message: '만료' }) : response(200, { ok: true })
  })

  const results = await Promise.all([request('/api/notices/fast'), request('/api/notices/slow')])

  assert.deepEqual(results, [{ ok: true }, { ok: true }])
  assert.equal(refreshCalls(calls).length, 1, 'the late 401 retries on the already-refreshed token, no second refresh')
  assert.equal(calls.filter((call) => call.url.includes('/slow')).length, 2, 'the late request still retries exactly once')
}

// ─── 3. Auth endpoints other than /api/auth/me never trigger a refresh ───────

{
  const calls = stubFetch(async () => response(401, { message: '비밀번호가 올바르지 않습니다.' }))

  await assert.rejects(
    () => request('/api/auth/password', { method: 'PATCH', body: JSON.stringify({}) }),
    (error) => error.status === 401,
    'a 401 on /api/auth/password surfaces to the caller',
  )

  assert.equal(refreshCalls(calls).length, 0, '/api/auth/password must never trigger a refresh')
  assert.equal(calls.length, 1, 'and must not be retried either')
}
