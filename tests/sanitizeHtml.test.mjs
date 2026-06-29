import assert from 'node:assert/strict'

import { sanitizeHtml, sanitizeStyleDeclaration, sanitizeClassAttribute, SANITIZE_PROFILES } from '../src/utils/sanitizeHtml.ts'

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

// --- code blocks: <pre>/<code> are allowed and the `class` attribute is
// constrained to a single `language-*` hint on code/pre only. The class
// decision is exercised directly via sanitizeClassAttribute (the DOM-free
// single source of truth used by the browser post-process pass) so it is
// testable without a headless DOM. ---

// 5. <pre>/<code> are now in BOTH allow-lists (post body + rich editor).
for (const tag of ['pre', 'code']) {
  assert.ok(SANITIZE_PROFILES.richText.allowedTags.includes(tag), `rich tag <${tag}> must be allowed`)
}
// `class` is allowed at the attribute level (its values are then constrained).
assert.ok(SANITIZE_PROFILES.richText.allowedAttributes.includes('class'), 'class attribute must be allow-listed')

// 6. A `language-js` hint survives on <code>/<pre> with the class value intact.
assert.equal(sanitizeClassAttribute('code', 'language-js'), 'language-js')
assert.equal(sanitizeClassAttribute('pre', 'language-py3'), 'language-py3')
assert.equal(sanitizeClassAttribute('CODE', 'language-TS'), 'language-TS', 'tag/class matching is case-insensitive')

// 7. A <code class="language-js" onclick=alert(1)> keeps the class but the
//    event handler is never allow-listed, so onclick is dropped. (The class
//    survives; onclick is rejected by the attribute allow-list.)
assert.ok(!SANITIZE_PROFILES.richText.allowedAttributes.includes('onclick'))
assert.equal(sanitizeClassAttribute('code', 'language-js'), 'language-js')

// 8. A <div class="evil"> has its class stripped entirely (class only rides on code/pre).
assert.equal(sanitizeClassAttribute('div', 'evil'), '')
assert.equal(sanitizeClassAttribute('span', 'language-js'), '', 'language-* is only honored on code/pre')
// Non-language classes on code/pre are also stripped (no arbitrary class survives).
assert.equal(sanitizeClassAttribute('code', 'hljs theme-dark'), '')
assert.equal(sanitizeClassAttribute('pre', 'language-js evil'), '', 'multi-class with a non-language token is rejected')

// 9. A <script> inside a code block is still neutralized — never emitted as live
//    markup. Server-side (no DOM) the whole body is HTML-escaped; the rich
//    profile additionally drops <script> from the allow-list in the browser.
const codeWithScript = sanitizeHtml('<pre><code><script>alert(1)</script></code></pre>', { profile: 'richText' })
assert.ok(!codeWithScript.includes('<script>'), 'script inside a code block must not survive as live markup')
assert.ok(!richText.allowedTags.includes('script'))
