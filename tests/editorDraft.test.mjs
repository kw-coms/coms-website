import assert from 'node:assert/strict'
import { MAX_DRAFT_AGE_MS, MAX_DRAFT_CHARS, clearMemberDrafts, draftIsStale, draftFieldsEqual, draftStorageKey, normalizeDraftContent, readDraft, removeDraft, writeDraft } from '../src/utils/editorDraft.ts'
import { beginMemberLogout, cancelMemberLogout, canWriteMember, finishMemberLogout, memberSessionEpoch, setMemberSessionOwner } from '../src/utils/memberSession.ts'

const store = () => {
  const data = new Map()
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) }, removeItem: (k) => { data.delete(k) }, data }
}
const fields = { title: '제목', category: 'GENERAL', anonymousName: '', content: '[{"type":"text","content":"<p>본문</p>"}]' }

assert.notEqual(draftStorageKey('a', 'post', null), draftStorageKey('a', 'post', 7), 'new and edit-N drafts are separate')
assert.notEqual(draftStorageKey('a', 'post', 7), draftStorageKey('a', 'notice', 7), 'post and notice drafts are separate')
assert.notEqual(draftStorageKey('a', 'post', 7), draftStorageKey('b', 'post', 7), 'drafts are per member')

const s = store()
assert.equal(readDraft('k', s), null)
assert.equal(writeDraft('k', fields, s, 123), true)
assert.deepEqual(readDraft('k', s, 123), { ...fields, savedAt: 123 })
removeDraft('k', s)
assert.equal(readDraft('k', s), null)

s.setItem('k', '{bad json')
assert.equal(readDraft('k', s), null, 'corrupt value is ignored')
s.setItem('k', JSON.stringify({ title: 3 }))
assert.equal(readDraft('k', s), null, 'wrong shape is ignored')

assert.equal(writeDraft('big', { ...fields, content: 'x'.repeat(MAX_DRAFT_CHARS) }, s), false, 'oversized draft is not stored')
assert.equal(s.getItem('big'), null)
const throwing = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('full') }, removeItem() { throw new Error('blocked') } }
assert.equal(writeDraft('k', fields, throwing), false, 'storage errors are swallowed')
assert.equal(readDraft('k', throwing), null)
removeDraft('k', throwing)
assert.equal(writeDraft('k', fields, null), false)

assert.equal(normalizeDraftContent('[{"type":"text","content":"<p><br></p>"},{"type":"text","content":""}]'), '', 'blank paragraphs are no content')
assert.equal(draftFieldsEqual({ ...fields, content: '' }, { ...fields, content: '[{"type":"text","content":""}]' }), true)
assert.equal(draftFieldsEqual(fields, { ...fields, title: '다른 제목' }), false)
assert.equal(draftFieldsEqual(fields, { ...fields, content: '[{"type":"text","content":"본문<br>"}]' }), true, 'editor normalization does not make untouched server content dirty')
assert.equal(draftFieldsEqual(fields, { ...fields, content: '[{"type":"text","content":"다른 본문<br>"}]' }), false, 'changed body still counts as dirty')

// Old drafts are dropped on read.
const old = store()
writeDraft('k', fields, old, 1000)
assert.equal(readDraft('k', old, 1000 + MAX_DRAFT_AGE_MS + 1), null)
assert.equal(old.getItem('k'), null, 'and removed from storage')
assert.notEqual(readDraft('k', (writeDraft('k', fields, old, 1000), old), 1000 + MAX_DRAFT_AGE_MS - 1), null)

// A draft older than the server's last change must not be applied silently.
const d = { savedAt: new Date('2026-07-01T10:00:00').getTime() }
assert.equal(draftIsStale(d, '2026-07-01T11:00:00'), true)
assert.equal(draftIsStale(d, '2026-07-01T09:00:00'), false)
assert.equal(draftIsStale(d, null), false)
assert.equal(draftIsStale(null, '2026-07-01T11:00:00'), false)

// Logout removes only that member's drafts.
const multi = { keys: ['kwcoms-draft:v1:a:post:new', 'kwcoms-draft:v1:a:notice:3', 'kwcoms-draft:v1:b:post:new', 'other'], removeItem(k) { this.keys = this.keys.filter((x) => x !== k) }, get length() { return this.keys.length }, key(i) { return this.keys[i] ?? null }, getItem: () => null, setItem() {} }
clearMemberDrafts('a', multi)
assert.deepEqual(multi.keys, ['kwcoms-draft:v1:b:post:new', 'other'])

// A pending or completed logout must fence off late writes from the old editor.
setMemberSessionOwner('a')
const memberStore = store()
const memberKey = draftStorageKey('a', 'post', null)
const oldEpoch = memberSessionEpoch()
assert.equal(writeDraft(memberKey, fields, memberStore, 123, oldEpoch), true)
assert.equal(beginMemberLogout(), true)
assert.equal(beginMemberLogout(), false, 'a second logout cannot release the first request write fence')
assert.equal(canWriteMember('a', oldEpoch), false)
assert.equal(writeDraft(memberKey, fields, memberStore, 124, oldEpoch), false)
cancelMemberLogout()
assert.equal(canWriteMember('a', oldEpoch), true, 'failed logout resumes the same editor')
beginMemberLogout()
finishMemberLogout()
clearMemberDrafts('a', { ...memberStore, length: 1, key: () => memberKey })
assert.equal(writeDraft(memberKey, fields, memberStore, 125, oldEpoch), false, 'late unmount cannot recreate the removed draft')
assert.equal(memberStore.getItem(memberKey), null)
setMemberSessionOwner('b')
assert.equal(writeDraft(memberKey, fields, memberStore, 126), false, 'a different member cannot write the old key')
assert.equal(readDraft(memberKey, memberStore), null, 'a different member cannot restore the old key')
assert.equal(writeDraft(draftStorageKey('b', 'post', null), fields, memberStore, 126), true)
setMemberSessionOwner('a')
assert.equal(canWriteMember('a', oldEpoch), false, 'even the same member has a fresh session epoch')
assert.equal(writeDraft('', fields, memberStore), false, 'no anonymous draft key exists')

// A 401 that lands during a pending logout must invalidate ownership even if logout fails.
const beforeExpiry = memberSessionEpoch()
beginMemberLogout()
setMemberSessionOwner(null)
cancelMemberLogout()
assert.equal(canWriteMember('a', beforeExpiry), false)
assert.equal(writeDraft(memberKey, fields, memberStore, 127, beforeExpiry), false)
console.log('editorDraft ok')
