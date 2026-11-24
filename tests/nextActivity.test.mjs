import assert from 'node:assert/strict'
import { test } from 'node:test'
import { daysUntilActivity, nextActivity } from '../src/data/nextActivity.ts'

test('D-day changes at midnight in Seoul, including across a year boundary', () => {
  assert.equal(daysUntilActivity('2027-01-01', Date.parse('2026-12-31T14:59:59.999Z')), 1)
  assert.equal(daysUntilActivity('2027-01-01', Date.parse('2026-12-31T15:00:00.000Z')), 0)
})

test('selects the closest dated confirmed activity, with live activities first', () => {
  const now = Date.parse('2026-11-24T00:00:00+09:00')
  const event = (title, resolvedStatus, eventDate) => ({ title, resolvedStatus, eventDate })
  const ignored = [event('미정', 'CONFIRMED', null), event('예정', 'PLANNED', '2026-11-24'),
    event('지난 일정', 'CONFIRMED', '2026-11-23'), event('완료', 'DONE', '2026-11-24')]
  const confirmed = [event('다음 주', 'CONFIRMED', '2026-12-01'), event('오늘 일정', 'CONFIRMED', '2026-11-24')]
  assert.equal(nextActivity(ignored, now), undefined)
  assert.deepEqual(nextActivity([...ignored, ...confirmed], now), {
    title: '오늘 일정', days: 0, live: false,
  })
  assert.equal(nextActivity([...confirmed, event('진행 중인 일정', 'LIVE', '2026-11-22')], now).live, true)
})
