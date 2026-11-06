import './setupDom.mjs'

import assert from 'node:assert/strict'

import {
  PERF_MODE_KEY,
  PERF_NOTICE_KEY,
  decideAutoMode,
  dismissPerfNotice,
  framesAreSlow,
  getPerfState,
  initPerfMode,
  isSoftwareRenderer,
  parsePerfPreference,
  probeGraphics,
  resetPerfModeForTests,
  sampleFrames,
  setPerfPreference,
} from '../src/utils/perfMode.ts'

// jsdom has no canvas: say so quietly (a null context is what a machine without WebGL gives).
window.HTMLCanvasElement.prototype.getContext = () => null

// ─── stored preference ───────────────────────────────────────────────────────
assert.equal(parsePerfPreference('lite'), 'lite')
assert.equal(parsePerfPreference('full'), 'full')
assert.equal(parsePerfPreference('auto'), 'auto')
assert.equal(parsePerfPreference('turbo'), 'auto', 'an unknown value is treated as auto')
assert.equal(parsePerfPreference(null), 'auto')

// ─── software renderers ──────────────────────────────────────────────────────
for (const name of [
  'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0)), SwiftShader driver)',
  'llvmpipe (LLVM 15.0.7, 256 bits)',
  'Softpipe',
  'Microsoft Basic Render Driver',
  'Apple Software Renderer',
]) assert.equal(isSoftwareRenderer(name), true, name)
for (const name of ['ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)', 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11 vs_5_0 ps_5_0)', 'Intel(R) UHD Graphics 630', '']) {
  assert.equal(isSoftwareRenderer(name), false, name)
}

// ─── WebGL probe with a fake document ────────────────────────────────────────
const fakeDoc = (gl) => ({ createElement: () => ({ getContext: (type, opts) => { fakeDoc.lastOpts = opts; return gl } }) })
const fakeGl = (renderer) => {
  let lost = 0
  const gl = {
    RENDERER: 1,
    UNMASKED: 2,
    getExtension: (name) => (name === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 2 } : name === 'WEBGL_lose_context' ? { loseContext: () => lost++ } : null),
    getParameter: () => renderer,
    lost: () => lost,
  }
  return gl
}
assert.deepEqual(probeGraphics(fakeDoc(null)), { accelerated: false, renderer: '' }, 'no context under failIfMajorPerformanceCaveat means software')
assert.equal(fakeDoc.lastOpts.failIfMajorPerformanceCaveat, true)
const swGl = fakeGl('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader driver)')
assert.equal(probeGraphics(fakeDoc(swGl)).accelerated, false, 'a SwiftShader context is software even when it was granted')
assert.equal(swGl.lost(), 1, 'the probe context is released at once')
const hwGl = fakeGl('ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11)')
assert.deepEqual(probeGraphics(fakeDoc(hwGl)), { accelerated: true, renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11)' })
assert.equal(probeGraphics({ createElement: () => { throw new Error('blocked') } }).accelerated, false, 'a throwing probe means lite, not a crash')

// ─── startup decision ────────────────────────────────────────────────────────
assert.deepEqual(decideAutoMode({ accelerated: true, renderer: 'GPU' }, false), { mode: 'full', reason: null })
assert.deepEqual(decideAutoMode({ accelerated: false, renderer: '' }, false), { mode: 'lite', reason: 'webgl' })
assert.deepEqual(decideAutoMode({ accelerated: false, renderer: 'SwiftShader' }, false), { mode: 'lite', reason: 'renderer' })
assert.deepEqual(decideAutoMode({ accelerated: true, renderer: 'GPU' }, true), { mode: 'lite', reason: 'reduced-motion' })

// ─── frame-rate watchdog ─────────────────────────────────────────────────────
const steady = Array.from({ length: 120 }, () => 16.7)
assert.equal(framesAreSlow(steady), false)
assert.equal(framesAreSlow(Array.from({ length: 60 }, () => 40)), true, 'a 40 ms median is slow')
assert.equal(framesAreSlow([...Array.from({ length: 70 }, () => 17), ...Array.from({ length: 40 }, () => 80)]), true, 'over 30% of frames above 50 ms is slow')
assert.equal(framesAreSlow([...Array.from({ length: 110 }, () => 17), ...Array.from({ length: 4 }, () => 300)]), false, 'a few load-time hitches are not slow')
assert.equal(framesAreSlow(Array.from({ length: 5 }, () => 200)), false, 'too few frames to judge')

const run = (gap, { hidden = false, ms = 2000 } = {}) => {
  let t = 0
  let result
  const queue = []
  sampleFrames((cb) => queue.push(cb), ms, () => hidden, (d) => { result = d })
  while (queue.length) {
    t += gap
    queue.shift()(t)
  }
  return result
}
const fast = run(16.7)
assert.ok(fast.length > 100 && fast.every((d) => Math.abs(d - 16.7) < 0.01))
assert.equal(framesAreSlow(run(45)), true)
assert.equal(run(45, { hidden: true }), null, 'a window that saw the page hidden is discarded')

// ─── store: preference wins, applies live, is remembered ─────────────────────
const root = document.documentElement
window.localStorage.clear()
resetPerfModeForTests()
window.localStorage.setItem(PERF_MODE_KEY, 'full')
initPerfMode()
assert.equal(root.dataset.perf, 'full', 'a stored "full" beats detection')
assert.equal(getPerfState().autoLite, false)

resetPerfModeForTests()
window.localStorage.setItem(PERF_MODE_KEY, 'lite')
initPerfMode()
assert.equal(root.dataset.perf, 'lite')
assert.equal(getPerfState().autoLite, false, 'a chosen lite is not announced')

resetPerfModeForTests()
window.localStorage.clear()
initPerfMode() // jsdom has no WebGL, like a machine without acceleration
assert.equal(root.dataset.perf, 'lite', 'auto picks lite when WebGL needs software')
assert.equal(getPerfState().autoLite, true)
assert.equal(getPerfState().preference, 'auto')

const seen = []
const { subscribePerf } = await import('../src/utils/perfMode.ts')
const off = subscribePerf(() => seen.push(getPerfState().mode))
setPerfPreference('full')
assert.equal(root.dataset.perf, 'full', 'the toggle applies without a reload')
assert.equal(window.localStorage.getItem(PERF_MODE_KEY), 'full')
setPerfPreference('lite')
assert.equal(root.dataset.perf, 'lite')
setPerfPreference('auto')
assert.equal(window.localStorage.getItem(PERF_MODE_KEY), null, 'auto clears the stored choice')
assert.deepEqual(seen, ['full', 'lite', 'lite'])
off()

// ─── the notice is dismissed once and stays dismissed ────────────────────────
assert.equal(getPerfState().noticeDismissed, false)
dismissPerfNotice()
assert.equal(window.localStorage.getItem(PERF_NOTICE_KEY), '1')
resetPerfModeForTests()
initPerfMode()
assert.equal(getPerfState().noticeDismissed, true, 'remembered across visits')

console.log('perfMode tests passed')
