import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recommendProblem, problemStatus, chapterOf } from '../src/pages/study/exercises/navigation.ts'
const problems = [
  { id: 'one', chapter: { c: 'start' }, level: 1 },
  { id: 'two', chapter: { c: 'loop' }, level: 3 },
  { id: 'three', chapter: { c: 'loop' }, level: 2 },
]
test('recommendation follows reached chapter then lowest difficulty', () => {
  assert.equal(recommendProblem(problems, 'c', {})?.id, 'one')
  assert.equal(recommendProblem(problems, 'c', {}, ['loop'])?.id, 'three')
  assert.equal(recommendProblem(problems, 'c', { two: { solved: false, lastAt: 1 } })?.id, 'three')
  assert.equal(recommendProblem(problems, 'c', Object.fromEntries(problems.map((p) => [p.id, { solved: true, lastAt: 1 }]))), undefined)
})
test('status never counts viewed solutions as solved', () => {
  assert.equal(problemStatus(), 'new')
  assert.equal(problemStatus({ solved: false, tries: 1 }), '◐ 도전 중')
  assert.equal(problemStatus({ solved: false, tries: 1, viewed: true }), '👀 답 확인')
  assert.equal(problemStatus({ solved: true, tries: 1, viewed: true }), '✓ 해결')
  assert.equal(chapterOf({ chapter: 'html' }, 'web'), 'html')
})
