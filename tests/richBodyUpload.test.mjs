import assert from 'node:assert/strict'
import { resetRejectedRichBlocks, uploadPendingRichBlocks } from '../src/components/richEditor/uploadPendingRichBlocks.ts'
import { request } from '../src/services/apiClient.ts'

const originalFetch = globalThis.fetch
const files = [new File(['a'], 'a.pdf', { type: 'application/pdf' }), new File(['b'], 'b.pdf', { type: 'application/pdf' })]
const blocks = files.map((file, index) => ({ type: 'file', id: `f${index}`, status: 'pending', file, name: file.name }))
let calls = 0
const paths = []
globalThis.fetch = async (url, init) => {
  paths.push(url)
  assert.equal(init.credentials, 'include')
  assert.equal(init.body.get('file') instanceof File, true)
  calls++
  if (calls === 2) return new Response('{}', { status: 500 })
  return Response.json({ id: calls + 40, kind: 'FILE', name: 'file', size: 1 })
}
try {
  await assert.rejects(
    uploadPendingRichBlocks(blocks, 'notice', (id, patch) => Object.assign(blocks.find((b) => b.id === id), patch)),
    /업로드에 실패했습니다/,
  )
  assert.equal(blocks[0].fileId, 41)
  assert.equal(blocks[0].status, 'saved')
  const retried = await uploadPendingRichBlocks(blocks, 'notice')
  assert.equal(retried[0].fileId, 41)
  assert.equal(retried[1].fileId, 43)
  assert.equal(calls, 3)
  assert.deepEqual(paths, ['/api/rich-media/notice/files', '/api/rich-media/notice/files', '/api/rich-media/notice/files'])
} finally {
  globalThis.fetch = originalFetch
}
console.log('rich body upload retry contract passed')

const rejected = { status: 400, serverMessage: '첨부할 수 없는 파일이 포함되어 있습니다. 다시 올려 주세요.' }
const retryBlocks = [
  { type: 'file', id: 'new', status: 'saved', file: files[0], fileId: 91 },
  { type: 'file', id: 'existing', status: 'saved', fileId: 12 },
  { type: 'image', id: 'image', status: 'saved', file: files[0], mediaId: 93 },
  { type: 'video', id: 'video', status: 'saved', file: files[1], mediaId: 94 },
]
const patches = []
resetRejectedRichBlocks(retryBlocks, { status: 500, serverMessage: rejected.serverMessage })
assert.equal(retryBlocks[0].fileId, 91)
resetRejectedRichBlocks(retryBlocks, { status: 400, serverMessage: '다른 입력 오류' })
assert.equal(retryBlocks[0].fileId, 91)
globalThis.fetch = async () => Response.json({ message: rejected.serverMessage }, { status: 400 })
try {
  await assert.rejects(request('/api/notices', { method: 'POST', body: '{}' }), (error) => {
    assert.equal(error.status, 400)
    assert.equal(error.serverMessage, rejected.serverMessage)
    assert.equal(error.message, rejected.serverMessage)
    resetRejectedRichBlocks(retryBlocks, error, (id, patch) => patches.push({ id, patch }))
    return true
  })
} finally {
  globalThis.fetch = originalFetch
}
assert.equal(retryBlocks[0].status, 'pending')
assert.equal(retryBlocks[0].fileId, null)
assert.equal(retryBlocks[1].fileId, 12)
assert.equal(retryBlocks[2].mediaId, null)
assert.equal(retryBlocks[3].mediaId, null)
assert.deepEqual(patches, [
  { id: 'new', patch: { status: 'pending', fileId: null } },
  { id: 'image', patch: { status: 'pending', mediaId: null } },
  { id: 'video', patch: { status: 'pending', mediaId: null } },
])
let retryCalls = 0
globalThis.fetch = async () => {
  retryCalls++
  return Response.json({ id: 92, kind: 'FILE', name: 'a.pdf', size: 1 })
}
try {
  const next = await uploadPendingRichBlocks(retryBlocks.slice(0, 2), 'notice')
  assert.equal(next[0].fileId, 92)
  assert.equal(next[1].fileId, 12)
  assert.equal(retryCalls, 1)
} finally {
  globalThis.fetch = originalFetch
}
console.log('rich body attachment rejection retry contract passed')
