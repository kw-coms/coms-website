import './setupDom.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { act, Component, createElement as h, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ts from 'typescript'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const media = new window.EventTarget()
media.matches = false
window.matchMedia = () => media
const timers = new Map()
let nextTimer = 0
window.setTimeout = (callback) => { timers.set(++nextTimer, callback); return nextTimer }
window.clearTimeout = (id) => timers.delete(id)
const url = new URL('../src/components/common/ComsIntro.tsx', import.meta.url)
const localRequire = createRequire(url)
const source = ts.transpileModule(readFileSync(url, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText

class RootBoundary extends Component {
  state = { error: false }
  static getDerivedStateFromError() { return { error: true } }
  render() { return this.state.error ? h('p', null, 'ROOT_ERROR') : this.props.children }
}

for (const failure of ['download', 'renderer']) {
  let reported = 0
  const exports = {}
  runInNewContext(source, {
    exports, window, document, sessionStorage: window.sessionStorage, CustomEvent: window.CustomEvent,
    require(name) {
      if (name === './LegacyIntroCanvas') {
        if (failure === 'download') throw new Error('simulated optional chunk failure')
        return { default: () => { throw new Error('simulated canvas renderer failure') } }
      }
      if (name === '../../utils/perfMode') return { getPerfState: () => ({ mode: 'full' }), subscribePerf: () => () => {} }
      if (name === '../../services/observability') return { captureError: () => { reported++; return Promise.resolve() } }
      return localRequire(name)
    },
  })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  let completed = 0
  let handoffs = 0
  const onScreenOn = () => handoffs++
  window.addEventListener('coms:screen-on', onScreenOn)
  const previousError = console.error
  console.error = () => {} // React reports the intentional renderer fault as part of boundary recovery.
  document.body.style.overflow = 'auto'
  try {
    await act(async () => root.render(h(StrictMode, null, h(RootBoundary, null,
      h(exports.default, { introStyle: 'legacy', preview: true, onComplete: () => completed++ })))))
    await act(async () => { await new Promise((resolve) => setImmediate(resolve)) })
    assert.equal(host.textContent.includes('ROOT_ERROR'), false, `${failure}: optional art cannot replace the site with an error page`)
    assert.equal(Boolean(host.querySelector('[data-coms-intro]')), false)
    assert.equal(completed, 1)
    assert.equal(handoffs, 1)
    assert.equal(reported, 1)
    assert.equal(document.body.style.overflow, 'auto')
    assert.equal(timers.size, 0)
  } finally {
    console.error = previousError
    window.removeEventListener('coms:screen-on', onScreenOn)
    await act(async () => root.unmount())
    host.remove()
  }
}
console.log('optional intro failure contracts passed')
