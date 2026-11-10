import assert from 'node:assert/strict'
import { VISIT_GAP_MS, isNoticeUnread, loadNoticeReadState, markAllNoticesRead, markNoticeRead, saveNoticeReadState, visitList } from '../src/utils/noticeReads.ts'
import { canDeleteNotice, canEditNotice } from '../src/utils/roleAccess.ts'

const t0 = new Date('2026-07-01T10:00:00').getTime()
const old = { id: 1, createdAt: '2026-07-01T09:00:00' }
const fresh = { id: 2, createdAt: '2026-07-01T11:00:00' }

let state = visitList(null, t0)
assert.equal(isNoticeUnread(state, old), false, 'first visit marks everything as seen')
assert.equal(isNoticeUnread(state, fresh), true, 'posted after the visit')
assert.equal(isNoticeUnread(null, fresh), false)

state = markNoticeRead(state, 2)
assert.equal(isNoticeUnread(state, fresh), false, 'opened notice is read')

state = visitList(state, t0 + 60_000)
assert.equal(state.seenAt, t0, 'a quick return keeps the same baseline')
state = visitList(state, t0 + VISIT_GAP_MS + 1_000_000)
assert.equal(state.seenAt, t0 + 60_000, 'a later visit moves the baseline to the previous visit')
assert.deepEqual(state.readIds, [])

const withNew = { id: 3, createdAt: '2026-07-01T10:00:30' }
assert.equal(isNoticeUnread(state, withNew), false)
assert.equal(isNoticeUnread(visitList(visitList(null, t0), t0 + VISIT_GAP_MS + 1), withNew), true)

assert.equal(isNoticeUnread(markAllNoticesRead(visitList(null, t0), t0 + 5), fresh), true, 'still newer than now')
assert.equal(isNoticeUnread(markAllNoticesRead(visitList(null, t0), t0 + 10_000_000_000), fresh), false)

const mem = new Map()
const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) }
saveNoticeReadState(state, storage)
assert.deepEqual(loadNoticeReadState(storage), state)
mem.set('kwcoms-notice-read:v1', 'nope')
assert.equal(loadNoticeReadState(storage), null)
assert.doesNotThrow(() => saveNoticeReadState(state, { setItem() { throw new Error('full') } }))

// Server rules: edit = author or ADMIN, delete = notice.write permission.
const authored = { authorStudentId: '2023000002' }
assert.equal(canEditNotice({ role: 'USER', studentId: '2023000002' }, authored), true)
assert.equal(canEditNotice({ role: 'OFFICER', studentId: '2020000001' }, authored), false)
assert.equal(canEditNotice({ role: 'ADMIN', studentId: '2020000001' }, authored), true)
assert.equal(canEditNotice(null, authored), false)
assert.equal(canDeleteNotice(new Set(['notice.write'])), true)
assert.equal(canDeleteNotice(new Set()), false)
console.log('noticeReads ok')
