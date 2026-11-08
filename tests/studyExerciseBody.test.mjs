import assert from 'node:assert/strict'
import { MAX_BODY_BYTES, postRun } from '../src/pages/study/playground/runner.ts'

assert.equal(MAX_BODY_BYTES, 112 * 1024)

const originalFetch = globalThis.fetch
const calls = []
globalThis.fetch = async (_url, options) => {
  calls.push(options.body)
  return new Response(JSON.stringify({ ok: true, stage: 'run' }), { status: 200 })
}
try {
  const maxFields = { lang: 'python', code: 'x'.repeat(60 * 1024) + '\n'.repeat(4 * 1024), tests: ['a'.repeat(16 * 1024), 'b'.repeat(16 * 1024)] }
  assert.equal((await postRun(maxFields)).kind, 'output')
  assert.ok(new TextEncoder().encode(calls[0]).length > 96 * 1024)
  assert.ok(new TextEncoder().encode(calls[0]).length <= MAX_BODY_BYTES)

  const escaped = { ...maxFields, code: '"'.repeat(64 * 1024) }
  assert.equal((await postRun(escaped)).kind, 'rejected')
  assert.equal(calls.length, 1, 'oversized serialized JSON never reaches fetch')

  globalThis.fetch = async () => new Response('<html>nginx 413</html>', { status: 413 })
  assert.equal((await postRun(maxFields)).kind, 'rejected')
} finally {
  globalThis.fetch = originalFetch
}

console.log('studyExerciseBody ok')
