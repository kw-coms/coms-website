import type { Opportunity, OpportunityDates } from '../../services/opportunityApi'

export type OpportunityPhase = 'upcoming' | 'ongoing' | 'ended' | 'unknown'

// Published dates are Seoul-local values. A date-only deadline includes its entire day.
export function opportunityTime(value: string | null, end = false): number | null {
  if (!value) return null
  const local = value.length === 10 ? `${value}T${end ? '23:59:59.999' : '00:00:00'}` : value
  const instant = Date.parse(`${local}+09:00`)
  return Number.isFinite(instant) ? instant : null
}

export function periodPhase(start: string | null, end: string | null, now: number): OpportunityPhase {
  const from = opportunityTime(start)
  const until = opportunityTime(end, true)
  if (from !== null && now < from) return 'upcoming'
  if (until !== null && now > until) return 'ended'
  if (from !== null || until !== null) return 'ongoing'
  return 'unknown'
}

export function opportunityPhases(dates: OpportunityDates, now: number) {
  const application = periodPhase(dates.applicationStart, dates.applicationEnd, now)
  const event = periodPhase(dates.eventStart, dates.eventEnd, now)
  return { application, event, overall: event !== 'unknown' ? event : application }
}

const phaseOrder: Record<OpportunityPhase, number> = { ongoing: 0, upcoming: 1, ended: 2, unknown: 3 }

export function compareOpportunitiesSoon(a: Opportunity, b: Opportunity, now: number): number {
  const first = opportunityPhases(a, now).overall
  const second = opportunityPhases(b, now).overall
  if (first !== second) return phaseOrder[first] - phaseOrder[second]
  const dateFor = (item: Opportunity, phase: OpportunityPhase) => {
    const start = item.eventStart ?? item.applicationStart
    const end = item.eventEnd ?? item.applicationEnd
    return phase === 'upcoming' ? opportunityTime(start) ?? opportunityTime(end, true)
      : opportunityTime(end, true) ?? opportunityTime(start)
  }
  const left = dateFor(a, first)
  const right = dateFor(b, second)
  if (left !== null && right !== null && left !== right) return first === 'ended' ? right - left : left - right
  if (left !== null && right === null) return -1
  if (left === null && right !== null) return 1
  return (Date.parse(b.publishedAt ?? '') || 0) - (Date.parse(a.publishedAt ?? '') || 0) || a.id - b.id
}
