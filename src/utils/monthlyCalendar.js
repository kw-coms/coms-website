export function parseLocalDate(value) {
  if (typeof value !== 'string') return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

export function toLocalDateString(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export function formatTimeLabel(startTime, endTime) {
  if (!startTime) return ''
  return endTime ? `${startTime}~${endTime}` : startTime
}

function monthBounds(calendarMonth) {
  const monthStart = new Date(calendarMonth.year, calendarMonth.month, 1)
  const monthEnd = new Date(calendarMonth.year, calendarMonth.month, calendarMonth.days.length)
  return { monthStart, monthEnd }
}

function clampRange(startDate, endDate, calendarMonth) {
  const { monthStart, monthEnd } = monthBounds(calendarMonth)
  const visibleStart = startDate > monthStart ? startDate : monthStart
  const visibleEnd = endDate < monthEnd ? endDate : monthEnd
  if (visibleEnd < visibleStart) return null
  return { visibleStart, visibleEnd }
}

function segmentFor(date, startDate, endDate) {
  if (startDate.getTime() === endDate.getTime()) return 'single'
  if (date.getTime() === startDate.getTime()) return 'start'
  if (date.getTime() === endDate.getTime()) return 'end'
  return 'middle'
}

function pushDay(acc, date, event) {
  const day = date.getDate()
  acc[day] = [...(acc[day] || []), event]
}

function sortDayEvents(eventsByDay) {
  for (const key of Object.keys(eventsByDay)) {
    eventsByDay[key].sort((a, b) => {
      const byTime = (a.startTime || '').localeCompare(b.startTime || '')
      if (byTime !== 0) return byTime
      return (a.title || '').localeCompare(b.title || '')
    })
  }
  return eventsByDay
}

export function buildCalendarDayEvents({ calendarMonth, scheduleItems = [], recurringOccurrences = [] }) {
  const eventsByDay = {}

  scheduleItems
    .filter((item) => item?.kind === 'SCHEDULE')
    .forEach((item) => {
      const startDate = parseLocalDate(item.eventDate)
      if (!startDate) return
      const endDate = parseLocalDate(item.endDate) || startDate
      const clamped = clampRange(startDate, endDate, calendarMonth)
      if (!clamped) return

      for (let date = new Date(clamped.visibleStart); date <= clamped.visibleEnd; date.setDate(date.getDate() + 1)) {
        const current = new Date(date)
        const dateKey = toLocalDateString(current)
        const segment = segmentFor(current, startDate, endDate)
        pushDay(eventsByDay, current, {
          id: `schedule-${item.id}-${dateKey}`,
          title: item.title,
          date: dateKey,
          startDate: toLocalDateString(startDate),
          endDate: toLocalDateString(endDate),
          startTime: item.startTime || '',
          endTime: item.endTime || '',
          timeLabel: formatTimeLabel(item.startTime, item.endTime),
          recurring: false,
          range: startDate.getTime() !== endDate.getTime(),
          segment,
          showTitle: current.getTime() === clamped.visibleStart.getTime(),
        })
      }
    })

  recurringOccurrences.forEach((occ) => {
    const date = parseLocalDate(occ.date)
    if (!date) return
    if (date.getFullYear() !== calendarMonth.year || date.getMonth() !== calendarMonth.month) return
    pushDay(eventsByDay, date, {
      id: `recurring-${occ.recurringScheduleId}-${occ.date}`,
      title: occ.title,
      date: occ.date,
      startDate: occ.date,
      endDate: occ.date,
      startTime: occ.startTime || '',
      endTime: occ.endTime || '',
      timeLabel: formatTimeLabel(occ.startTime, occ.endTime),
      location: occ.location || '',
      recurring: true,
      range: false,
      segment: 'single',
      showTitle: true,
    })
  })

  return sortDayEvents(eventsByDay)
}

export function visibleDayEvents(events, limit = 3) {
  const list = Array.isArray(events) ? events : []
  return {
    visible: list.slice(0, limit),
    overflowCount: Math.max(0, list.length - limit),
  }
}
