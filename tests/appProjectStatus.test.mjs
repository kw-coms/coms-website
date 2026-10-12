import assert from 'node:assert/strict'
import { buildProjectStatusBadges, linkStateOf } from '../src/utils/appProjectStatus.ts'

assert.deepEqual(buildProjectStatusBadges({
  linkUrl: 'https://coms.kw.ac.kr/worldcup/',
  files: [],
}).map((badge) => badge.label), ['열기 가능', 'COMS 호스팅'])

assert.deepEqual(buildProjectStatusBadges({
  linkUrl: 'https://example.com/app',
  files: [{ id: 1 }],
}).map((badge) => badge.label), ['열기 가능', '외부 링크', '다운로드'])

assert.deepEqual(buildProjectStatusBadges({
  linkUrl: '',
  files: [],
}).map((badge) => badge.label), ['준비 중'])

// A link that did not answer the server's last look is not "열기 가능".
assert.deepEqual(buildProjectStatusBadges({ linkUrl: 'https://coms.kw.ac.kr/PRDoctor', files: [] }, 'DOWN'),
  [{ key: 'down', label: '응답 없음', tone: 'down' }, { key: 'coms', label: 'COMS 호스팅', tone: 'hosted' }])
for (const state of ['UP', 'UNKNOWN', null, undefined]) {
  assert.deepEqual(buildProjectStatusBadges({ linkUrl: 'https://example.com/app', files: [] }, state).map((badge) => badge.label),
    ['열기 가능', '외부 링크'], `state ${state}`)
}
// Nothing to open, nothing that can be down.
assert.deepEqual(buildProjectStatusBadges({ linkUrl: '', files: [] }, 'DOWN').map((badge) => badge.label), ['준비 중'])

// Which state belongs to an entry: its own, and only for the address it still has.
const statuses = [
  { projectId: 3, linkUrl: 'https://coms.kw.ac.kr/PRDoctor', state: 'DOWN', checkedAt: '2026-10-12T17:00:00' },
  { projectId: 4, linkUrl: 'https://coms.kw.ac.kr/tier/', state: 'UP', checkedAt: '2026-10-12T17:00:00' },
  { projectId: 5, linkUrl: 'https://old.example/', state: 'DOWN', checkedAt: '2026-10-12T17:00:00' },
  { projectId: 6, linkUrl: 'https://odd.example/', state: 'BROKEN', checkedAt: '2026-10-12T17:00:00' },
]
assert.equal(linkStateOf({ id: 3, linkUrl: 'https://coms.kw.ac.kr/PRDoctor' }, statuses), 'DOWN')
assert.equal(linkStateOf({ id: '3', linkUrl: ' https://coms.kw.ac.kr/PRDoctor ' }, statuses), 'DOWN', 'ids compare as text, addresses without outer spaces')
assert.equal(linkStateOf({ id: 4, linkUrl: 'https://coms.kw.ac.kr/tier/' }, statuses), 'UP')
assert.equal(linkStateOf({ id: 5, linkUrl: 'https://new.example/' }, statuses), null, 'the entry was edited after the look')
assert.equal(linkStateOf({ id: 6, linkUrl: 'https://odd.example/' }, statuses), null, 'a state this page does not know')
assert.equal(linkStateOf({ id: 7, linkUrl: 'https://unseen.example/' }, statuses), null)
assert.equal(linkStateOf({ id: 3, linkUrl: '' }, statuses), null)
assert.equal(linkStateOf({ id: 3, linkUrl: 'https://coms.kw.ac.kr/PRDoctor' }, null), null)

console.log('app project status contract passed')
