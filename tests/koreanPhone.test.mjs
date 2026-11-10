import assert from 'node:assert/strict'
import { isValidKoreanPhone } from '../src/utils/koreanPhone.ts'

const good = ['01012345678', '010-1234-5678', '010 1234 5678', '010.1234.5678', '011-123-4567', '016-123-4567',
  '02-123-4567', '02-1234-5678', '(02) 123-4567', '(02)1234-5678', '031-123-4567', '031-1234-5678', '051-123-4567',
  '070-1234-5678', '070-123-4567', '0505-123-4567', '0502-1234-5678', '+82-10-1234-5678', '+821012345678', '+82 10 1234 5678',
  '+82-2-123-4567', '+82-(0)10-1234-5678', ' 010-1234-5678 ']
const bad = ['', '1234', '010-12-5678', '0101234567890', '12345678', '010-abcd-5678', '010--1234-5678', '-010-1234-5678', '010-1234-5678-',
  '012-123-4567', '030-123-4567', '+1-212-555-0100', '+82', '+82-10', '0505-123', '(02 123-4567', '010/1234/5678']
for (const value of good) assert.equal(isValidKoreanPhone(value), true, `should accept ${value}`)
for (const value of bad) assert.equal(isValidKoreanPhone(value), false, `should reject ${value}`)
console.log('korean phone ok')

// A long malformed value must be rejected at once: the old pattern backtracked for seconds on this input.
{
  const started = performance.now()
  assert.equal(isValidKoreanPhone('0'.repeat(29) + 'x'), false)
  assert.equal(isValidKoreanPhone('0'.repeat(5000) + 'x'), false)
  assert.equal(isValidKoreanPhone('0-'.repeat(3000)), false)
  assert.ok(performance.now() - started < 50, 'phone validation stays linear on long input')
}
