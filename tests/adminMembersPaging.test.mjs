import assert from 'node:assert/strict'
import { listMembersPage } from '../src/services/adminApi.ts'

const paths = []
globalThis.fetch = async (url, options) => {
  paths.push(String(url))
  assert.equal(options.credentials, 'include')
  return Response.json([{ id: 2, name: '김나래' }], { headers: { 'X-Total-Count': '42' } })
}

const result = await listMembersPage(1, 30, ' 김 ', 'USER', 'VERIFIED')
assert.deepEqual(result, { members: [{ id: 2, name: '김나래' }], total: 42 })
const url = new URL(paths[0], 'http://localhost')
assert.equal(url.pathname, '/api/admin/members')
assert.deepEqual(Object.fromEntries(url.searchParams), {
  page: '1', size: '30', search: '김', role: 'USER', status: 'VERIFIED',
})

console.log('admin member paging contract passed')
