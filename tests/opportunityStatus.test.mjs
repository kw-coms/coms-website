import assert from 'node:assert/strict'
import { compareOpportunitiesSoon, opportunityPhases, opportunityTime, periodPhase } from '../src/features/opportunities/opportunityStatus.ts'

const seoul = value => Date.parse(value + '+09:00')
const dates = {
  applicationStart: '2026-11-24', applicationEnd: '2026-11-24',
  eventStart: '2026-11-27T10:00', eventEnd: '2026-11-29',
}
assert.equal(opportunityTime('2026-11-24'), seoul('2026-11-24T00:00:00'))
assert.equal(opportunityTime('2026-11-24', true), seoul('2026-11-24T23:59:59.999'))
assert.equal(periodPhase('2026-11-24', '2026-11-24', seoul('2026-11-24T23:59:59')), 'ongoing')
assert.equal(periodPhase('2026-11-24', '2026-11-24', seoul('2026-11-25T00:00:00')), 'ended')
assert.deepEqual(opportunityPhases(dates, seoul('2026-11-24T12:00:00')),
  { application: 'ongoing', event: 'upcoming', overall: 'upcoming' })
assert.deepEqual(opportunityPhases(dates, seoul('2026-11-28T12:00:00')),
  { application: 'ended', event: 'ongoing', overall: 'ongoing' })
assert.equal(periodPhase(null, '2026-11-24T18:00', seoul('2026-11-24T17:59')), 'ongoing')
assert.equal(periodPhase(null, null, Date.now()), 'unknown')

const item = (id, eventStart, eventEnd) => ({ id, applicationStart: null, applicationEnd: null,
  eventStart, eventEnd, publishedAt: '2026-11-20T00:00:00Z' })
const now = seoul('2026-11-24T12:00:00')
const ordered = [item(1, '2026-11-27', '2026-11-27'), item(2, '2026-11-23', '2026-11-25'),
  item(3, '2026-11-20', '2026-11-21')].sort((a, b) => compareOpportunitiesSoon(a, b, now))
assert.deepEqual(ordered.map(entry => entry.id), [2, 1, 3])
console.log('opportunity Seoul lifecycle and ordering passed')
