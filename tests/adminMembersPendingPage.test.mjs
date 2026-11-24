import './setupDom.mjs'
import assert from 'node:assert/strict'
import * as nodeModule from 'node:module'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
nodeModule.registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier.endsWith('.css')
      ? { url: 'data:text/javascript,export {}', shortCircuit: true }
      : nextResolve(specifier, context)
  },
})
const { default: AdminMembers } = await import('../src/pages/admin/AdminMembers.tsx')

const member = { id: 1, studentId: '2026000001', name: '김가람', role: 'USER', generation: '60' }
let finishNextPage
globalThis.fetch = async (url) => {
  const path = String(url)
  if (path === '/api/admin/eligible-members') return Response.json([])
  if (path.includes('/api/admin/members?page=0')) {
    return Response.json([member], { headers: { 'X-Total-Count': '31' } })
  }
  if (path.includes('/api/admin/members?page=1')) {
    return new Promise((resolve) => { finishNextPage = resolve })
  }
  throw new Error(`Unexpected request: ${path}`)
}

const container = document.createElement('div')
document.body.appendChild(container)
const root = createRoot(container)
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const flush = async () => {
  for (let turn = 0; turn < 5; turn += 1) {
    await act(async () => { await new Promise((resolve) => setImmediate(resolve)) })
  }
}
const button = (name) => [...container.querySelectorAll('button')].find((node) => node.textContent.trim() === name)
const rowEdit = () => container.querySelector('select[aria-label="김가람 역할 변경"]')

await act(async () => {
  root.render(createElement(QueryClientProvider, { client }, createElement(AdminMembers, { currentUser: { studentId: '2026000099' } })))
})
await flush()
assert.ok(rowEdit(), 'first page row renders')
assert.equal(button('현재 페이지 CSV 내보내기').disabled, false)

await act(async () => { button('다음').click() })
await flush()
assert.equal(typeof finishNextPage, 'function', 'next page remains in flight')
assert.equal(button('현재 페이지 CSV 내보내기').disabled, true)
assert.equal(rowEdit().disabled, true)
for (const name of ['기수 변경', '비번 초기화', '삭제']) assert.equal(button(name).disabled, true)

await act(async () => {
  finishNextPage(Response.json([{ ...member, id: 2, name: '박나래' }], { headers: { 'X-Total-Count': '31' } }))
})
await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)) })
assert.equal(button('현재 페이지 CSV 내보내기').disabled, false)
assert.equal(container.querySelector('select[aria-label="박나래 역할 변경"]').disabled, false)
await act(async () => { root.unmount() })
container.remove()
client.clear()
console.log('admin members pending page controls passed')
