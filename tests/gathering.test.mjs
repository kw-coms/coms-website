import assert from 'node:assert/strict'
import {
  GATHERING_STATE_LABELS,
  fillRatio,
  formatGatheringTime,
  gatheringState,
  gatheringToCsv,
  parseCapacity,
  placesLabel,
  toApiDateTime,
} from '../src/utils/gathering.ts'

// Open, full or closed. Closed wins: a closed gathering takes nobody, places left or not.
assert.equal(gatheringState({ open: true, full: false }), 'open')
assert.equal(gatheringState({ open: true, full: true }), 'full')
assert.equal(gatheringState({ open: false, full: false }), 'closed')
assert.equal(gatheringState({ open: false, full: true }), 'closed')
assert.deepEqual(GATHERING_STATE_LABELS, { open: '받는 중', full: '정원 마감', closed: '마감' })

assert.equal(placesLabel(7, 10), '7 / 10명')
assert.equal(placesLabel(7, null), '7명')
assert.equal(placesLabel(0, undefined), '0명')

// The bar: nothing to fill without a limit, never past the end.
assert.equal(fillRatio(5, 10), 0.5)
assert.equal(fillRatio(0, 10), 0)
assert.equal(fillRatio(12, 10), 1)
assert.equal(fillRatio(3, null), null)
assert.equal(fillRatio(3, 0), null)

assert.equal(formatGatheringTime('2026-10-20T18:00:00'), '10월 20일 18:00')
assert.equal(formatGatheringTime('2026-01-03T09:05:00.5'), '1월 3일 09:05')
assert.equal(formatGatheringTime(''), '')
assert.equal(formatGatheringTime(null), '')

// What a datetime-local box holds, as the API takes it.
assert.equal(toApiDateTime('2026-10-20T18:00'), '2026-10-20T18:00:00')
assert.equal(toApiDateTime('2026-10-20T18:00:30'), '2026-10-20T18:00:30')
assert.equal(toApiDateTime('  2026-10-20T18:00  '), '2026-10-20T18:00:00')
assert.equal(toApiDateTime(''), null)
assert.equal(toApiDateTime('내일 저녁'), null)

// Places: a whole number from 1 to 500, an empty box for no limit, anything else is refused.
assert.equal(parseCapacity(''), null)
assert.equal(parseCapacity('   '), null)
assert.equal(parseCapacity('8'), 8)
assert.equal(parseCapacity(' 12 '), 12)
assert.equal(parseCapacity('500'), 500)
for (const bad of ['0', '501', '3.5', '-2', '여덟', '8명']) {
  assert.ok(Number.isNaN(parseCapacity(bad)), `"${bad}" is not a number of places`)
}

// The list as a spreadsheet file. The people are made up.
const gathering = { id: 7, title: '알고리즘 스터디', creatorName: '연사람', mine: true, canManage: true, capacity: 8, noteLabel: '하고 싶은 주제', open: true, full: false, participantCount: 3, joined: false }
const csv = gatheringToCsv({
  gathering,
  participants: [
    { id: 1, name: '홍길동', mine: false, note: '그래프, "DP"', signedUpAt: '2026-10-12T19:05:00' },
    { id: 2, name: '=HYPERLINK("http://x")', mine: false, note: null, signedUpAt: '2026-10-12T19:06:00' },
    { id: 3, name: '이영희', mine: false, note: '+1 같이', signedUpAt: '2026-10-13T08:00:00' },
  ],
})
assert.equal(csv.charCodeAt(0), 0xfeff, 'starts with a byte-order mark so Excel reads the Korean text')
assert.deepEqual(csv.slice(1).split('\r\n'), [
  '"순서","이름","하고 싶은 주제","신청 시각"',
  '"1","홍길동","그래프, ""DP""","10월 12일 19:05"',
  // A name or an answer that starts like a formula is not run as one.
  '"2","\'=HYPERLINK(""http://x"")","","10월 12일 19:06"',
  '"3","이영희","\'+1 같이","10월 13일 08:00"',
  '',
])
// No question asked: no column for answers.
assert.deepEqual(gatheringToCsv({ gathering: { ...gathering, noteLabel: null }, participants: [{ id: 1, name: '홍길동', mine: false, note: null, signedUpAt: '2026-10-12T19:05:00' }] }).slice(1).split('\r\n'), [
  '"순서","이름","신청 시각"',
  '"1","홍길동","10월 12일 19:05"',
  '',
])

console.log('gathering contract passed')
