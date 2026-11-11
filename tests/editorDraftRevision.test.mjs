import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as drafts from '../src/utils/editorDraft.ts'
const { draftIsStale, readDraft, writeDraft } = drafts

const fields = { title: 'R1 draft', category: 'GENERAL', anonymousName: '', content: 'R1 body' }
const r1 = '2026-11-11T09:00:00'
const r2 = '2026-11-11T10:00:00'

test('autosave after R2 retains the R1 base and still conflicts with R2', () => {
  const values = new Map()
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) }
  const now = Date.parse('2026-11-11T11:00:00')
  writeDraft('revision-test', fields, storage, now, undefined, r1)
  writeDraft('revision-test', fields, storage, now + 1500, undefined, r1)
  const draft = readDraft('revision-test', storage, now + 1500)
  assert.equal(draftIsStale(draft, r2), true)
  assert.equal(draft.baseRevision, r1)
  assert.equal(draft.savedAt, now + 1500)
  assert.equal(draftIsStale(draft, r1), false)
})

test('legacy drafts require a choice for an existing item even when saved after it', () => {
  const legacy = { savedAt: Date.parse('2026-11-11T11:00:00') }
  assert.equal(draftIsStale(legacy, r1), true)
  assert.equal(draftIsStale(legacy, null), false, 'new items have no server base to conflict with')
})

test('timestamp-free revisions detect a changed title or body independently of savedAt', () => {
  assert.equal(typeof drafts.draftRevision, 'function')
  const item = { title: 'R1', content: '<p>body</p>' }
  const baseRevision = drafts.draftRevision(item)
  const draft = { baseRevision, savedAt: Date.now() + 100_000 }
  assert.equal(draftIsStale(draft, drafts.draftRevision({ ...item })), false)
  assert.equal(draftIsStale(draft, drafts.draftRevision({ ...item, title: 'R2' })), true)
  assert.equal(draftIsStale(draft, drafts.draftRevision({ ...item, content: '<p>R2</p>' })), true)
  assert.equal(drafts.draftRevision({ ...item, updatedAt: r1 }), r1)
})
