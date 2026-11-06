import { useSyncExternalStore } from 'react'
import { SCREEN_ON_EVENT } from './screenOn'
import { forgetStoredValue, readStoredValue, storeValue } from './themeColors'

// Render mode. Without hardware graphics acceleration the browser paints and composites on the
// CPU (SwiftShader, "Microsoft Basic Render Driver", llvmpipe ...), and backdrop blur, big
// shadows, filters and looping animations then cost whole frames. `data-perf` on <html> is
// 'lite' | 'full'; CSS keys off `:root[data-perf='lite']` and JS effects read this store.
// Other work styles the same attribute, so its name and values are a contract.

export const PERF_MODE_KEY = 'kwcoms-perf-mode:v1'
export const PERF_NOTICE_KEY = 'kwcoms-perf-notice:v1'

export type PerfPreference = 'auto' | 'lite' | 'full'
export type PerfMode = 'lite' | 'full'
export type PerfReason = 'user' | 'webgl' | 'renderer' | 'reduced-motion' | 'frame-rate'
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

export function decideAutoMode(probe: GraphicsProbe, reducedMotion: boolean): { mode: PerfMode; reason: PerfReason | null } {
  if (!probe.accelerated) return { mode: 'lite', reason: probe.renderer ? 'renderer' : 'webgl' }
  if (reducedMotion) return { mode: 'lite', reason: 'reduced-motion' }
  return { mode: 'full', reason: null }
}

// Median frame over 28 ms (under ~35 fps), or a third of the frames over 50 ms.
export function framesAreSlow(deltas: number[]) {
  if (deltas.length < 20) return false
  const sorted = [...deltas].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const stalled = deltas.filter((d) => d > 50).length / deltas.length
  return median > 28 || stalled > 0.3
}

type Raf = (cb: (t: number) => void) => number

// Collects rAF frame gaps for `ms`, then reports them (null when the page was hidden meanwhile).
export function sampleFrames(raf: Raf, ms: number, isHidden: () => boolean, done: (deltas: number[] | null) => void) {
  const stamps: number[] = []
  let hidden = false
  const tick = (t: number) => {
    hidden = hidden || isHidden()
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
let watchToken = 0

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

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function applyPreference(preference: PerfPreference) {
  if (preference === 'auto') {
    probeCache ??= probeGraphics()
    const { mode, reason } = decideAutoMode(probeCache, prefersReducedMotion())
    commit({ ...state, preference, mode, reason, autoLite: mode === 'lite' && reason !== 'reduced-motion' })
    if (mode === 'full') watchFrameRate()
  } else {
    commit({ ...state, preference, mode: preference, reason: 'user', autoLite: false })
  }
}

// Frame-rate watchdog, only while the mode is "auto" and still full: sample once after load and
// once after the boot intro hands over. A slow window switches to lite for good (no flapping).
function watchFrameRate() {
  const token = ++watchToken
  const live = () => token === watchToken && state.preference === 'auto' && state.mode === 'full'
  const run = (delay: number) =>
    window.setTimeout(() => {
      if (!live()) return
      sampleFrames(
        (cb) => window.requestAnimationFrame(cb),
        2000,
        () => document.hidden,
        (deltas) => {
          if (live() && deltas && framesAreSlow(deltas)) commit({ ...state, mode: 'lite', reason: 'frame-rate', autoLite: true })
        },
      )
    }, delay)
  const afterLoad = () => run(600)
  if (document.readyState === 'complete') afterLoad()
  else window.addEventListener('load', afterLoad, { once: true })
  window.addEventListener(SCREEN_ON_EVENT, () => run(900), { once: true })
}

export function setPerfPreference(preference: PerfPreference) {
  if (preference === 'auto') forgetStoredValue(PERF_MODE_KEY)
  else storeValue(PERF_MODE_KEY, preference)
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
  applyPreference(parsePerfPreference(readStoredValue(PERF_MODE_KEY)))
}

// Test hook: forget the cached probe and watchers.
export function resetPerfModeForTests() {
  probeCache = null
  watchToken++
  state = { preference: 'auto', mode: 'full', reason: null, autoLite: false, noticeDismissed: false }
}
