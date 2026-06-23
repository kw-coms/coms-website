import assert from 'node:assert/strict'
import {
  buildMonthEventSummary,
  buildCalendarDayEvents,
  visibleDayEvents,
} from '../src/utils/monthlyCalendar.ts'

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
      colorHex: '#ff9f0a',
    },
  ],
  recurringOccurrences: [
    {
      recurringScheduleId: 2,
      title: '정기 모임',
      date: '2026-06-02',
      startTime: '19:00',
      recurring: true,
      colorHex: '#34c759',
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
    colorHex: '#ff9f0a',
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
assert.equal(eventsByDay[2][1].colorHex, '#34c759')

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

// past event (2026-06-01) is excluded; today (2026-06-02) and future (2026-06-04) are included
const pastDates = summary.map((e) => e.date).filter((d) => d < '2026-06-02')
assert.equal(pastDates.length, 0, 'past events must not appear in upcoming summary')

const todayEvent = summary.find((e) => e.date === '2026-06-02')
assert.ok(todayEvent, "today's event must appear in upcoming summary")

const futureEvent = summary.find((e) => e.date === '2026-06-04')
assert.ok(futureEvent, 'future event must appear in upcoming summary')

// viewing a past month: all events should be filtered out
const summaryPastMonth = buildMonthEventSummary({
  eventsByDay,
  calendarMonth,
  today: new Date(2026, 5, 30),
  limit: 3,
})
assert.equal(summaryPastMonth.length, 0, 'no upcoming events when today is past all events in month')

// viewing a future month: all events are upcoming
const summaryFutureToday = buildMonthEventSummary({
  eventsByDay,
  calendarMonth,
  today: new Date(2026, 4, 1),
  limit: 3,
})
assert.ok(summaryFutureToday.length > 0, 'all events are upcoming when today is before the month')
assert.ok(summaryFutureToday.find((e) => e.date === '2026-06-01'), 'earliest event included when viewing future month')

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
