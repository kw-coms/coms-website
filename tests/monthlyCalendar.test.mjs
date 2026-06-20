import assert from 'node:assert/strict'
import {
  buildMonthEventSummary,
  buildCalendarDayEvents,
  visibleDayEvents,
} from '../src/utils/monthlyCalendar.js'

const calendarMonth = {
  year: 2026,
  month: 5,
  days: Array.from({ length: 30 }, (_, index) => index + 1),
}

const eventsByDay = buildCalendarDayEvents({
  calendarMonth,
  scheduleItems: [
    {
      id: 1,
      title: '신입 부원 OT',
      kind: 'SCHEDULE',
      eventDate: '2026-06-01',
      endDate: '2026-06-03',
      startTime: '18:30',
      endTime: '20:00',
    },
  ],
  recurringOccurrences: [
    {
      recurringScheduleId: 2,
      title: '정기 모임',
      date: '2026-06-02',
      startTime: '19:00',
      recurring: true,
    },
    {
      recurringScheduleId: 3,
      exceptionId: 7,
      title: '운영 회의',
      date: '2026-06-04',
      startTime: '20:00',
      endTime: '21:00',
      canceled: true,
      recurring: true,
    },
  ],
})

assert.deepEqual(
  Object.fromEntries(Object.entries(eventsByDay).map(([day, items]) => [day, items.map((item) => item.title)])),
  {
    1: ['신입 부원 OT'],
    2: ['신입 부원 OT', '정기 모임'],
    3: ['신입 부원 OT'],
    4: ['운영 회의'],
  },
)

assert.deepEqual(
  eventsByDay[1][0],
  {
    activityId: 1,
    sourceType: 'date',
    id: 'schedule-1-2026-06-01',
    title: '신입 부원 OT',
    date: '2026-06-01',
    startDate: '2026-06-01',
    endDate: '2026-06-03',
    startTime: '18:30',
    endTime: '20:00',
    timeLabel: '18:30~20:00',
    recurring: false,
    range: true,
    segment: 'start',
    showTitle: true,
  },
)

assert.equal(eventsByDay[2][0].segment, 'middle')
assert.equal(eventsByDay[2][0].showTitle, false)
assert.equal(eventsByDay[3][0].segment, 'end')
assert.equal(eventsByDay[4][0].exceptionId, 7)
assert.equal(eventsByDay[4][0].canceled, true)

const summary = buildMonthEventSummary({
  eventsByDay,
  calendarMonth,
  today: new Date(2026, 5, 2),
  limit: 3,
})

assert.deepEqual(summary.map((event) => ({
  date: event.date,
  title: event.title,
  canceled: event.canceled,
})), [
  { date: '2026-06-02', title: '정기 모임', canceled: false },
  { date: '2026-06-04', title: '운영 회의', canceled: true },
])

const crowded = visibleDayEvents([
  { id: 1 },
  { id: 2 },
  { id: 3 },
  { id: 4 },
  { id: 5 },
], 3)

assert.equal(crowded.overflowCount, 2)
assert.deepEqual(crowded.visible.map((item) => item.id), [1, 2, 3])

console.log('monthly calendar contract passed')
