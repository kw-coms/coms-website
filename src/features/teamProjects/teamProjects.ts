import type { BoardStatus, Milestone, Submission, SubmissionTiming } from '../../services/teamProjectApi'

// Every date the API carries is a Korea-time wall-clock string. All maths here runs on "wall-clock
// milliseconds" (Date.UTC of those fields), and `now` is shifted into the same frame, so nothing
// depends on the viewer's own time zone. Korea has no daylight saving, so a day is always 24h.
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const DAY = 86_400_000
const SEOUL_OFFSET = 9 * 3_600_000
const pad = (value: number) => String(value).padStart(2, '0')

type Dated = Pick<Milestone, 'startsAt' | 'dueAt' | 'allDay'>

/** A wall-clock string as milliseconds in the wall-clock frame. */
export function wallMs(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(value)
  if (!match) return Number.NaN
  const [, y, mo, d, h = '0', mi = '0', s = '0'] = match
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))
}

/** The current instant expressed in Korea wall-clock milliseconds. */
export const seoulNow = (now: Date) => now.getTime() + SEOUL_OFFSET

/** "11/22(일) 23:59", or just "11/22(일)" for an all-day date. A 00:00 time is shown. */
export function formatWhen(value: string | null | undefined, allDay = false): string {
  if (!value) return ''
  const ms = wallMs(value)
  if (Number.isNaN(ms)) return ''
  const date = new Date(ms)
  const day = `${date.getUTCMonth() + 1}/${date.getUTCDate()}(${WEEKDAYS[date.getUTCDay()]})`
  return allDay ? day : `${day} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
}

/** Calendar days from `nowMs` to `targetMs` (both wall-clock): 0 is the same day, negative is past. */
export const daysBetween = (targetMs: number, nowMs: number) => Math.floor(targetMs / DAY) - Math.floor(nowMs / DAY)

export function ddayLabel(days: number): string {
  return days === 0 ? 'D-DAY' : days > 0 ? `D-${days}` : `D+${-days}`
}

/** Start of a milestone's period: the start date (00:00 when all-day), if it has one. */
function startMs(milestone: Dated): number | null {
  return milestone.startsAt && milestone.dueAt ? wallMs(milestone.startsAt) : null
}

/** The moment it is over: the due time, or the last instant of an all-day date. A start-only item ends at its start. */
export function endMs(milestone: Dated): number | null {
  const value = milestone.dueAt ?? milestone.startsAt
  if (!value) return null
  const ms = wallMs(value)
  return milestone.allDay ? Math.floor(ms / DAY) * DAY + DAY - 1 : ms
}

export const isPeriod = (milestone: Dated) => Boolean(milestone.startsAt && milestone.dueAt)

/** "12/8(화) ~ 12/21(월)" for a period, the single date otherwise, "일정 미정" with no dates. */
export function milestoneWhen(milestone: Dated): string {
  const { startsAt, dueAt, allDay } = milestone
  if (startsAt && dueAt) return `${formatWhen(startsAt, allDay)} ~ ${formatWhen(dueAt, allDay)}`
  return formatWhen(dueAt ?? startsAt, allDay) || '일정 미정'
}

export type Phase = 'past' | 'active' | 'upcoming' | 'undated'

/** Periods: upcoming before the start, active from the start through the end, past after. */
export function milestonePhase(milestone: Dated, now: Date): Phase {
  const end = endMs(milestone)
  if (end === null) return 'undated'
  const at = seoulNow(now)
  if (at > end) return 'past'
  const start = startMs(milestone)
  return start !== null && at < start ? 'upcoming' : start !== null ? 'active' : 'upcoming'
}

/** The time that decides what comes next: the start of a period that has not begun, otherwise the end. */
function nextKey(milestone: Dated, phase: Phase): number {
  return phase === 'upcoming' && isPeriod(milestone) ? startMs(milestone)! : endMs(milestone)!
}

/** The next thing that has not ended yet (an ongoing period counts), earliest first. */
export function nextMilestone(milestones: Milestone[], now: Date): Milestone | null {
  const pending = milestones
    .map(item => ({ item, phase: milestonePhase(item, now) }))
    .filter(entry => entry.phase === 'active' || entry.phase === 'upcoming')
  pending.sort((a, b) => nextKey(a.item, a.phase) - nextKey(b.item, b.phase))
  return pending[0]?.item ?? null
}

/** "D-3" for a single date; "시작 D-5" before a period begins, "종료 D-2" while it runs. */
export function milestoneDday(milestone: Dated, now: Date): string | null {
  const phase = milestonePhase(milestone, now)
  if (phase === 'undated') return null
  const at = seoulNow(now)
  if (!isPeriod(milestone)) return ddayLabel(daysBetween(endMs(milestone)!, at))
  if (phase === 'upcoming') return `시작 ${ddayLabel(daysBetween(startMs(milestone)!, at))}`
  return `종료 ${ddayLabel(daysBetween(endMs(milestone)!, at))}`
}

export const STATUS_LABEL: Record<BoardStatus | 'PENDING', string> = { SUBMITTED: '제출', LATE: '늦은 제출', MISSING: '미제출', PENDING: '제출 전' }

export function submissionStatusLabel(status: keyof typeof STATUS_LABEL, timing?: SubmissionTiming | null) {
  return status === 'SUBMITTED' && timing === 'ON_TIME' ? '정시 제출' : STATUS_LABEL[status]
}

/** No submission yet reads "제출 전" until the due time has passed, then "미제출". */
export function submissionStatus(submission: Submission | undefined, milestone: Dated, now: Date): BoardStatus | 'PENDING' {
  if (submission) return submission.late ? 'LATE' : 'SUBMITTED'
  const end = milestone.dueAt ? endMs(milestone) : null
  return end !== null && seoulNow(now) > end ? 'MISSING' : 'PENDING'
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

/** datetime-local ("2026-11-22T23:59") <-> date-only ("2026-11-22") values for the admin form. */
export const toInputValue = (value: string | null, allDay = false) => value ? value.slice(0, allDay ? 10 : 16) : ''
export const toWriteValue = (value: string, allDay: boolean) => value ? (allDay ? `${value.slice(0, 10)}T00:00` : value) : null

export const megabytes = (bytes: number) => Math.max(1, Math.floor(bytes / 1024 / 1024))

/** 413 (from the server or the proxy in front of it) becomes a message that names the real limit. */
export function uploadErrorText(cause: unknown, limits: { maxFileBytes: number } | undefined): string {
  const status = (cause as { status?: number } | null)?.status
  if (status === 413) return `파일이 너무 큽니다${limits ? ` (파일 하나당 최대 ${megabytes(limits.maxFileBytes)}MB)` : ''}. 크기를 줄이거나 나눠서 올려 주세요.`
  return cause instanceof Error ? cause.message : '요청을 처리하지 못했습니다.'
}
