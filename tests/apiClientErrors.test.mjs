import assert from 'node:assert/strict'

import {
  createApiError,
  request,
  requestBlob,
  requestNoContent,
  setSessionExpiredHandler,
} from '../src/services/apiClient.ts'
import { buildAuthLoadError, isLoggedOutAuthError } from '../src/contexts/authErrors.ts'

const serverError = createApiError(
  500,
  { message: 'NullPointerException at InternalSecretService' },
  '{"message":"NullPointerException at InternalSecretService"}',
)
assert.match(serverError.message, /서버 오류/)
assert.equal(serverError.serverMessage, 'NullPointerException at InternalSecretService')
assert.notEqual(serverError.message, serverError.serverMessage)

const validationError = createApiError(400, { detail: 'password hash constraint failed' }, '', '입력값을 확인해주세요.')
assert.equal(validationError.message, '입력값을 확인해주세요.')
assert.equal(validationError.serverMessage, 'password hash constraint failed')

const missingError = createApiError(404, { error: 'Post entity id=7 not found' })
assert.equal(missingError.message, '요청한 항목을 찾을 수 없습니다.')
assert.equal(missingError.serverMessage, 'Post entity id=7 not found')

// 401/403 must surface the backend's intentional user-facing `message`
// (wrong password, unverified email) instead of the generic session-expired text.
const badCredentials = createApiError(401, { message: '아이디 또는 비밀번호가 올바르지 않습니다.' })
assert.equal(badCredentials.message, '아이디 또는 비밀번호가 올바르지 않습니다.')

const unverifiedEmail = createApiError(401, {
  message: '이메일 인증이 완료되지 않았습니다. 가입 시 받은 인증 이메일을 확인해주세요.',
})
assert.match(unverifiedEmail.message, /이메일 인증/)

// Framework default bodies carry `error` ("Forbidden") and an empty `message`
// (server.error.include-message=never) — keep the generic text.
const expiredSession = createApiError(401, { status: 401, error: 'Unauthorized', message: '', path: '/api/auth/me' })
assert.equal(expiredSession.message, '로그인이 만료되었습니다. 다시 로그인해주세요.')

const forbidden = createApiError(403, { status: 403, error: 'Forbidden', message: '', path: '/api/admin/site-settings' })
assert.equal(forbidden.message, '이 작업을 할 권한이 없습니다.')

// ─── Every 4xx: a Korean `message` is what the backend wrote for the member ───
//     Lockouts, duplicates and rate limits used to collapse into "입력값을 확인한
//     뒤 다시 시도해주세요." / "(HTTP 429)", which told the member nothing.

for (const [status, message] of [
  [400, '비밀번호가 너무 깁니다. 영문·숫자 기준 72자(한글은 24자) 이내로 입력해주세요.'],
  [400, '관리자 삭제 사유를 입력해주세요.'],
  [404, '투표를 찾을 수 없습니다.'],
  [409, '이미 사용 중인 이메일입니다.'],
  [413, '업로드 용량이 너무 큽니다. 파일 크기를 줄여 다시 시도해주세요.'],
  [429, '로그인 시도 횟수가 초과되었습니다. 15분 후 다시 시도해주세요.'],
]) {
  assert.equal(createApiError(status, { message }).message, message, `HTTP ${status} shows the server's Korean message`)
}

// Without one, each status keeps its generic copy.
assert.equal(createApiError(404).message, '요청한 항목을 찾을 수 없습니다.')
assert.equal(createApiError(409, { error: 'Conflict' }).message, '이미 처리되었거나 현재 상태와 충돌합니다. 새로고침 후 다시 시도해주세요.')
assert.match(createApiError(413, null, '<html>413 Request Entity Too Large</html>').message, /업로드 용량이 너무 큽니다/)
assert.equal(createApiError(429).message, '요청 처리 중 오류가 발생했습니다. (HTTP 429)')

// Text without Hangul is framework or internal wording, on any status, and stays hidden.
const hiddenBadRequest = createApiError(400, { message: 'password hash constraint failed' })
assert.equal(hiddenBadRequest.message, '입력값을 확인한 뒤 다시 시도해주세요.')
assert.equal(hiddenBadRequest.serverMessage, 'password hash constraint failed')
assert.equal(createApiError(400, { message: 'Invalid vote value.' }).message, '입력값을 확인한 뒤 다시 시도해주세요.')
assert.equal(
  createApiError(403, { message: 'Access Denied' }).message,
  '이 작업을 할 권한이 없습니다.',
)
// A `message` that is not a string is not something to print either.
assert.equal(createApiError(400, { message: { reason: '한글' } }).message, '입력값을 확인한 뒤 다시 시도해주세요.')

// 5xx stays generic even when the reason is Korean. Callers that need the reason read
// `serverMessage` — Signup tells a failed verification mail apart that way.
const mailDown = createApiError(503, { message: '이메일 발송에 실패했습니다.' })
assert.match(mailDown.message, /서버 오류/)
assert.equal(mailDown.serverMessage, '이메일 발송에 실패했습니다.')

// A caller-supplied fallback replaces the generic copy when the server sent nothing for the
// member to read...
assert.equal(createApiError(401, { message: 'from-server' }, '', 'caller-wins').message, 'caller-wins')
// ...but it is a fallback: it does not outrank a message the server wrote for them.
assert.equal(
  createApiError(400, { message: '허용되지 않는 파일 형식입니다.' }, '', '업로드 중 오류가 발생했습니다.').message,
  '허용되지 않는 파일 형식입니다.',
)

// The same rule end to end, through request() and a real Response.
{
  globalThis.fetch = async () => new Response(
    JSON.stringify({ message: '로그인 시도 횟수가 초과되었습니다. 15분 후 다시 시도해주세요.' }),
    { status: 429, headers: { 'content-type': 'application/json' } },
  )
  await assert.rejects(
    () => request('/api/auth/login', { method: 'POST', body: '{}' }),
    (error) => {
      assert.equal(error.status, 429)
      assert.equal(error.message, '로그인 시도 횟수가 초과되었습니다. 15분 후 다시 시도해주세요.')
      return true
    },
  )
}

// ─── No response at all: fetch() rejects ─────────────────────────────────────
//     The browser's wording ("Failed to fetch", "Load failed") used to reach the
//     screen through every `err.message`.

{
  let expired = 0
  setSessionExpiredHandler(() => { expired += 1 })

  // Chrome, Safari and Firefox name the same failure differently; an aborted request rejects too.
  for (const cause of [
    new TypeError('Failed to fetch'),
    new TypeError('Load failed'),
    new TypeError('NetworkError when attempting to fetch resource.'),
    new DOMException('The user aborted a request.', 'AbortError'),
  ]) {
    for (const send of [
      () => request('/api/notices'),
      () => requestNoContent('/api/notices/1', { method: 'DELETE' }),
      () => requestBlob('/api/files/1/download'),
    ]) {
      let fetches = 0
      globalThis.fetch = async () => {
        fetches += 1
        throw cause
      }

      await assert.rejects(send, (error) => {
        assert.equal(error.message, '서버에 연결하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.')
        assert.equal(error.cause, cause, 'the original failure stays reachable for debugging')
        assert.equal(error.isNetworkError, true)
        // No status, on purpose: that is how AuthProvider tells "transient" from "logged out".
        assert.equal(error.status, undefined)
        assert.equal(isLoggedOutAuthError(error), false)
        assert.equal(buildAuthLoadError(error).status, null)
        return true
      })
      assert.equal(fetches, 1, 'nothing answered, so there is nothing to refresh or retry')
    }
  }

  // The retry after a successful refresh goes through the same path.
  let attempts = 0
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/api/auth/refresh')) return new Response(null, { status: 204 })
    attempts += 1
    if (attempts === 1) return new Response(null, { status: 401 })
    throw new TypeError('Failed to fetch')
  }
  await assert.rejects(() => request('/api/community/posts'), /서버에 연결하지 못했습니다/)
  assert.equal(attempts, 2)

  assert.equal(expired, 0, 'a network failure says nothing about the session')
  setSessionExpiredHandler(null)
}

console.log('api client error contract passed')
