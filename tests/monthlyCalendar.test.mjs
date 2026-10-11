import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CALENDAR_MAX_YEAR,
  CALENDAR_MIN_YEAR,
  buildMonthEventSummary,
  buildCalendarDayEvents,
  parseCalendarYear,
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

// Year box: the calendar follows only a whole year inside the offered range. Everything a
// member passes through while typing ("", "2", "20", "202") must come back as null, so the
// box can keep the text instead of being clamped into range on every keystroke.
assert.equal(parseCalendarYear('2026'), 2026)
assert.equal(parseCalendarYear(2026), 2026, 'a number (the current year) is accepted as well')
assert.equal(parseCalendarYear(' 2027 '), 2027)
assert.equal(parseCalendarYear(String(CALENDAR_MIN_YEAR)), CALENDAR_MIN_YEAR)
assert.equal(parseCalendarYear(String(CALENDAR_MAX_YEAR)), CALENDAR_MAX_YEAR)
for (const unfinished of ['', '2', '20', '202']) {
  assert.equal(parseCalendarYear(unfinished), null, `"${unfinished}" is still being typed`)
}
for (const rejected of [
  String(CALENDAR_MIN_YEAR - 1),
  String(CALENDAR_MAX_YEAR + 1),
  '20260',
  '2026.5',
  '-2026',
  '2e3',
  'abcd',
  null,
  undefined,
]) {
  assert.equal(parseCalendarYear(rejected), null, `${JSON.stringify(rejected)} must not reach the calendar`)
}
// The schedule API (RecurringScheduleService) answers 400 outside 1900–2200.
assert.ok(CALENDAR_MIN_YEAR >= 1900 && CALENDAR_MAX_YEAR <= 2200, 'offered years must stay inside what the API accepts')

const calendarSection = readFileSync(new URL('../src/features/clubCalendar/ClubCalendarSection.tsx', import.meta.url), 'utf8')
assert.match(
  calendarSection,
  /value=\{yearDraft \?\? selectedYear\}/,
  'year box should show unfinished typing instead of the last committed year',
)
assert.match(
  calendarSection,
  /const nextYear = parseCalendarYear\(value\)[\s\S]*?if \(nextYear === null\) return[\s\S]*?setSelectedYear\(nextYear\)/,
  'only a parsed, in-range year may move the calendar (and its API request)',
)
assert.match(
  calendarSection,
  /const Heading = compact \? 'h2' : 'h1'[\s\S]*?<Heading [^>]*>동아리 일정 캘린더<\/Heading>/,
  '/monthly-calendar needs an <h1>; the compact block on the home page stays an <h2>',
)

console.log('monthly calendar contract passed')
