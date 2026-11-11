import assert from 'node:assert/strict'
import { uploadClubProjectImages } from '../src/services/clubProjectApi.ts'

const calls = []
globalThis.fetch = async (url, options) => {
  calls.push({ url: String(url), ...options })
  if (String(url).endsWith('/api/auth/refresh')) return new Response(null, { status: 204 })
  if (calls.filter((call) => call.url.endsWith('/images')).length === 1) return new Response('{}', { status: 401 })
  return Response.json([1, 2], { status: 201 })
}

const images = [new File(['first'], 'cover.jpg', { type: 'image/jpeg' }), new File(['second'], 'screen.png', { type: 'image/png' })]
assert.deepEqual(await uploadClubProjectImages(7, images), [1, 2])
assert.equal(calls.filter((call) => call.url.endsWith('/api/auth/refresh')).length, 1)
for (const call of calls.filter((entry) => entry.url.endsWith('/api/club-projects/7/images'))) {
  assert.equal(call.credentials, 'include')
  assert.equal(call.method, 'POST')
  assert.deepEqual([...call.body.getAll('images')].map((image) => image.name), ['cover.jpg', 'screen.png'])
}
