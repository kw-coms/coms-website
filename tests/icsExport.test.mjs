import assert from 'node:assert/strict'
import { buildIcsCalendar, escapeText } from '../src/utils/icsExport.ts'

// Text escaping per RFC5545 §3.3.11.
assert.equal(escapeText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne')

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

console.log('ics export contract passed')
