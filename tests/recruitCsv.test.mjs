import assert from 'node:assert/strict'
import { recruitApplicationsToCsv } from '../src/pages/admin/recruitCsv.ts'

// Made-up applicants.
const csv = recruitApplicationsToCsv([
  { name: '김지원', studentId: '2026123000', department: '컴퓨터정보공학부', grade: '1학년', email: 'apply@example.com', phone: '01012345678', status: 'RECEIVED', submittedAt: '2026-06-15T09:00:00', interests: '웹, 알고리즘', motive: '같이 "만들고" 싶습니다.', expectation: '스터디', adminNote: '' },
  { name: '=HYPERLINK("http://example.com")', studentId: '2026123001', department: '+cmd', grade: null, email: '', phone: '-1', status: 'UNKNOWN', submittedAt: null, interests: null, motive: '@x', expectation: null, adminNote: '메모' },
])

assert.equal(csv.charCodeAt(0), 0xfeff, 'starts with a byte-order mark so Excel reads the Korean text')
const lines = csv.slice(1).split('\r\n')
assert.equal(lines.length, 3, 'a header and one line per application')
assert.equal(lines[0], '"이름","학번","학과","학년","이메일","전화번호","상태","접수일","관심 분야","지원 동기","기대하는 활동","운영 메모"')
assert.equal(lines[1], '"김지원","2026123000","컴퓨터정보공학부","1학년","apply@example.com","01012345678","접수됨","2026-06-15T09:00:00","웹, 알고리즘","같이 ""만들고"" 싶습니다.","스터디",""')
// A cell a spreadsheet would run as a formula is forced to text; an unknown status is kept as sent.
assert.equal(lines[2], '"\'=HYPERLINK(""http://example.com"")","2026123001","\'+cmd","","","\'-1","UNKNOWN","","","\'@x","","메모"')
assert.equal(recruitApplicationsToCsv([]).slice(1).split('\r\n').length, 1, 'an empty list is just the header')

console.log('recruit csv contract passed')
