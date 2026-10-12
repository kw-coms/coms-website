import { useEffect, useRef, useState } from 'react'
import { mixHex, normalizeHex } from '../../utils/themeColors'
import { SCREEN_ON_EVENT, type ScreenOnDetail } from '../../utils/screenOn'

/**
 * Boot intro: the machine starts in the dark. The cube logo lights up cell by cell while a
 * hairline fills and the club's four activities are named; at 100% the logo folds into a
 * line, the line runs out to the edges of the screen, and the picture opens from it onto the
 * home page, which is already complete underneath. Short (~2.4s), skippable, once per tab.
 *
 * Under reduced motion it still plays, in a calm form: the cells come up by brightness alone
 * with no sweep line or sparkle, and at the end the loading screen simply gives way to the
 * page, with nothing folding or opening.
 */

// Module-level so an SPA route change back to "/" doesn't replay it, but a full
// page reload (which re-imports the module) does.
const INTRO_SESSION_KEY = 'coms.intro.played:v1'

function introAlreadyPlayed() {
  try {
    return sessionStorage.getItem(INTRO_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

let introPlayed = introAlreadyPlayed()

// True when the user prefers reduced motion: the intro then plays in its calm form.
function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const easeIn = (t: number) => t * t * t
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4)
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

// The three faces of the cube logo (COMs_logo_vec.svg), kept apart so each face can take its
// own tint. Sampled with Path2D rather than loaded as images: no network, no CSP dependency.
const VIEW_W = 333
const VIEW_H = 368
const FACE_TOP =
  'M166.242 0.133789L328.742 90.1338L329.555 90.584L328.731 91.0146L166.231 176.015L165.999 176.136L165.767 176.014L3.7666 90.5137L2.94824 90.0811L3.75781 89.6338L165.758 0.133789L166 0L166.242 0.133789ZM164.816 40.2002L76.3164 89.2002L75.5039 89.6504L76.3271 90.0811L129.827 118.081L130.068 118.207L130.305 118.072L201.555 77.7129L219.555 88.1338L150.311 127.703L149.521 128.154L150.324 128.58L167.324 137.58L167.566 137.707L167.804 137.573L254.804 88.5732L255.589 88.1318L254.799 87.6992L201.799 58.6992L201.556 58.5664L201.314 58.7012L130.057 98.5654L111.091 88.1338L145.302 69.0742L180.302 49.5742L181.079 49.1416L180.305 48.7031L165.305 40.2031L165.062 40.0645L164.816 40.2002Z'
const FACE_LEFT =
  'M162.5 322.483V367.071L0.5 276.903V96.0713L162.5 181.571V224.071L34.7598 153.541V252.627L162.5 322.483Z'
const FACE_RIGHT =
  'M202.605 347.571L169.503 367.071L169.503 181.571L332 96.5713L331.5 276.571L298.398 294.571V150.467L266.802 167.619V312.071L233 331.071C233 283.373 232.697 187.417 232.697 186.241C232.697 185.065 212.635 196.859 202.605 202.903V347.571Z'
const FACES = [FACE_TOP, FACE_LEFT, FACE_RIGHT]

// timeline (ms)
const SCAN_START = 200 // the logo starts lighting, top row first
const SCAN_TIME = 1150
const LOADED = SCAN_START + SCAN_TIME + 200 // the hairline reaches 100%
const HANDOFF = LOADED + 170 // one "ready" beat, then the screen comes on
const FOLD = 210 // the logo folds into a line
const RUN = 150 // the line runs out to the screen edges
const OPEN_AT = FOLD + RUN * 0.55 // ... and the picture starts opening from it
const OPEN = 460
const CALM_FADE = 180 // the calm form has none of that: the loading screen gives way at once
const STATUS: Array<[number, string]> = [
  [0, 'seminar'],
  [0.25, 'study'],
  [0.5, 'project'],
  [0.75, 'community'],
  [1, 'ready'],
]
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
// On <html> for a moment after the screen comes on: the hero's entrance hangs off it.
const BOOTED_CLASS = 'coms-booted'

type Box = { x: number; y: number; w: number; h: number }
type Cell = { gx: number; gy: number; face: number; order: number; at: number }

export default function ComsIntro() {
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // Decided once, at mount. The effect keys off this instead of re-reading the
  // module flag: under React StrictMode the effect runs setup → cleanup → setup,
  // and the first pass already flips `introPlayed`, so re-checking it made the
  // second pass bail and left a blank overlay that never dismissed itself.
  const [shouldPlay] = useState(() => !introPlayed)
  const [calm] = useState(prefersReducedMotion)
  const [gone, setGone] = useState(!shouldPlay)
  // leaving: the loading is over and the skip control goes; released: the page is uncovered.
  const [leaving, setLeaving] = useState(false)
  const [released, setReleased] = useState(false)
  const skipRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (typeof window === 'undefined' || !shouldPlay) return
    introPlayed = true
    try {
      sessionStorage.setItem(INTRO_SESSION_KEY, '1')
    } catch {
      // Session gating is best-effort.
    }

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d') ?? null
    if (!canvas || !ctx || typeof Path2D === 'undefined') {
      // Nothing can be drawn: dismiss instead of leaving a blank overlay on the home page.
      const dismiss = window.setTimeout(() => setReleased(true), 0)
      return () => window.clearTimeout(dismiss)
    }

    const root = document.documentElement
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // The machine is off, so the boot screen is black whatever the site theme: pale cells, the
    // site's accent. The calm form has no switch-on to justify a black screen, so it stays on
    // the page's own colours. Re-read while running: this child effect runs before the parent
    // App effect that sets [data-theme-mode] and the accent, so at mount they are not final.
    let cBg = '#000000'
    let cInk = '#f5f5f7'
    let cAccent = '#2997ff'
    let cMuted = '#8e8e93'
    let cSide = '#bcd5ff'
    const readTheme = () => {
      const cs = getComputedStyle(root)
      const token = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback
      cAccent = normalizeHex(token('--app-accent', cAccent))
      if (calm) {
        cBg = token('--app-bg', '#0f1115')
        cInk = token('--app-text', cInk)
        cMuted = token('--app-muted', cMuted)
      }
      cSide = mixHex(normalizeHex(cInk), cAccent, 0.4)
    }

    let W = 0
    let H = 0
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    // The logo boots in the middle of the screen, a little above centre.
    const stageBox = (): Box => {
      const h = Math.max(170, Math.min(300, Math.min(W, H) * 0.34))
      const w = (h * VIEW_W) / VIEW_H
      return { x: (W - w) / 2, y: (H - h) / 2 - h * 0.14, w, h }
    }

    // The logo as a matrix of cells: which face each cell belongs to, and the moment in the
    // top-to-bottom sweep at which it lights.
    let cols = 0
    let rows = 0
    let cells: Cell[] = []
    const buildCells = (height: number) => {
      const size = Math.max(2.6, Math.min(6.5, height / 64))
      rows = Math.max(18, Math.floor(height / size))
      cols = Math.max(16, Math.round((rows * VIEW_W) / VIEW_H))
      const sample = document.createElement('canvas')
      sample.width = cols
      sample.height = rows
      const g = sample.getContext('2d', { willReadFrequently: true })
      cells = []
      if (!g) return
      const faceOf = new Uint8Array(cols * rows)
      FACES.forEach((d, index) => {
        g.setTransform(1, 0, 0, 1, 0, 0)
        g.clearRect(0, 0, cols, rows)
        g.setTransform(cols / VIEW_W, 0, 0, rows / VIEW_H, 0, 0)
        g.fill(new Path2D(d))
        const data = g.getImageData(0, 0, cols, rows).data
        for (let i = 0; i < cols * rows; i++) if (data[i * 4 + 3] > 110) faceOf[i] = index + 1
      })
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          const face = faceOf[gy * cols + gx]
          if (face) cells.push({ gx, gy, face, order: gy / rows + (Math.random() - 0.5) * 0.05, at: -1 })
        }
      }
    }

    let raf = 0
    let start = 0
    let frames = 0
    let handoffAt = HANDOFF
    let handing = false
    let uncovered = false
    let stage: Box | null = null
    let bootedTimer = 0

    // The page takes over: from here the canvas alone decides how much of it shows, and the
    // hero underneath is told the screen is on.
    const release = (lineY: number) => {
      if (uncovered) return
      uncovered = true
      if (overlayRef.current) overlayRef.current.style.background = 'transparent'
      root.classList.add(BOOTED_CLASS)
      bootedTimer = window.setTimeout(() => root.classList.remove(BOOTED_CLASS), 1400)
      window.dispatchEvent(new CustomEvent<ScreenOnDetail>(SCREEN_ON_EVENT, { detail: { y: lineY } }))
      setReleased(true)
    }
    skipRef.current = () => {
      handoffAt = Math.min(handoffAt, start ? performance.now() - start : 0)
    }

    const frame = (now: number) => {
      if (!start) start = now
      const t = now - start
      if (frames++ % 20 === 0) readTheme()

      if (!stage) {
        stage = stageBox()
        buildCells(stage.h)
      }
      const box = stage
      const cx = W / 2
      const cy = box.y + box.h / 2
      if (!handing && t >= handoffAt) {
        handing = true
        setLeaving(true)
      }
      const since = handing ? t - handoffAt : -1
      // Three beats close the full form: fold, run, open. The calm form only fades.
      const moving = !calm && since >= 0
      const fold = moving ? easeIn(clamp01(since / FOLD)) : 0
      const run = moving ? easeOut(clamp01((since - FOLD * 0.6) / RUN)) : 0
      const open = moving ? easeOutQuart(clamp01((since - OPEN_AT) / OPEN)) : 0
      const veil = calm && since >= 0 ? 1 - easeInOut(clamp01(since / CALM_FADE)) : 1
      if (handing && !uncovered && (calm || since >= OPEN_AT)) release(cy)

      // The dark machine: everything but the opening picture.
      ctx.clearRect(0, 0, W, H)
      const top = cy * (1 - open)
      const bottom = cy + (H - cy) * open
      ctx.globalAlpha = veil
      ctx.fillStyle = cBg
      ctx.fillRect(0, 0, W, top)
      ctx.fillRect(0, bottom, W, H - bottom)
      if (open > 0) {
        // The picture comes up overbright for a moment, between two edges still glowing.
        const dim = 1 - open
        ctx.fillStyle = '#fff'
        ctx.globalAlpha = 0.16 * dim * dim
        ctx.fillRect(0, top, W, bottom - top)
        ctx.globalAlpha = Math.pow(dim, 1.5)
        ctx.fillRect(0, top - 1, W, 2)
        ctx.fillRect(0, bottom - 1, W, 2)
      }

      // The logo matrix.
      const stepX = box.w / cols
      const stepY = box.h / rows
      const dot = Math.min(stepX, stepY) * 0.68
      const reveal = clamp01((t - SCAN_START) / SCAN_TIME)
      const idle = stepX * 0.34
      const squash = 1 - fold
      const stretch = 1 + fold * 0.16
      // Loaded: the whole logo flares once before it goes.
      const ready = calm ? 0 : clamp01(1 - Math.abs(t - (LOADED + 80)) / 120)
      const lit = veil * (1 - run)
      ctx.fillStyle = cInk
      ctx.globalAlpha = 0.07 * squash * veil
      if (ctx.globalAlpha > 0.004) {
        for (let gy = -3; gy < rows + 3; gy += 1) {
          for (let gx = -3; gx < cols + 3; gx += 1) {
            ctx.fillRect(box.x + (gx + 0.5) * stepX - idle / 2, box.y + (gy + 0.5) * stepY - idle / 2, idle, idle)
          }
        }
      }
      if (lit > 0.004) {
        for (let i = 0; i < cells.length; i++) {
          const cell = cells[i]
          if (cell.order > reveal * 1.06) continue
          if (cell.at < 0) cell.at = t
          const x = cx + (box.x + (cell.gx + 0.5) * stepX - cx) * stretch
          const y = cy + (box.y + (cell.gy + 0.5) * stepY - cy) * squash
          const w = dot * (1 + ready * 0.18)
          const h = Math.max(1.2, w * squash)
          const rise = calm ? clamp01((t - cell.at) / 260) : 1
          ctx.globalAlpha = (calm ? 0.94 : 0.86 + 0.14 * Math.sin((cell.gx + cell.gy) * 0.22 - t * 0.0013)) * lit * rise
          ctx.fillStyle = cell.face === 1 ? cInk : cell.face === 2 ? cSide : cAccent
          ctx.fillRect(x - w / 2, y - h / 2, w, h)
          // Flaring and folding both take the cell to white.
          const white = Math.max(ready * 0.7, fold)
          if (white > 0.01 && cell.face !== 1) {
            ctx.globalAlpha = white * lit
            ctx.fillStyle = cInk
            ctx.fillRect(x - w / 2, y - h / 2, w, h)
          }
          const flash = 1 - (t - cell.at) / 320
          if (!calm && flash > 0.02) {
            ctx.globalAlpha = flash * lit
            ctx.fillStyle = cInk
            ctx.fillRect(x - dot * 0.75, y - (dot * 0.75) * squash, dot * 1.5, dot * 1.5 * squash)
          }
        }
      }
      if (!calm && reveal > 0 && reveal < 1 && !handing) {
        ctx.globalAlpha = 0.55
        ctx.fillStyle = cAccent
        ctx.fillRect(box.x - stepX * 3, box.y + reveal * box.h, box.w + stepX * 6, 1.5)
      }
      // The line the logo folds into, running out to the screen edges. Once the picture starts
      // to open it has become the picture's two edges.
      const line = clamp01((fold - 0.5) / 0.5) * (1 - clamp01(open * 9))
      if (line > 0.01) {
        const half = box.w * 0.6 + (W / 2 + 2 - box.w * 0.6) * run
        ctx.globalAlpha = line
        ctx.shadowColor = cAccent
        ctx.shadowBlur = 22
        ctx.fillStyle = '#fff'
        ctx.fillRect(cx - half, cy - 1, half * 2, 2)
        ctx.shadowBlur = 0
      }

      // Status: a hairline that fills while the four activities are named.
      const progress = clamp01((t - SCAN_START) / (LOADED - SCAN_START))
      const show = clamp01((t - 220) / 240) * (1 - clamp01(since / 150)) * veil
      if (show > 0.01) {
        const width = Math.min(240, W * 0.56)
        const lineY = box.y + box.h + Math.max(40, box.h * 0.22)
        const left = W / 2 - width / 2
        let label = STATUS[0][1]
        for (const [at, text] of STATUS) if (progress >= at) label = text
        ctx.globalAlpha = show
        ctx.font = '500 12px ' + MONO
        ctx.textBaseline = 'alphabetic'
        ctx.textAlign = 'left'
        ctx.fillStyle = cMuted
        ctx.fillText(label, left, lineY - 12)
        ctx.textAlign = 'right'
        ctx.fillStyle = cInk
        ctx.fillText(String(Math.round(progress * 100)).padStart(3, '0') + '%', left + width, lineY - 12)
        ctx.globalAlpha = show * 0.22
        ctx.fillStyle = cInk
        ctx.fillRect(left, lineY, width, 2)
        ctx.globalAlpha = show
        ctx.fillStyle = cAccent
        ctx.fillRect(left, lineY, width * progress, 2)
        ctx.globalAlpha = show * 0.7
        ctx.font = '500 11px ' + MONO
        ctx.textAlign = 'left'
        ctx.fillStyle = cMuted
        ctx.fillText('kw-coms://boot', 20, 30)
      }
      ctx.globalAlpha = 1

      const length = calm ? CALM_FADE : OPEN_AT + OPEN
      if (!handing || since < length) raf = requestAnimationFrame(frame)
      else ctx.clearRect(0, 0, W, H)
    }
    raf = requestAnimationFrame(frame)

    // Safety net: the first frame normally lands within a tick. If none has arrived
    // while the page is actually visible, let go rather than keep covering the home
    // page. (A background tab is left alone — the intro plays once it becomes visible.)
    const watchdog = window.setTimeout(() => {
      if (!start && document.visibilityState === 'visible') {
        cancelAnimationFrame(raf)
        ctx.clearRect(0, 0, W, H)
        release(H / 2)
      }
    }, 2000)

    const onResize = () => resize()
    window.addEventListener('resize', onResize)
    const skip = () => skipRef.current()
    window.addEventListener('keydown', skip)
    window.addEventListener('wheel', skip, { passive: true })
    window.addEventListener('touchstart', skip, { passive: true })

    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(watchdog)
      window.clearTimeout(bootedTimer)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', skip)
      window.removeEventListener('wheel', skip)
      window.removeEventListener('touchstart', skip)
      root.classList.remove(BOOTED_CLASS)
      document.body.style.overflow = prevOverflow
    }
  }, [shouldPlay, calm])

  useEffect(() => {
    if (!released) return
    document.body.style.overflow = ''
    const id = window.setTimeout(() => setGone(true), (calm ? CALM_FADE : OPEN) + 120)
    return () => window.clearTimeout(id)
  }, [released, calm])

  if (gone) return null

  // The skip control sits on a black screen in the full form and on the page colour in the calm one.
  const skipColors = calm
    ? { border: '1px solid var(--app-hairline)', background: 'var(--app-surface)', color: 'var(--app-muted)' }
    : { border: '1px solid rgba(255, 255, 255, 0.18)', background: 'rgba(255, 255, 255, 0.06)', color: '#aeaeb4' }

  return (
    <div
      ref={overlayRef}
      onClick={() => skipRef.current()}
      // Covered until the page is released so it never shows before the first frame (black
      // for the full form, the page colour for the calm one); from then on the canvas alone
      // decides how much of the page is visible, and the page takes the pointer.
      style={{ position: 'fixed', inset: 0, zIndex: 9999, cursor: 'pointer', background: released ? 'transparent' : calm ? 'var(--app-bg)' : '#000', pointerEvents: released ? 'none' : 'auto' }}
    >
      <canvas ref={canvasRef} aria-hidden="true" style={{ display: 'block', width: '100%', height: '100%' }} />
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); skipRef.current() }}
        style={{ position: 'absolute', right: 18, bottom: 16, padding: '6px 14px', borderRadius: 999, ...skipColors, font: '500 12px ' + MONO, cursor: 'pointer', opacity: leaving ? 0 : 1, transition: 'opacity 160ms ease' }}
      >
        skip ›
      </button>
    </div>
  )
}
