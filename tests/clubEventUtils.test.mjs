import assert from 'node:assert/strict'
import { clubEventPhase, isContestEvent, sortClubEvents } from '../src/features/clubEvent/clubEventUtils.ts'

const now = new Date('2026-07-01T00:00:00').getTime()

assert.equal(isContestEvent({ votingOpen: false, entryCount: 0 }), false, 'plain event')
assert.equal(isContestEvent({ votingOpen: true, entryCount: 0 }), true, 'open vote')
assert.equal(isContestEvent({ votingOpen: false, entryCount: 2 }), true, 'has entries')
assert.equal(isContestEvent({ votingOpen: false, entries: [{}] }), true, 'entries array')

assert.equal(clubEventPhase({ votingOpen: true }, now), 0)
assert.equal(clubEventPhase({ votingOpen: false, startsAt: '2026-08-01T00:00:00' }, now), 1)
assert.equal(clubEventPhase({ votingOpen: false, startsAt: '2026-05-01T00:00:00' }, now), 2)

const sorted = sortClubEvents([
  { id: 1, votingOpen: false, startsAt: '2026-05-01T00:00:00' },
  { id: 2, votingOpen: false, startsAt: '2026-08-01T00:00:00' },
  { id: 3, votingOpen: true, startsAt: '2026-06-20T00:00:00' },
  { id: 4, votingOpen: false, startsAt: '2026-06-01T00:00:00' },
  { id: 5, votingOpen: true, startsAt: '2026-06-25T00:00:00' },
], now).map((event) => event.id)
assert.deepEqual(sorted, [5, 3, 2, 4, 1])
console.log('clubEventUtils ok')
