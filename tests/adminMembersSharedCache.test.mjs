import './setupDom.mjs'
import assert from 'node:assert/strict'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { useAdminMembers } from '../src/pages/admin/useAdminMembers.ts'
import { listMembers } from '../src/services/adminApi.ts'
import { queryKeys } from '../src/services/queryKeys.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const member = { id: 1, studentId: '2026000001', name: '김가람', role: 'USER' }
globalThis.fetch = async (url) => String(url).includes('?page=')
  ? Response.json([member], { headers: { 'X-Total-Count': '2' } })
  : Response.json([member])

function PagedMembers() {
  const result = useAdminMembers({ page: 0, size: 1, search: '', role: 'ALL', status: 'ALL' })
  return createElement('output', null, `${result.members.length}/${result.total}`)
}
function RosterMembers() {
  const result = useAdminMembers()
  return createElement('output', null, String(result.members.length))
}
function PickerMembers() {
  const people = useQuery({ queryKey: queryKeys.admin.members(), queryFn: listMembers })
  return createElement('output', null, String((people.data ?? []).filter((person) => person.studentId === member.studentId).length))
}

const container = document.createElement('div')
document.body.appendChild(container)
const root = createRoot(container)
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
const render = async (component, expected) => {
  await act(async () => { root.render(createElement(QueryClientProvider, { client }, createElement(component))) })
  // Time-based wait: twenty bare ticks were not enough for the mocked fetch to settle on a loaded CI runner.
  for (let turn = 0; turn < 100 && container.textContent !== expected; turn += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
  }
  assert.equal(container.textContent, expected)
}

await render(PagedMembers, '1/2')
assert.equal(client.getQueryData(queryKeys.admin.members()), undefined, 'paged results use their own cache key')
await render(RosterMembers, '1')
assert.ok(Array.isArray(client.getQueryData(queryKeys.admin.members())), 'roster caches the legacy array')
await render(PickerMembers, '1')
await render(RosterMembers, '1')

await act(async () => { root.unmount() })
container.remove()
client.clear()
console.log('admin member shared cache contract passed')
