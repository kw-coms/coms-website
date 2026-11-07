import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { selectInlineProblems } from '../src/pages/study/exercises/selection.ts'
import { initExerciseLinks } from '../src/pages/study/exercises/inline.ts'
import { exercisesFor } from '../src/pages/study/exercises/problems/index.ts'
import { chapterOf } from '../src/pages/study/exercises/navigation.ts'

const problems = [
  { id: 'solved-low', level: 1 }, { id: 'new-high', level: 3 },
  { id: 'new-first', level: 2 }, { id: 'new-second', level: 2 },
  { id: 'new-low', level: 1 }, { id: 'solved-high', level: 5 },
]

test('inline selection caps at four: unsolved, level, then authored order without mutation', () => {
  const before = [...problems]
  assert.deepEqual(selectInlineProblems(problems, { 'solved-low': { solved: true }, 'solved-high': { solved: true } }).map(p => p.id),
    ['new-low', 'new-first', 'new-second', 'new-high'])
  assert.deepEqual(problems, before)
})

test('inline selection fills remaining slots with solved problems and handles short or empty lists', () => {
  const progress = Object.fromEntries(problems.map(p => [p.id, { solved: true }]))
  progress['new-high'].solved = false
  assert.deepEqual(selectInlineProblems(problems, progress).map(p => p.id), ['new-high', 'solved-low', 'new-low', 'new-first'])
  assert.deepEqual(selectInlineProblems([], {}), [])
  assert.deepEqual(selectInlineProblems(problems.slice(0, 2), {}), problems.slice(0, 2))
})

test('inline DOM caps chapter problems, links the full count and cleans up owned nodes', () => {
  const dom = new JSDOM('<main><section id="start"></section><section id="loop"></section></main>', { url: 'https://example.test' })
  globalThis.document = dom.window.document
  globalThis.localStorage = dom.window.localStorage
  const root = document.querySelector('main')
  const paths = []
  const cleanup = initExerciseLinks(root, 'c', path => paths.push(path))
  for (const section of root.querySelectorAll('section')) {
    const matches = exercisesFor('c').filter(p => chapterOf(p, 'c') === section.id)
    assert.equal(section.querySelectorAll('li').length, Math.min(4, matches.length))
    const full = section.querySelector('aside > a')
    if (matches.length > 4) {
      assert.equal(full.textContent, `이 장 문제 전체 ${matches.length}개 →`)
      assert.equal(full.getAttribute('href'), `/study/c/practice?chapter=${section.id}`)
      full.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      assert.equal(paths.at(-1), `/study/c/practice?chapter=${section.id}`)
    } else assert.equal(full, null)
  }
  cleanup()
  assert.equal(root.querySelectorAll('.ex-inline').length, 0)
})
