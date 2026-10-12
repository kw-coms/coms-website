import assert from 'node:assert/strict'
import {
  compareDate,
  compareNumber,
  compareRank,
  compareText,
  matchesQuery,
  nextColumnSort,
  searchKey,
  sortedBy,
} from '../src/utils/listTools.ts'

// --- search -----------------------------------------------------------------
assert.equal(searchKey(' 010-1234 5678 '), '01012345678')
assert.equal(searchKey(null), '')
assert.equal(matchesQuery('', ['anything']), true, 'an empty query matches')
assert.equal(matchesQuery('   ', ['anything']), true, 'a blank query matches')
assert.equal(matchesQuery('홍길', ['홍길동', '2024123456']), true)
assert.equal(matchesQuery('01012345678', ['010-1234-5678']), true, 'hyphens in the field are ignored')
assert.equal(matchesQuery('010-1234', ['01012345678']), true, 'hyphens in the query are ignored')
assert.equal(matchesQuery('KIM', ['kim@example.com']), true, 'case is ignored')
assert.equal(matchesQuery('홍길동 60', ['홍길동', '60']), true, 'each word may match a different field')
assert.equal(matchesQuery('홍길동 61', ['홍길동', '60']), false, 'every word has to match')
assert.equal(matchesQuery('x', [null, undefined, '']), false)

// --- ordering -----------------------------------------------------------------
const names = ['다람', '', '가람', null, '나람']
assert.deepEqual(sortedBy(names, (a, b) => compareText(a, b, 'asc')), ['가람', '나람', '다람', '', null])
assert.deepEqual(
  sortedBy(names, (a, b) => compareText(a, b, 'desc')),
  ['다람', '나람', '가람', '', null],
  'blank values stay last when the order is reversed',
)
assert.deepEqual(sortedBy(['2', '10', '1'], (a, b) => compareText(a, b)), ['1', '2', '10'], 'digits in text sort by value')

const generations = ['60', 59, '', '7', 'x', null]
assert.deepEqual(sortedBy(generations, (a, b) => compareNumber(a, b, 'asc')), ['7', 59, '60', '', 'x', null])
assert.deepEqual(sortedBy(generations, (a, b) => compareNumber(a, b, 'desc')), ['60', 59, '7', '', 'x', null])

const order = ['ADMIN', 'OFFICER', 'USER']
assert.deepEqual(sortedBy(['USER', 'GHOST', 'ADMIN', 'OFFICER'], (a, b) => compareRank(a, b, order)), ['ADMIN', 'OFFICER', 'USER', 'GHOST'])
assert.deepEqual(
  sortedBy(['USER', 'GHOST', 'ADMIN', 'OFFICER'], (a, b) => compareRank(a, b, order, 'desc')),
  ['USER', 'OFFICER', 'ADMIN', 'GHOST'],
)

const dates = ['2026-09-03T10:00:00', '', '2026-09-01T09:00:00', 'not a date']
assert.deepEqual(sortedBy(dates, (a, b) => compareDate(a, b, 'asc')), ['2026-09-01T09:00:00', '2026-09-03T10:00:00', '', 'not a date'])
assert.deepEqual(sortedBy(dates, (a, b) => compareDate(a, b, 'desc')), ['2026-09-03T10:00:00', '2026-09-01T09:00:00', '', 'not a date'])

// Sorting returns a copy and keeps ties in their original order.
const rows = [{ n: 'b', g: 1 }, { n: 'a', g: 1 }, { n: 'c', g: 0 }]
const byG = sortedBy(rows, (a, b) => compareNumber(a.g, b.g))
assert.deepEqual(byG.map((r) => r.n), ['c', 'b', 'a'])
assert.deepEqual(rows.map((r) => r.n), ['b', 'a', 'c'], 'the input is not reordered')

// --- column headings ----------------------------------------------------------
assert.deepEqual(nextColumnSort(null, 'name'), { key: 'name', direction: 'asc' })
assert.deepEqual(nextColumnSort({ key: 'name', direction: 'asc' }, 'name'), { key: 'name', direction: 'desc' })
assert.equal(nextColumnSort({ key: 'name', direction: 'desc' }, 'name'), null, 'the third press returns to the original order')
assert.deepEqual(nextColumnSort({ key: 'name', direction: 'desc' }, 'generation'), { key: 'generation', direction: 'asc' })

console.log('list tools contract passed')
