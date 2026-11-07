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

// The numbers in each face must follow from the measured table in font-fallback.css (target advance / fallback advance, target
// metric / size-adjust), so a typo in one face fails here.
const PRETENDARD = { ascent: 1950 / 2048, descent: 494 / 2048, hangul: 0.8643, latin400: 0.4250, latin700: 0.4414 }
const expected = {
  Latin: [['100 599', PRETENDARD.latin400 / 0.4256], ['600 900', PRETENDARD.latin700 / 0.4537]],
  Apple: [['100 599', PRETENDARD.hangul / 0.8650], ['600 900', PRETENDARD.hangul / 0.8650]],
  Noto: [['100 599', PRETENDARD.hangul / 0.9200], ['600 900', PRETENDARD.hangul / 0.9200]],
  Malgun: [['100 599', PRETENDARD.hangul / 1.0], ['600 900', PRETENDARD.hangul / 1.0]],
  WenQuanYi: [['100 599', PRETENDARD.hangul / 1.0]],
}
for (const [name, faces] of Object.entries(expected)) {
  const css = faceCss.split('@font-face').filter((face) => face.includes(`font-family: 'Pretendard Fallback ${name}';`))
  assert.equal(css.length, faces.length, `${name}: face count`)
  faces.forEach(([weights, sizeAdjust], i) => {
    const pct = (property) => Number(new RegExp(`${property}: ([\\d.]+)%`).exec(css[i])[1])
    assert.match(css[i], new RegExp(`font-weight: ${weights};`), `${name} face ${i}: weights`)
    assert.ok(Math.abs(pct('size-adjust') - sizeAdjust * 100) < 0.02, `${name} face ${i}: size-adjust ${pct('size-adjust')} vs ${(sizeAdjust * 100).toFixed(2)}`)
    assert.ok(Math.abs(pct('ascent-override') - (PRETENDARD.ascent / sizeAdjust) * 100) < 0.02, `${name} face ${i}: ascent-override`)
    assert.ok(Math.abs(pct('descent-override') - (PRETENDARD.descent / sizeAdjust) * 100) < 0.02, `${name} face ${i}: descent-override`)
    assert.equal(pct('line-gap-override'), 0, `${name} face ${i}: line-gap-override`)
  })
}

console.log('fontPreferences tests passed')
