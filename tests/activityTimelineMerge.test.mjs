import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeActivityTimeline } from '../src/data/activityTimelineMerge.ts'

const item = (id, overrides = {}) => ({
  id, title: `활동 ${id}`, kind: 'ACTIVITY', kindLabel: '행사',
  description: `요약 ${id}\n공개 사실 ${id}`, resolvedStatus: 'DONE',
  timelineTerm: '2026 2학기', ...overrides,
})

test('merges completed DB rows after static fall events, ordered by date with undated last', () => {
  const merged = mergeActivityTimeline([
    item(3),
    item(2, { eventDate: '2026-11-20', dateLabel: '11월 말' }),
    item(1, { eventDate: '2026-10-10', memberFacts: '회원 전용 한 줄' }),
  ], Date.parse('2026-11-24T00:00:00+09:00'))
  const fall = merged.sections.find((section) => section.term === '2026 2학기')
  assert.deepEqual(fall.events.map((event) => event.id), ['fall-opening', 'fall-founding', 'fall-hackathon', 'db-1', 'db-2', 'db-3'])
  assert.equal(fall.events[3].summary, '요약 1')
  assert.deepEqual(fall.events[3].facts, ['공개 사실 1'])
  assert.deepEqual(fall.events[3].memberFacts, ['회원 전용 한 줄'])
  assert.equal(fall.events[4].dateLabel, '11월 말')
  assert.equal(fall.events[5].dateLabel, '날짜 미정')
})

test('routes planned and confirmed items to upcoming, dated first, without guessing undated dates', () => {
  const merged = mergeActivityTimeline([
    item(1, { resolvedStatus: 'PLANNED' }),
    item(2, { resolvedStatus: 'CONFIRMED', eventDate: '2026-12-01' }),
    item(3, { resolvedStatus: 'PLANNED', eventDate: '2026-11-30' }),
  ], Date.parse('2026-11-24T00:00:00+09:00'))
  assert.deepEqual(merged.upcoming.map((event) => [event.id, event.status]), [
    ['db-3', 'planned'], ['db-2', 'confirmed'], ['db-1', 'planned'],
  ])
  assert.equal(merged.hasUndatedUpcoming, true)
  assert.equal(mergeActivityTimeline([item(4, { resolvedStatus: 'PLANNED', eventDate: '2026-12-01' })], 0).hasUndatedUpcoming, false)
})

test('orders a DB-only term and marks live terms from backend-resolved status', () => {
  const merged = mergeActivityTimeline([
    item(1, { timelineTerm: '2027 1학기', resolvedStatus: 'LIVE', eventDate: '2027-03-01' }),
    item(2, { timelineTerm: '2025 겨울방학' }),
  ], Date.parse('2026-11-24T00:00:00+09:00'))
  assert.deepEqual(merged.sections.map((section) => section.term), [
    '2025 겨울방학', '2026 1학기', '2026 여름방학', '2026 2학기', '2027 1학기',
  ])
  assert.equal(merged.liveTerms.has('2027 1학기'), true)
})

test('shows rich activity descriptions as plain text', () => {
  const merged = mergeActivityTimeline([item(1, { description: '<p><strong>공지</strong> 안내</p>' })], 0)
  const fall = merged.sections.find((section) => section.term === '2026 2학기')
  assert.equal(fall.events.at(-1).summary, '공지 안내')
})
