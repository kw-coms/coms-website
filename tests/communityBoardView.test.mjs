// The community board keeps its page / filter / sort / search in the list URL, so that opening
// a post and coming back (the page remounts on every path change) returns to the same view.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { boardViewFromSearch, boardViewToSearch } from '../src/pages/community/communityBoardUtils.ts'

const defaults = { page: 1, category: 'ALL', sort: 'latest', query: '' }

// ─── reading ─────────────────────────────────────────────────────────────────

assert.deepEqual(boardViewFromSearch(''), defaults)
assert.deepEqual(boardViewFromSearch(undefined), defaults)
assert.deepEqual(
  boardViewFromSearch('?page=3&cat=QUESTION&sort=views&q=%EC%8A%A4%ED%84%B0%EB%94%94+%EB%AA%A8%EC%A7%91'),
  { page: 3, category: 'QUESTION', sort: 'views', query: '스터디 모집' },
)
// A hand-edited or stale link still opens the board.
for (const bad of ['?page=0', '?page=-2', '?page=1.5', '?page=abc', '?page=']) {
  assert.equal(boardViewFromSearch(bad).page, 1, `${bad} falls back to the first page`)
}
assert.equal(boardViewFromSearch('?sort=hottest').sort, 'latest')
assert.equal(boardViewFromSearch(`?q=${'가'.repeat(500)}`).query.length, 100)
// Other parameters on the same URL are not this view's business.
assert.deepEqual(boardViewFromSearch('?view=deleted'), defaults)

// ─── writing ─────────────────────────────────────────────────────────────────

// The plain board keeps the plain URL.
assert.equal(boardViewToSearch(defaults), '')
assert.equal(boardViewToSearch({ ...defaults, query: '   ' }), '')
assert.equal(boardViewToSearch({ page: 3, category: 'QUESTION', sort: 'views', query: ' 스터디 모집 ' }),
  '?page=3&cat=QUESTION&sort=views&q=%EC%8A%A4%ED%84%B0%EB%94%94+%EB%AA%A8%EC%A7%91')
// Returning to a default removes the parameter instead of leaving `page=1` behind…
assert.equal(boardViewToSearch({ ...defaults, sort: 'score' }, '?page=4&sort=views'), '?sort=score')
// …and parameters that belong to something else survive.
assert.equal(boardViewToSearch({ ...defaults, page: 2 }, '?view=deleted'), '?view=deleted&page=2')

// What is written is what is read back.
for (const view of [
  defaults,
  { page: 7, category: 'CONCEPT', sort: 'comments', query: 'a&b=c #1' },
  { page: 2, category: 'ANONYMOUS', sort: 'latest', query: '100% 확실?' },
]) {
  assert.deepEqual(boardViewFromSearch(boardViewToSearch(view)), view)
}
// Writing an already-written URL changes nothing — this is what stops the sync effect looping.
const written = boardViewToSearch({ page: 2, category: 'INFO', sort: 'views', query: 'x y' })
assert.equal(boardViewToSearch(boardViewFromSearch(written), written), written)

// ─── wiring ──────────────────────────────────────────────────────────────────

const community = readFileSync(new URL('../src/pages/Community.tsx', import.meta.url), 'utf8')
assert.match(community, /boardViewFromSearch\(location\.search\)/, 'the board view starts from the URL')
assert.match(community, /replace: true, state: location\.state/, 'the URL is replaced, not pushed, while browsing the board')
assert.match(community, /state: \{ boardSearch: location\.search \}/, 'a post remembers which board view it was opened from')

console.log('community board view contract passed')
