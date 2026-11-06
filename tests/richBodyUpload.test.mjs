import assert from 'node:assert/strict'
import { uploadPendingRichBlocks } from '../src/components/richEditor/uploadPendingRichBlocks.ts'

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
