import type { PublicTimelineActivity } from './activityTimelineMerge'

const seoulDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', dateStyle: 'short' })
const DAY_MS = 86_400_000

export function daysUntilActivity(eventDate: string, now: number) {
  return (Date.parse(eventDate) - Date.parse(seoulDate.format(now))) / DAY_MS
}

export function nextActivity(items: PublicTimelineActivity[], now: number) {
  const candidates = items.flatMap(({ eventDate, resolvedStatus, title }) => {
    if (!eventDate || (resolvedStatus !== 'LIVE' && resolvedStatus !== 'CONFIRMED')) return []
    const days = daysUntilActivity(eventDate, now)
    if (!Number.isFinite(days) || (resolvedStatus === 'CONFIRMED' && days < 0)) return []
    return [{ title, days, live: resolvedStatus === 'LIVE' }]
  })
  return candidates.sort((a, b) => Number(b.live) - Number(a.live) || Math.abs(a.days) - Math.abs(b.days))[0]
}
