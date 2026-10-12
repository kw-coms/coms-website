import { csvCell } from '../pages/admin/auditLogCsv'

// Types and small pure helpers for the gatherings page ("모임 신청");
// tests/gathering.test.mjs pins the helpers.

export type Gathering = {
  id: number
  title: string
  description?: string | null
  creatorName: string
  /** Opened by the member asking. */
  mine: boolean
  /** The member asking may close it, delete it and take names off it. */
  canManage: boolean
  /** How many may sign up; null for no limit. */
  capacity?: number | null
  /** What each member is asked to add; null when nothing is asked. */
  noteLabel?: string | null
  closesAt?: string | null
  open: boolean
  full: boolean
  participantCount: number
  joined: boolean
  createdAt?: string
}

export type GatheringParticipant = {
  id: number
  name: string
  mine: boolean
  /** Sent to whoever manages the gathering and to the member who wrote it. */
  note?: string | null
  signedUpAt: string
}

export type GatheringDetail = { gathering: Gathering; participants: GatheringParticipant[] }

export type GatheringState = 'open' | 'full' | 'closed'

/** Closed wins over full: a closed gathering takes nobody whether or not places are left. */
export function gatheringState(gathering: Pick<Gathering, 'open' | 'full'>): GatheringState {
  if (!gathering.open) return 'closed'
  return gathering.full ? 'full' : 'open'
}

export const GATHERING_STATE_LABELS: Record<GatheringState, string> = {
  open: '받는 중',
  full: '정원 마감',
  closed: '마감',
}

/** "7 / 10명" with a limit, "7명" without. */
export function placesLabel(count: number, capacity?: number | null): string {
  return capacity ? `${count} / ${capacity}명` : `${count}명`
}

/** How full the gathering is, from 0 to 1, for the bar. Without a limit there is nothing to fill. */
export function fillRatio(count: number, capacity?: number | null): number | null {
  if (!capacity || capacity <= 0) return null
  return Math.min(1, Math.max(0, count / capacity))
}

const pad = (value: number) => String(value).padStart(2, '0')

/** "10월 20일 18:00"; "" when the value is not a date. */
export function formatGatheringTime(value?: string | null): string {
  const date = new Date(String(value ?? ''))
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * What a `datetime-local` box holds ("2026-10-20T18:00") as the API takes it
 * ("2026-10-20T18:00:00"); null when the box is empty or unreadable.
 */
export function toApiDateTime(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?/.exec(String(value ?? '').trim())
  return match ? `${match[1]}T${match[2]}:${match[3] ?? '00'}` : null
}

/** A whole number of places from 1 to 500, or null for no limit (an empty box). NaN when it is neither. */
export function parseCapacity(value: string): number | null {
  const text = String(value ?? '').trim()
  if (text === '') return null
  const number = Number(text)
  return Number.isInteger(number) && number >= 1 && number <= 500 ? number : Number.NaN
}

// Byte-order mark, spelled as a code point so no invisible character sits in this file.
const BOM = String.fromCharCode(0xfeff)

/**
 * Who signed up, as a spreadsheet file, in the order they did: name, the answer when the
 * gathering asks a question, and the time. UTF-8 with a BOM so Excel reads the Korean text;
 * cells go through csvCell, which keeps a name or an answer that starts like a formula from
 * being run as one.
 */
export function gatheringToCsv(detail: GatheringDetail): string {
  const label = detail.gathering.noteLabel
  const header = ['순서', '이름', ...(label ? [label] : []), '신청 시각']
  const rows = detail.participants.map((participant, index) => [
    index + 1,
    participant.name,
    ...(label ? [participant.note ?? ''] : []),
    formatGatheringTime(participant.signedUpAt),
  ])
  return `${BOM}${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}
