import './setupDom.mjs'
import assert from 'node:assert/strict'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { useEditorDraft } from '../src/hooks/useEditorDraft.ts'
import { clearMemberDrafts, draftStorageKey } from '../src/utils/editorDraft.ts'
import { beginMemberLogout, finishMemberLogout, setMemberSessionOwner } from '../src/utils/memberSession.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(globalThis, 'localStorage', { value: window.localStorage, configurable: true })
const empty = { title: '', category: 'GENERAL', anonymousName: '', content: '' }
const key = draftStorageKey('member', 'post', null)
let fields
function Probe() {
  useEditorDraft({ storageKey: key, baseline: () => empty, current: () => fields, hasPending: () => false })
  return null
}
async function mount() {
  localStorage.clear()
  setMemberSessionOwner('member')
  fields = empty
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(createElement(MemoryRouter, null, createElement(Probe))))
  return async () => {
    await act(async () => root.unmount())
    container.remove()
  }
}
const savedTitle = () => JSON.parse(localStorage.getItem(key) || 'null')?.title

// No input event or autosave tick: teardown must save the latest fields itself.
{
  const unmount = await mount()
  fields = { ...empty, title: 'unmount flush' }
  assert.equal(savedTitle(), undefined)
  await unmount()
  assert.equal(savedTitle(), fields.title)
}

{
  const unmount = await mount()
  fields = { ...empty, title: 'pagehide flush' }
  await act(async () => window.dispatchEvent(new window.Event('pagehide')))
  assert.equal(savedTitle(), fields.title)
  fields = { ...empty, title: 'hidden flush' }
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
  await act(async () => document.dispatchEvent(new window.Event('visibilitychange')))
  assert.equal(savedTitle(), fields.title)
  const event = new window.Event('beforeunload', { cancelable: true })
  await act(async () => window.dispatchEvent(event))
  assert.equal(event.defaultPrevented, true, 'flush recomputes dirty before the browser leave check')
  await unmount()
}

{
  const unmount = await mount()
  fields = { ...empty, title: 'must not return after logout' }
  beginMemberLogout()
  finishMemberLogout()
  clearMemberDrafts('member')
  await unmount()
  assert.equal(savedTitle(), undefined, 'a late cleanup cannot recreate the logged-out member draft')
}
console.log('editorDraftHook lifecycle passed')
