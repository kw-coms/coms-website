import './setupDom.mjs'
import assert from 'node:assert/strict'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthContext } from '../src/contexts/useAuth.ts'
import AdminFiles from '../src/pages/admin/AdminFiles.tsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} })
let rows = []
globalThis.fetch = async url => Response.json(String(url).includes('visibility-members') ? [] : rows)
const host = document.createElement('div')
document.body.append(host)
const root = createRoot(host)

for (const visibility of ['PUBLIC', 'MEMBERS', 'OFFICERS', 'SELECTED', 'GROUP']) {
  for (const granted of [false, true]) {
    rows = [{ id: 1, title: '내 자료', originalName: 'own.txt', uploadedBy: 'owner', visibility, selectedStudentIds: [], uploadedAt: '2026-11-24T00:00:00' }]
    const mayChange = visibility !== 'GROUP' && (granted || visibility === 'PUBLIC' || visibility === 'MEMBERS')
    await act(async () => {
      root.render(h(AuthContext.Provider, { value: {
        user: { studentId: 'owner', role: 'USER' }, loading: false,
        permissions: granted ? ['archive.visibility'] : [], permissionsSettled: true,
      } }, h(AdminFiles, { key: `${visibility}:${granted}` })))
      await new Promise(setImmediate)
    })
    assert.equal(!!host.querySelector('select[aria-label="내 자료 공개 범위"]'), mayChange,
      `admin visibility control: ${visibility}, grant=${granted}`)
    await act(async () => {
      [...host.querySelectorAll('button')].find(button => button.textContent === '수정').click()
      await new Promise(setImmediate)
    })
    const publicChoice = host.querySelector('input[type="radio"][value="PUBLIC"]')
    assert.ok(publicChoice, 'the owner can still open the metadata editor')
    assert.equal(publicChoice.disabled, !mayChange,
      `form visibility control: ${visibility}, grant=${granted}`)
    assert.equal(!!host.querySelector('input[type="radio"][value="GROUP"]'), visibility === 'GROUP',
      'only existing study materials display the fixed group audience')
  }
}
await act(async () => root.unmount())
host.remove()
console.log('archive visibility controls respect current restrictions and effective grants')
