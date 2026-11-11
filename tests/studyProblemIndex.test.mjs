import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { INDEX_PATH, renderIndex } from '../scripts/gen-problem-index.mjs'

// The hub reads this file instead of the problem bodies. A new or renamed problem must be followed by
// `node --import tsx scripts/gen-problem-index.mjs`.
assert.equal(readFileSync(INDEX_PATH, 'utf8'), renderIndex(), 'problemIndex.ts is stale: run node --import tsx scripts/gen-problem-index.mjs')

// The hub path must not import the problem bodies.
for (const file of ['../src/pages/study/exercises/StudyPracticeSummary.tsx', '../src/pages/study/StudyHubPage.tsx']) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8')
  assert.doesNotMatch(source, /from '\.\/problems'|from '\.\/exercises\/problems'|problems\/index'/, `${file} imports the problem bodies`)
}
console.log('study problem index ok')
