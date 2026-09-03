import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { captureError, initObservability, setUserContext } from '../src/services/observability.ts'

// No VITE_SENTRY_DSN in the test env, so init must bail before touching the SDK.
// The point of the assertions below is that the reporting helpers stay usable
// (and silent) in that state: they now read a module-level handle captured at
// init instead of re-importing @sentry/react on every call, so a null handle is
// the only thing standing between them and a crash on a code path that runs
// inside catch blocks.
await initObservability({ release: 'test' })

await assert.doesNotReject(() => captureError(new Error('boom')))
await assert.doesNotReject(() => captureError(new Error('boom'), { route: '/community' }))
await assert.doesNotReject(() => setUserContext({ id: 7 }))
await assert.doesNotReject(() => setUserContext(null))

// Source guard for the bundle size. `await import('@sentry/react')` bound to a
// namespace pins the SDK's whole export surface — session replay (rrweb),
// the feedback widget and every router integration — because the bundler cannot
// prove which properties are read. Destructuring the three functions we call
// took vendor-sentry from 154 to 29 KB gz. Anything reintroducing a namespace
// binding here silently gives that back.
const source = await readFile(new URL('../src/services/observability.ts', import.meta.url), 'utf8')
assert.match(source, /const \{[^}]*\} = await import\('@sentry\/react'\)/, 'import @sentry/react by named bindings, never as a namespace')
assert.equal((source.match(/await import\('@sentry/g) || []).length, 1, 'a single import site keeps the SDK off the hot paths')
assert.doesNotMatch(source, /(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*await import\('@sentry/, 'the import must be destructured, not bound to a namespace')

console.log('observability tests passed')
