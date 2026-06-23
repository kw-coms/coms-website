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

console.log('schedule CSV contract passed')
