import assert from 'node:assert/strict'
import { formatPhoneForSheet, membersToCsv } from '../src/pages/admin/memberCsv.ts'

// Phone numbers keep their leading zero in a spreadsheet only when they are not a bare number.
assert.equal(formatPhoneForSheet('01012345678'), '010-1234-5678')
assert.equal(formatPhoneForSheet('010-1234-5678'), '010-1234-5678')
assert.equal(formatPhoneForSheet('010 1234 5678'), '010-1234-5678')
assert.equal(formatPhoneForSheet('0111234567'), '011-123-4567')
assert.equal(formatPhoneForSheet(''), '')
assert.equal(formatPhoneForSheet(null), '')
assert.equal(formatPhoneForSheet('02-123-4567'), '02-123-4567', 'anything else is left as written')

// Made-up people.
const csv = membersToCsv([
  { name: '홍길동', studentId: '2023000002', generation: '61', role: 'USER', email: 'hong@example.com', emailVerified: true, department: '소프트웨어학부', phone: '01000000002' },
  { name: '졸업 "선배"', studentId: 'G2019-12', generation: '', role: 'OFFICER', email: 'old@example.com', emailVerified: false, department: null, phone: '' },
  { name: '=HYPERLINK("http://example.com")', studentId: '2024000004', generation: 62, role: 'UNKNOWN', email: '', emailVerified: true, department: '+cmd', phone: '-1' },
])

assert.equal(csv.charCodeAt(0), 0xfeff, 'starts with a byte-order mark so Excel reads the Korean text')
const lines = csv.slice(1).split('\r\n')
assert.equal(lines.length, 4, 'a header and one line per member')
assert.equal(lines[0], '"이름","학번","기수","역할","이메일","이메일 인증","학과","전화번호"')
assert.equal(lines[1], '"홍길동","2023000002","61기","회원","hong@example.com","인증","소프트웨어학부","010-0000-0002"')
// Quotes are doubled, a graduate's internal account id is shown the way the screen shows it,
// and missing values are empty cells.
assert.equal(lines[2], '"졸업 ""선배""","2019 (졸업생)","","임원","old@example.com","미인증","",""')
// A cell a spreadsheet would run as a formula is forced to text; an unknown role is kept as sent.
assert.equal(lines[3], '"\'=HYPERLINK(""http://example.com"")","2024000004","62기","UNKNOWN","","인증","\'+cmd","\'-1"')

assert.equal(membersToCsv([]).slice(1), '"이름","학번","기수","역할","이메일","이메일 인증","학과","전화번호"', 'an empty list is just the header')

console.log('member csv contract passed')
