import assert from 'node:assert/strict'
import { createPost, updateArchiveFile } from '../src/services/archiveApi.ts'

const originalFetch = globalThis.fetch
const requests = []
globalThis.fetch = async (_url, options) => {
  requests.push(options.body)
  return { ok: true, json: async () => ({ id: 1 }) }
}
try {
  const file = new File(['hello'], 'paper.txt', { type: 'text/plain' })
  await createPost({ title: '자료', file, visibility: 'PUBLIC', selectedStudentIds: ['stale'] })
  assert.equal(requests[0].get('visibility'), 'PUBLIC')
  assert.deepEqual(requests[0].getAll('selectedStudentIds'), [], 'stale recipients must not be sent to a public file')
  await createPost({ title: '자료', file, visibility: 'SELECTED', selectedStudentIds: ['member-1', 'member-2'] })
  assert.deepEqual(requests[1].getAll('selectedStudentIds'), ['member-1', 'member-2'])
  await updateArchiveFile(1, { title: '자료', description: '', category: 'GENERAL', visibility: 'MEMBERS', selectedStudentIds: ['stale'] })
  assert.deepEqual(requests[2].getAll('selectedStudentIds'), [], 'editing from SELECTED to MEMBERS drops old recipients')
  await updateArchiveFile(1, { title: '자료', description: '', category: 'GENERAL' })
  assert.equal(requests[3].has('visibility'), false, 'metadata-only edit preserves existing visibility')
} finally {
  globalThis.fetch = originalFetch
}
console.log('archive visibility multipart contract passed')
