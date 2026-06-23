import { useEffect, useRef, useState } from 'react'
import { getLogoAsset } from '../../utils/logoAssets'

/**
 * One-time cinematic boot intro: a procedural pixel Earth spins and zooms while
 * the camera descends, crossfades into a pixel silhouette of the Korean
 * peninsula, then the COM's logo + wordmark assemble out of pixels and snap into
 * their crisp final form before the whole overlay fades away to reveal the home.
 *
 * No image assets for Earth/Korea — both are drawn block-by-block on a canvas so
 * they read as chunky pixel art. Plays once per browser session, is skippable
 * (click / key / scroll / touch), and is skipped entirely under reduced-motion.
 */

const SEEN_KEY = 'coms-intro-seen'

// Phase timeline (ms from start). Windows overlap so phases crossfade.
const EARTH_END = 2200
const KOREA_IN = 1900
const KOREA_END = 3700
const LOGO_IN = 3400
const LOGO_SETTLE = 4600
const DONE = 5300
const FADE = 600 // overlay fade-out duration

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a))
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// Cheap value noise → blobby continents. Lattice hash, bilinear smoothed.
function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}
function vnoise(x: number, y: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const u = fx * fx * (3 - 2 * fx)
  const v = fy * fy * (3 - 2 * fy)
  const a = hash(xi, yi)
  const b = hash(xi + 1, yi)
  const c = hash(xi, yi + 1)
  const d = hash(xi + 1, yi + 1)
  return lerp(lerp(a, b, u), lerp(c, d, u), v)
}

// Korean peninsula, stylized 0/1 bitmap (north at top).
// ponytail: evocative silhouette, not cartographically exact.
const KOREA = [
  '0001111000000000',
  '0011111100000000',
  '0011111110000000',
  '0001111111000000',
  '0001111111100000',
  '0000111111100000',
  '0000011111110000',
  '0000011111111000',
  '0000001111111000',
  '0000001111111100',
  '0000001111111100',
  '0000011111111000',
  '0000011111110000',
  '0000011111110000',
  '0000001111110000',
  '0000000111110000',
  '0000000111100000',
  '0000000111000000',
  '0000000110000000',
  '0000000100000000',
  '0000000000000000',
  '0000001100000000',
].map((r) => r.split('').map((c) => c === '1'))

export default function ComsIntro() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [gone, setGone] = useState(false)
  const [fadingOut, setFadingOut] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.sessionStorage.getItem(SEEN_KEY)) {
      setGone(true)
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.sessionStorage.setItem(SEEN_KEY, '1')
      setGone(true)
      return
    }
    window.sessionStorage.setItem(SEEN_KEY, '1')

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Lock the page so the intro can't be scrolled past mid-play.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    let W = 0
    let H = 0
    let dpr = 1
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1)
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    const logo = new Image()
    logo.src = getLogoAsset('COMs_logo_vec')
    let logoReady = false
    logo.onload = () => {
      logoReady = true
    }

    // Stars for the space backdrop (fixed, twinkle a touch).
    const stars = Array.from({ length: 90 }, (_, i) => ({
      x: hash(i, 7) * W,
      y: hash(i, 99) * H,
      r: hash(i, 31) > 0.85 ? 2 : 1,
      tw: hash(i, 53),
    }))

    let raf = 0
    let start = 0
    let finishing = false

    const finish = () => {
      if (finishing) return
      finishing = true
      setFadingOut(true)
    }

    const drawEarth = (cx: number, cy: number, R: number, spin: number, alpha: number) => {
      if (alpha <= 0) return
      const block = Math.max(2, Math.round(Math.min(W, H) / 240))
      ctx.globalAlpha = alpha
      const lx = -0.55
      const ly = -0.5
      const lz = 0.66
      for (let y = cy - R; y <= cy + R; y += block) {
        for (let x = cx - R; x <= cx + R; x += block) {
          const nx = (x - cx) / R
          const ny = (y - cy) / R
          const d2 = nx * nx + ny * ny
          if (d2 > 1) continue
          const nz = Math.sqrt(1 - d2)
          // spin: rotate sample longitude over time
          const sx = nx * Math.cos(spin) + nz * Math.sin(spin)
          const lon = sx * 2.2 + 4
          const lat = ny * 2.2 + 4
          const n = vnoise(lon * 1.7, lat * 1.7) * 0.6 + vnoise(lon * 3.4, lat * 3.4) * 0.4
          const isLand = n > 0.45
          const ice = Math.abs(ny) > 0.88
          // crisp 2-tone B&W: hard land/sea boundary -> clean pixel islands, no blur
          let g: number
          if (ice) g = 240
          else if (isLand) g = 222 + Math.round(vnoise(lon * 6, lat * 6) * 24)
          else g = 30 + Math.round(vnoise(lon * 6, lat * 6) * 16)
          const lambert = clamp01(nx * lx + ny * ly + nz * lz) * 0.25 + 0.82
          const v = Math.min(255, Math.round(g * lambert))
          ctx.fillStyle = `rgb(${v},${v},${v})`
          ctx.fillRect(Math.round(x), Math.round(y), block, block)
        }
      }
      // soft white atmosphere rim
      ctx.globalAlpha = alpha * 0.45
      const grad = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.12)
      grad.addColorStop(0, 'rgba(255,255,255,0)')
      grad.addColorStop(1, 'rgba(255,255,255,0.3)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(cx, cy, R * 1.12, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }

    const drawKorea = (cx: number, cy: number, scale: number, alpha: number) => {
      if (alpha <= 0) return
      const cols = KOREA[0].length
      const rows = KOREA.length
      // Subdivide each bitmap cell into f×f small pixels (small-pixel look) but
      // keep the whole silhouette on screen with low-variance, near-solid land so
      // it reads as the peninsula, not static.
      const f = 3
      const px = Math.max(3, Math.round(Math.min(W, H) * 0.0095 * scale))
      const gw = cols * f * px
      const gh = rows * f * px
      const ox = cx - gw / 2
      const oy = cy - gh / 2
      ctx.globalAlpha = alpha
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (!KOREA[r][c]) continue
          for (let sy = 0; sy < f; sy++) {
            for (let sx = 0; sx < f; sx++) {
              const shade = 0.86 + hash(c * f + sx + 1.3, r * f + sy + 2.7) * 0.14
              const v = Math.round(212 * shade)
              ctx.fillStyle = `rgb(${v},${v},${v})`
              ctx.fillRect(
                Math.round(ox + (c * f + sx) * px),
                Math.round(oy + (r * f + sy) * px),
                px,
                px,
              )
            }
          }
        }
      }
      ctx.globalAlpha = 1
    }

    // Offscreen pixel-sample of the logo so it can assemble block by block.
    const drawLogo = (cx: number, cy: number, size: number, assemble: number) => {
      const logoSize = size
      const lx = cx - logoSize / 2
      const ly = cy - logoSize / 2
      if (assemble >= 1 && logoReady) {
        // settled: crisp logo + wordmark
        ctx.drawImage(logo, lx, ly, logoSize, logoSize)
      } else if (logoReady) {
        const block = Math.max(2, Math.round(logoSize / 96))
        // render logo small into a temp canvas, sample block centers
        const tmp = document.createElement('canvas')
        const n = Math.max(8, Math.round(logoSize / block))
        tmp.width = n
        tmp.height = n
        const tctx = tmp.getContext('2d')
        if (tctx) {
          tctx.drawImage(logo, 0, 0, n, n)
          const data = tctx.getImageData(0, 0, n, n).data
          for (let gy = 0; gy < n; gy++) {
            for (let gx = 0; gx < n; gx++) {
              const i = (gy * n + gx) * 4
              const a = data[i + 3]
              if (a < 30) continue
              // each block has a random reveal threshold → assembles over time
              const delay = hash(gx + 11, gy + 17)
              if (assemble < delay) continue
              ctx.fillStyle = `rgba(${data[i]},${data[i + 1]},${data[i + 2]},${(a / 255).toFixed(3)})`
              ctx.fillRect(
                Math.round(lx + gx * block),
                Math.round(ly + gy * block),
                block,
                block,
              )
            }
          }
        }
      }
      // wordmark assembles in just under the logo
      const wordSize = Math.round(logoSize * 0.42)
      ctx.save()
      ctx.font = `700 ${wordSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const wy = cy + logoSize * 0.78
      if (assemble >= 1) {
        ctx.fillStyle = '#141414'
        ctx.fillText("COM's", cx, wy)
      } else {
        ctx.globalAlpha = easeOut(seg(assemble, 0.35, 1))
        ctx.fillStyle = '#141414'
        ctx.fillText("COM's", cx, wy)
        ctx.globalAlpha = 1
      }
      ctx.restore()
    }

    const frame = (now: number) => {
      if (!start) start = now
      const t = now - start
      if (t >= DONE && !finishing) {
        finish()
      }

      // Background: deep space → home surface as logo settles.
      const spaceFade = easeInOut(seg(t, LOGO_IN, LOGO_SETTLE))
      ctx.clearRect(0, 0, W, H)
      const bg = ctx.createLinearGradient(0, 0, 0, H)
      const bgTop = Math.round(lerp(10, 248, spaceFade))
      const bgBot = Math.round(lerp(4, 240, spaceFade))
      bg.addColorStop(0, `rgb(${bgTop},${bgTop},${bgTop})`)
      bg.addColorStop(1, `rgb(${bgBot},${bgBot},${bgBot})`)
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      // Stars fade out as we descend out of space.
      const starA = (1 - spaceFade) * 0.9
      if (starA > 0.01) {
        for (const s of stars) {
          ctx.globalAlpha = starA * (0.5 + 0.5 * Math.abs(Math.sin(t * 0.002 + s.tw * 6)))
          ctx.fillStyle = '#fff'
          ctx.fillRect(s.x, s.y, s.r, s.r)
        }
        ctx.globalAlpha = 1
      }

      const cx = W / 2

      // EARTH — zoom in + descend (camera drops, earth rises off top).
      const eP = seg(t, 0, EARTH_END)
      const eAlpha = clamp01(seg(t, 0, 350)) * (1 - easeInOut(seg(t, 1600, EARTH_END)))
      const eR = lerp(Math.min(W, H) * 0.22, Math.min(W, H) * 0.62, easeInOut(eP))
      const eCy = lerp(H * 0.46, H * 0.04, easeInOut(eP))
      drawEarth(cx, eCy, eR, t * 0.0006, eAlpha)

      // KOREA — fades in mid, zooms, keeps descending.
      const kP = seg(t, KOREA_IN, KOREA_END)
      const kAlpha = easeInOut(seg(t, KOREA_IN, 2400)) * (1 - easeInOut(seg(t, 3200, KOREA_END)))
      const kScale = lerp(0.72, 1.28, easeInOut(kP))
      const kCy = lerp(H * 0.6, H * 0.42, easeInOut(kP))
      drawKorea(cx, kCy, kScale, kAlpha)

      // LOGO — assembles from pixels, settles, then overlay fades.
      const assemble = easeOut(seg(t, LOGO_IN, LOGO_SETTLE))
      const logoAlpha = easeInOut(seg(t, LOGO_IN, LOGO_IN + 350))
      if (logoAlpha > 0) {
        const pop = 1 + 0.06 * (1 - easeOut(seg(t, LOGO_SETTLE, LOGO_SETTLE + 250))) * (assemble >= 1 ? 1 : 0)
        ctx.globalAlpha = logoAlpha
        drawLogo(cx, H * 0.44, Math.min(W, H) * 0.34 * pop, assemble)
        ctx.globalAlpha = 1
      }

      if (!finishing || t < DONE + 50) {
        raf = requestAnimationFrame(frame)
      }
    }
    raf = requestAnimationFrame(frame)

    const onResize = () => resize()
    window.addEventListener('resize', onResize)
    const skip = () => finish()
    window.addEventListener('keydown', skip)
    window.addEventListener('wheel', skip, { passive: true })
    window.addEventListener('touchstart', skip, { passive: true })

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', skip)
      window.removeEventListener('wheel', skip)
      window.removeEventListener('touchstart', skip)
      document.body.style.overflow = prevOverflow
    }
  }, [])

  // Any fade-out path (auto-finish or a skip click) unmounts after the transition.
  useEffect(() => {
    if (!fadingOut) return
    const id = window.setTimeout(() => setGone(true), FADE)
    return () => window.clearTimeout(id)
  }, [fadingOut])

  if (gone) return null

  return (
    <div
      onClick={() => setFadingOut(true)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        opacity: fadingOut ? 0 : 1,
        transition: `opacity ${FADE}ms ease`,
        background: '#080808',
        cursor: 'pointer',
      }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setFadingOut(true)
        }}
        style={{
          position: 'absolute',
          right: 20,
          bottom: 20,
          padding: '6px 14px',
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.25)',
          background: 'rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.85)',
          fontSize: 13,
          fontWeight: 600,
          backdropFilter: 'blur(8px)',
        }}
      >
        Skip
      </button>
    </div>
  )
}
