// Minimal RFC5545 iCalendar (.ics) builder for the club calendar.
// Frontend-only: takes the calendar event objects already produced by
// buildCalendarDayEvents() and serializes them into a VCALENDAR string.
//
// Each event carries: { id, title, date 'YYYY-MM-DD', startDate, endDate,
// startTime 'HH:MM'|'', endTime 'HH:MM'|'', range, recurring, canceled,
// location? }. We map them to VEVENTs with all-day (DATE) vs timed
// (DATE-TIME, floating local time) handling.

export type IcsEvent = {
  id?: string
  title?: string
  date?: string
  startDate?: string
  endDate?: string
  startTime?: string
  endTime?: string
  range?: boolean
  recurring?: boolean
  canceled?: boolean
  location?: string
  description?: string
}

// RFC5545 §3.3.11 text escaping: backslash, semicolon, comma, and newlines.
export function escapeText(value: unknown): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

// "2026-03-04" -> "20260304"
function toIcsDate(value: string): string {
  return String(value || '').replace(/-/g, '')
}

// "2026-03-04" + "18:00" -> "20260304T180000" (floating local time, no Z).
function toIcsDateTime(date: string, time: string): string {
  const [hh = '00', mm = '00'] = String(time || '').split(':')
  return `${toIcsDate(date)}T${hh.padStart(2, '0')}${mm.padStart(2, '0')}00`
}

// All-day DTEND is exclusive in iCalendar, so add one day to the end date.
function addOneDay(value: string): string {
  const [year, month, day] = String(value || '').split('-').map(Number)
  if (!year || !month || !day) return toIcsDate(value)
  const next = new Date(year, month - 1, day + 1)
  return [
    next.getFullYear(),
    String(next.getMonth() + 1).padStart(2, '0'),
    String(next.getDate()).padStart(2, '0'),
  ].join('')
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function dtStamp(now = new Date()): string {
  return (
    `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}` +
    `T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`
  )
}

function uidFor(event: IcsEvent, index: number): string {
  const base = event.id || `${event.date || 'event'}-${index}`
  return `${base}@coms.kw.ac.kr`
}

function buildVevent(event: IcsEvent, index: number, stamp: string): string[] {
  const startDate = event.startDate || event.date || ''
  const endDate = event.endDate || startDate
  const lines = ['BEGIN:VEVENT', `UID:${uidFor(event, index)}`, `DTSTAMP:${stamp}`]

  if (event.startTime) {
    // Timed event: DTSTART/DTEND as floating local DATE-TIME.
    lines.push(`DTSTART:${toIcsDateTime(startDate, event.startTime)}`)
    if (event.endTime) {
      // Same-day end when range spans days but only has clock times.
      const endClockDate = event.range ? endDate : startDate
      lines.push(`DTEND:${toIcsDateTime(endClockDate, event.endTime)}`)
    } else {
      lines.push('DURATION:PT1H')
    }
  } else {
    // All-day event: VALUE=DATE, with exclusive DTEND.
    lines.push(`DTSTART;VALUE=DATE:${toIcsDate(startDate)}`)
    lines.push(`DTEND;VALUE=DATE:${addOneDay(endDate)}`)
  }

  lines.push(`SUMMARY:${escapeText(event.title || '제목 없음')}`)
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`)
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`)
  lines.push('END:VEVENT')
  return lines
}

export function buildIcsCalendar(events: IcsEvent[], options: { calendarName?: string } = {}): string {
  const stamp = dtStamp()
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//COMs//Monthly Calendar//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]
  if (options.calendarName) {
    lines.push(`X-WR-CALNAME:${escapeText(options.calendarName)}`)
  }
  ;(Array.isArray(events) ? events : []).forEach((event, index) => {
    lines.push(...buildVevent(event, index, stamp))
  })
  lines.push('END:VCALENDAR')
  // RFC5545 mandates CRLF line endings.
  return lines.join('\r\n') + '\r\n'
}

export default buildIcsCalendar
