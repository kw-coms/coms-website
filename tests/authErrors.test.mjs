import assert from 'node:assert/strict'

import { buildAuthLoadError, isLoggedOutAuthError } from '../src/contexts/authErrors.ts'

assert.equal(isLoggedOutAuthError({ status: 401 }), true)
// The backend's default Spring Security entry point answers an expired/invalid/absent token on a
// protected endpoint with 403 (not 401), so 403 must also be treated as logged-out — matching the
// apiClient refresh-retry condition.
assert.equal(isLoggedOutAuthError({ status: 403 }), true)
assert.equal(isLoggedOutAuthError({ status: 404 }), false)
assert.equal(isLoggedOutAuthError(new TypeError('Failed to fetch')), false)

const networkError = buildAuthLoadError(new TypeError('Failed to fetch'))
assert.equal(networkError.status, null)
assert.match(networkError.message, /다시 시도/)
assert.match(networkError.detail, /Failed to fetch/)
