import { useSyncExternalStore } from 'react'
import { INTRO_SESSION_KEY, SCREEN_ON_EVENT } from './screenOn'
import { getStoredIntroStyle, readStoredValue, storeValue } from './themeColors'

// Render mode. Without hardware graphics acceleration the browser paints and composites on the
// CPU (SwiftShader, "Microsoft Basic Render Driver", llvmpipe ...), and backdrop blur, big
// shadows, filters and looping animations then cost whole frames. `data-perf` on <html> is
// 'lite' | 'full'; CSS keys off `:root[data-perf='lite']` and JS effects read this store.
// Other work styles the same attribute, so its name and values are a contract.

export const PERF_MODE_KEY = 'kwcoms-perf-mode:v1'
export const PERF_NOTICE_KEY = 'kwcoms-perf-notice:v1'
// The WebGL probe answer is kept for the tab's session: the machine does not change meanwhile.
export const PERF_PROBE_KEY = 'kwcoms-perf-probe:v1'

export type PerfPreference = 'auto' | 'lite' | 'full'
export type PerfMode = 'lite' | 'full'
export type PerfReason = 'user' | 'webgl' | 'renderer' | 'frame-rate'
export type PerfState = {
  preference: PerfPreference
  mode: PerfMode
  reason: PerfReason | null
  // True when "auto" chose lite because of the machine (not a user choice or an a11y setting).
  autoLite: boolean
  noticeDismissed: boolean
}

export const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|basic render|microsoft basic|software|mesa offscreen/i

export function parsePerfPreference(raw: unknown): PerfPreference {
  return raw === 'lite' || raw === 'full' ? raw : 'auto'
}

export function isSoftwareRenderer(renderer: string | null | undefined) {
  return typeof renderer === 'string' && SOFTWARE_RENDERER.test(renderer)
}

export type GraphicsProbe = { accelerated: boolean; renderer: string }

// One cheap WebGL context, asked to fail when the browser would have to fall back to software.
export function probeGraphics(doc: Document = document): GraphicsProbe {
  let renderer = ''
  try {
    const canvas = doc.createElement('canvas')
    const gl = canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true }) as WebGLRenderingContext | null
    if (!gl) return { accelerated: false, renderer }
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    renderer = String((info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) ?? '')
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return { accelerated: !isSoftwareRenderer(renderer), renderer }
  } catch {
    return { accelerated: false, renderer }
  }
}

export function decideAutoMode(probe: GraphicsProbe): { mode: PerfMode; reason: PerfReason | null } {
  if (!probe.accelerated) return { mode: 'lite', reason: probe.renderer ? 'renderer' : 'webgl' }
  return { mode: 'full', reason: null }
}

// A third of the frames stalled past 50 ms. Deliberately NOT a median test: a steady ~33 ms
// cadence (a 30 fps cap from Energy Saver / battery saver, a 24-30 Hz display) is smooth, not
// slow, and must never switch the look.
export function framesAreSlow(deltas: number[]) {
  if (deltas.length < 20) return false
  return deltas.filter((d) => d > 50).length / deltas.length > 0.3
}

type Raf = (cb: (t: number) => void) => number

// A gap this long is the page having been hidden or frozen, not a slow frame.
const RESUME_GAP_MS = 1000

// Collects rAF frame gaps for `ms`, then reports them. Reports null (sample discarded) when the
// page was hidden at any tick or a frame gap looks like a resume from the background.
export function sampleFrames(raf: Raf, ms: number, isHidden: () => boolean, done: (deltas: number[] | null) => void) {
  const stamps: number[] = []
  let hidden = false
  const tick = (t: number) => {
    hidden = hidden || isHidden() || (stamps.length > 0 && t - stamps[stamps.length - 1] > RESUME_GAP_MS)
    stamps.push(t)
    if (t - stamps[0] < ms) {
      raf(tick)
      return
    }
    done(hidden ? null : stamps.slice(1).map((s, i) => s - stamps[i]))
  }
  raf(tick)
}

let state: PerfState = { preference: 'auto', mode: 'full', reason: null, autoLite: false, noticeDismissed: false }
const listeners = new Set<() => void>()
let probeCache: GraphicsProbe | null = null

export const getPerfState = () => state
export function subscribePerf(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export const usePerfState = () => useSyncExternalStore(subscribePerf, getPerfState, getPerfState)

function commit(next: PerfState) {
  state = next
  if (typeof document !== 'undefined') document.documentElement.dataset.perf = next.mode
  listeners.forEach((listener) => listener())
}

// The probe makes a WebGL context, which is not free on the machines this is for, so ask once
// per session. It runs synchronously before the first render on purpose: deferring it would
// paint the full look first and then flip to lite, a visible flash of the very effects being
// removed (and the hero animation would already have started).
function graphicsProbe(): GraphicsProbe {
  if (probeCache) return probeCache
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(PERF_PROBE_KEY) || 'null')
    if (saved && typeof saved.accelerated === 'boolean' && typeof saved.renderer === 'string') {
      probeCache = { accelerated: saved.accelerated, renderer: saved.renderer }
      return probeCache
    }
  } catch {
    // Unreadable cache: probe again.
  }
  probeCache = probeGraphics()
  try {
    window.sessionStorage.setItem(PERF_PROBE_KEY, JSON.stringify(probeCache))
  } catch {
    // Not cached; the module-level copy still serves this page.
  }
  return probeCache
}

// With nothing stored, a browser driven by automation (navigator.webdriver: Playwright, CI) stays
// on the full look instead of probing: headless CI has no GPU, and a test that clears storage
// must not silently end up on the lite look. An explicitly stored "auto" still probes.
function defaultPreference(): PerfPreference {
  return window.navigator?.webdriver ? 'full' : 'auto'
}

function applyPreference(preference: PerfPreference) {
  if (preference === 'auto') {
    const { mode, reason } = decideAutoMode(graphicsProbe())
    commit({ ...state, preference, mode, reason, autoLite: mode === 'lite' })
    if (mode === 'full') watchFrameRate()
    else stopWatching()
  } else {
    stopWatching()
    commit({ ...state, preference, mode: preference, reason: 'user', autoLite: false })
  }
}

// ---- Frame-rate watchdog ---------------------------------------------------------------------
// Only while the mode is "auto" and still full. When the title card is going to play,
// sample the usable home page only after it hands over
// (SCREEN_ON_EVENT); otherwise sample once the page has loaded. A slow window switches to lite
// for good (no flapping). Handlers live at module scope so a repeated "auto" never stacks them.
let watchTimer = 0
let watchSampling = 0
let watchHidden = false
let watchOn = false
let watchRetries = 0
const MAX_RETRIES = 3
const RETRY_MS = 2000

const SAMPLE_MS = 2000
const INTRO_FALLBACK_MS = 12000

function introWillPlay() {
  try {
    return getStoredIntroStyle() !== 'off' && window.location.pathname === '/' && window.sessionStorage.getItem(INTRO_SESSION_KEY) !== '1'
  } catch {
    return false
  }
}

const watchLive = () => watchOn && state.preference === 'auto' && state.mode === 'full'
const onWatchVisibility = () => {
  if (document.hidden) watchHidden = true
}

function startSample(delay: number) {
  window.clearTimeout(watchTimer)
  watchTimer = window.setTimeout(() => {
    if (!watchLive() || watchSampling) return
    watchHidden = document.hidden
    watchSampling = 1
    sampleFrames(
      (cb) => window.requestAnimationFrame(cb),
      SAMPLE_MS,
      () => watchHidden || document.hidden,
      (deltas) => {
        watchSampling = 0
        // Discarded (tab was in the background): look again a little later, a few times at most.
        if (!deltas && watchLive() && watchRetries < MAX_RETRIES) {
          watchRetries++
          startSample(RETRY_MS)
          return
        }
        if (watchLive() && deltas && framesAreSlow(deltas)) {
          commit({ ...state, mode: 'lite', reason: 'frame-rate', autoLite: true })
          stopWatching()
        }
      },
    )
  }, delay)
}

const onWatchLoad = () => startSample(600)
const onWatchScreenOn = () => startSample(900)
const onWatchIntroGaveUp = () => startSample(0)

function stopWatching() {
  watchOn = false
  window.clearTimeout(watchTimer)
  window.removeEventListener('load', onWatchLoad)
  window.removeEventListener(SCREEN_ON_EVENT, onWatchScreenOn)
  document.removeEventListener('visibilitychange', onWatchVisibility)
}

function watchFrameRate() {
  stopWatching()
  watchOn = true
  watchRetries = 0
  document.addEventListener('visibilitychange', onWatchVisibility)
  if (introWillPlay()) {
    window.addEventListener(SCREEN_ON_EVENT, onWatchScreenOn, { once: true })
    // The intro always lets go within seconds; if its event never arrives, sample anyway.
    watchTimer = window.setTimeout(onWatchIntroGaveUp, INTRO_FALLBACK_MS)
  } else if (document.readyState === 'complete') {
    onWatchLoad()
  } else {
    window.addEventListener('load', onWatchLoad, { once: true })
  }
}

export function setPerfPreference(preference: PerfPreference) {
  // Stored even for "auto": an explicit "auto" outranks the automation default.
  storeValue(PERF_MODE_KEY, preference)
  applyPreference(preference)
}

export function dismissPerfNotice() {
  storeValue(PERF_NOTICE_KEY, '1')
  commit({ ...state, noticeDismissed: true })
}

// Called from main.tsx before React renders.
export function initPerfMode() {
  if (typeof window === 'undefined') return
  state = { ...state, noticeDismissed: readStoredValue(PERF_NOTICE_KEY) === '1' }
  const stored = readStoredValue(PERF_MODE_KEY)
  applyPreference(stored === null ? defaultPreference() : parsePerfPreference(stored))
}

// Test hook: forget the cached probe and watchers.
export function resetPerfModeForTests() {
  probeCache = null
  stopWatching()
  watchSampling = 0
  state = { preference: 'auto', mode: 'full', reason: null, autoLite: false, noticeDismissed: false }
}
