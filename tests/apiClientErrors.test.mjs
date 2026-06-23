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
