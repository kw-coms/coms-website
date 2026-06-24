import assert from 'node:assert/strict'
import { buildIcsCalendar, escapeText } from '../src/utils/icsExport.ts'

// Text escaping per RFC5545 §3.3.11.
assert.equal(escapeText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne')

// Backslash is escaped before other delimiters (no double-escaping).
assert.equal(escapeText(';'), '\\;')
assert.equal(escapeText('\r\n'), '\\n', 'CRLF collapses to a single literal \\n')
assert.equal(escapeText('\r'), '\\n')
assert.equal(escapeText(null), '', 'nullish becomes empty string')
assert.equal(escapeText(undefined), '')

const ics = buildIcsCalendar(
  [
    {
      id: 'schedule-1-2026-03-04',
      title: '개강, 총회',
      date: '2026-03-04',
      startDate: '2026-03-04',
      endDate: '2026-03-04',
      startTime: '18:00',
      endTime: '19:00',
      range: false,
      recurring: false,
    },
    {
      id: 'mt-1',
      title: 'MT',
      date: '2026-04-10',
      startDate: '2026-04-10',
      endDate: '2026-04-11',
      startTime: '',
      endTime: '',
      range: true,
      recurring: false,
    },
  ],
  { calendarName: '동아리 일정' },
)

// CRLF line endings everywhere.
assert.ok(ics.includes('\r\n'))
assert.ok(!/[^\r]\n/.test(ics), 'all newlines must be CRLF')

// Envelope.
assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'))
assert.ok(ics.includes('VERSION:2.0'))
assert.ok(ics.trimEnd().endsWith('END:VCALENDAR'))
assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2)

// Timed event: floating local DATE-TIME, comma escaped in SUMMARY.
assert.ok(ics.includes('DTSTART:20260304T180000'))
assert.ok(ics.includes('DTEND:20260304T190000'))
assert.ok(ics.includes('SUMMARY:개강\\, 총회'))
assert.ok(ics.includes('UID:schedule-1-2026-03-04@coms.kw.ac.kr'))

// All-day range: VALUE=DATE with exclusive (next-day) DTEND.
assert.ok(ics.includes('DTSTART;VALUE=DATE:20260410'))
assert.ok(ics.includes('DTEND;VALUE=DATE:20260412'))

// Empty list still yields a valid (empty) calendar.
const empty = buildIcsCalendar([])
assert.ok(empty.includes('BEGIN:VCALENDAR'))
assert.equal((empty.match(/BEGIN:VEVENT/g) || []).length, 0)
// Without a calendar name, no X-WR-CALNAME line is emitted.
assert.ok(!empty.includes('X-WR-CALNAME'))
// Non-array input is treated as an empty event list.
assert.equal((buildIcsCalendar(null).match(/BEGIN:VEVENT/g) || []).length, 0)

// All-day single day: exclusive DTEND is the next calendar day.
const allDaySingle = buildIcsCalendar([
  { id: 'x', title: '휴강', date: '2026-03-04', startDate: '2026-03-04', endDate: '2026-03-04', startTime: '' },
])
assert.ok(allDaySingle.includes('DTSTART;VALUE=DATE:20260304'))
assert.ok(allDaySingle.includes('DTEND;VALUE=DATE:20260305'))

// addOneDay rolls over month boundaries (31 Mar -> exclusive 1 Apr).
const monthRoll = buildIcsCalendar([
  { id: 'm', title: '월말', date: '2026-03-31', startDate: '2026-03-31', endDate: '2026-03-31', startTime: '' },
])
assert.ok(monthRoll.includes('DTEND;VALUE=DATE:20260401'))

// Timed event without endTime falls back to a one-hour DURATION (no DTEND).
const noEnd = buildIcsCalendar([
  { id: 't', title: '미팅', date: '2026-05-01', startDate: '2026-05-01', startTime: '09:05', endTime: '' },
])
assert.ok(noEnd.includes('DTSTART:20260501T090500'))
assert.ok(noEnd.includes('DURATION:PT1H'))
assert.ok(!noEnd.includes('DTEND'), 'no DTEND when only DURATION applies')

// Timed range carries the clock-time DTEND onto the range end date.
const timedRange = buildIcsCalendar([
  {
    id: 'r',
    title: '합숙',
    date: '2026-06-01',
    startDate: '2026-06-01',
    endDate: '2026-06-02',
    startTime: '10:00',
    endTime: '12:00',
    range: true,
  },
])
assert.ok(timedRange.includes('DTSTART:20260601T100000'))
assert.ok(timedRange.includes('DTEND:20260602T120000'))

// Semicolon, comma, backslash and newline are all escaped in text fields;
// LOCATION/DESCRIPTION are emitted only when present.
const escaped = buildIcsCalendar([
  {
    id: 'e',
    title: 'a;b,c\\d\ne',
    date: '2026-07-01',
    startDate: '2026-07-01',
    startTime: '',
    location: '참빛관 201호; B동',
    description: '준비물: 노트북, 펜',
  },
])
assert.ok(escaped.includes('SUMMARY:a\\;b\\,c\\\\d\\ne'))
assert.ok(escaped.includes('LOCATION:참빛관 201호\\; B동'))
assert.ok(escaped.includes('DESCRIPTION:준비물: 노트북\\, 펜'))

// Missing title falls back to a placeholder; missing id derives a UID.
const fallbacks = buildIcsCalendar([{ date: '2026-08-01', startDate: '2026-08-01', startTime: '' }])
assert.ok(fallbacks.includes('SUMMARY:제목 없음'))
assert.ok(/UID:2026-08-01-0@coms\.kw\.ac\.kr/.test(fallbacks))
// Every VEVENT carries a DTSTAMP (UTC, Z-suffixed).
assert.ok(/DTSTAMP:\d{8}T\d{6}Z/.test(fallbacks))

console.log('ics export contract passed')
