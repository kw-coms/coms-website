import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const spec = readFileSync(new URL('./e2e/member-fixes.spec.js', import.meta.url), 'utf8')
const machinePaths = [
  ['/private', '/tmp'].join(''),
  ['claude', '501'].join('-'),
  ['scratch', 'pad'].join(''),
]

for (const path of machinePaths) assert.equal(spec.includes(path), false, `machine-specific path in member fixes spec: ${path}`)
assert.doesNotMatch(spec, /(?:\.screenshot\s*\(|\.toHaveScreenshot\s*\(|screenshot\s*:)/, 'member fixes spec must not write screenshots')
console.log('memberFixesHygiene ok')
