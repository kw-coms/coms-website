import assert from 'node:assert/strict'

import { sanitizeHtml, sanitizeStyleDeclaration } from '../src/utils/sanitizeHtml.ts'

assert.equal(
  sanitizeStyleDeclaration('color:red;background-image:url(javascript:alert(1));font-weight:bold'),
  'color: red; font-weight: bold',
)

assert.equal(
  sanitizeHtml('<img src=x onerror=alert(1)>'),
  '&lt;img src=x onerror=alert(1)&gt;',
)
