import assert from 'node:assert/strict'
import { isGraduateRow, rosterAdmissionYear, rosterToCsv } from '../src/pages/admin/rosterCsv.ts'

// 2026 기준 졸업 경계는 2019 입학(= 올해 - 7). 시계에 흔들리지 않게 날짜를 주입한다.
const NOW = new Date('2026-10-13T00:00:00Z')

// 졸업생으로 등록된 명부 행은 학번이 없다 — G{입학연도}-{명부번호} 는 가입할 때 비로소 발급된다.
// 그래서 학번 모양이 아니라 입학연도로 가른다.
assert.equal(isGraduateRow({ studentId: null, admissionYear: 2015 }, NOW), true)
assert.equal(isGraduateRow({ studentId: '2015000001', admissionYear: 2015 }, NOW), true, '졸업 연도대의 10자리 학번도 졸업생')
assert.equal(isGraduateRow({ studentId: null, admissionYear: 2019 }, NOW), true, '경계: 올해 - 7')
assert.equal(isGraduateRow({ studentId: null, admissionYear: 2020 }, NOW), false, '경계 바로 뒤')
assert.equal(isGraduateRow({ studentId: '2024000001', admissionYear: 2024 }, NOW), false)
// 아무것도 못 구하면 추측하지 않는다.
assert.equal(isGraduateRow({ studentId: null, generation: null, admissionYear: null }, NOW), null)

// admissionYear 가 없는 행(구버전 응답)은 V29 백필과 같은 순서로 되짚는다.
assert.equal(rosterAdmissionYear({ studentId: '2024000001' }), 2024)
assert.equal(rosterAdmissionYear({ studentId: 'G2017-42' }), 2017)
assert.equal(rosterAdmissionYear({ studentId: null, generation: '53' }), 2019, '기수 + 1966')
assert.equal(rosterAdmissionYear({ studentId: null, generation: '' }), null)
assert.equal(rosterAdmissionYear({ studentId: '', admissionYear: 2021 }), 2021, 'admissionYear 가 먼저')

// Made-up people.
const csv = rosterToCsv([
  { name: '홍길동', studentId: '2024000002', generation: '58', admissionYear: 2024, phone: '01000000002', initialRole: 'USER', joined: true },
  { name: '졸업 "선배"', studentId: null, generation: '53', admissionYear: 2019, phone: '', initialRole: 'USER', joined: false },
  { name: '=HYPERLINK("http://example.com")', studentId: '', generation: 60, admissionYear: null, phone: '-1', initialRole: 'ASSOCIATE' },
], NOW)

assert.equal(csv.charCodeAt(0), 0xfeff, 'starts with a byte-order mark so Excel reads the Korean text')

const lines = csv.slice(1).split('\r\n')
assert.equal(lines[0], '"이름","학번","입학연도","기수","구분","전화번호","가입 여부","가입 시 등급"')
assert.equal(lines[1], '"홍길동","2024000002","2024","58기","재학생","010-0000-0002","가입","회원"')
// 학번 없는 졸업생 행: 예전처럼 "재학생" 으로 새지 않는다.
assert.equal(lines[2], '"졸업 ""선배""","","2019","53기","졸업생","","미가입","회원"')
// 가입 여부를 모르면(회원 목록 로딩 실패) 빈 칸. 수식으로 읽힐 셀은 앞에 '를 붙인다.
assert.equal(lines[3], `"'=HYPERLINK(""http://example.com"")","","2026","60기","재학생","'-1","","준회원"`)

assert.equal(rosterToCsv([], NOW).slice(1).split('\r\n').length, 1, 'an empty roster is a header row only')

console.log('roster CSV contract passed')
