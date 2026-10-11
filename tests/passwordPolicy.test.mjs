import assert from 'node:assert/strict'

import {
  PASSWORD_MAX_BYTES,
  PASSWORD_PATTERN,
  PASSWORD_TOO_LONG_MESSAGE,
  isPasswordTooLong,
  isValidPassword,
} from '../src/utils/passwordPolicy.ts'

// The backend refuses passwords over 72 UTF-8 bytes (BCrypt's input limit) with a 400. The
// client has to count the same thing — bytes — or a Korean passphrase that looks short passes
// here and fails there.
assert.equal(PASSWORD_MAX_BYTES, 72)

// ASCII is one byte a character: 72 fit, 73 do not.
const ascii72 = `Aa1!${'x'.repeat(68)}`
assert.equal(ascii72.length, 72)
assert.equal(isPasswordTooLong(ascii72), false)
assert.equal(isPasswordTooLong(`${ascii72}x`), true)

// Hangul is three bytes a syllable: 24 fit exactly, the 25th does not.
assert.equal(isPasswordTooLong('가'.repeat(24)), false)
assert.equal(isPasswordTooLong('가'.repeat(25)), true)

// The case that used to reach the server: fine by the pattern, 28 characters, 76 bytes.
const koreanPassphrase = `Aa1!${'비밀번호'.repeat(6)}`
assert.equal(koreanPassphrase.length, 28)
assert.equal(new TextEncoder().encode(koreanPassphrase).length, 76)
assert.ok(PASSWORD_PATTERN.test(koreanPassphrase), 'the pattern alone accepts it')
assert.equal(isPasswordTooLong(koreanPassphrase), true)
assert.equal(isValidPassword(koreanPassphrase), false)

// Mixed input right at the boundary: 4 ASCII bytes + 22 syllables = 70, + 2 ASCII = 72.
const mixed70 = `Aa1!${'한'.repeat(22)}`
assert.equal(isPasswordTooLong(`${mixed70}ab`), false)
assert.equal(isPasswordTooLong(`${mixed70}abc`), true)
assert.equal(isPasswordTooLong(`${mixed70}한`), true)

// Astral characters are four bytes, not "two characters".
assert.equal(isPasswordTooLong('😀'.repeat(18)), false)
assert.equal(isPasswordTooLong(`${'😀'.repeat(18)}a`), true)

// Nothing typed yet is not "too long", and the pattern still applies on its own.
assert.equal(isPasswordTooLong(''), false)
assert.equal(isPasswordTooLong(undefined), false)
assert.equal(isValidPassword('Strong!234'), true)
assert.equal(isValidPassword('weakpassword'), false)
assert.equal(isValidPassword(ascii72), true)
assert.equal(isValidPassword(`${ascii72}x`), false)

// Members read this instead of a generic "입력값을 확인…": it has to name both limits.
assert.match(PASSWORD_TOO_LONG_MESSAGE, /72자/)
assert.match(PASSWORD_TOO_LONG_MESSAGE, /한글은 24자/)

console.log('password policy contract passed')
