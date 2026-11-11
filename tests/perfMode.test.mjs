import './setupDom.mjs'

import assert from 'node:assert/strict'

import {
  PERF_MODE_KEY,
  PERF_NOTICE_KEY,
  PERF_PROBE_KEY,
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
assert.deepEqual(decideAutoMode({ accelerated: true, renderer: 'GPU' }), { mode: 'full', reason: null })
assert.deepEqual(decideAutoMode({ accelerated: false, renderer: '' }), { mode: 'lite', reason: 'webgl' })
assert.deepEqual(decideAutoMode({ accelerated: false, renderer: 'SwiftShader' }), { mode: 'lite', reason: 'renderer' })

// ─── frame-rate watchdog ─────────────────────────────────────────────────────
const steady = Array.from({ length: 120 }, () => 16.7)
assert.equal(framesAreSlow(steady), false)
assert.equal(framesAreSlow(Array.from({ length: 60 }, () => 33.4)), false, 'a steady 30 fps cadence (Energy Saver, 30 Hz display) is not slow')
assert.equal(framesAreSlow(Array.from({ length: 60 }, () => 41.7)), false, 'a steady 24 Hz cadence is not slow either')
assert.equal(framesAreSlow(Array.from({ length: 60 }, () => 70)), true, 'frames that all stall past 50 ms are slow')
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
assert.equal(framesAreSlow(run(70)), true)
assert.equal(framesAreSlow(run(33.4)), false)
assert.equal(run(45, { hidden: true }), null, 'a window that saw the page hidden is discarded')
// A long gap in the middle is a resume from the background, not a slow frame: discard.
{
  const queue = []
  let result = 'unset'
  sampleFrames((cb) => queue.push(cb), 2000, () => false, (d) => { result = d })
  let t = 0
  for (let i = 0; queue.length; i++) {
    t += i === 30 ? 5000 : 16.7
    queue.shift()(t)
  }
  assert.equal(result, null, 'a frame gap over a second discards the sample')
}

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
assert.equal(window.localStorage.getItem(PERF_MODE_KEY), 'auto', 'an explicit auto is stored (it outranks a build-time default)')
assert.deepEqual(seen, ['full', 'lite', 'lite'])
off()

// ─── the notice is dismissed once and stays dismissed ────────────────────────
assert.equal(getPerfState().noticeDismissed, false)
dismissPerfNotice()
assert.equal(window.localStorage.getItem(PERF_NOTICE_KEY), '1')
resetPerfModeForTests()
initPerfMode()
assert.equal(getPerfState().noticeDismissed, true, 'remembered across visits')

// ─── automation default ──────────────────────────────────────────────────────
{
  resetPerfModeForTests()
  window.sessionStorage.clear()
  window.localStorage.clear()
  Object.defineProperty(window.navigator, 'webdriver', { configurable: true, get: () => true })
  initPerfMode()
  assert.equal(root.dataset.perf, 'full', 'an automated browser with nothing stored stays full (no GPU in CI)')
  resetPerfModeForTests()
  window.localStorage.setItem(PERF_MODE_KEY, 'auto')
  initPerfMode()
  assert.equal(root.dataset.perf, 'lite', 'an explicit auto still probes')
  Object.defineProperty(window.navigator, 'webdriver', { configurable: true, get: () => false })
  window.localStorage.clear()
}

// ─── the probe answer is kept for the session ────────────────────────────────
{
  resetPerfModeForTests()
  window.sessionStorage.clear()
  let calls = 0
  window.HTMLCanvasElement.prototype.getContext = () => { calls++; return null }
  window.localStorage.clear()
  initPerfMode()
  initPerfMode()
  assert.equal(calls, 1, 'the WebGL probe runs once')
  assert.match(window.sessionStorage.getItem(PERF_PROBE_KEY), /"accelerated":false/)
  resetPerfModeForTests()
  initPerfMode()
  assert.equal(calls, 1, 'a later page load of the session reads the cached answer')
}

// ─── watchdog with fake timers / rAF ─────────────────────────────────────────
{
  const realSetTimeout = window.setTimeout
  const realClearTimeout = window.clearTimeout
  const realRaf = window.requestAnimationFrame
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }) // jsdom has no visible page
  let now = 0
  let timers = []
  let rafQueue = []
  window.setTimeout = (fn, ms) => { timers.push({ at: now + ms, fn }); return timers.length }
  window.clearTimeout = (id) => { if (timers[id - 1]) timers[id - 1].fn = null }
  window.requestAnimationFrame = (cb) => rafQueue.push(cb)
  const advance = (gap) => { // drive the page: run due timers, then one frame
    now += gap
    for (const timer of timers.filter((x) => x.fn && x.at <= now)) { const fn = timer.fn; timer.fn = null; fn() }
    const cbs = rafQueue; rafQueue = []
    cbs.forEach((cb) => cb(now))
  }
  const drive = (gap, ms) => { for (let spent = 0; spent < ms; spent += gap) advance(gap) }
  const goodGl = fakeGl('ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11)')
  window.HTMLCanvasElement.prototype.getContext = () => goodGl
  const rootEl = document.documentElement

  // A machine that stalls after load: lite once, and no flip back.
  resetPerfModeForTests()
  window.sessionStorage.clear()
  window.sessionStorage.setItem('coms.intro.played:v1', '1') // intro already played: sample after load
  window.localStorage.clear()
  initPerfMode()
  assert.equal(rootEl.dataset.perf, 'full')
  window.dispatchEvent(new window.Event('load')) // (a no-op when the document had already loaded)
  drive(100, 3000) // timers fire; the sampler gets frames 100 ms apart (stalled)
  drive(100, 3000)
  assert.equal(rootEl.dataset.perf, 'lite', 'a stalled window switches to lite')
  assert.equal(getPerfState().reason, 'frame-rate')
  assert.equal(getPerfState().autoLite, true)
  drive(16.7, 6000)
  assert.equal(rootEl.dataset.perf, 'lite', 'it never flips back')

  // A steady 30 fps cadence stays full.
  resetPerfModeForTests()
  window.localStorage.clear()
  initPerfMode()
  window.dispatchEvent(new window.Event('load'))
  drive(33.4, 6000)
  assert.equal(rootEl.dataset.perf, 'full', 'a 30 fps cap does not switch the look')

  // With the intro still to play, the load sample is skipped; only the hand-over samples.
  resetPerfModeForTests()
  window.sessionStorage.clear()
  window.localStorage.clear()
  initPerfMode()
  drive(100, 8000)
  assert.equal(rootEl.dataset.perf, 'full', 'intro frames are not judged')
  window.dispatchEvent(new window.CustomEvent('coms:screen-on'))
  drive(100, 6000)
  assert.equal(rootEl.dataset.perf, 'lite', 'frames after the intro are')

  // Disabling the intro must not leave the performance watchdog waiting for a hand-over that never comes.
  resetPerfModeForTests()
  window.sessionStorage.clear()
  window.localStorage.clear()
  window.localStorage.setItem('kwcoms-intro-style:v1', 'off')
  initPerfMode()
  window.dispatchEvent(new window.Event('load'))
  drive(100, 6000)
  assert.equal(rootEl.dataset.perf, 'lite', 'an off intro is sampled after load without waiting for screen-on')
  window.localStorage.removeItem('kwcoms-intro-style:v1')

  // A sample discarded because the tab was hidden is retried, a bounded number of times.
  resetPerfModeForTests()
  window.sessionStorage.setItem('coms.intro.played:v1', '1')
  window.localStorage.clear()
  let hiddenNow = true
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hiddenNow })
  initPerfMode()
  window.dispatchEvent(new window.Event('load'))
  drive(100, 3000) // first window runs hidden: discarded, retry armed
  assert.equal(rootEl.dataset.perf, 'full')
  hiddenNow = false
  drive(100, 6000) // retry runs visible and stalled
  assert.equal(rootEl.dataset.perf, 'lite', 'a discarded window is looked at again')
  // Always hidden: the retries run out and the watchdog goes quiet.
  resetPerfModeForTests()
  window.localStorage.clear()
  hiddenNow = true
  initPerfMode()
  window.dispatchEvent(new window.Event('load'))
  drive(100, 30000)
  assert.equal(rootEl.dataset.perf, 'full')
  assert.equal(timers.filter((x) => x.fn).length, 0, 'no endless retry loop')
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })

  // Repeated "auto" does not stack handlers.
  resetPerfModeForTests()
  window.sessionStorage.clear()
  window.localStorage.clear()
  initPerfMode()
  setPerfPreference('auto')
  setPerfPreference('auto')
  window.dispatchEvent(new window.CustomEvent('coms:screen-on'))
  const before = timers.filter((x) => x.fn).length
  assert.ok(before <= 3, 'timers are replaced, not accumulated (' + before + ')')
  setPerfPreference('full')
  assert.equal(timers.filter((x) => x.fn).length, 0, 'choosing a fixed mode stops the watchdog')

  window.setTimeout = realSetTimeout
  window.clearTimeout = realClearTimeout
  window.requestAnimationFrame = realRaf
}

console.log('perfMode tests passed')
