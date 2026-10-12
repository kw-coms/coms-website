import assert from 'node:assert/strict'
import {
  attendanceSummaryToCsv,
  cleanAttendanceCode,
  formatAttendanceDay,
  formatAttendanceTime,
  remainingLabel,
  secondsLeft,
} from '../src/utils/attendance.ts'

// The code box keeps digits only, four at most, whatever is typed or pasted.
assert.equal(cleanAttendanceCode('4821'), '4821')
assert.equal(cleanAttendanceCode(' 48 21 '), '4821')
assert.equal(cleanAttendanceCode('코드 4821번'), '4821')
assert.equal(cleanAttendanceCode('482199'), '4821')
assert.equal(cleanAttendanceCode('ab'), '')
assert.equal(cleanAttendanceCode(null), '')

// Seconds left: what the server counted when the list arrived, minus the time passed since.
const received = 1_000_000
assert.equal(secondsLeft(1800, received, received), 1800)
assert.equal(secondsLeft(1800, received, received + 999), 1800, 'a second has to pass in full')
assert.equal(secondsLeft(1800, received, received + 61_000), 1739)
assert.equal(secondsLeft(30, received, received + 30_000), 0)
assert.equal(secondsLeft(30, received, received + 95_000), 0, 'never below zero')
assert.equal(secondsLeft(30, received, received - 4_000), 30, 'a clock tick older than the answer gains no time')
assert.equal(secondsLeft(0, received, received), 0)
assert.equal(secondsLeft(Number.NaN, received, received), 0)
assert.equal(secondsLeft(undefined, received, received), 0)

assert.equal(remainingLabel(725), '12:05')
assert.equal(remainingLabel(59), '00:59')
assert.equal(remainingLabel(7200), '120:00')
assert.equal(remainingLabel(0), '', 'nothing once the time is up')
assert.equal(remainingLabel(-3), '')
assert.equal(remainingLabel(Number.NaN), '')

assert.equal(formatAttendanceTime('2026-10-12T13:05:00'), '10월 12일 13:05')
assert.equal(formatAttendanceTime('2026-01-03T09:00:00.123'), '1월 3일 09:00')
assert.equal(formatAttendanceTime('nope'), '')
assert.equal(formatAttendanceDay('2026-10-12T13:05:00'), '10/12')
assert.equal(formatAttendanceDay('2026-01-03T09:00:00'), '1/3')
assert.equal(formatAttendanceDay('nope'), '')

// The summary as a spreadsheet file. The people are made up.
const csv = attendanceSummaryToCsv({
  // Newest first, as the server sends them.
  sessions: [
    { id: 3, title: '웹 세미나 3주차', openedAt: '2026-10-12T19:00:00' },
    { id: 2, title: '=HYPERLINK("http://x")', openedAt: '2026-10-05T19:00:00' },
    { id: 1, title: '개강 총회, "1학기"', openedAt: '2026-09-02T18:00:00' },
  ],
  members: [
    { name: '홍길동', count: 3, sessionIds: [1, 2, 3] },
    { name: '김철수', count: 1, sessionIds: [2] },
    { name: '+82 장난', count: 1, sessionIds: [3] },
  ],
})
assert.equal(csv.charCodeAt(0), 0xfeff, 'starts with a byte-order mark so Excel reads the Korean text')
const lines = csv.slice(1).split('\r\n')
assert.equal(lines.length, 5, 'a header, three members and the line end of the last row')
assert.equal(lines[4], '')
// Checks run oldest to newest, left to right; a title that starts like a formula is not run as one.
assert.equal(lines[0], '"이름","출석 횟수","9/2 개강 총회, ""1학기""","10/5 =HYPERLINK(""http://x"")","10/12 웹 세미나 3주차"')
assert.equal(lines[1], '"홍길동","3","O","O","O"')
assert.equal(lines[2], '"김철수","1","","O",""')
assert.equal(lines[3], '"\'+82 장난","1","","","O"')
assert.equal(attendanceSummaryToCsv({ sessions: [], members: [] }), `${String.fromCharCode(0xfeff)}"이름","출석 횟수"\r\n`)

console.log('attendance contract passed')
