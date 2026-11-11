import assert from 'node:assert/strict'
import {
  getClubProject,
  setClubProjectLike,
  listClubProjectComments,
  createClubProjectComment,
  updateClubProjectComment,
  deleteClubProjectComment,
} from '../src/services/clubProjectApi.ts'

const calls = []
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), ...options })
  if (options.method === 'DELETE') return new Response(null, { status: 204 })
  return Response.json({ ok: true })
}

assert.deepEqual(await getClubProject(7), { ok: true })
assert.deepEqual(await setClubProjectLike(7, true), { ok: true })
assert.deepEqual(await setClubProjectLike(7, false), { ok: true })
assert.deepEqual(await listClubProjectComments(7), { ok: true })
assert.deepEqual(await createClubProjectComment(7, { content: '답글', parentCommentId: 9 }), { ok: true })
assert.deepEqual(await updateClubProjectComment(7, 9, { content: '수정한 댓글' }), { ok: true })
await deleteClubProjectComment(7, 9)

assert.deepEqual(calls.map(({ url, method = 'GET' }) => [url, method]), [
  ['/api/club-projects/7', 'GET'],
  ['/api/club-projects/7/like', 'PUT'],
  ['/api/club-projects/7/like', 'PUT'],
  ['/api/club-projects/7/comments', 'GET'],
  ['/api/club-projects/7/comments', 'POST'],
  ['/api/club-projects/7/comments/9', 'PATCH'],
  ['/api/club-projects/7/comments/9', 'DELETE'],
])
assert.ok(calls.every((call) => call.credentials === 'include'), 'all requests use the shared credentialed client')
assert.deepEqual(JSON.parse(calls[1].body), { liked: true })
assert.deepEqual(JSON.parse(calls[2].body), { liked: false })
assert.deepEqual(JSON.parse(calls[4].body), { content: '답글', parentCommentId: 9 })
assert.deepEqual(JSON.parse(calls[5].body), { content: '수정한 댓글' })

console.log('works social API tests passed')
