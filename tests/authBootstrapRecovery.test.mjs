import './setupDom.mjs'
import assert from 'node:assert/strict'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from '../src/contexts/AuthContext.tsx'
import { useAuth } from '../src/contexts/useAuth.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.localStorage = window.localStorage
globalThis.sessionStorage = window.sessionStorage

const user = { id: 7, studentId: '2026000001', name: '홍길동', role: 'USER' }
const json = (status, body) => new Response(JSON.stringify(body), { status })
const originalTimeout = AbortSignal.timeout
let auth
localStorage.clear()
sessionStorage.clear()
localStorage.setItem('kwcoms-member-owner:v1', JSON.stringify({ owner: user.studentId, generation: 'legacy' }))

function Probe() {
  auth = useAuth()
  return null
}

async function mount() {
  const root = createRoot(document.createElement('div'))
  await act(async () => { root.render(createElement(AuthProvider, null, createElement(Probe))) })
  return root
}

async function settle(ready) {
  for (let i = 0; i < 30 && !ready(); i += 1) {
    await act(async () => { await new Promise((resolve) => setImmediate(resolve)) })
  }
  assert.ok(ready(), 'auth bootstrap settled')
}

try {
  for (const failure of ['503', 'network', 'timeout']) {
    document.cookie = 'comsSession=1; Path=/'
    if (failure === 'timeout') AbortSignal.timeout = () => AbortSignal.abort()

    let restored = false
    let refreshed = false
    const calls = []
    globalThis.fetch = async (url) => {
      const path = String(url)
      calls.push(path)
      if (path === '/api/auth/me') return restored && refreshed ? json(200, user) : json(401, {})
      if (path === '/api/auth/refresh') {
        if (restored) { refreshed = true; return new Response(null, { status: 204 }) }
        if (failure === '503') return new Response(null, { status: 503 })
        if (failure === 'network') throw new TypeError('Failed to fetch')
        return new Promise(() => {})
      }
      if (path === '/api/permissions/me') return json(200, { permissions: [] })
      return json(200, {})
    }

    const first = await mount()
    await settle(() => !auth.loading)
    assert.equal(auth.user, null, `${failure}: /me was not authenticated during refresh outage`)
    assert.ok(calls.includes('/api/auth/refresh'), `${failure}: refresh was attempted`)
    assert.ok(document.cookie.includes('comsSession=1'), `${failure}: session cookie hint survives`)
    assert.ok(localStorage.getItem('kwcoms-member-owner:v1'), `${failure}: legacy owner hint survives`)
    await act(async () => { first.unmount() })

    AbortSignal.timeout = originalTimeout
    restored = true
    const second = await mount()
    await settle(() => !auth.loading && auth.user?.studentId === user.studentId)
    assert.equal(auth.user.studentId, user.studentId, `${failure}: remount recovers the remembered session`)
    await act(async () => { second.unmount() })
  }
} finally {
  AbortSignal.timeout = originalTimeout
}

console.log('auth bootstrap outage recovery passed')
