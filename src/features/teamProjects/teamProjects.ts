import type { BoardStatus, Milestone, Submission } from '../../services/teamProjectApi'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const pad = (value: number) => String(value).padStart(2, '0')

export const parseWhen = (value: string | null | undefined) => value ? new Date(value) : null
const dayStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

/** "11/22(일) 23:59" — the time is left off when it is exactly midnight. */
export function formatWhen(value: string | null | undefined): string {
  const date = parseWhen(value)
  if (!date || Number.isNaN(date.getTime())) return ''
  const day = `${date.getMonth() + 1}/${date.getDate()}(${WEEKDAYS[date.getDay()]})`
  return date.getHours() === 0 && date.getMinutes() === 0 ? day : `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Calendar days from `now` to `target`: 0 is today, negative is past. */
export const daysUntil = (target: Date, now: Date) => Math.round((dayStart(target).getTime() - dayStart(now).getTime()) / 86_400_000)

export function ddayLabel(days: number): string {
  return days === 0 ? 'D-DAY' : days > 0 ? `D-${days}` : `D+${-days}`
}

/** The date a milestone is measured by: its due time, or its start when it only has a start. */
export const milestoneEnd = (milestone: Pick<Milestone, 'startsAt' | 'dueAt'>) => parseWhen(milestone.dueAt ?? milestone.startsAt)

/** "12/8(화) ~ 12/21(월)" for a period, the single date otherwise, "일정 미정" with no dates. */
export function milestoneWhen(milestone: Pick<Milestone, 'startsAt' | 'dueAt'>): string {
  const { startsAt, dueAt } = milestone
  if (startsAt && dueAt) return `${formatWhen(startsAt)} ~ ${formatWhen(dueAt)}`
  return formatWhen(dueAt ?? startsAt) || '일정 미정'
}

export type Phase = 'past' | 'active' | 'upcoming' | 'undated'

export function milestonePhase(milestone: Pick<Milestone, 'startsAt' | 'dueAt'>, now: Date): Phase {
  const end = milestoneEnd(milestone)
  if (!end) return 'undated'
  if (end.getTime() < now.getTime()) return 'past'
  const start = parseWhen(milestone.dueAt ? milestone.startsAt : null)
  return start && start.getTime() <= now.getTime() ? 'active' : 'upcoming'
}

/** The next thing that has not ended yet (an ongoing period counts), earliest end first. */
export function nextMilestone(milestones: Milestone[], now: Date): Milestone | null {
  const pending = milestones.filter(item => ['active', 'upcoming'].includes(milestonePhase(item, now)))
  pending.sort((a, b) => (milestoneEnd(a)?.getTime() ?? 0) - (milestoneEnd(b)?.getTime() ?? 0))
  return pending[0] ?? null
}

export function milestoneDday(milestone: Milestone, now: Date): string | null {
  const end = milestoneEnd(milestone)
  return end ? ddayLabel(daysUntil(end, now)) : null
}

export const STATUS_LABEL: Record<BoardStatus, string> = { SUBMITTED: '제출', LATE: '늦은 제출', MISSING: '미제출' }

export function submissionStatus(submission: Submission | undefined): BoardStatus {
  return !submission ? 'MISSING' : submission.late ? 'LATE' : 'SUBMITTED'
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

/** datetime-local value ("2026-11-22T23:59") <-> the API's local date-time. */
export const toInputValue = (value: string | null) => value ? value.slice(0, 16) : ''
export const fromInputValue = (value: string) => value ? value : null
