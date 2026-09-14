import assert from 'node:assert/strict'

import { createMember } from '../src/services/adminApi.ts'

const requests = []
const originalFetch = globalThis.fetch

globalThis.fetch = async (url, options = {}) => {
  requests.push({
    url: String(url),
    method: options.method || 'GET',
    body: options.body ? JSON.parse(options.body) : null,
    credentials: options.credentials,
    headers: options.headers,
  })
  return new Response(JSON.stringify({
    id: 77,
    studentId: '2026123456',
    name: '신규회원',
    email: 'new-member@example.com',
    generation: 60,
    role: 'USER',
    emailVerified: true,
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

try {
  const created = await createMember({
    studentId: '2026123456',
    name: '신규회원',
    email: 'new-member@example.com',
    password: 'temp1',
    passwordConfirm: 'temp1',
    generation: '60',
    role: 'USER',
    department: '',
    phone: '',
    emailVerified: false,
  })

  assert.equal(created.emailVerified, true)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, '/api/admin/members')
  assert.equal(requests[0].method, 'POST')
  assert.equal(requests[0].credentials, 'include')
  assert.deepEqual(requests[0].body, {
    studentId: '2026123456',
    name: '신규회원',
    email: 'new-member@example.com',
    password: 'temp1',
    generation: '60',
    role: 'USER',
  })
  assert.equal(Object.hasOwn(requests[0].body, 'passwordConfirm'), false)
  assert.equal(Object.hasOwn(requests[0].body, 'emailVerified'), false)
  assert.equal(Object.hasOwn(requests[0].body, 'department'), false)
  assert.equal(Object.hasOwn(requests[0].body, 'phone'), false)
} finally {
  globalThis.fetch = originalFetch
}

console.log('preverified signup admin member contract passed')
