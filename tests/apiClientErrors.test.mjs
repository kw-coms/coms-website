import assert from 'node:assert/strict'

import { createApiError } from '../src/services/apiClient.ts'

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
assert.equal(forbidden.message, '접근 권한이 없거나 로그인 상태가 만료되었습니다. 다시 로그인해주세요.')

// Caller-supplied fallback outranks the server message.
assert.equal(createApiError(401, { message: 'from-server' }, '', 'caller-wins').message, 'caller-wins')

// Server `message` is only surfaced for 401/403 — other statuses keep hiding server text (b955a1a).
const hiddenBadRequest = createApiError(400, { message: 'password hash constraint failed' })
assert.equal(hiddenBadRequest.message, '입력값을 확인한 뒤 다시 시도해주세요.')
