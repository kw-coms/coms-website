import assert from 'node:assert/strict'
import { parseScheduleCsv } from '../src/utils/scheduleCsv.ts'

const parsed = parseScheduleCsv(`종류,제목,시작일,종료일,시작시간,종료시간,요일,색상
날짜,개강 총회,2026-03-04,2026-03-04,18:00,19:00,,#ff9f0a
정기,알고리즘 스터디,2026-03-10,2026-06-20,19:00,21:00,MON|WED,#34c759
`)

assert.deepEqual(parsed.errors, [])
assert.deepEqual(parsed.rows, [
  {
    type: 'date',
    title: '개강 총회',
    startDate: '2026-03-04',
    endDate: '2026-03-04',
    startTime: '18:00',
    endTime: '19:00',
    daysOfWeek: [],
    colorHex: '#ff9f0a',
  },
  {
    type: 'recurring',
    title: '알고리즘 스터디',
    startDate: '2026-03-10',
    endDate: '2026-06-20',
    startTime: '19:00',
    endTime: '21:00',
    daysOfWeek: ['MON', 'WED'],
    colorHex: '#34c759',
  },
])

const invalid = parseScheduleCsv(`type,title,startDate,endDate,daysOfWeek
recurring,요일 없음,2026-03-10,2026-06-20,
date,,2026-03-11,,
`)

assert.equal(invalid.rows.length, 0)
assert.deepEqual(invalid.errors.map((error) => error.line), [2, 3])

// Parses one data row under the importer's documented column order and returns it (or throws
// with the parser's own message, so a failing case names the reason).
const HEADER = '종류,제목,시작일,종료일,시작시간,종료시간,요일,색상'
function row(line) {
  const result = parseScheduleCsv(`${HEADER}\n${line}`)
  assert.deepEqual(result.errors, [], `unexpected error for: ${line}`)
  assert.equal(result.rows.length, 1)
  return result.rows[0]
}
function rejection(line) {
  const result = parseScheduleCsv(`${HEADER}\n${line}`)
  assert.equal(result.rows.length, 0, `should have been rejected: ${line}`)
  assert.equal(result.errors.length, 1)
  assert.equal(result.errors[0].line, 2)
  return result.errors[0].message
}

// ---- 요일: Korean names (what the 요일 header invites) map to the tokens the API accepts.
assert.deepEqual(row('정기,스터디,2026-03-10,2026-06-20,,,월|수,').daysOfWeek, ['MON', 'WED'])
assert.deepEqual(row('정기,스터디,2026-03-10,2026-06-20,,,월요일 목요일,').daysOfWeek, ['MON', 'THU'])
assert.deepEqual(row('정기,스터디,2026-03-10,2026-06-20,,,월수금,').daysOfWeek, ['MON', 'WED', 'FRI'])
assert.deepEqual(row('정기,스터디,2026-03-10,2026-06-20,,,"화,목",').daysOfWeek, ['TUE', 'THU'])
assert.deepEqual(row('정기,스터디,2026-03-10,2026-06-20,,,토·일,').daysOfWeek, ['SAT', 'SUN'])
// The spellings the server itself understands keep working, in any case, without repeats.
assert.deepEqual(row('정기,스터디,2026-03-10,2026-06-20,,,mon/Wednesday;FRIDAY,').daysOfWeek, ['MON', 'WED', 'FRI'])
assert.deepEqual(row('정기,스터디,2026-03-10,2026-06-20,,,1|3|7|0,').daysOfWeek, ['MON', 'WED', 'SUN'])
assert.deepEqual(row('정기,스터디,2026-03-10,2026-06-20,,,월|MON|월요일,').daysOfWeek, ['MON'])
// A token that is no weekday is named instead of being sent on to fail on the server.
assert.match(rejection('정기,스터디,2026-03-10,2026-06-20,,,월|평일,'), /요일을 알 수 없습니다: 평일/)
assert.match(rejection('정기,스터디,2026-03-10,2026-06-20,,,,'), /종료일과 반복 요일이 필요합니다/)
// 날짜 rows never send weekdays, so a stray value there must not start rejecting the row.
assert.deepEqual(row('날짜,개강 총회,2026-03-04,,,,메모,').daysOfWeek, [])

// ---- 날짜
assert.equal(row('날짜,MT,2026-05-01,,,,,').endDate, '2026-05-01')
assert.equal(row('날짜,MT,2026-05-01,2026-05-03,,,,').endDate, '2026-05-03')
assert.match(rejection('날짜,MT,2026/05/01,,,,,'), /YYYY-MM-DD/)
assert.match(rejection('날짜,MT,2026-5-1,,,,,'), /YYYY-MM-DD/)
assert.match(rejection('날짜,MT,2026-02-30,,,,,'), /YYYY-MM-DD/)
assert.match(rejection('날짜,MT,2026-05-01,5월 3일,,,,'), /YYYY-MM-DD/)
assert.match(rejection('날짜,MT,2026-05-03,2026-05-01,,,,'), /종료일은 시작일과 같거나 이후/)
// A 정기 row must spell out its end date; it used to fall back to the start date and import
// as a one-day "recurring" schedule.
assert.match(rejection('정기,스터디,2026-03-10,,,,월,'), /종료일과 반복 요일이 필요합니다/)

// ---- 시간: zero-padded for the API, which rejects "9:00".
assert.equal(row('날짜,회의,2026-03-04,,9:00,10:30,,').startTime, '09:00')
assert.equal(row('날짜,회의,2026-03-04,,9:00:00,10:30,,').startTime, '09:00')
assert.equal(row('날짜,회의,2026-03-04,,09:00:30,10:30,,').startTime, '09:00:30')
assert.equal(row('날짜,회의,2026-03-04,,,,,').startTime, '')
assert.equal(row('날짜,회의,2026-03-04,,18:00,18:00,,').endTime, '18:00')
assert.match(rejection('날짜,회의,2026-03-04,,1800,,,'), /HH:MM/)
assert.match(rejection('날짜,회의,2026-03-04,,25:00,,,'), /HH:MM/)
assert.match(rejection('날짜,회의,2026-03-04,,18:00,오후 7시,,'), /HH:MM/)
assert.match(rejection('날짜,회의,2026-03-04,,19:00,18:00,,'), /종료 시간은 시작 시간 이후/)

// ---- 제목 / 색상
assert.equal(row(`날짜,${'가'.repeat(120)},2026-03-04,,,,,`).title.length, 120)
assert.match(rejection(`날짜,${'가'.repeat(121)},2026-03-04,,,,,`), /120자 이하/)
assert.equal(row('날짜,회의,2026-03-04,,,,,#FF9F0A').colorHex, '#ff9f0a')
assert.match(rejection('날짜,회의,2026-03-04,,,,,orange'), /#RRGGBB/)
// No colour is null, never '': the importer passes it straight to the recurring-schedule API,
// whose #RRGGBB pattern refuses an empty string. The documented 7-column format has no colour
// column at all, so every 정기 row written to that format hit this.
assert.equal(row('정기,스터디,2026-03-10,2026-06-20,19:00,21:00,월,').colorHex, null)
const documentedFormat = parseScheduleCsv(`type,title,startDate,endDate,startTime,endTime,daysOfWeek
recurring,스터디,2026-03-10,2026-06-20,19:00,21:00,TUE`)
assert.deepEqual(documentedFormat.errors, [])
assert.equal(documentedFormat.rows[0].colorHex, null)

// ---- File shape
// Line numbers are the ones in the pasted text, blank lines included.
const spaced = parseScheduleCsv(`종류,제목,시작일

날짜,정상,2026-03-04

날짜,,2026-03-05
`)
assert.equal(spaced.rows.length, 1)
assert.deepEqual(spaced.errors.map((error) => error.line), [5])

// Excel's "CSV UTF-8" starts with a BOM (U+FEFF) and uses CRLF.
const fromExcel = parseScheduleCsv(`${String.fromCharCode(0xfeff)}종류,제목,시작일\r\n날짜,개강 총회,2026-03-04\r\n`)
assert.deepEqual(fromExcel.errors, [])
assert.equal(fromExcel.rows[0].title, '개강 총회')

// A missing header row is one clear error, not one misleading error per data row.
const headerless = parseScheduleCsv(`날짜,개강 총회,2026-03-04
정기,스터디,2026-03-10`)
assert.equal(headerless.rows.length, 0)
assert.equal(headerless.errors.length, 1)
assert.equal(headerless.errors[0].line, 1)
assert.match(headerless.errors[0].message, /첫 줄/)

assert.deepEqual(parseScheduleCsv('').errors.map((error) => error.line), [1])
assert.deepEqual(parseScheduleCsv(HEADER), { rows: [], errors: [] })

console.log('schedule CSV contract passed')
