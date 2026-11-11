import './setupDom.mjs'
import assert from 'node:assert/strict'
import { test } from 'node:test'

Object.defineProperty(globalThis, 'localStorage', { value: window.localStorage, configurable: true })
const first = await import('../src/utils/memberSession.ts?first-tab')
const second = await import('../src/utils/memberSession.ts?second-tab')
const writer = await import('../src/utils/memberSession.ts')
const { writeDraft, draftStorageKey } = await import('../src/utils/editorDraft.ts')
const { saveNoticeReadState, noticeReadKey } = await import('../src/utils/noticeReads.ts')

test('logout generation fences a remote tab before storage events and latches until fresh login', () => {
  first.setMemberSessionOwner('a')
  second.setMemberSessionOwner('a')
  const epoch = first.memberSessionEpoch()
  assert.equal(first.canWriteMember('a', epoch), true)
  second.beginMemberLogout()
  assert.equal(first.canWriteMember('a', epoch), false, 'direct shared-generation read precedes event delivery')
  second.cancelMemberLogout()
  first.setMemberSessionOwner('a')
  assert.equal(first.canWriteMember('a'), false, 'ordinary user refresh cannot revive an invalidated tab')
  first.setMemberSessionOwner(null)
  first.setMemberSessionOwner('a')
  assert.equal(first.canWriteMember('a'), false, 'clearing auth state cannot remove the remote-logout latch')
  first.setMemberSessionOwner('a', true)
  assert.equal(first.canWriteMember('a'), true, 'explicit login starts a fresh tab session')
  assert.equal(first.canWriteMember('a', epoch), false, 'old editor lifetime remains fenced')
})

test('remote owner changes fence the previous member even when the owner later changes back', () => {
  first.setMemberSessionOwner('a', true)
  second.setMemberSessionOwner('b', true)
  second.setMemberSessionOwner('a', true)
  assert.equal(first.canWriteMember('a'), false, 'owner generation records transitions, not just current member id')
})

test('draft writes re-check shared logout generation immediately before storage mutation', async () => {
  writer.setMemberSessionOwner('draft-boundary', true)
  const peer = await import('../src/utils/memberSession.ts?draft-boundary-peer')
  peer.setMemberSessionOwner('draft-boundary')
  const key = draftStorageKey('draft-boundary', 'post', null)
  const fields = { title: 'draft', content: '', category: 'GENERAL', anonymousName: '', toJSON() {
    peer.beginMemberLogout()
    return { title: this.title, content: this.content }
  } }
  assert.equal(writeDraft(key, fields), false)
  assert.equal(localStorage.getItem(key), null)
})

test('notice read marks re-check shared logout generation immediately before storage mutation', async () => {
  writer.setMemberSessionOwner('read-boundary', true)
  const peer = await import('../src/utils/memberSession.ts?read-boundary-peer')
  peer.setMemberSessionOwner('read-boundary')
  const state = { seenAt: 1, lastVisit: 2, readIds: [], toJSON() {
    peer.beginMemberLogout()
    return { seenAt: this.seenAt, lastVisit: this.lastVisit, readIds: this.readIds }
  } }
  saveNoticeReadState('read-boundary', state)
  assert.equal(localStorage.getItem(noticeReadKey('read-boundary')), null)
})

test('logout cannot clear member data when its shared invalidation could not be published', () => {
  writer.setMemberSessionOwner('quota-member', true)
  const shared = localStorage
  const generation = shared.getItem('kwcoms-member-logout:v1:quota-member')
  Object.defineProperty(globalThis, 'localStorage', { value: {
    getItem: (key) => shared.getItem(key),
    setItem() { throw new Error('quota or storage denied') },
  }, configurable: true })
  try {
    assert.equal(writer.beginMemberLogout(), false, 'no logout or cleanup may follow failed publication')
    assert.equal(writer.canWriteMember('quota-member'), true, 'failed preparation retains the authenticated session')
    assert.equal(shared.getItem('kwcoms-member-logout:v1:quota-member'), generation)
  } finally {
    writer.cancelMemberLogout()
    Object.defineProperty(globalThis, 'localStorage', { value: shared, configurable: true })
  }
})

test('session establishment cannot adopt an interleaved different-member owner generation', async () => {
  const establishing = await import('../src/utils/memberSession.ts?establishing-tab')
  const peer = await import('../src/utils/memberSession.ts?interleaved-owner-tab')
  const shared = localStorage
  Object.defineProperty(globalThis, 'localStorage', { value: {
    getItem: (key) => shared.getItem(key),
    setItem(key, value) {
      shared.setItem(key, value)
      if (key === 'kwcoms-member-owner:v1' && JSON.parse(value).owner === 'race-a') peer.setMemberSessionOwner('race-b', true)
    },
  }, configurable: true })
  try {
    establishing.setMemberSessionOwner('race-a')
    assert.equal(establishing.canWriteMember('race-a'), false)
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { value: shared, configurable: true })
  }
})

test('a reloaded tab still requires fresh login after missing a remote logout event', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const tab = () => {
    const values = new Map()
    return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  }
  const firstStorage = tab()
  const secondStorage = tab()
  try {
    Object.defineProperty(globalThis, 'sessionStorage', { value: firstStorage, configurable: true })
    const beforeReload = await import('../src/utils/memberSession.ts?before-reload-tab')
    beforeReload.setMemberSessionOwner('reload-member')
    Object.defineProperty(globalThis, 'sessionStorage', { value: secondStorage, configurable: true })
    const peer = await import('../src/utils/memberSession.ts?reload-peer')
    peer.setMemberSessionOwner('reload-member')
    peer.beginMemberLogout()
    Object.defineProperty(globalThis, 'sessionStorage', { value: firstStorage, configurable: true })
    const afterReload = await import('../src/utils/memberSession.ts?after-reload-tab')
    afterReload.setMemberSessionOwner('reload-member')
    assert.equal(afterReload.canWriteMember('reload-member'), false)
    afterReload.setMemberSessionOwner('reload-member', true)
    assert.equal(afterReload.canWriteMember('reload-member'), true)
  } finally {
    if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous)
    else delete globalThis.sessionStorage
  }
})
