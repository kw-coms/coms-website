import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { act, createElement } from 'react'
import { JSDOM } from 'jsdom'
import { sampleExercises, sampleWebExercises } from '../src/pages/study/exercises/__fixtures__/sample.ts'
import { exercisesFor, findExercise, exerciseCounts } from '../src/pages/study/exercises/problems/index.ts'
import { MiniMarkdown } from '../src/pages/study/exercises/markdown.tsx'
import { PROGRESS_KEY, readProgress, saveCode, scheduleSaveCode, flushSaves, recordAttempt, markViewed, markOpened, useProgress } from '../src/pages/study/exercises/progress.ts'
import { labMissions, missionUrl } from '../src/pages/study/exercises/labMissions.ts'

const dom = new JSDOM('', { url: 'https://example.test/' })
globalThis.localStorage = dom.window.localStorage

test('fixtures cover each programming language and web checks without entering the production index', () => {
  for (const lang of ['c', 'java', 'python']) {
    assert.equal(sampleExercises.filter((p) => p.langs.includes(lang) && p.mode === 'stdio').length, 2)
    assert.equal(sampleExercises.filter((p) => p.langs.includes(lang) && p.mode === 'function').length, 1)
  }
  assert.equal(sampleWebExercises.length, 2)
  assert.equal(exercisesFor('arduino').length, 0)
  assert.equal(exerciseCounts.web, exercisesFor('web').length)
  assert.equal(findExercise('sample-echo'), undefined)
})

test('mini-markdown escapes source HTML and renders supported blocks', () => {
  const html = renderToStaticMarkup(createElement(MiniMarkdown, { text: '첫 줄 **강조**와 `코드` <img src=x>\n둘째 줄\n\n- 항목\n- 둘째\n\n1. 순서\n\n```js\nconst n = 1\n```' }))
  assert.match(html, /<strong>강조<\/strong>/)
  assert.match(html, /<code>코드<\/code>/)
  assert.match(html, /&lt;img src=x&gt;/)
  assert.match(html, /<br\/>/)
  assert.match(html, /<ul>/)
  assert.match(html, /<ol>/)
  assert.match(html, /<pre><code data-language="js">const n = 1<\/code><\/pre>/)
  assert.doesNotMatch(html, /<img/)
})

test('progress survives malformed storage and keeps language drafts and solved state', () => {
  localStorage.clear()
  localStorage.setItem(PROGRESS_KEY, '{broken')
  assert.deepEqual(readProgress(), {})
  saveCode('exercise-a', 'c', 'old')
  scheduleSaveCode('exercise-a', 'c', 'new')
  scheduleSaveCode('exercise-a', 'python', 'print(1)')
  flushSaves()
  recordAttempt('exercise-a', 'c', false)
  recordAttempt('exercise-a', 'python', true)
  markViewed('exercise-a')
  markOpened('exercise-a')
  const p = readProgress()['exercise-a']
  assert.equal(p.code.c, 'new')
  assert.equal(p.code.python, 'print(1)')
  assert.equal(p.tries, 2)
  assert.equal(p.solved, true)
  assert.deepEqual(p.solvedLangs, ['python'])
  assert.equal(p.viewed, true)
  assert.ok(p.lastAt > 0)
})

test('storage failures do not stop progress actions', () => {
  const before = globalThis.localStorage
  saveCode('volatile', 'c', 'draft')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw Error('blocked') } })
  assert.equal(readProgress().volatile.code.c, 'draft')
  assert.doesNotThrow(() => { saveCode('x', 'html', '<h1>x</h1>'); recordAttempt('x', 'web', true); markViewed('x') })
  assert.equal(readProgress().x.code.html, '<h1>x</h1>')
  assert.equal(readProgress().x.solved, true)
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: before })
})

test('quota failure keeps subsequent edits even while storage still reads stale data', () => {
  localStorage.clear()
  saveCode('quota', 'c', 'old')
  const before = globalThis.localStorage
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: before.getItem.bind(before), setItem() { throw new DOMException('full', 'QuotaExceededError') } },
  })
  saveCode('quota', 'c', 'new')
  recordAttempt('quota', 'c', true)
  assert.equal(readProgress().quota.code.c, 'new')
  assert.equal(readProgress().quota.solved, true)
  assert.equal(JSON.parse(before.getItem(PROGRESS_KEY)).quota.code.c, 'old')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: before })
  // The next successful write carries the volatile edits forward.
  markViewed('quota')
  assert.equal(readProgress().quota.code.c, 'new')
  assert.equal(JSON.parse(before.getItem(PROGRESS_KEY)).quota.viewed, true)
})

test('progress hook sees cross-tab changes after all subscribers unmount', async () => {
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const { createRoot } = await import('react-dom/client')
  const Counter = () => createElement('span', null, String(Object.keys(useProgress()).length))
  localStorage.setItem(PROGRESS_KEY, '{}')
  let host = document.createElement('div')
  let root = createRoot(host)
  await act(async () => { root.render(createElement(Counter)) })
  assert.equal(host.textContent, '0')
  await act(async () => { root.unmount() })
  localStorage.setItem(PROGRESS_KEY, JSON.stringify({ remote: { solved: true, tries: 1, lastAt: 1, code: {}, solvedLangs: [] } }))
  host = document.createElement('div')
  root = createRoot(host)
  await act(async () => { root.render(createElement(Counter)) })
  assert.equal(host.textContent, '1')
  const before = globalThis.localStorage
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw Error('blocked') } })
  await act(async () => { markOpened('while-mounted') })
  assert.equal(host.textContent, '2', 'volatile updates rerender a mounted subscriber')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: before })
  await act(async () => { root.unmount() })
})

test('Arduino mission list uses the requested IDs and full-page destination', () => {
  assert.equal(labMissions.length, 10)
  assert.equal(new Set(labMissions.map((m) => m.id)).size, 10)
  assert.equal(missionUrl('led-blink'), '/lab/#mission=led-blink')
})
