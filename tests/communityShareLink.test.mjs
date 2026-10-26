import assert from 'node:assert/strict'

import { addressWithShareSignature } from '../src/pages/community/shareLink.ts'

const SIGNATURE = 'AbCdEfGhIjKlMnOpQrStUv'

// The open post's URL gains its share signature, so a copied address bar previews the post.
assert.equal(
  addressWithShareSignature({ pathname: '/community/42', search: '', hash: '' }, 42, SIGNATURE),
  `/community/42?s=${SIGNATURE}`,
)

// Other query parameters and the fragment survive.
assert.equal(
  addressWithShareSignature({ pathname: '/community/42/', search: '?from=notice', hash: '#comment-3' }, 42, SIGNATURE),
  `/community/42?from=notice&s=${SIGNATURE}#comment-3`,
)

// A stale signature (e.g. after the server key changed) is replaced, not duplicated.
assert.equal(
  addressWithShareSignature({ pathname: '/community/42', search: '?s=old', hash: '' }, 42, SIGNATURE),
  `/community/42?s=${SIGNATURE}`,
)

// Nothing to do when the URL already carries this signature.
assert.equal(
  addressWithShareSignature({ pathname: '/community/42', search: `?s=${SIGNATURE}`, hash: '' }, 42, SIGNATURE),
  null,
)

// The reader moved on before the signature arrived: never rewrite another page's URL.
assert.equal(addressWithShareSignature({ pathname: '/community/43', search: '', hash: '' }, 42, SIGNATURE), null)
assert.equal(addressWithShareSignature({ pathname: '/community', search: '', hash: '' }, 42, SIGNATURE), null)

// No signature (the request failed or the post cannot be shared): leave the URL alone.
assert.equal(addressWithShareSignature({ pathname: '/community/42', search: '', hash: '' }, 42, ''), null)
assert.equal(addressWithShareSignature({ pathname: '/community/42', search: '', hash: '' }, 42, undefined), null)

console.log('communityShareLink tests passed')
