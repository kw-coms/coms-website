import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { OUTLINE_PATH, renderOutline } from '../scripts/gen-study-outline.mjs'
import { studyQuickItems } from '../src/data/studyQuickItems.ts'
import { searchQuickItems } from '../src/utils/quickSearch.ts'

// Quick search reads this file instead of the lessons. After editing a table of contents run
// `node --import tsx scripts/gen-study-outline.mjs`.
assert.equal(readFileSync(OUTLINE_PATH, 'utf8'), renderOutline(), 'studyOutline.ts is stale: run node --import tsx scripts/gen-study-outline.mjs')

const first = (query) => searchQuickItems(studyQuickItems, query).flatMap((group) => group.items)
const ids = (query) => first(query).map((item) => item.id)

assert.ok(ids('python').includes('study:python'), 'python finds the Python track')
assert.equal(first('python')[0].path, '/study/python')
assert.ok(first('포인터').some((item) => item.path.startsWith('/study/c#')), 'pointer finds a C chapter anchor')
assert.ok(first('아두이노').some((item) => item.path === '/study/arduino'), 'arduino finds its track')
assert.ok(first('회로').some((item) => item.path === '/lab/' || item.path.startsWith('/lab/')), 'circuit finds the Lab')

// Every chapter link points at an anchor that exists in the lesson markup.
for (const item of studyQuickItems) {
  const match = item.path.match(/^\/study\/([a-z]+)#(.+)$/)
  if (!match) continue
  assert.ok(readFileSync(new URL(`../src/pages/study/content/${match[1]}.html`, import.meta.url), 'utf8').includes(`id="${match[2]}"`), `${item.path} has no anchor`)
}
console.log('study outline ok')
