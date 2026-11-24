import './setupDom.mjs'
import assert from 'node:assert/strict'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthContext } from '../src/contexts/useAuth.ts'

const { default: AdminPermissions } = await import('../src/pages/admin/AdminPermissions.tsx')
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const key = 'archive.visibility'
const member = { studentId: '2026000001', name: '회원', role: 'USER' }
const admin = { studentId: '2026000002', name: '회장', role: 'ADMIN' }
const matrix = {
  roles: ['ASSOCIATE', 'USER', 'OFFICER', 'VICE_PRESIDENT'],
  permissions: [{ key, label: '공개 범위', description: '자료 공개 범위 변경' }],
  allowed: { ASSOCIATE: [], USER: [], OFFICER: [], VICE_PRESIDENT: [key] },
}
const overrides = new Map([[member.studentId, { [key]: 'REVOKE' }]])
const writes = []
let permissionRefreshes = 0
globalThis.fetch = async (url, options = {}) => {
  const path = String(url)
  if (path === '/api/admin/permissions') {
    if (options.method === 'PUT') matrix.allowed = JSON.parse(options.body).allowed
    return Response.json(matrix)
  }
  if (path === '/api/admin/permissions/overrides') return Response.json(
    Object.keys(overrides.get(member.studentId) || {}).length
      ? [{ ...member, overrides: overrides.get(member.studentId) }] : []
  )
  if (path.startsWith('/api/admin/permissions/overrides/')) {
    const studentId = decodeURIComponent(path.split('/').at(-1))
    const person = studentId === admin.studentId ? admin : member
    if (options.method === 'PUT') {
      const body = JSON.parse(options.body)
      writes.push({ studentId, body })
      overrides.set(studentId, body.overrides)
    }
    return Response.json({ ...person, rolePermissions: person.role === 'ADMIN' ? [key] : [],
      overrides: overrides.get(studentId) || {}, permissions: [] })
  }
  if (path.startsWith('/api/admin/permissions/members?query=')) return Response.json([admin])
  throw new Error(`Unexpected request: ${path}`)
}

const host = document.createElement('div')
document.body.append(host)
const root = createRoot(host)
async function flush() {
  await act(async () => { await new Promise(setImmediate) })
}
await act(async () => { root.render(h(AuthContext.Provider, { value: { refreshPermissions: () => { permissionRefreshes++ } } }, h(AdminPermissions))) })
await flush()
const memberButton = [...host.querySelectorAll('button')].find((button) => button.textContent.includes(member.studentId))
assert.ok(memberButton, 'member with an override is listed')
await act(async () => { memberButton.click() })
await flush()
const effect = host.querySelector(`select[aria-label="${member.name} 공개 범위 개인 설정"]`)
assert.equal(effect.value, 'REVOKE')
assert.match(host.textContent, /직급 기본: 차단/)
await act(async () => { effect.value = 'GRANT'; effect.dispatchEvent(new window.Event('change', { bubbles: true })) })
const save = [...host.querySelectorAll('button')].find((button) => button.textContent.includes('개인별 권한 저장'))
assert.equal(save.disabled, false)
await act(async () => { save.click() })
await flush()
assert.deepEqual(writes, [{ studentId: member.studentId, body: { overrides: { [key]: 'GRANT' } } }])
assert.equal(permissionRefreshes, 1)
assert.equal(effect.value, 'GRANT')
await act(async () => { effect.value = ''; effect.dispatchEvent(new window.Event('change', { bubbles: true })) })
await act(async () => { save.click() })
await flush()
assert.deepEqual(writes[1], { studentId: member.studentId, body: { overrides: {} } }, '기본 removes the override')
assert.equal(permissionRefreshes, 2)

// Saving role defaults updates the selected member's baseline without losing their draft.
await act(async () => { effect.value = 'REVOKE'; effect.dispatchEvent(new window.Event('change', { bubbles: true })) })
const roleToggle = host.querySelector('input[aria-label="회원 — 공개 범위"]')
await act(async () => { roleToggle.click() })
const saveRoles = [...host.querySelectorAll('button')].find(button => button.textContent === '저장')
await act(async () => { saveRoles.click() })
await flush()
assert.match(host.textContent, /직급 기본: 허용/)
assert.equal(effect.value, 'REVOKE', 'an unsaved member override survives a role-matrix save')
assert.equal(save.disabled, false)

const search = host.querySelector('input[aria-label="개인별 권한 회원 검색"]')
await act(async () => {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(search, admin.studentId)
  search.dispatchEvent(new window.Event('input', { bubbles: true }))
})
await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)) })
const adminButton = [...host.querySelectorAll('button')].find((button) => button.textContent.includes(admin.studentId))
assert.ok(adminButton)
await act(async () => { adminButton.click() })
await flush()
assert.equal(host.querySelector(`select[aria-label="${admin.name} 공개 범위 개인 설정"]`).disabled, true)
assert.equal([...host.querySelectorAll('button')].find((button) => button.textContent.includes('개인별 권한 저장')).disabled, true)
assert.equal(writes.length, 2, 'ADMIN override cannot be submitted from UI')
await act(async () => { root.unmount() })
host.remove()
console.log('admin member permissions passed')
