import assert from 'node:assert/strict'

import { buildAuthLoadError, isLoggedOutAuthError } from '../src/contexts/authErrors.ts'

assert.equal(isLoggedOutAuthError({ status: 401 }), true)
assert.equal(isLoggedOutAuthError({ status: 403 }), false)
assert.equal(isLoggedOutAuthError(new TypeError('Failed to fetch')), false)

const networkError = buildAuthLoadError(new TypeError('Failed to fetch'))
assert.equal(networkError.status, null)
assert.match(networkError.message, /다시 시도/)
assert.match(networkError.detail, /Failed to fetch/)
