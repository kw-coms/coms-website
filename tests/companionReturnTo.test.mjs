import assert from 'node:assert/strict'
import { companionReturnTo } from '../src/routes/companionReturnTo.ts'

const token = 'A'.repeat(43)
const valid = `/companion/respond#${token}`
assert.equal(companionReturnTo('?returnTo=%2Fcompanion%2Frespond', `#${token}`), valid)
for (const candidate of [
  'https://evil.example/companion/respond',
  '//evil.example/companion/respond',
  '/companion/../respond',
  '/companion\\respond',
  '/companion/respond?x=1',
  '/companion/respond#' + token,
]) {
  assert.equal(companionReturnTo(`?returnTo=${encodeURIComponent(candidate)}`, `#${token}`), null, candidate)
}
for (const hash of ['', '#', `#${token.slice(1)}`, `#${token}%2f`, `#${token}/`]) {
  assert.equal(companionReturnTo('?returnTo=%2Fcompanion%2Frespond', hash), null, hash)
}
assert.equal(companionReturnTo('?returnTo=%2Fcompanion%2Frespond&returnTo=%2Fcompanion%2Frespond', `#${token}`), null)
assert.equal(companionReturnTo('?returnTo=%2Fcompanion%2Frespond&next=/', `#${token}`), null)

// Circuit Lab: exactly /lab/, nothing attached.
assert.equal(companionReturnTo('?returnTo=%2Flab%2F', ''), '/lab/')
for (const candidate of ['/lab', '/lab/x', '/lab/?a=1', '//lab/', '/lab/../admin', 'https://evil.example/lab/']) {
  assert.equal(companionReturnTo(`?returnTo=${encodeURIComponent(candidate)}`, ''), null, candidate)
}
assert.equal(companionReturnTo('?returnTo=%2Flab%2F', '#x'), null)
