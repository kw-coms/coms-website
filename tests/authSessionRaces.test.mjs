import './setupDom.mjs'
import assert from 'node:assert/strict'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from '../src/contexts/AuthContext.tsx'
import { useAuth } from '../src/contexts/useAuth.ts'
import { request } from '../src/services/apiClient.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const oldUser = { id: 1, studentId: '2026000001', name: 'Old', role: 'USER' }
const newUser = { id: 2, studentId: '2026000002', name: 'New', role: 'USER' }
const json = (status, body) => new Response(JSON.stringify(body), { status })
const deferred = () => {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}
let auth
function Probe() {
  auth = useAuth()
  return null
}
async function settle(predicate) {
  for (let attempt = 0; attempt < 30 && !predicate(); attempt++) {
    await act(async () => { await new Promise((resolve) => setImmediate(resolve)) })
  }
  assert.ok(predicate(), 'expected auth state to settle')
}

window.localStorage.clear()
document.cookie = 'comsSession=1; Path=/'
const pendingRefresh = deferred()
let currentUser = oldUser
let refreshStarted = false
globalThis.fetch = async (url) => {
  const path = String(url)
  if (path === '/api/auth/me') return json(200, currentUser)
  if (path === '/api/auth/refresh') { refreshStarted = true; return pendingRefresh.promise }
  if (path === '/api/notices') return json(401, {})
  if (path === '/api/permissions/me') return json(200, { permissions: [] })
  return json(200, {})
}
const firstRoot = createRoot(document.createElement('div'))
await act(async () => { firstRoot.render(createElement(AuthProvider, null, createElement(Probe))) })
await settle(() => !auth.loading && auth.user?.id === oldUser.id)

const oldRequest = request('/api/notices').catch(() => {})
await settle(() => refreshStarted)
currentUser = newUser
await act(async () => { await auth.login(newUser) })
assert.equal(auth.user?.id, newUser.id)
pendingRefresh.resolve(json(401, {}))
await act(async () => { await oldRequest })
assert.equal(auth.user?.id, newUser.id, 'old refresh rejection cannot log out a newer login')
assert.ok(document.cookie.includes('comsSession=1'), 'old refresh rejection cannot erase the new session hint')
await act(async () => { firstRoot.unmount() })

// A different tab can remove the hint after the initial loading state is read but before the effect runs.
window.localStorage.clear()
document.cookie = 'comsSession=1; Path=/'
function RemoveHintDuringRender() {
  document.cookie = 'comsSession=; Max-Age=0; Path=/'
  return createElement(Probe)
}
const secondRoot = createRoot(document.createElement('div'))
await act(async () => { secondRoot.render(createElement(AuthProvider, null, createElement(RemoveHintDuringRender))) })
await settle(() => !auth.loading)
assert.equal(auth.user, null)
await act(async () => { secondRoot.unmount() })

// A current-session 401 still ends authentication, including an explicit retry on the logged-out screen.
document.cookie = 'comsSession=1; Path=/'
globalThis.fetch = async () => json(401, {})
const thirdRoot = createRoot(document.createElement('div'))
await act(async () => { thirdRoot.render(createElement(AuthProvider, null, createElement(Probe))) })
await settle(() => !auth.loading)
document.cookie = 'comsSession=1; Path=/'
await act(async () => { await auth.retryAuth() })
assert.equal(auth.loading, false, 'a rejected current refresh ends retry loading')
assert.equal(auth.user, null)
await act(async () => { thirdRoot.unmount() })

console.log('auth session races passed')
