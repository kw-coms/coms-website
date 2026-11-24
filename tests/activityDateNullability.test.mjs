import assert from 'node:assert/strict'
import { formatActivityDate, parseLocalDate } from '../src/shared/homeUi.ts'
import { activityDateMatchesRange } from '../src/features/activityLog/activityLogUtils.ts'
import { buildCalendarDayEvents } from '../src/utils/monthlyCalendar.ts'

assert.equal(parseLocalDate(null), null)
assert.equal(formatActivityDate(null), '날짜 미정')
assert.equal(formatActivityDate('2026-11-24'), '2026.11.24')
assert.equal(activityDateMatchesRange(null, '', ''), true)
assert.equal(activityDateMatchesRange(null, '2026-11-01', ''), false)
assert.equal(activityDateMatchesRange(null, '', '2026-11-30'), false)
assert.equal(activityDateMatchesRange('2026-11-24', '2026-11-24', '2026-11-24'), true)
assert.equal(activityDateMatchesRange('2026-10-31', '2026-11-01', ''), false)
assert.equal(activityDateMatchesRange('2026-12-01', '', '2026-11-30'), false)
const events = buildCalendarDayEvents({
  calendarMonth: { year: 2026, month: 10, days: Array.from({ length: 30 }) },
  scheduleItems: [
    { id: 1, kind: 'SCHEDULE', eventDate: null, endDate: '2026-11-24' },
    { id: 2, kind: 'SCHEDULE', eventDate: '2026-11-24', endDate: null },
  ],
})
assert.deepEqual(Object.keys(events), ['24'])
assert.deepEqual(events[24].map(event => event.activityId), [2])
console.log('activity nullable dates passed')
