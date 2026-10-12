import { csvCell } from '../pages/admin/auditLogCsv'

// Small pure helpers for the attendance page; tests/attendance.test.mjs pins them.

/** Digits only, at most four: what the code box keeps of whatever is typed or pasted. */
export function cleanAttendanceCode(input: string): string {
  return String(input ?? '').replace(/\D+/g, '').slice(0, 4)
}

/**
 * Seconds of check-in left: what the server counted when the list arrived, minus the time
 * that has passed here since. The server counts, so a wrong clock or another time zone on
 * the viewer's side does not move the countdown. Never below 0.
 */
export function secondsLeft(remainingSeconds: number, receivedAt: number, now: number): number {
  // `now` can be a tick older than the answer; that is no time passed, not time gained.
  const left = Number(remainingSeconds) - Math.floor(Math.max(0, now - receivedAt) / 1000)
  return Number.isFinite(left) && left > 0 ? left : 0
}

/** Seconds as "12:05"; "" when none are left. */
export function remainingLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  const whole = Math.floor(seconds)
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`
}

/** "10월 12일 13:05" */
export function formatAttendanceTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** "10/12" */
export function formatAttendanceDay(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getMonth() + 1}/${date.getDate()}`
}

type SummarySession = { id: number; title: string; openedAt: string }
type SummaryMember = { name: string; count: number; sessionIds: number[] }

// Byte-order mark, spelled as a code point so no invisible character sits in this file.
const BOM = String.fromCharCode(0xfeff)

/**
 * The attendance summary as a spreadsheet file: one member per line, one column per check
 * with an "O" where the member came. Checks run oldest to newest, left to right (the summary
 * lists them newest first). UTF-8 with a BOM so Excel reads the Korean text; cells go through
 * csvCell, which keeps a title or name that starts like a formula from being run as one.
 */
export function attendanceSummaryToCsv(summary: { sessions: SummarySession[]; members: SummaryMember[] }): string {
  const sessions = [...summary.sessions].reverse()
  const header = ['이름', '출석 횟수', ...sessions.map((session) => `${formatAttendanceDay(session.openedAt)} ${session.title}`.trim())]
  const rows = summary.members.map((member) => {
    const came = new Set(member.sessionIds)
    return [member.name, member.count, ...sessions.map((session) => (came.has(session.id) ? 'O' : ''))]
  })
  return `${BOM}${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}
