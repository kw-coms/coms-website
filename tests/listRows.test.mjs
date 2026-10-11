import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { openRowWithKeyboard } from '../src/components/archive/archiveUtils.ts'

const notices = readFileSync(new URL('../src/pages/Notices.tsx', import.meta.url), 'utf8')
const archive = readFileSync(new URL('../src/pages/Archive.tsx', import.meta.url), 'utf8')

// --- Row keyboard handler ---------------------------------------------------------------
// The clickable table rows are focusable (tabIndex=0, role="button") and open on Enter/Space.
// Key events bubble, so the handler also hears keys pressed on a link or button inside the
// row; those must keep their own meaning.
function pressKey(key, { on, row }) {
  const event = { key, target: on, currentTarget: row, prevented: false, preventDefault() { this.prevented = true } }
  let opened = 0
  openRowWithKeyboard(event, () => { opened += 1 })
  return { opened, prevented: event.prevented }
}

const row = { tagName: 'TR' }
const downloadLink = { tagName: 'A' }

assert.deepEqual(pressKey('Enter', { on: row, row }), { opened: 1, prevented: true })
assert.deepEqual(pressKey(' ', { on: row, row }), { opened: 1, prevented: true }, 'Space opens too and must not scroll the page')
assert.deepEqual(pressKey('Tab', { on: row, row }), { opened: 0, prevented: false }, 'other keys pass through')
assert.deepEqual(
  pressKey('Enter', { on: downloadLink, row }),
  { opened: 0, prevented: false },
  'Enter on the download link inside a row must reach the link, not open the row',
)
assert.deepEqual(pressKey(' ', { on: downloadLink, row }), { opened: 0, prevented: false })

// Notices.tsx keeps its own copy of the helper; it has to carry the same guard.
assert.match(
  notices,
  /function openRowWithKeyboard\(event, open\) \{[\s\S]*?if \(event\.target !== event\.currentTarget\) return\s+if \(event\.key === 'Enter' \|\| event\.key === ' '\)/,
  'the notices row handler should ignore keys that did not originate on the row',
)

// --- Notices table ------------------------------------------------------------------------
// A click handler on the <tr> and on each <td> ran twice per click: two navigate() calls, two
// history entries, so one Back press stayed on the same notice.
assert.doesNotMatch(notices, /clickableCell/, 'notice cells should not repeat the row click handler')
assert.doesNotMatch(notices, /<td[^>]*onClick/, 'notice cells should not carry their own click handler')
assert.match(notices, /<tr\s+key=\{notice\.id\}[\s\S]*?onClick=\{open\}/, 'the notice row itself stays clickable')

// The table keeps min-w-[760px]; its box is narrower than that on portrait tablets.
assert.doesNotMatch(
  notices,
  /hidden overflow-hidden rounded-lg[^"]*md:block/,
  'the notice table wrapper should not clip the table',
)
assert.equal(
  (notices.match(/hidden overflow-x-auto rounded-lg[^"]*md:block/g) || []).length,
  2,
  'the notice table and its skeleton should scroll sideways when the table is wider than the box',
)

// --- List filter survives Back -------------------------------------------------------------
// App.tsx keys the routed page by pathname, so list -> detail -> Back remounts the list. Both
// lists read their filter from the query string on mount and mirror it there with replace.
for (const [name, source] of [['notices', notices], ['archive', archive]]) {
  assert.match(source, /useState\(\(\) => searchParams\.get\('q'\) \?\? ''\)/, `${name} should restore the search text from the URL`)
  assert.match(source, /searchParams\.get\('category'\)/, `${name} should restore the category from the URL`)
  assert.match(
    source,
    /setSearchParams\(params, \{ replace: true \}\)/,
    `${name} should mirror the filter into the URL without adding history entries`,
  )
}

console.log('list rows contract passed')
