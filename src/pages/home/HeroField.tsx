import { useEffect, useRef } from 'react'
import { hexToRgb, mixHex, normalizeHex } from '../../utils/themeColors'
import { SCREEN_ON_EVENT, type ScreenOnDetail } from '../../utils/screenOn'

/**
 * The home hero's backdrop: the screen's own pixel grid, kept alive. Every few seconds a
 * band of light crosses the dots on a diagonal, a slow swell drifts under it, short signals
 * run along the rows and columns like traffic on a board, and the dots near the pointer
 * brighten. When the boot intro switches the screen on (ComsIntro fires SCREEN_ON_EVENT) the
 * grid flares once from that line and settles.
 *
 * Decorative only: aria-hidden, no pointer events, and it stops drawing while the hero is
 * off screen. Under reduced motion nothing plays by itself: the grid is still, it answers the
 * pointer with light, and it glows once when the screen comes on.
 */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (from: number, to: number, v: number) => {
  const t = clamp01((v - from) / (to - from))
  return t * t * (3 - 2 * t)
}

const DOT = 1.6
const TRAIL = 11 // cells a signal leaves lit behind its head
const REACH = 210 // px around the pointer that lights up
const SURGE = 1500 // ms the switch-on flare takes to settle
const SWEEP_EVERY = 6800 // ms between the bands of light that cross the grid
const SWEEP_TIME = 2400 // ms one crossing takes
const SWEEP_WIDTH = 150 // px, half the band

type Signal = { path: Int32Array; born: number; speed: number }

export default function HeroField() {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d') ?? null
    if (!canvas || !ctx || typeof window.matchMedia !== 'function') return

    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const root = document.documentElement

    // Colours follow the live theme: pale dots on the dark stage, ink dots on the light one,
    // and the accent for whatever is lit.
    let ink = '#f5f5f7'
    let lit = '#7fb8ff'
    let hot = '#ffffff'
    let rest = 0.2
    let sprite: HTMLCanvasElement | null = null
    let pool: HTMLCanvasElement | null = null
    // The root's inline style also carries the scroll progress, so a change there is only a
    // theme change when the mode or the accent is different.
    const themeKeyNow = () => `${root.dataset.themeMode}|${root.style.getPropertyValue('--app-accent')}`
    let themeKey = ''
    const readTheme = () => {
      themeKey = themeKeyNow()
      const cs = getComputedStyle(root)
      const dark = root.dataset.themeMode === 'dark'
      const text = cs.getPropertyValue('--app-text').trim()
      const accent = normalizeHex(cs.getPropertyValue('--app-accent').trim())
      ink = /^#[0-9a-f]{6}$/i.test(text) ? text : dark ? '#f5f5f7' : '#1d1d1f'
      lit = dark ? mixHex(accent, '#ffffff', 0.38) : accent
      hot = dark ? '#ffffff' : mixHex(accent, '#000000', 0.12)
      rest = dark ? 0.2 : 0.15
      const { r, g, b } = hexToRgb(lit)
      sprite = document.createElement('canvas')
      sprite.width = 48
      sprite.height = 48
      const g2 = sprite.getContext('2d')
      if (g2) {
        const halo = g2.createRadialGradient(24, 24, 0, 24, 24, 24)
        halo.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.6)`)
        halo.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
        g2.fillStyle = halo
        g2.fillRect(0, 0, 48, 48)
      }
      pool = document.createElement('canvas')
      pool.width = 128
      pool.height = 128
      const g3 = pool.getContext('2d')
      if (g3) {
        const wash = g3.createRadialGradient(64, 64, 0, 64, 64, 64)
        wash.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${dark ? 0.2 : 0.14})`)
        wash.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${dark ? 0.07 : 0.05})`)
        wash.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
        g3.fillStyle = wash
        g3.fillRect(0, 0, 128, 128)
      }
    }

    let W = 0
    let H = 0
    let step = 23
    let cols = 0
    let rows = 0
    let ox = 0
    let oy = 0
    // How much of each dot shows: dimmed behind the hero copy, faded out at the foot.
    let weight = new Float32Array(0)
    // Light the signals add to each dot this frame.
    let energy = new Float32Array(0)
    let still: HTMLCanvasElement | null = null
    let rate = 1
    const signals: Signal[] = []
    let nextSignal = 0

    const build = () => {
      W = canvas.clientWidth
      H = canvas.clientHeight
      // Signals are stored as cell indices, which mean nothing on a grid of another size.
      signals.length = 0
      if (W < 2 || H < 2) return
      // The dots are a pixel or two across, so a sharper bitmap than this only costs fill rate.
      const dpr = Math.min(1.5, window.devicePixelRatio || 1)
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      step = W < 640 ? 20 : 23
      cols = Math.ceil(W / step) + 1
      rows = Math.ceil(H / step) + 1
      ox = (W - (cols - 1) * step) / 2
      oy = (H - (rows - 1) * step) / 2
      rate = Math.min(2.2, Math.max(0.45, (1280 * 760) / (W * H)))
      weight = new Float32Array(cols * rows)
      energy = new Float32Array(cols * rows)

      const rx = Math.min(W * 0.4, 420)
      const ry = Math.min(H * 0.44, 310)
      still = document.createElement('canvas')
      still.width = canvas.width
      still.height = canvas.height
      const g = still.getContext('2d')
      if (g) {
        g.setTransform(dpr, 0, 0, dpr, 0, 0)
        g.fillStyle = ink
      }
      for (let r = 0; r < rows; r++) {
        const y = oy + r * step
        for (let c = 0; c < cols; c++) {
          const x = ox + c * step
          const fromCopy = Math.hypot((x - W / 2) / rx, (y - H * 0.47) / ry)
          const w = (0.36 + 0.64 * smooth(0.72, 1.2, fromCopy)) * smooth(0, 120, H - y)
          weight[r * cols + c] = w
          if (g && w > 0.02) {
            g.globalAlpha = rest * w
            g.fillRect(x - DOT / 2, y - DOT / 2, DOT, DOT)
          }
        }
      }
    }

    // A signal runs a few cells along a row or a column and may take one right-angle turn.
    const spawn = (now: number) => {
      const length = 8 + Math.floor(Math.random() * 16)
      const turnAt = Math.random() < 0.45 ? 3 + Math.floor(Math.random() * (length - 5)) : -1
      let c = Math.floor(Math.random() * cols)
      let r = Math.floor(Math.random() * rows)
      let dc = 0
      let dr = 0
      if (Math.random() < 0.6) dc = Math.random() < 0.5 ? 1 : -1
      else dr = Math.random() < 0.5 ? 1 : -1
      const path = new Int32Array(length)
      let n = 0
      for (let k = 0; k < length; k++) {
        if (c < 0 || r < 0 || c >= cols || r >= rows) break
        path[n++] = r * cols + c
        if (k === turnAt) {
          const side = Math.random() < 0.5 ? 1 : -1
          if (dc) {
            dc = 0
            dr = side
          } else {
            dr = 0
            dc = side
          }
        }
        c += dc
        r += dr
      }
      if (n > 3) signals.push({ path: path.subarray(0, n), born: now, speed: 0.016 + Math.random() * 0.014 })
    }

    // The pointer's glow trails the pointer a little, and fades when it leaves the hero.
    let px = 0
    let py = 0
    let tx = 0
    let ty = 0
    let near = 0
    let nearTarget = 0
    let surgeAt = -1
    let surgeY = 0
    // The first band sets off a moment after the grid appears (or after the screen comes on).
    let sweepFrom = performance.now() + 900 - SWEEP_EVERY

    let raf = 0
    let running = false
    let visible = true
    let stale = false
    // The idle grid changes slowly, so it is drawn about 30 times a second however fast the
    // display refreshes. While it follows the pointer or flares it is drawn at about 60, unless
    // the machine cannot draw it comfortably.
    let drawnAt = 0
    let cost = 0
    let halved = false

    const frame = (now: number) => {
      raf = 0
      if (!visible) {
        running = false
        return
      }
      const lively = !halved && (surgeAt >= 0 || nearTarget === 1 || near > 0.01)
      if (now - drawnAt < (lively ? 12 : 30)) {
        raf = requestAnimationFrame(frame)
        return
      }
      drawnAt = now
      if (stale) {
        stale = false
        readTheme()
        build()
      }
      const began = performance.now()
      ctx.clearRect(0, 0, W, H)
      if (still) ctx.drawImage(still, 0, 0, W, H)
      px += (tx - px) * 0.18
      py += (ty - py) * 0.18
      near += (nearTarget - near) * 0.09
      if (near > 0.01 && pool) {
        // A pool of light under the pointer, as if a torch were held to the panel.
        ctx.globalAlpha = near * 0.5
        ctx.drawImage(pool, px - REACH * 1.3, py - REACH * 1.3, REACH * 2.6, REACH * 2.6)
        ctx.globalAlpha = 1
      }

      energy.fill(0)
      if (!calm) {
        if (now >= nextSignal) {
          spawn(now)
          nextSignal = now + (110 + Math.random() * 240) * rate
        }
        for (let s = signals.length - 1; s >= 0; s--) {
          const signal = signals[s]
          const head = (now - signal.born) * signal.speed
          if (head - TRAIL > signal.path.length) {
            signals.splice(s, 1)
            continue
          }
          const first = Math.max(0, Math.ceil(head - TRAIL))
          const last = Math.min(signal.path.length - 1, Math.floor(head))
          for (let k = first; k <= last; k++) {
            const fade = 1 - (head - k) / TRAIL
            energy[signal.path[k]] += fade * fade
          }
        }
      }

      let warm = 0
      let front = -1
      let frontGain = 0
      if (surgeAt >= 0) {
        const age = now - surgeAt
        if (age >= SURGE) surgeAt = -1
        else {
          const left = 1 - age / SURGE
          warm = 0.4 * left * left
          if (!calm) {
            front = age * 1.15
            frontGain = 0.9 * left
          }
        }
      }

      // A band of light crosses the grid on a diagonal, then the grid rests until the next one.
      let band = -1
      if (!calm) {
        const crossing = ((now - sweepFrom) % SWEEP_EVERY) / SWEEP_TIME
        if (crossing >= 0 && crossing < 1) band = -SWEEP_WIDTH + (W * 0.87 + H * 0.5 + SWEEP_WIDTH * 2) * crossing
      }

      for (let r = 0; r < rows; r++) {
        const y = oy + r * step
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c
          const w = weight[i]
          if (w < 0.02) continue
          const x = ox + c * step
          let e = energy[i] + warm
          if (!calm) {
            const swell =
              (Math.sin(x * 0.0105 + y * 0.0062 - now * 0.00055) + Math.sin(x * -0.0043 + y * 0.0121 + now * 0.00038 + 1.7)) * 0.5
            if (swell > 0) e += swell * swell * swell * 0.34
            if (band >= 0) {
              const d = Math.abs(x * 0.87 + y * 0.5 - band)
              if (d < SWEEP_WIDTH) {
                const k = 1 - d / SWEEP_WIDTH
                e += k * k * (3 - 2 * k) * 0.6
              }
            }
          }
          let own = 0
          if (near > 0.01) {
            const d = Math.hypot(x - px, y - py)
            if (d < REACH) {
              const k = 1 - d / REACH
              own = k * k * (3 - 2 * k) * near * 0.85
            }
          }
          if (front >= 0) {
            const d = Math.abs(Math.abs(y - surgeY) - front)
            if (d < 90) {
              const k = 1 - d / 90
              e += k * k * frontGain
            }
          }
          // The pointer's own light is the visitor's doing, so the copy dims it less.
          e = e * w + own * (0.45 + 0.55 * w)
          if (e < 0.03) continue
          const v = e > 1 ? 1 : e
          const size = DOT + v * 2.3
          ctx.globalAlpha = v < 0.5 ? v * 1.6 : 0.8 + (v - 0.5) * 0.4
          ctx.fillStyle = v > 0.7 ? hot : lit
          ctx.fillRect(x - size / 2, y - size / 2, size, size)
          if (v > 0.3 && sprite) {
            ctx.globalAlpha = (v - 0.3) * 1.1
            ctx.drawImage(sprite, x - 15, y - 15, 30, 30)
          }
        }
      }
      ctx.globalAlpha = 1
      cost += (performance.now() - began - cost) * 0.08
      if (cost > 7) halved = true

      // The calm form only draws while something is happening.
      if (calm && surgeAt < 0 && nearTarget === 0 && near < 0.01) {
        running = false
        return
      }
      raf = requestAnimationFrame(frame)
    }
    const kick = () => {
      if (running || !visible) return
      running = true
      raf = requestAnimationFrame(frame)
    }

    readTheme()
    build()
    kick()

    const onPointer = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      const rect = canvas.getBoundingClientRect()
      tx = event.clientX - rect.left
      ty = event.clientY - rect.top
      const inside = tx >= 0 && ty >= 0 && tx <= rect.width && ty <= rect.height
      if (inside && near < 0.02) {
        px = tx
        py = ty
      }
      nearTarget = inside ? 1 : 0
      if (inside) kick()
    }
    const onPointerGone = () => {
      nearTarget = 0
    }
    const onScreenOn = (event: Event) => {
      const y = (event as CustomEvent<ScreenOnDetail>).detail?.y
      const rect = canvas.getBoundingClientRect()
      surgeY = typeof y === 'number' ? y - rect.top : rect.height / 2
      surgeAt = performance.now()
      sweepFrom = surgeAt + SURGE + 500 - SWEEP_EVERY
      kick()
    }
    const refresh = () => {
      stale = true
      kick()
    }

    window.addEventListener('pointermove', onPointer, { passive: true })
    document.documentElement.addEventListener('pointerleave', onPointerGone)
    window.addEventListener('blur', onPointerGone)
    window.addEventListener(SCREEN_ON_EVENT, onScreenOn)
    const sizes =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            if (canvas.clientWidth !== W || canvas.clientHeight !== H) refresh()
          })
    sizes?.observe(canvas)
    const themes = new MutationObserver(() => {
      if (themeKeyNow() !== themeKey) refresh()
    })
    themes.observe(root, { attributes: true, attributeFilter: ['data-theme-mode', 'style'] })
    const views = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting)
      if (visible) kick()
    })
    views.observe(canvas)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onPointer)
      document.documentElement.removeEventListener('pointerleave', onPointerGone)
      window.removeEventListener('blur', onPointerGone)
      window.removeEventListener(SCREEN_ON_EVENT, onScreenOn)
      sizes?.disconnect()
      themes.disconnect()
      views.disconnect()
    }
  }, [])

  return <canvas ref={ref} aria-hidden="true" className="coms-hero-field" />
}
