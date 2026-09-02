// setupDom MUST come first: it installs jsdom's window/document on globalThis
// before dompurify is imported (transitively, via sanitizeHtml). Without it
// DOMPurify reports isSupported=false, sanitize() returns its input untouched,
// and sanitizeHtml() takes its DOM-free escapeHtml() branch — so every assertion
// below would be exercising HTML-escaping instead of the actual sanitizer.
import './setupDom.mjs'

import assert from 'node:assert/strict'

import { sanitizeHtml, sanitizeStyleDeclaration, sanitizeClassAttribute, SANITIZE_PROFILES } from '../src/utils/sanitizeHtml.ts'

const rich = (html) => sanitizeHtml(html, { profile: 'richText' })
const richText = SANITIZE_PROFILES.richText

// ─── the DOM-free helpers (unchanged contract) ───────────────────────────────

assert.equal(
  sanitizeStyleDeclaration('color:red;background-image:url(javascript:alert(1));font-weight:bold'),
  'color: red; font-weight: bold',
)

// ─── script / event handlers / javascript: are stripped ──────────────────────

assert.ok(!richText.allowedTags.includes('script'))
assert.equal(rich('<script>alert(1)</script>'), '', 'script tag and its content must be removed')
assert.equal(rich('<pre><code><script>alert(1)</script></code></pre>'), '<pre><code></code></pre>')

// An onerror-bearing <img> is dropped whole — tag AND attribute.
assert.equal(sanitizeHtml('<img src=x onerror=alert(1)>'), '')

// The tag survives, the event handler never does.
assert.ok(!richText.allowedAttributes.includes('onclick'))
assert.equal(rich('<p onclick="alert(1)">hi</p>'), '<p>hi</p>')

// ─── the richText profile does NOT admit layout / form tags ──────────────────
// These four are the regression guard for the USE_PROFILES bug: DOMPurify
// OVERWRITES ALLOWED_TAGS/ALLOWED_ATTR when USE_PROFILES is set, so the explicit
// allow-list above it was dead config and the full default HTML profile applied.
// Against that code these four assertions fail (verified by re-adding the line):
//   <img src=x onerror=…> -> '<img src="x">',  <form>/<input> -> echoed back,
//   <table> -> '<table><tbody><tr><td>cell</td></tr></tbody></table>'.
for (const tag of ['img', 'form', 'input', 'table']) {
  assert.ok(!richText.allowedTags.includes(tag), `<${tag}> must not be in the richText allow-list`)
}
assert.equal(rich('<img src="https://example.com/a.png">'), '', '<img> must not survive')
assert.equal(rich('<form action="/x"><input name="a"></form>'), '', '<form>/<input> must not survive')
// KEEP_CONTENT is on, so a table is unwrapped to its text rather than kept.
assert.equal(rich('<table><tr><td>cell</td></tr></table>'), 'cell', '<table> must not survive')

// ─── legitimately-allowed rich markup survives ───────────────────────────────

assert.equal(rich('<strong>b</strong><em>i</em><u>u</u>'), '<strong>b</strong><em>i</em><u>u</u>')
assert.equal(
  rich('<pre><code class="language-js">const a = 1</code></pre>'),
  '<pre><code class="language-js">const a = 1</code></pre>',
)
for (const tag of ['a', 'blockquote', 'h2', 'h3', 'font', 'span', 'strong', 'u', 'ul', 'li', 'pre', 'code']) {
  assert.ok(richText.allowedTags.includes(tag), `rich tag <${tag}> must stay allowed`)
}

// Allowed inline style properties survive; everything else is dropped.
assert.equal(
  rich('<span style="color:red;font-weight:bold">t</span>'),
  '<span style="color: red; font-weight: bold">t</span>',
)
assert.equal(
  rich('<span style="position:fixed;top:0;color:red">t</span>'),
  '<span style="color: red">t</span>',
  'disallowed style properties are stripped, allowed ones kept',
)
assert.equal(rich('<span style="position:fixed">t</span>'), '<span>t</span>', 'an all-disallowed style attribute is removed')
for (const style of ['color', 'background-color', 'font-family', 'font-size', 'font-weight', 'text-align', 'text-decoration']) {
  assert.ok(richText.allowedStyles.has(style), `rich style ${style} must stay allowed`)
}
assert.equal(
  sanitizeStyleDeclaration('text-align:center;font-weight:bold;text-decoration:underline', richText.allowedStyles),
  'text-align: center; font-weight: bold; text-decoration: underline',
)

// ─── anchors: javascript: loses its href, https keeps it + rel/target ────────

assert.equal(rich('<a href="javascript:alert(1)">x</a>'), '<a>x</a>')
assert.equal(
  rich('<a href="https://coms.kw.ac.kr/notice">link</a>'),
  '<a href="https://coms.kw.ac.kr/notice" target="_blank" rel="noopener noreferrer">link</a>',
)
// target/rel are always (re)written by the sanitizer, never taken from the input.
assert.equal(
  rich('<a href="https://coms.kw.ac.kr/notice" target="_self" rel="opener">link</a>'),
  '<a href="https://coms.kw.ac.kr/notice" target="_blank" rel="noopener noreferrer">link</a>',
)

// ─── class attribute: a single language-* hint, on code/pre only ─────────────

assert.ok(richText.allowedAttributes.includes('class'), 'class attribute must be allow-listed')
assert.equal(sanitizeClassAttribute('code', 'language-js'), 'language-js')
assert.equal(sanitizeClassAttribute('pre', 'language-py3'), 'language-py3')
assert.equal(sanitizeClassAttribute('CODE', 'language-TS'), 'language-TS', 'tag/class matching is case-insensitive')
assert.equal(sanitizeClassAttribute('div', 'evil'), '')
assert.equal(sanitizeClassAttribute('span', 'language-js'), '', 'language-* is only honored on code/pre')
assert.equal(sanitizeClassAttribute('code', 'hljs theme-dark'), '')
assert.equal(sanitizeClassAttribute('pre', 'language-js evil'), '', 'multi-class with a non-language token is rejected')
assert.equal(rich('<div class="evil">d</div>'), '<div>d</div>', 'class is stripped off non-code tags in the real pipeline')
