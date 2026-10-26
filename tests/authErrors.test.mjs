import assert from 'node:assert/strict'

import { buildAuthLoadError, isLoggedOutAuthError } from '../src/contexts/authErrors.ts'

assert.equal(isLoggedOutAuthError({ status: 401 }), true)
// The backend answers an expired/invalid/absent token with 401. A 403 from the session check is
// still read as logged-out: backends deployed before that change answered with 403.
assert.equal(isLoggedOutAuthError({ status: 403 }), true)
assert.equal(isLoggedOutAuthError({ status: 404 }), false)
assert.equal(isLoggedOutAuthError(new TypeError('Failed to fetch')), false)

const networkError = buildAuthLoadError(new TypeError('Failed to fetch'))
assert.equal(networkError.status, null)
assert.match(networkError.message, /다시 시도/)
assert.match(networkError.detail, /Failed to fetch/)
