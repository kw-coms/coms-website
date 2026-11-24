import './setupDom.mjs'
import assert from 'node:assert/strict'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from '../src/contexts/AuthContext.tsx'
import { useAuth } from '../src/contexts/useAuth.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
window.localStorage.clear()
document.cookie = 'comsSession=; Max-Age=0; Path=/'

const calls = []
globalThis.fetch = async (url) => {
  calls.push(String(url))
  return new Response('{}', { status: 401 })
}

let auth
function Probe() {
  auth = useAuth()
  return null
}

const container = document.createElement('div')
document.body.appendChild(container)
const root = createRoot(container)
await act(async () => { root.render(createElement(AuthProvider, null, createElement(Probe))) })

assert.equal(auth.loading, false)
assert.equal(auth.user, null)
assert.deepEqual(calls, [], 'a guest boot sends neither /me nor /refresh')

await act(async () => { root.unmount() })
console.log('guest auth bootstrap passed')
