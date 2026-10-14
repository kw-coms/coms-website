import assert from 'node:assert/strict'

import { createPost, updateArchiveFile } from '../src/services/archiveApi.ts'
import { createClubActivity } from '../src/services/clubActivityApi.ts'
import { createClubProject } from '../src/services/clubProjectApi.ts'

// The three multipart "create" calls used to run fetch() themselves, outside the shared client:
// an expired access token was never refreshed-and-retried the way request() does it, the
// server's own message was replaced by a fixed "… 중 오류가 발생했습니다.", and a dropped
// connection surfaced as the browser's raw "Failed to fetch".

// Minimal Response stand-in — apiClient only reads ok/status/json()/text().
function response(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body },
    async text() { return JSON.stringify(body) },
  }
}

// Installs a fetch stub and returns the call log it appends to.
function stubFetch(handler) {
  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    const call = { url: String(url), ...options }
    calls.push(call)
    return handler(call.url)
  }
  return calls
}

const isRefresh = (call) => call.url.endsWith('/api/auth/refresh')

const uploads = [
  {
    name: 'createPost',
    path: '/api/files',
    send: () => createPost({ title: '세미나 자료', file: new File(['slides'], 'slides.pdf', { type: 'application/pdf' }) }),
    title: '세미나 자료',
  },
  {
    name: 'createClubActivity',
    path: '/api/club-activities',
    send: () => createClubActivity({ kind: 'ACTIVITY', title: '정기 세미나', eventDate: '2026-10-11' }),
    title: '정기 세미나',
  },
  {
    name: 'createClubProject',
    path: '/api/club-projects',
    send: () => createClubProject({ category: 'WEB', title: '동아리 홈페이지' }),
    title: '동아리 홈페이지',
  },
]

for (const upload of uploads) {
  // ─── 1. Expired access token: refresh once, then send the same body again ───
  //        (the backend answers a missing/expired token with 403, see apiClient)
  {
    let refreshed = false
    const calls = stubFetch(async (url) => {
      if (url.endsWith('/api/auth/refresh')) {
        refreshed = true
        return response(204)
      }
      return refreshed ? response(200, { id: 1 }) : response(403, { error: 'Forbidden' })
    })

    assert.deepEqual(await upload.send(), { id: 1 }, `${upload.name} resolves with the saved record after the refresh`)

    assert.equal(calls.filter(isRefresh).length, 1, `${upload.name} refreshes exactly once`)
    const posts = calls.filter((call) => call.url.endsWith(upload.path))
    assert.equal(posts.length, 2, `${upload.name}: the first attempt and one retry`)
    for (const post of posts) {
      assert.equal(post.method, 'POST')
      assert.equal(post.credentials, 'include', 'the session cookie must travel with the upload')
      assert.ok(post.body instanceof FormData, 'the body stays multipart')
      assert.equal(post.body.get('title'), upload.title)
      // No Content-Type of our own: the browser has to write the multipart boundary.
      assert.equal(post.headers, undefined)
    }
  }

  // ─── 2. The server's message for the member is no longer overwritten ───────
  {
    stubFetch(async () => response(400, { message: '허용되지 않는 파일 형식입니다.' }))
    await assert.rejects(upload.send, (error) => {
      assert.equal(error.status, 400)
      assert.equal(error.message, '허용되지 않는 파일 형식입니다.')
      return true
    }, `${upload.name} surfaces the server's Korean message`)
  }

  // ─── 3. A dropped connection reads as one, in Korean ───────────────────────
  {
    stubFetch(async () => { throw new TypeError('Failed to fetch') })
    await assert.rejects(upload.send, /서버에 연결하지 못했습니다/, `${upload.name} normalises network failures`)
  }
}

// A multi-file archive is one multipart request and one post, with an unchanged title.
{
  const files = ['first.pdf', 'second.pdf'].map(name => new File(['contents'], name))
  const calls = stubFetch(async () => response(200, { id: 42, title: '2026 대물1 중간 족보' }))
  const saved = await createPost({ title: '2026 대물1 중간 족보', description: '참고 자료', category: 'GENERAL', files })
  assert.equal(saved.id, 42)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].body.get('title'), '2026 대물1 중간 족보')
  assert.equal(calls[0].body.get('description'), '참고 자료')
  assert.equal(calls[0].body.get('category'), 'GENERAL')
  assert.deepEqual(calls[0].body.getAll('files').map(file => file.name), ['first.pdf', 'second.pdf'])
  assert.equal(calls[0].body.has('file'), false)
}

// A rejected group is returned as one error, without creating individual fallback posts.
{
  const files = ['first.pdf', 'second.pdf'].map(name => new File(['contents'], name))
  const calls = stubFetch(async () => response(400, { message: '파일 내용이 확장자와 일치하지 않습니다.' }))
  await assert.rejects(() => createPost({ title: '세미나 자료', files }), /파일 내용이 확장자/)
  assert.equal(calls.length, 1)
}

// Metadata edits preserve attachments; replacing the set sends every selected file.
{
  const calls = stubFetch(async () => response(200, { id: 42 }))
  const meta = { title: '수정된 제목', description: '설명', category: 'ACADEMIC_JOURNAL' }
  await updateArchiveFile(42, meta)
  assert.equal(calls[0].body.has('file'), false)
  assert.equal(calls[0].body.has('files'), false)

  const files = ['replacement.pdf', 'appendix.pdf'].map(name => new File(['contents'], name))
  await updateArchiveFile(42, { ...meta, files })
  assert.equal(calls[1].method, 'PUT')
  assert.deepEqual(calls[1].body.getAll('files').map(file => file.name), ['replacement.pdf', 'appendix.pdf'])
  assert.equal(calls[1].body.has('file'), false)
}

console.log('api client upload contract passed')
