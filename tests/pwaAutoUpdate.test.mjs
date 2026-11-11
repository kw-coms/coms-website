import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setImmediate } from 'node:timers/promises'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

// Run the real startup module with Vite's import.meta values and a fake browser.
const source = readFileSync(new URL('../src/pwaAutoUpdate.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source.replaceAll('import.meta', '__vite_import_meta__'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
})

function openPage({ stored = new Map(), build = 'old', dev = false, storageError } = {}) {
  const window = new EventTarget()
  let reloads = 0
  const registrations = []
  window.location = { reload() { reloads++ } }
  Object.defineProperty(window, 'sessionStorage', {
    get() {
      if (storageError === 'access') throw new Error('SecurityError')
      return {
        getItem: (key) => stored.get(key) ?? null,
        setItem(key, value) {
          if (storageError === 'write') throw new Error('QuotaExceededError')
          stored.set(key, value)
        },
      }
    },
  })
  const exports = {}
  runInNewContext(outputText, {
    window,
    exports,
    __vite_import_meta__: { env: { DEV: dev }, url: `https://coms.kw.ac.kr/assets/index-${build}.js` },
    require(id) {
      assert.equal(id, 'virtual:pwa-register')
      return { registerSW: (options) => registrations.push(options.immediate) }
    },
  })
  exports.setupPwaAutoUpdate()
  return {
    get reloads() { return reloads },
    registrations,
    failPreload() {
      const event = new Event('vite:preloadError', { cancelable: true })
      window.dispatchEvent(event)
      return event
    },
  }
}

test('one failed preload reloads once and suppresses the error during recovery', () => {
  const page = openPage()
  assert.equal(page.failPreload().defaultPrevented, true)
  assert.equal(page.reloads, 1)
  page.failPreload()
  assert.equal(page.reloads, 1, 'simultaneous failed preloads must not reload again')
})

test('the same failing build stops reloading after a document reload', () => {
  const stored = new Map()
  openPage({ stored }).failPreload()
  const nextPage = openPage({ stored })
  assert.equal(nextPage.failPreload().defaultPrevented, false, 'leave the failure visible to the error boundary')
  assert.equal(nextPage.reloads, 0, 'a fresh document must remember the previous recovery')
})

test('a later build still gets one recovery attempt', () => {
  const stored = new Map()
  openPage({ stored }).failPreload()
  const nextBuild = openPage({ stored, build: 'new' })
  nextBuild.failPreload()
  assert.equal(nextBuild.reloads, 1)
  const reloadedBuild = openPage({ stored, build: 'new' })
  reloadedBuild.failPreload()
  assert.equal(reloadedBuild.reloads, 0)
})

test('an independent tab can recover even when another tab already tried', () => {
  openPage().failPreload()
  const otherTab = openPage()
  otherTab.failPreload()
  assert.equal(otherTab.reloads, 1)
})

for (const storageError of ['access', 'write']) {
  test(`blocked session storage (${storageError}) cannot cause a reload loop`, () => {
    const page = openPage({ storageError })
    assert.equal(page.failPreload().defaultPrevented, false)
    assert.equal(page.reloads, 0, 'do not reload without a durable guard')
  })
}

test('service worker auto registration remains enabled in production', async () => {
  const page = openPage()
  await setImmediate()
  assert.deepEqual(page.registrations, [true])
})

test('development installs neither the recovery handler nor the service worker', async () => {
  const page = openPage({ dev: true })
  await setImmediate()
  page.failPreload()
  assert.equal(page.reloads, 0)
  assert.deepEqual(page.registrations, [])
})
