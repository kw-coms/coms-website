import './setupDom.mjs'
import assert from 'node:assert/strict'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthContext } from '../src/contexts/useAuth.ts'
import { usePermissions } from '../src/contexts/usePermissions.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const container = document.createElement('div')
const root = createRoot(container)
let observed
function Probe() {
  observed = usePermissions()
  return null
}
async function render(value) {
  await act(async () => root.render(h(AuthContext.Provider, { value }, h(Probe))))
}

// Pending, failed and explicitly revoked permissions never inherit an officer's role defaults.
for (const permissions of [null, []]) {
  await render({ user: { role: 'VICE_PRESIDENT' }, permissions, permissionsSettled: true })
  assert.equal(observed.can('archive.delete'), false)
  assert.equal(observed.permissions.size, 0)
  assert.equal(observed.settled, true)
}
await render({ user: { role: 'USER' }, permissions: null, permissionsSettled: false })
assert.equal(observed.loaded, false)
assert.equal(observed.settled, false)
await render({ user: { role: 'USER' }, permissions: ['archive.delete'], permissionsSettled: true })
assert.equal(observed.can('archive.delete'), true)
assert.equal(observed.can('archive.author_change'), false)
await act(async () => root.unmount())
console.log('usePermissions fail-closed contract passed')
