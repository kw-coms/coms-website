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
const { default: AdminRoster } = await import('../src/pages/admin/AdminRoster.tsx')

let roster = [{
  id: 17, name: 'Fictional Member', studentId: '', email: '', phone: '00000000000',
  suggestedMemberId: 27, suggestedStudentId: '2026999999', suggestedEmail: 'suggested@example.invalid',
}]
const requests = []
globalThis.fetch = async (url, init = {}) => {
  const path = String(url)
  if (path === '/api/admin/members') return Response.json([])
  if (path === '/api/admin/eligible-members') return Response.json(roster)
  if (path === '/api/admin/roster/17/apply-suggestion') {
    requests.push({ method: init.method, body: JSON.parse(init.body) })
    roster = [{ ...roster[0], studentId: '2026999999', email: 'suggested@example.invalid', suggestedMemberId: null, suggestedStudentId: null, suggestedEmail: null }]
    return new Response(null, { status: 204 })
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

await act(async () => { root.render(createElement(QueryClientProvider, { client }, createElement(AdminRoster))) })
await flush()
const row = container.querySelector('tbody tr')
assert.ok(row, 'suggested roster row renders')
assert.equal(row.querySelector('[data-label="학번"]').textContent.trim(), '-', 'suggestion does not fill roster student number')
assert.equal(row.querySelector('[data-label="이메일"]').textContent.trim(), '-', 'suggestion does not fill roster email')
assert.match(row.querySelector('[role="note"][aria-label="추정 · 확인 필요"]').textContent, /2026999999.*suggested@example\.invalid/s)
assert.match(row.textContent, /본인 확인 후 적용하세요/)

const apply = [...row.querySelectorAll('button')].find((button) => button.textContent.trim() === '적용')
await act(async () => { apply.click() })
await flush()
assert.deepEqual(requests, [{ method: 'POST', body: { memberId: 27 } }])
assert.match(row.querySelector('[data-label="학번"]').textContent, /2026999999/)
assert.match(row.querySelector('[data-label="이메일"]').textContent, /suggested@example\.invalid/)
assert.equal(row.querySelector('[aria-label="추정 · 확인 필요"]'), null, 'suggestion disappears after apply')

await act(async () => { root.unmount() })
container.remove()
client.clear()
console.log('admin roster suggestion contract passed')
