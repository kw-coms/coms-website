import assert from 'node:assert/strict'
import { createClubActivity, updateClubActivity, previewClubActivityStatus } from '../src/services/clubActivityApi.ts'
import { selectedTerm, termForDate } from '../src/pages/admin/activityTimelineForm.ts'

const calls = []
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), body: init.body })
  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
}

await createClubActivity({ kind: 'ACTIVITY', title: '기존 작성 화면', eventDate: '2026-11-24' })
assert.equal(calls[0].body.get('eventDate'), '2026-11-24')
assert.equal(calls[0].body.has('showOnTimeline'), false, 'older callers must not publish by default')
assert.equal(calls[0].body.has('timelineStatus'), false)

await updateClubActivity(42, {
  title: '날짜 미정으로 변경', dateUndecided: true, timelineStatus: '',
  showOnTimeline: true, timelineTerm: '2026 2학기', dateLabel: '12월 중',
})
const undated = calls[1].body
assert.equal(undated.has('eventDate'), false)
assert.equal(undated.get('dateUndecided'), 'true')
assert.equal(undated.get('timelineStatus'), '', 'empty status must reset to automatic')
assert.equal(undated.get('showOnTimeline'), 'true')
assert.equal(undated.get('timelineTerm'), '2026 2학기')
assert.equal(undated.get('dateLabel'), '12월 중')

await updateClubActivity(42, { title: '기존 활동 수정' })
assert.equal(calls[2].body.has('dateUndecided'), false, 'unrelated edit must preserve the date')
assert.equal(calls[2].body.has('timelineStatus'), false, 'unrelated edit must preserve manual status')

await previewClubActivityStatus({ eventDate: '2026-11-24', startTime: '18:00', endTime: '20:00' })
const previewUrl = new URL(calls[3].url, 'http://localhost')
assert.equal(previewUrl.pathname, '/api/club-activities/status-preview')
assert.equal(previewUrl.searchParams.get('eventDate'), '2026-11-24')
assert.equal(previewUrl.searchParams.get('startTime'), '18:00')
assert.equal(previewUrl.searchParams.get('endTime'), '20:00')
await previewClubActivityStatus({})
assert.equal(calls[4].url, '/api/club-activities/status-preview', 'undated preview delegates to the same backend rule')

assert.equal(termForDate('2026-01-15'), '2025 겨울방학')
assert.equal(termForDate('2026-03-01'), '2026 1학기')
assert.equal(termForDate('2026-07-01'), '2026 여름방학')
assert.equal(termForDate('2026-09-01'), '2026 2학기')
assert.equal(selectedTerm({ eventDate: '2026-09-01', timelineTerm: '' }), '2026 2학기')
assert.equal(selectedTerm({ eventDate: '2026-09-01', timelineTerm: '2027 1학기' }), '2027 1학기')

console.log('club activity timeline request and term checks passed')
