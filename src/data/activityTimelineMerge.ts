import { resolveStatus, timelineEvents } from './activityTimeline'
import type { TimelineEvent, TimelineStatus } from './activityTimeline'
import { richTextToPlainText } from '../shared/homeUi'

export interface PublicTimelineActivity {
  id: number
  title: string
  kind: string
  kindLabel?: string | null
  categoryName?: string | null
  description?: string | null
  resolvedStatus: 'PLANNED' | 'CONFIRMED' | 'LIVE' | 'DONE'
  eventDate?: string | null
  endDate?: string | null
  startTime?: string | null
  endTime?: string | null
  dateLabel?: string | null
  timelineTerm?: string | null
  memberFacts?: string | null
}

export interface TimelineSection {
  term: string
  id: string
  events: TimelineEvent[]
}

const statusMap: Record<PublicTimelineActivity['resolvedStatus'], TimelineStatus> = {
  PLANNED: 'planned', CONFIRMED: 'confirmed', LIVE: 'live', DONE: 'done',
}
const seasonOrder: Record<string, number> = { '1학기': 0, '여름방학': 1, '2학기': 2, '겨울방학': 3 }

function termOrder(term: string) {
  const match = /^(\d{4}) (1학기|여름방학|2학기|겨울방학)$/.exec(term)
  return match ? Number(match[1]) * 4 + seasonOrder[match[2]] : Number.MAX_SAFE_INTEGER
}

function dateText(item: PublicTimelineActivity) {
  if (item.dateLabel) return item.dateLabel
  if (!item.eventDate) return '날짜 미정'
  const start = item.eventDate.replaceAll('-', '.')
  return item.endDate && item.endDate !== item.eventDate
    ? `${start} – ${item.endDate.replaceAll('-', '.')}` : start
}

function toEvent(item: PublicTimelineActivity): TimelineEvent {
  const lines = (item.description ?? '').split(/\r?\n/).map(richTextToPlainText).filter(Boolean)
  return {
    id: `db-${item.id}`,
    term: item.timelineTerm || '학기 미정',
    title: item.title,
    dateLabel: dateText(item),
    start: item.eventDate || undefined,
    end: item.endDate || undefined,
    status: statusMap[item.resolvedStatus],
    kind: item.kindLabel || item.categoryName || item.kind,
    summary: lines[0] || '',
    facts: lines.slice(1),
    memberFacts: item.memberFacts?.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    fromDb: true,
  }
}

function byDate(a: TimelineEvent, b: TimelineEvent) {
  if (!a.start) return b.start ? 1 : 0
  if (!b.start) return -1
  return a.start.localeCompare(b.start)
}

export function mergeActivityTimeline(dbItems: PublicTimelineActivity[], now: number, staticEvents = timelineEvents) {
  const upcoming: TimelineEvent[] = []
  const byTerm = new Map<string, TimelineEvent[]>()
  for (const event of staticEvents) {
    const term = event.term === 'spring' ? '2026 1학기' : event.term === 'fall' ? '2026 2학기' : event.term
    if (term === 'upcoming') upcoming.push(event)
    else byTerm.set(term, [...(byTerm.get(term) ?? []), event])
  }
  byTerm.set('2026 여름방학', byTerm.get('2026 여름방학') ?? [])
  for (const item of dbItems) {
    const event = toEvent(item)
    if (event.status === 'planned' || event.status === 'confirmed') upcoming.push(event)
    else byTerm.set(event.term, [...(byTerm.get(event.term) ?? []), event])
  }
  const terms = [...byTerm.keys()].sort((a, b) => termOrder(a) - termOrder(b) || a.localeCompare(b, 'ko'))
  const sections: TimelineSection[] = terms.map((term, index) => {
    const id = term === '2026 1학기' ? 'act-spring' : term === '2026 여름방학' ? 'act-summer'
      : term === '2026 2학기' ? 'act-fall' : `act-term-${index}`
    const events = byTerm.get(term) ?? []
    return { term, id, events: [
      ...events.filter((event) => !event.fromDb),
      ...events.filter((event) => event.fromDb).sort(byDate),
    ] }
  })
  upcoming.sort(byDate)
  return {
    sections,
    upcoming,
    hasUndatedUpcoming: upcoming.some((event) => !event.start),
    liveTerms: new Set(sections.filter((section) => section.events.some((event) =>
      (event.fromDb ? event.status : resolveStatus(event, now)) === 'live')).map((section) => section.term)),
  }
}
