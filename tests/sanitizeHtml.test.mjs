import assert from 'node:assert/strict'

import { sanitizeHtml, sanitizeStyleDeclaration, SANITIZE_PROFILES } from '../src/utils/sanitizeHtml.ts'

assert.equal(
  sanitizeStyleDeclaration('color:red;background-image:url(javascript:alert(1));font-weight:bold'),
  'color: red; font-weight: bold',
)

assert.equal(
  sanitizeHtml('<img src=x onerror=alert(1)>'),
  '&lt;img src=x onerror=alert(1)&gt;',
)

// --- rich-text profile (the home/editor sanitizer is now a thin wrapper) ---
// The richText profile is the SINGLE source of truth for the home-shell + rich
// editor allow-list. These cases pin its config (enforced by DOMPurify in the
// browser) and verify the public entry point never emits raw executable markup.

const richText = SANITIZE_PROFILES.richText

// 1. A <script> tag is never allowed and is neutralized at the entry point.
assert.ok(!richText.allowedTags.includes('script'))
const scriptOut = sanitizeHtml('<script>alert(1)</script>', { profile: 'richText' })
assert.ok(!scriptOut.includes('<script'), 'script tag must not survive')
assert.equal(scriptOut, '&lt;script&gt;alert(1)&lt;/script&gt;')

// 2. Event-handler attributes (onclick, …) are not in the allow-list and never
//    reach the sink as live markup.
assert.ok(!richText.allowedAttributes.includes('onclick'))
const onclickOut = sanitizeHtml('<p onclick="alert(1)">hi</p>', { profile: 'richText' })
assert.ok(!onclickOut.includes('<p'), 'onclick-bearing tag must not survive as live markup')

// 3. A javascript: href is rejected by the shared URL guard and never emitted
//    as a live anchor.
const jsHrefOut = sanitizeHtml('<a href="javascript:alert(1)">x</a>', { profile: 'richText' })
assert.ok(!jsHrefOut.includes('<a'), 'javascript: anchor must not survive as live markup')

// 4. Legitimately-allowed rich tags and styles are preserved (not narrowed):
//    the editor relies on these formatting tags and inline styles.
for (const tag of ['a', 'blockquote', 'h2', 'h3', 'font', 'span', 'strong', 'u', 'ul', 'li']) {
  assert.ok(richText.allowedTags.includes(tag), `rich tag <${tag}> must stay allowed`)
}
for (const style of ['color', 'background-color', 'font-family', 'font-size', 'font-weight', 'text-align', 'text-decoration']) {
  assert.ok(richText.allowedStyles.has(style), `rich style ${style} must stay allowed`)
}
assert.equal(
  sanitizeStyleDeclaration('text-align:center;font-weight:bold;text-decoration:underline', richText.allowedStyles),
  'text-align: center; font-weight: bold; text-decoration: underline',
)
