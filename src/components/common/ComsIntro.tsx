import { useEffect, useRef, useState } from 'react'
import { mixHex, normalizeHex } from '../../utils/themeColors'

/**
 * Boot intro: the screen switches on, the cube logo lights up cell by cell while a hairline
 * fills and the club's four activities are named, then the logo glides onto the home hero's
 * own logo as the screen clears and the hero wordmark is typed in. Short (~2.3s), skippable,
 * plays once per page load.
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

// True when the user prefers reduced motion — the intro (canvas animation) is
// skipped entirely in that case so no motion plays and no canvas work runs.
function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
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
const POWER = 380 // the screen switches on
const SCAN_START = 280 // the logo starts lighting, top row first
const SCAN_TIME = 1150
const HANDOFF = 1900 // the overlay starts dissolving into the hero
const FADE = 420
const STATUS: Array<[number, string]> = [
  [0, 'seminar'],
  [0.25, 'study'],
  [0.5, 'project'],
  [0.75, 'community'],
  [1, 'ready'],
]
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
// The hero logo the intro lands on: the giant one on desktop, the card logo on phones.
const TARGETS = ['.coms-cinema-intrologo', '.coms-logo-3d']
const BOOTING_CLASS = 'coms-booting'
const BOOTED_CLASS = 'coms-booted'

type Box = { x: number; y: number; w: number; h: number }
type Cell = { gx: number; gy: number; face: number; order: number; at: number }

export default function ComsIntro() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // Decided once, at mount. The effect keys off this instead of re-reading the
  // module flag: under React StrictMode the effect runs setup → cleanup → setup,
  // and the first pass already flips `introPlayed`, so re-checking it made the
  // second pass bail and left a blank overlay that never dismissed itself.
  // Reduced motion skips the intro outright (no overlay, no canvas work).
  const [shouldPlay] = useState(() => !(prefersReducedMotion() || introPlayed))
  const [gone, setGone] = useState(!shouldPlay)
  const [fadingOut, setFadingOut] = useState(false)
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
      const dismiss = window.setTimeout(() => setFadingOut(true), 0)
      return () => window.clearTimeout(dismiss)
    }

    const root = document.documentElement
    root.classList.add(BOOTING_CLASS)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Live site theme tokens so the boot screen matches the home page in BOTH light and
    // dark. Re-read while running: this child effect runs before the parent App effect that
    // sets [data-theme-mode], so at mount the final tokens are not applied yet.
    let cBg = '#0f1115'
    let cInk = '#f5f5f7'
    let cAccent = '#2997ff'
    let cMuted = '#aeaeb4'
    let cSide = '#bcd5ff'
    const readTheme = () => {
      const cs = getComputedStyle(root)
      const token = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback
      cBg = token('--app-bg', cBg)
      cInk = token('--app-text', cInk)
      cAccent = normalizeHex(token('--app-accent', cAccent))
      cMuted = token('--app-muted', cMuted)
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

    // Where the hero's logo is right now (it floats a few px, so this is asked every frame).
    const heroLogoBox = (): Box | null => {
      for (const selector of TARGETS) {
        const el = document.querySelector<HTMLElement>(selector)
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (r.width > 12 && r.height > 12 && r.bottom > 0 && r.top < H) return { x: r.left, y: r.top, w: r.width, h: r.height }
      }
      return null
    }
    // The logo boots in the middle of the screen and travels to the hero logo at the handoff.
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
    let stage: Box | null = null
    let bootedTimer = 0

    const beginHandoff = () => {
      handing = true
      root.classList.remove(BOOTING_CLASS)
      root.classList.add(BOOTED_CLASS)
      bootedTimer = window.setTimeout(() => root.classList.remove(BOOTED_CLASS), 1100)
      setFadingOut(true)
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
      if (!handing && t >= handoffAt) beginHandoff()
      const hand = handing ? easeInOut(clamp01((t - handoffAt) / FADE)) : 0
      const to = heroLogoBox() ?? stage
      const box: Box = {
        x: stage.x + (to.x - stage.x) * hand,
        y: stage.y + (to.y - stage.y) * hand,
        w: stage.w + (to.w - stage.w) * hand,
        h: stage.h + (to.h - stage.h) * hand,
      }
      // The screen clears first; the logo stays lit until it has landed on the hero's own.
      const veil = 1 - hand
      const lit = 1 - clamp01((hand - 0.7) / 0.3)

      // The screen: black until the picture opens from a centre line.
      ctx.clearRect(0, 0, W, H)
      const open = easeOut(clamp01(t / POWER))
      if (open < 1) {
        ctx.globalAlpha = veil
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, W, H)
      }
      const band = H * open
      ctx.globalAlpha = veil
      ctx.fillStyle = cBg
      ctx.fillRect(0, H / 2 - band / 2, W, band)
      if (t < POWER) {
        ctx.globalAlpha = 1 - open
        ctx.fillStyle = cInk
        ctx.fillRect(0, H / 2 - 1, W, 2)
      }
      ctx.globalAlpha = 1

      // The logo matrix.
      const stepX = box.w / cols
      const stepY = box.h / rows
      const dot = Math.min(stepX, stepY) * 0.68
      const reveal = clamp01((t - SCAN_START) / SCAN_TIME)
      const idle = stepX * 0.34
      ctx.fillStyle = cInk
      ctx.globalAlpha = 0.07 * open * veil
      for (let gy = -3; gy < rows + 3; gy += 1) {
        for (let gx = -3; gx < cols + 3; gx += 1) {
          ctx.fillRect(box.x + (gx + 0.5) * stepX - idle / 2, box.y + (gy + 0.5) * stepY - idle / 2, idle, idle)
        }
      }
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i]
        if (cell.order > reveal * 1.06) continue
        if (cell.at < 0) cell.at = t
        const x = box.x + (cell.gx + 0.5) * stepX
        const y = box.y + (cell.gy + 0.5) * stepY
        ctx.globalAlpha = (0.86 + 0.14 * Math.sin((cell.gx + cell.gy) * 0.22 - t * 0.0013)) * lit
        ctx.fillStyle = cell.face === 1 ? cInk : cell.face === 2 ? cSide : cAccent
        ctx.fillRect(x - dot / 2, y - dot / 2, dot, dot)
        const flash = 1 - (t - cell.at) / 320
        if (flash > 0.02) {
          ctx.globalAlpha = flash * lit
          ctx.fillStyle = cInk
          ctx.fillRect(x - dot * 0.75, y - dot * 0.75, dot * 1.5, dot * 1.5)
        }
      }
      if (reveal > 0 && reveal < 1) {
        ctx.globalAlpha = 0.55
        ctx.fillStyle = cAccent
        ctx.fillRect(box.x - stepX * 3, box.y + reveal * box.h, box.w + stepX * 6, 1.5)
      }

      // Status: a hairline that fills while the four activities are named.
      const progress = clamp01((t - SCAN_START) / (SCAN_TIME + 200))
      const show = clamp01((t - 260) / 240) * (1 - clamp01((t - handoffAt) / 180))
      if (show > 0.01) {
        const width = Math.min(220, W * 0.5)
        const lineY = stage.y + stage.h + Math.max(34, stage.h * 0.2)
        const left = W / 2 - width / 2
        let label = STATUS[0][1]
        for (const [at, text] of STATUS) if (progress >= at) label = text
        ctx.globalAlpha = show
        ctx.font = '500 12px ' + MONO
        ctx.textAlign = 'center'
        ctx.textBaseline = 'alphabetic'
        ctx.fillStyle = cMuted
        ctx.fillText(label, W / 2, lineY - 12)
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

      if (!handing || t < handoffAt + FADE + 60) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    // Safety net: the first frame normally lands within a tick. If none has arrived
    // while the page is actually visible, fade out rather than keep covering the home
    // page. (A background tab is left alone — the intro plays once it becomes visible.)
    const watchdog = window.setTimeout(() => {
      if (!start && document.visibilityState === 'visible') beginHandoff()
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
      root.classList.remove(BOOTING_CLASS, BOOTED_CLASS)
      document.body.style.overflow = prevOverflow
    }
  }, [shouldPlay])

  useEffect(() => {
    if (!fadingOut) return
    document.body.style.overflow = ''
    const id = window.setTimeout(() => setGone(true), FADE)
    return () => window.clearTimeout(id)
  }, [fadingOut])

  if (gone) return null

  return (
    <div
      onClick={() => skipRef.current()}
      // Black until the handoff so the page never shows before the first frame; from then on
      // the canvas alone decides how much of the page is visible.
      style={{ position: 'fixed', inset: 0, zIndex: 9999, cursor: 'pointer', background: fadingOut ? 'transparent' : '#000', pointerEvents: fadingOut ? 'none' : 'auto' }}
    >
      <canvas ref={canvasRef} aria-hidden="true" style={{ display: 'block', width: '100%', height: '100%' }} />
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); skipRef.current() }}
        style={{ position: 'absolute', right: 18, bottom: 16, padding: '6px 14px', borderRadius: 999, border: '1px solid var(--app-hairline)', background: 'var(--app-surface)', color: 'var(--app-muted)', font: '500 12px ' + MONO, cursor: 'pointer', opacity: fadingOut ? 0 : 1, transition: 'opacity 160ms ease' }}
      >
        skip ›
      </button>
    </div>
  )
}
