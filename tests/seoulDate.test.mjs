import './setupDom.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { seoulDateStamp } from '../src/utils/seoulDate.ts'
import { downloadMembersCsv } from '../src/pages/admin/memberCsv.ts'
import { downloadRecruitApplicationsCsv } from '../src/pages/admin/recruitCsv.ts'
import { downloadRosterCsv } from '../src/pages/admin/rosterCsv.ts'

for (const [instant, day] of [
  ['2026-11-23T14:59:59Z', '2026-11-23'],
  ['2026-11-23T15:00:00Z', '2026-11-24'],
  ['2026-11-23T23:59:59Z', '2026-11-24'],
  ['2026-11-24T00:00:00Z', '2026-11-24'],
  ['2026-12-31T15:00:00Z', '2027-01-01'],
]) assert.equal(seoulDateStamp(new Date(instant)), day, instant)

const downloads = []
window.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download) }
URL.createObjectURL = () => 'blob:csv'
URL.revokeObjectURL = () => {}
for (const download of [downloadMembersCsv, downloadRecruitApplicationsCsv, downloadRosterCsv]) {
  download([], new Date('2026-11-23T15:00:00Z'))
}
assert.deepEqual(downloads, ['coms-members-2026-11-24.csv', 'coms-recruit-2026-11-24.csv', 'coms-roster-2026-11-24.csv'])
for (const file of ['Attendance.tsx', 'Gatherings.tsx', 'admin/AdminAuditLogs.tsx']) {
  const source = readFileSync(new URL(`../src/pages/${file}`, import.meta.url), 'utf8')
  assert.match(source, /anchor.download = .*seoulDateStamp\(\)/, `${file} uses the shared calendar`)
}
console.log('Seoul CSV date boundary tests passed')
