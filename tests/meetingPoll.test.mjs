import assert from 'node:assert/strict'
import {
  bestRanges,
  countsPerSlot,
  emptySlots,
  formatMinute,
  formatPollDate,
  monthCells,
  namesAt,
  normalizeSlots,
  paintRectangle,
  parseIsoDate,
  shortPollDate,
  slotsPerDay,
  summarizeDates,
  timeOptions,
  toIsoDate,
  toggleDay,
  toggleRow,
  toggleSlot,
  totalSlots,
} from '../src/utils/meetingPoll.ts'

// Two days, 10:00 to 12:00 in half hours: 4 slots a day, 8 in all.
const grid = { dates: ['2026-10-14', '2026-10-15'], startMinute: 600, endMinute: 720, slotMinutes: 30 }

// --- the grid -----------------------------------------------------------------
assert.equal(slotsPerDay(grid), 4)
assert.equal(totalSlots(grid), 8)
assert.equal(emptySlots(grid), '00000000')
assert.equal(formatMinute(0), '00:00')
assert.equal(formatMinute(810), '13:30')
assert.equal(formatMinute(1440), '24:00')
assert.equal(timeOptions().length, 49)
assert.deepEqual(timeOptions()[1], { value: 30, label: '00:30' })
assert.deepEqual(timeOptions().at(-1), { value: 1440, label: '24:00' })

// --- dates: no UTC shift whatever the machine's time zone -----------------------
assert.equal(toIsoDate(parseIsoDate('2026-10-14')), '2026-10-14')
assert.equal(toIsoDate(parseIsoDate('2026-01-01')), '2026-01-01')
assert.equal(formatPollDate('2026-10-14'), '10월 14일 (수)')
assert.deepEqual(shortPollDate('2026-10-18'), { day: '10/18', weekday: '일' })
assert.equal(summarizeDates([]), '')
assert.equal(summarizeDates(['2026-10-14']), '10월 14일 (수)')
assert.equal(summarizeDates(['2026-10-14', '2026-10-15', '2026-10-16']), '10월 14일 (수) ~ 10월 16일 (금) · 3일')

// October 2026 starts on a Thursday and has 31 days.
const october = monthCells(2026, 9)
assert.equal(october.length % 7, 0)
assert.deepEqual(october.slice(0, 5), [null, null, null, null, '2026-10-01'])
assert.equal(october.filter(Boolean).length, 31)
assert.equal(october.filter(Boolean).at(-1), '2026-10-31')

// --- answers ---------------------------------------------------------------------
assert.equal(normalizeSlots('1x1', grid), '10100000', 'cut or padded to the grid, anything else read as 0')
assert.equal(normalizeSlots('111111111111', grid), '11111111')
assert.equal(normalizeSlots(null, grid), '00000000')

assert.equal(toggleSlot('0000', 1), '0100')
assert.equal(toggleSlot('0100', 1), '0000')
assert.equal(toggleSlot('0000', 9), '0000', 'an index off the grid changes nothing')

// Dragging from day 0 slot 1 to day 1 slot 2 fills the rectangle, in either direction.
assert.equal(paintRectangle('00000000', 4, { day: 0, slot: 1 }, { day: 1, slot: 2 }, '1'), '01100110')
assert.equal(paintRectangle('00000000', 4, { day: 1, slot: 2 }, { day: 0, slot: 1 }, '1'), '01100110')
assert.equal(paintRectangle('11111111', 4, { day: 0, slot: 0 }, { day: 0, slot: 1 }, '0'), '00111111', 'erasing works the same way')
assert.equal(paintRectangle('10000001', 4, { day: 0, slot: 1 }, { day: 0, slot: 1 }, '1'), '11000001', 'the rest of the answer is kept')

assert.equal(toggleDay('00000000', 4, 1), '00001111')
assert.equal(toggleDay('00001011', 4, 1), '00001111', 'a partly filled day is filled')
assert.equal(toggleDay('00001111', 4, 1), '00000000', 'a full day is cleared')
assert.equal(toggleRow('00000000', 4, 2, 2), '00100010')
assert.equal(toggleRow('00100000', 4, 2, 2), '00100010')
assert.equal(toggleRow('00100010', 4, 2, 2), '00000000')

// --- the group ---------------------------------------------------------------------
const people = [
  { name: '가', mine: true, slots: '11110000' },
  { name: '나', mine: false, slots: '01111100' },
  { name: '다', mine: false, slots: '01100000' },
]
assert.deepEqual(countsPerSlot(people, 8), [1, 3, 3, 2, 1, 1, 0, 0])
assert.deepEqual(namesAt(people, 1), { free: ['가', '나', '다'], busy: [] })
assert.deepEqual(namesAt(people, 4), { free: ['나'], busy: ['가', '다'] })

// Most members first, then the longer stretch, then the earlier one; empty stretches left out.
assert.deepEqual(bestRanges(grid, people), [
  { day: 0, date: '2026-10-14', startMinute: 630, endMinute: 690, count: 3 },
  { day: 0, date: '2026-10-14', startMinute: 690, endMinute: 720, count: 2 },
  { day: 1, date: '2026-10-15', startMinute: 600, endMinute: 660, count: 1 },
  { day: 0, date: '2026-10-14', startMinute: 600, endMinute: 630, count: 1 },
])
assert.deepEqual(bestRanges(grid, people, 1), [{ day: 0, date: '2026-10-14', startMinute: 630, endMinute: 690, count: 3 }])
assert.deepEqual(bestRanges(grid, []), [], 'nothing to suggest before anyone answers')
// A stretch never runs across midnight into the next day.
assert.deepEqual(
  bestRanges(grid, [{ name: '가', mine: true, slots: '00011000' }]),
  [
    { day: 0, date: '2026-10-14', startMinute: 690, endMinute: 720, count: 1 },
    { day: 1, date: '2026-10-15', startMinute: 600, endMinute: 630, count: 1 },
  ],
)

console.log('meeting poll contract passed')
