export type TimelineFields = {
  eventDate: string
  endDate: string
  startTime: string
  endTime: string
  dateUndecided: boolean
  showOnTimeline: boolean
  timelineStatus: string
  timelineTerm: string
  dateLabel: string
}

export function termForDate(date: string): string {
  const kstToday = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const [year, month] = (date || kstToday).split('-').map(Number)
  if (month <= 2) return `${year - 1} 겨울방학`
  if (month <= 6) return `${year} 1학기`
  if (month <= 8) return `${year} 여름방학`
  return `${year} 2학기`
}

export function selectedTerm(fields: TimelineFields): string {
  return fields.timelineTerm || termForDate(fields.eventDate)
}

/** Date edits re-derive the 학기 so it never goes stale; a cleared date keeps the current term. */
export function eventDatePatch(date: string, current: string): { eventDate: string; timelineTerm: string } {
  return { eventDate: date, timelineTerm: date ? termForDate(date) : current }
}
