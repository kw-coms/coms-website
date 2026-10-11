import assert from 'node:assert/strict'
import { auditLogsToCsv, csvCell } from '../src/pages/admin/auditLogCsv.ts'

// Ordinary values are quoted, with embedded quotes doubled.
assert.equal(csvCell('관리자'), '"관리자"')
assert.equal(csvCell('say "hi", ok'), '"say ""hi"", ok"')
assert.equal(csvCell(2020123456), '"2020123456"')
assert.equal(csvCell(null), '""')
assert.equal(csvCell(undefined), '""')

// A cell that would open as a formula in a spreadsheet gets a leading apostrophe.
for (const payload of [
  '=HYPERLINK("https://evil.example","열어보기")',
  '=cmd|\' /C calc\'!A0',
  '+1+1',
  '-2+3',
  '@SUM(A1:A9)',
  '\t=1+1',
  '\r=1+1',
]) {
  assert.equal(csvCell(payload), `"'${payload.replaceAll('"', '""')}"`, `not neutralised: ${JSON.stringify(payload)}`)
}

// Only the first character decides: the audit detail format ("key=value" lines), ISO
// timestamps and hyphenated text must come through untouched.
assert.equal(csvCell('title=삭제 대상\ncontent==1+1'), '"title=삭제 대상\ncontent==1+1"')
assert.equal(csvCell('2026-06-15T03:30:00'), '"2026-06-15T03:30:00"')
assert.equal(csvCell('a-b@c'), '"a-b@c"')

const csv = auditLogsToCsv([
  {
    id: 2,
    createdAt: '2026-06-15T03:29:00',
    actorName: '=관리자',
    actorStudentId: '2020123456',
    action: 'COMMUNITY_POST_DELETE',
    targetType: 'COMMUNITY_POST',
    targetId: '77',
    ipAddress: null,
    detail: '@SUM(1+1)*cmd|\' /C calc\'!A0',
  },
])

// Excel only reads the file as UTF-8 (i.e. shows 한글 correctly) when it starts with a BOM.
assert.equal(csv.charCodeAt(0), 0xfeff)
assert.equal(
  csv.slice(1),
  [
    'createdAt,actorName,actorStudentId,action,targetType,targetId,ipAddress,detail',
    '"2026-06-15T03:29:00","\'=관리자","2020123456","COMMUNITY_POST_DELETE","COMMUNITY_POST","77","","\'@SUM(1+1)*cmd|\' /C calc\'!A0"',
  ].join('\n'),
)

// No rows still yields a well-formed file: BOM + header.
assert.equal(
  auditLogsToCsv([]),
  `${String.fromCharCode(0xfeff)}createdAt,actorName,actorStudentId,action,targetType,targetId,ipAddress,detail`,
)

console.log('audit log CSV contract passed')
