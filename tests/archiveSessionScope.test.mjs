import './setupDom.mjs'
import assert from 'node:assert/strict'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../src/contexts/useAuth.ts'
import Archive from '../src/pages/Archive.tsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} })
const pending = []
globalThis.fetch = async (url) => {
  assert.equal(String(url), '/api/files')
  return new Promise(resolve => pending.push(rows => resolve(Response.json(rows))))
}
const host = document.createElement('div')
document.body.append(host)
const root = createRoot(host)
const member = studentId => ({ studentId, role: 'USER' })
const file = title => ({ id: 1, title, originalName: 'private.txt', uploadedBy: 'first', visibility: 'SELECTED', uploadedAt: '2026-11-24T00:00:00' })
const render = async user => act(async () => root.render(h(MemoryRouter, { initialEntries: ['/resources'] },
  h(AuthContext.Provider, { value: { user, loading: false, permissions: [], permissionsSettled: true } },
    h(Archive, { onBack() {} })))))
const complete = async (resolve, rows) => act(async () => { resolve(rows); await new Promise(setImmediate) })

await render(member('first'))
await complete(pending.shift(), [file('첫 계정 비공개 자료')])
assert.match(host.textContent, /첫 계정 비공개 자료/)
await render(null)
assert.doesNotMatch(host.textContent, /첫 계정 비공개 자료/, 'logout removes private metadata before the public request completes')
await complete(pending.shift(), [])

await render(member('first'))
const stale = pending.shift()
await render(member('second'))
const current = pending.shift()
await complete(stale, [file('늦게 도착한 이전 계정 자료')])
assert.doesNotMatch(host.textContent, /늦게 도착한 이전 계정 자료/)
await complete(current, [file('현재 계정 자료')])
assert.match(host.textContent, /현재 계정 자료/)
assert.doesNotMatch(host.textContent, /늦게 도착한 이전 계정 자료/)
await act(async () => root.unmount())
host.remove()
console.log('archive account scope and stale response regression passed')
