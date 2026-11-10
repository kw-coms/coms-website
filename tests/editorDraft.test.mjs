import assert from 'node:assert/strict'
import { MAX_DRAFT_CHARS, draftFieldsEqual, draftStorageKey, normalizeDraftContent, readDraft, removeDraft, writeDraft } from '../src/utils/editorDraft.ts'

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
assert.deepEqual(readDraft('k', s), { ...fields, savedAt: 123 })
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
console.log('editorDraft ok')
