// setupDom MUST come first: injectBuiltinFontStylesheet touches document.head,
// and the module short-circuits on `typeof document === 'undefined'`.
import './setupDom.mjs'

import assert from 'node:assert/strict'

import { readFileSync } from 'node:fs'

import { BUILT_IN_FONTS, PRETENDARD_FALLBACK_FAMILIES, fontFamilyValue, injectBuiltinFontStylesheet } from '../src/services/fontPreferences.ts'

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

// ─── Pretendard's metric-matched stand-ins ───────────────────────────────────
// The stack lives in three places (tokens.css for the first paint, fontPreferences.ts once React sets the variable,
// font-fallback.css for the faces themselves); they must name the same families in the same order.
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const fallbackFamilies = PRETENDARD_FALLBACK_FAMILIES.split(',').map((name) => name.trim())
assert.equal(fallbackFamilies.length, 5)
const faceCss = read('../src/styles/font-fallback.css')
for (const family of fallbackFamilies) {
  const faces = faceCss.split('@font-face').filter((face) => face.includes(`font-family: ${family};`))
  assert.equal(faces.length, family.includes('WenQuanYi') ? 1 : 2, `${family}: a regular and a bold face (WenQuanYi has no bold)`)
  for (const face of faces) {
    for (const descriptor of ['size-adjust', 'ascent-override', 'descent-override', 'line-gap-override', 'unicode-range']) assert.match(face, new RegExp(`${descriptor}:`), `${family} needs ${descriptor}`)
    assert.doesNotMatch(face, /url\(/, `${family} must not download anything`)
  }
}
assert.ok(read('../src/styles/tokens.css').includes(`--apple-font-family: 'Pretendard Variable', ${PRETENDARD_FALLBACK_FAMILIES}, -apple-system`), 'tokens.css first-paint stack')
assert.ok(fontFamilyValue(BUILT_IN_FONTS[0]).startsWith(`"Pretendard Variable", ${PRETENDARD_FALLBACK_FAMILIES}, `), 'the applied Pretendard stack')
assert.equal(fontFamilyValue(BUILT_IN_FONTS[1]).includes('Pretendard Fallback'), false, 'other fonts are left alone')

console.log('fontPreferences tests passed')
