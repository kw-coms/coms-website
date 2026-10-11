// setupDom MUST come first: react-dom/client needs window/document on globalThis.
import './setupDom.mjs'
import assert from 'node:assert/strict'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from '../src/contexts/useAuth.ts'
import { PERMISSIONS_WAIT_MS, RequireAdmin } from '../src/routes/guards.tsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ADMIN_PANEL = '운영 패널 본문'

// Mounts /admin behind RequireAdmin with a hand-built auth context value, the way a hard
// reload of the URL does. `permissions: null` is "the server has not answered yet".
async function mountAdminRoute(auth) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const tree = (value) => h(
    MemoryRouter,
    { initialEntries: ['/admin'] },
    h(
      AuthContext.Provider,
      { value: { loading: false, authError: null, permissions: null, ...value } },
      h(
        Routes,
        null,
        h(Route, { path: '/admin', element: h(RequireAdmin, null, h('p', null, ADMIN_PANEL)) }),
        h(Route, { path: '/login', element: h('p', null, 'LOGIN_SCREEN') }),
        h(Route, { path: '/', element: h('p', null, 'HOME_SCREEN') }),
      ),
    ),
  )
  await act(async () => { root.render(tree(auth)) })
  return {
    text: () => container.textContent,
    update: (next) => act(async () => { root.render(tree(next)) }),
    unmount: () => act(async () => { root.unmount(); container.remove() }),
  }
}

const member = { studentId: '2024123456', name: '회원', role: 'USER' }
const officer = { studentId: '2023123456', name: '임원', role: 'OFFICER' }

// Auth still resolving: neither redirect nor panel.
{
  const page = await mountAdminRoute({ user: null, loading: true })
  assert.match(page.text(), /로그인 상태를 확인하는 중/)
  await page.unmount()
}

// Logged out: straight to the login screen, without waiting on permissions that will never load.
{
  const page = await mountAdminRoute({ user: null })
  assert.equal(page.text(), 'LOGIN_SCREEN')
  await page.unmount()
}

// A role the defaults already admit gets in before /api/permissions/me answers.
{
  const page = await mountAdminRoute({ user: officer })
  assert.equal(page.text(), ADMIN_PANEL)
  await page.unmount()
}

// The regression: a 회원 the 회장 granted archive.manage in the matrix. The role defaults deny
// the panel, so the guard must hold the verdict until the real permissions arrive instead of
// redirecting home on the optimistic defaults.
{
  const page = await mountAdminRoute({ user: member })
  assert.match(page.text(), /권한을 확인하는 중/)
  await page.update({ user: member, permissions: ['club_room.view', 'archive.manage'] })
  assert.equal(page.text(), ADMIN_PANEL)
  await page.unmount()
}

// Same wait, but the server confirms the member has no operations permission: redirect home.
{
  const page = await mountAdminRoute({ user: member })
  assert.match(page.text(), /권한을 확인하는 중/)
  await page.update({ user: member, permissions: ['club_room.view', 'community.anonymous_board'] })
  assert.equal(page.text(), 'HOME_SCREEN')
  await page.unmount()
}

// Permissions already loaded and every operations permission revoked from the role.
{
  const page = await mountAdminRoute({ user: officer, permissions: ['club_room.view'] })
  assert.equal(page.text(), 'HOME_SCREEN')
  await page.unmount()
}

// /api/permissions/me failed: the context reports the request as settled with no answer. There
// is nothing left to wait for, so the guard decides on the role defaults straight away.
{
  const denied = await mountAdminRoute({ user: member, permissions: null, permissionsSettled: true })
  assert.equal(denied.text(), 'HOME_SCREEN')
  await denied.unmount()
  const admitted = await mountAdminRoute({ user: officer, permissions: null, permissionsSettled: true })
  assert.equal(admitted.text(), ADMIN_PANEL)
  await admitted.unmount()
}

// /api/permissions/me never answers at all: the wait is bounded, and the guard then falls back
// to the role defaults rather than hanging. The wait is the only timer of that length, so
// capture it instead of sleeping through it.
{
  const realSetTimeout = globalThis.setTimeout
  let expireWait = null
  globalThis.setTimeout = (callback, delay, ...args) => {
    if (delay !== PERMISSIONS_WAIT_MS) return realSetTimeout(callback, delay, ...args)
    expireWait = callback
    return 0
  }
  try {
    const page = await mountAdminRoute({ user: member })
    assert.match(page.text(), /권한을 확인하는 중/)
    assert.equal(typeof expireWait, 'function')
    await act(async () => { expireWait() })
    assert.equal(page.text(), 'HOME_SCREEN')
    await page.unmount()
  } finally {
    globalThis.setTimeout = realSetTimeout
  }
}

console.log('admin route guard contract passed')
