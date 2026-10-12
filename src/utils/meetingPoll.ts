// Pure logic for meeting polls ("일정 조율"): the grid of dates x half-hour slots, painting a
// member's answer onto it, and reading the group's answers back. The page keeps the state;
// tests/meetingPoll.test.mjs pins the behaviour.
//
// An answer is one character per slot, day after day: '1' free, '0' not. Slot i of day d sits
// at index d * slotsPerDay + i.

export type MeetingPollSummary = {
  id: number
  title: string
  description?: string | null
  creatorName: string
  mine: boolean
  canDelete: boolean
  dates: string[]
  startMinute: number
  endMinute: number
  slotMinutes: number
  createdAt?: string
  participantCount: number
  answered: boolean
}

export type MeetingPollParticipant = { name: string; mine: boolean; slots: string }

export type MeetingPollDetail = { poll: MeetingPollSummary; participants: MeetingPollParticipant[] }

type Grid = Pick<MeetingPollSummary, 'dates' | 'startMinute' | 'endMinute' | 'slotMinutes'>

export const SLOT_MINUTES = 30
export const MAX_POLL_DATES = 14

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const pad = (value: number) => String(value).padStart(2, '0')

export function slotsPerDay(grid: Grid): number {
  return Math.max(0, Math.floor((grid.endMinute - grid.startMinute) / (grid.slotMinutes || SLOT_MINUTES)))
}

export function totalSlots(grid: Grid): number {
  return grid.dates.length * slotsPerDay(grid)
}

export function emptySlots(grid: Grid): string {
  return '0'.repeat(totalSlots(grid))
}

/** "13:30"; the end of the day is written "24:00". */
export function formatMinute(minute: number): string {
  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`
}

/** A calendar date from "2026-10-14" without going through UTC (which can shift the day). */
export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** "10월 14일 (수)" */
export function formatPollDate(iso: string): string {
  const date = parseIsoDate(iso)
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAYS[date.getDay()]})`
}

/** Column heading parts: "10/14" and "수". */
export function shortPollDate(iso: string): { day: string; weekday: string } {
  const date = parseIsoDate(iso)
  return { day: `${date.getMonth() + 1}/${date.getDate()}`, weekday: WEEKDAYS[date.getDay()] }
}

/** One line for a list: the single date, or the first and last with the number of days. */
export function summarizeDates(dates: string[]): string {
  if (dates.length === 0) return ''
  if (dates.length === 1) return formatPollDate(dates[0])
  return `${formatPollDate(dates[0])} ~ ${formatPollDate(dates[dates.length - 1])} · ${dates.length}일`
}

/** Every half hour of a day as a select option, 00:00 to 24:00. */
export function timeOptions(): { value: number; label: string }[] {
  return Array.from({ length: (24 * 60) / SLOT_MINUTES + 1 }, (_, index) => {
    const minute = index * SLOT_MINUTES
    return { value: minute, label: formatMinute(minute) }
  })
}

/** An answer cut or padded to the grid, with anything that is not '1' read as '0'. */
export function normalizeSlots(slots: string | null | undefined, grid: Grid): string {
  const total = totalSlots(grid)
  const source = String(slots ?? '')
  let result = ''
  for (let index = 0; index < total; index++) result += source[index] === '1' ? '1' : '0'
  return result
}

/**
 * Painting by dragging: every slot in the rectangle between two cells takes `value`; the rest
 * of `base` (the answer as it was when the drag began) is left as it was.
 */
export function paintRectangle(
  base: string,
  perDay: number,
  from: { day: number; slot: number },
  to: { day: number; slot: number },
  value: '0' | '1',
): string {
  const dayMin = Math.min(from.day, to.day)
  const dayMax = Math.max(from.day, to.day)
  const slotMin = Math.min(from.slot, to.slot)
  const slotMax = Math.max(from.slot, to.slot)
  const cells = base.split('')
  for (let day = dayMin; day <= dayMax; day++) {
    for (let slot = slotMin; slot <= slotMax; slot++) {
      const index = day * perDay + slot
      if (index >= 0 && index < cells.length) cells[index] = value
    }
  }
  return cells.join('')
}

export function toggleSlot(slots: string, index: number): string {
  if (index < 0 || index >= slots.length) return slots
  return slots.slice(0, index) + (slots[index] === '1' ? '0' : '1') + slots.slice(index + 1)
}

/** A whole day at once: cleared if every slot of it was on, otherwise filled. */
export function toggleDay(slots: string, perDay: number, day: number): string {
  const start = day * perDay
  const part = slots.slice(start, start + perDay)
  if (part.length === 0) return slots
  const value = part.includes('0') ? '1' : '0'
  return slots.slice(0, start) + value.repeat(part.length) + slots.slice(start + part.length)
}

/** The same time on every day: cleared if all of them were on, otherwise filled. */
export function toggleRow(slots: string, perDay: number, days: number, slot: number): string {
  const indexes = Array.from({ length: days }, (_, day) => day * perDay + slot).filter((index) => index < slots.length)
  if (indexes.length === 0) return slots
  const value = indexes.some((index) => slots[index] !== '1') ? '1' : '0'
  const cells = slots.split('')
  for (const index of indexes) cells[index] = value
  return cells.join('')
}

/** How many members are free in each slot. */
export function countsPerSlot(participants: MeetingPollParticipant[], total: number): number[] {
  const counts = new Array<number>(total).fill(0)
  for (const participant of participants) {
    for (let index = 0; index < total; index++) if (participant.slots[index] === '1') counts[index] += 1
  }
  return counts
}

/** Who is free and who is not in one slot. */
export function namesAt(participants: MeetingPollParticipant[], index: number): { free: string[]; busy: string[] } {
  const free: string[] = []
  const busy: string[] = []
  for (const participant of participants) (participant.slots[index] === '1' ? free : busy).push(participant.name)
  return { free, busy }
}

export type BestRange = { day: number; date: string; startMinute: number; endMinute: number; count: number }

/**
 * The stretches of time the most members can make: runs of consecutive slots with the same
 * number of free members, most members first, then the longer stretch, then the earlier one.
 * Stretches nobody can make are left out.
 */
export function bestRanges(grid: Grid, participants: MeetingPollParticipant[], limit = 5): BestRange[] {
  const perDay = slotsPerDay(grid)
  const step = grid.slotMinutes || SLOT_MINUTES
  const counts = countsPerSlot(participants, totalSlots(grid))
  const ranges: BestRange[] = []
  grid.dates.forEach((date, day) => {
    let runStart = 0
    for (let slot = 1; slot <= perDay; slot++) {
      const previous = counts[day * perDay + slot - 1]
      if (slot === perDay || counts[day * perDay + slot] !== previous) {
        if (previous > 0) {
          ranges.push({
            day,
            date,
            startMinute: grid.startMinute + runStart * step,
            endMinute: grid.startMinute + slot * step,
            count: previous,
          })
        }
        runStart = slot
      }
    }
  })
  return ranges
    .sort((a, b) => (
      b.count - a.count
      || (b.endMinute - b.startMinute) - (a.endMinute - a.startMinute)
      || a.day - b.day
      || a.startMinute - b.startMinute
    ))
    .slice(0, limit)
}

/** The 6 x 7 grid of a month view (Sunday first), with nulls before the 1st and after the last day. */
export function monthCells(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (string | null)[] = Array.from({ length: first.getDay() }, () => null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(toIsoDate(new Date(year, month, day)))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}
