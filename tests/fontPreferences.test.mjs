// setupDom MUST come first: injectBuiltinFontStylesheet touches document.head,
// and the module short-circuits on `typeof document === 'undefined'`.
import './setupDom.mjs'

import assert from 'node:assert/strict'

import { BUILT_IN_FONTS, injectBuiltinFontStylesheet } from '../src/services/fontPreferences.ts'

const links = () => Array.from(document.head.querySelectorAll('link[id^="builtin-font-"]'))

// ─── the site default must be a unicode-range-subset stylesheet ──────────────
// Regression guard for the 2 MB first paint: the single-file
// `pretendardvariable.min.css` is ONE @font-face with no unicode-range, so every
// visitor downloaded the whole variable woff2 before the homepage painted.
const pretendard = BUILT_IN_FONTS[0]
assert.equal(pretendard.id, 'b:pretendard', 'Pretendard must stay the site default (App.tsx uses BUILT_IN_FONTS[0])')
assert.match(pretendard.stylesheet, /pretendardvariable-dynamic-subset\.min\.css$/)

// Every built-in stylesheet must sit on a host the CSP allows (security-headers.conf).
for (const font of BUILT_IN_FONTS) {
  assert.match(font.stylesheet, /^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com)\//, `${font.id} host must be CSP-allowed`)
}

// ─── only the selected font is fetched ───────────────────────────────────────
assert.equal(links().length, 0)

injectBuiltinFontStylesheet('b:pretendard')
assert.equal(links().length, 1, 'exactly one stylesheet per selected font')
assert.equal(links()[0].href, pretendard.stylesheet)
assert.equal(links()[0].rel, 'stylesheet')

// Idempotent: re-applying the same font must not add a second <link>.
injectBuiltinFontStylesheet('b:pretendard')
assert.equal(links().length, 1)

// Switching fonts in settings adds the new one and KEEPS the previous link, so
// flipping back is instant and never re-downloads.
injectBuiltinFontStylesheet('b:noto-sans-kr')
assert.equal(links().length, 2)
injectBuiltinFontStylesheet('b:pretendard')
assert.equal(links().length, 2)

// Unknown ids inject nothing: '' / null is "기본 고딕체", and a numeric id is a
// member-uploaded font whose @font-face comes from buildFontFaceCss instead.
for (const id of ['', null, undefined, 7, 'b:nope']) {
  injectBuiltinFontStylesheet(id)
}
assert.equal(links().length, 2, 'non-built-in ids must not inject a stylesheet')

console.log('fontPreferences tests passed')
