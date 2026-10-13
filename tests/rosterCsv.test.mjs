import assert from 'node:assert/strict'
import { isGraduateRow, rosterToCsv } from '../src/pages/admin/rosterCsv.ts'

// 졸업생 행은 합성 ID(G{입학연도}-{명부번호})로 알아본다. 실제 학번은 숫자 10자리다.
assert.equal(isGraduateRow('G2019-12'), true)
assert.equal(isGraduateRow('2023000002'), false)
assert.equal(isGraduateRow(''), false)
assert.equal(isGraduateRow(null), false)
assert.equal(isGraduateRow('G2019'), false, 'the roster number is part of the shape')

// Made-up people.
const csv = rosterToCsv([
  { name: '홍길동', studentId: '2023000002', generation: '61', phone: '01000000002', initialRole: 'USER', joined: true },
  { name: '졸업 "선배"', studentId: 'G2019-12', generation: '53', phone: '', initialRole: 'USER', joined: false },
  { name: '=HYPERLINK("http://example.com")', studentId: '', generation: 62, phone: '-1', initialRole: 'ASSOCIATE' },
])

assert.equal(csv.charCodeAt(0), 0xfeff, 'starts with a byte-order mark so Excel reads the Korean text')

const lines = csv.slice(1).split('\r\n')
assert.equal(lines[0], '"이름","학번","기수","구분","전화번호","가입 여부","가입 시 등급"')
assert.equal(lines[1], '"홍길동","2023000002","61기","재학생","010-0000-0002","가입","회원"')
assert.equal(lines[2], '"졸업 "선배"","2019 (졸업생)","53기","졸업생","","미가입","회원"'.replace('"선배"', '""선배""'))
// 가입 여부를 모르면(회원 목록 로딩 실패) 추측하지 않고 빈 칸으로 둔다.
assert.equal(lines[3], `"'=HYPERLINK(""http://example.com"")","","62기","재학생","'-1","","준회원"`)

assert.equal(rosterToCsv([]).slice(1).split('\r\n').length, 1, 'an empty roster is a header row only')

console.log('roster CSV contract passed')
