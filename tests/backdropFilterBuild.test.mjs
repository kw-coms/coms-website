import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// The CSS minifier (lightningcss) keeps only the LAST of an adjacent `backdrop-filter` /
// `-webkit-backdrop-filter` pair. Written unprefixed-first, that left only the -webkit- spelling,
// which Chromium ignores, so glass surfaces lost their blur in Chrome. The sources therefore
// carry the unprefixed property only and the build adds the prefixed one for the targets.

const stylesDir = new URL('../src/styles/', import.meta.url).pathname
const sources = [...readdirSync(stylesDir).filter((f) => f.endsWith('.css')).map((f) => join(stylesDir, f)), new URL('../src/pages/study/study.css', import.meta.url).pathname]
for (const file of sources) {
  assert.doesNotMatch(readFileSync(file, 'utf8'), /-webkit-backdrop-filter\s*:/, `${file}: write the unprefixed backdrop-filter only`)
}

// When a build exists (npm run build), its CSS must still carry the unprefixed property.
const assets = new URL('../dist/assets/', import.meta.url).pathname
if (existsSync(assets)) {
  const css = readdirSync(assets).filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n')
  assert.match(css, /(^|[;{}])backdrop-filter:[^;}]*blur\(/, 'dist css has an unprefixed backdrop-filter with blur')
  assert.match(css, /\.apple-topbar\{[^}]*(?<![-\w])backdrop-filter:/, 'the top bar keeps its unprefixed backdrop-filter')
  assert.match(css, /-webkit-backdrop-filter:[^;}]*blur\(/, 'dist css also carries the -webkit- spelling for Safari')
}

console.log('backdrop-filter build contract passed')
