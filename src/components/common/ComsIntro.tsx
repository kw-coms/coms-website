import { useEffect, useRef, useState } from 'react'
import { getLogoAsset } from '../../utils/logoAssets'

/**
 * One-time cinematic boot intro: a procedural pixel Earth spins and zooms while
 * the camera descends, crossfades into a pixel silhouette of the Korean
 * peninsula, then the COM's logo + wordmark assemble out of pixels and snap into
 * their crisp final form before the whole overlay fades away to reveal the home.
 *
 * No image assets for Earth/Korea — both are drawn block-by-block on a canvas so
 * they read as pixel art. Plays once per page load (in-app navigation back to the
 * home does NOT replay it; a fresh visit / reload does), is skippable (click / key
 * / scroll / touch), and is skipped entirely under reduced-motion.
 */

// Module-level so an SPA route change back to "/" doesn't replay it, but a full
// page reload (which re-imports the module) does.
let introPlayed = false

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

// Korean peninsula as a normalized outline (x,y in 0..1, north at top, west at
// left), traced to approximate the real coastline: NW border, the wide northern
// body, a fairly straight east coast, the jagged south-west, and the southern
// tip. Filled + sampled to a high-res grid at runtime so it reads as an accurate
// pixel silhouette instead of a hand-typed bitmap. ponytail: hand-traced, not
// survey-grade — good enough to read unmistakably as Korea.
const KOREA_OUTLINE: Array<[number, number]> = [
  [0.34, 0.04], // NW border (toward the mainland)
  [0.46, 0.02],
  [0.58, 0.05],
  [0.62, 0.12], // NE shoulder
  [0.7, 0.16],
  [0.78, 0.2],
  [0.74, 0.27],
  [0.8, 0.33], // east bulge
  [0.76, 0.42],
  [0.78, 0.5],
  [0.72, 0.58],
  [0.74, 0.66], // SE (Busan side)
  [0.66, 0.72],
  [0.6, 0.8],
  [0.52, 0.84],
  [0.46, 0.9], // southern tip
  [0.42, 0.86],
  [0.38, 0.8],
  [0.32, 0.82], // SW coast
  [0.34, 0.74],
  [0.27, 0.7],
  [0.31, 0.62],
  [0.24, 0.56],
  [0.3, 0.5],
  [0.22, 0.44],
  [0.27, 0.37],
  [0.2, 0.31],
  [0.26, 0.24],
  [0.21, 0.18],
  [0.27, 0.1],
]
const JEJU: [number, number, number] = [0.4, 0.97, 0.045] // cx, cy, radius (island)

// Rasterize the outline to a boolean grid of the given resolution (once).
function buildKoreaGrid(gw: number, gh: number): boolean[][] {
  const cv = document.createElement('canvas')
  cv.width = gw
  cv.height = gh
  const c = cv.getContext('2d')
  if (!c) return []
  c.fillStyle = '#fff'
  c.beginPath()
  KOREA_OUTLINE.forEach(([x, y], i) => {
    const px = x * gw
    const py = y * gh
    if (i === 0) c.moveTo(px, py)
    else c.lineTo(px, py)
  })
  c.closePath()
  c.fill()
  // Jeju as a separate filled circle
  c.beginPath()
  c.arc(JEJU[0] * gw, JEJU[1] * gh, JEJU[2] * gw, 0, Math.PI * 2)
  c.fill()
  const data = c.getImageData(0, 0, gw, gh).data
  const grid: boolean[][] = []
  for (let r = 0; r < gh; r++) {
    const row: boolean[] = []
    for (let col = 0; col < gw; col++) {
      row.push(data[(r * gw + col) * 4 + 3] > 128)
    }
    grid.push(row)
  }
  return grid
}

export default function ComsIntro() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [gone, setGone] = useState(false)
  const [fadingOut, setFadingOut] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (introPlayed || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      introPlayed = true
      setGone(true)
      return
    }
    introPlayed = true

    const koreaGrid = buildKoreaGrid(76, 108)
    const koreaCols = koreaGrid[0]?.length ?? 0
    const koreaRows = koreaGrid.length

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

    const drawEarth = (
      cx: number,
      cy: number,
      R: number,
      spin: number,
      alpha: number,
      bumpX = 0,
      bumpY = 0,
    ) => {
      if (alpha <= 0) return
      const block = Math.max(2, Math.round(Math.min(W, H) / 240))
      ctx.globalAlpha = alpha
      const lx = -0.55
      const ly = -0.5
      const lz = 0.66
      // Only iterate the on-screen slice of the globe — R can be many screens
      // wide during the dive, so the full bounding box would be millions of cells.
      const y0 = Math.max(cy - R, -block)
      const y1 = Math.min(cy + R, H + block)
      const x0 = Math.max(cx - R, -block)
      const x1 = Math.min(cx + R, W + block)
      for (let y = y0; y <= y1; y += block) {
        for (let x = x0; x <= x1; x += block) {
          const nx = (x - cx) / R
          const ny = (y - cy) / R
          const d2 = nx * nx + ny * ny
          if (d2 > 1) continue
          const nz = Math.sqrt(1 - d2)
          // spin: rotate sample longitude over time
          const sx = nx * Math.cos(spin) + nz * Math.sin(spin)
          const lon = sx * 2.2 + 4
          const lat = ny * 2.2 + 4
          // Guarantee a continent at the zoom target (in screen-space nx/ny so it
          // stays put while the globe spins) — this is "Korea's location" we dive into.
          const dbx = nx - bumpX
          const dby = ny - bumpY
          const landBump = 0.32 * Math.exp(-(dbx * dbx + dby * dby) / 0.05)
          const n = vnoise(lon * 1.7, lat * 1.7) * 0.6 + vnoise(lon * 3.4, lat * 3.4) * 0.4 + landBump
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
      if (alpha <= 0 || koreaRows === 0) return
      // One small pixel per grid cell — the grid is already high-res, so the
      // silhouette is detailed and the pixels stay tiny.
      const px = Math.max(2, Math.round(Math.min(W, H) * 0.006 * scale))
      const gw = koreaCols * px
      const gh = koreaRows * px
      const ox = cx - gw / 2
      const oy = cy - gh / 2
      ctx.globalAlpha = alpha
      for (let r = 0; r < koreaRows; r++) {
        const row = koreaGrid[r]
        for (let c = 0; c < koreaCols; c++) {
          if (!row[c]) continue
          const shade = 0.88 + hash(c + 1.3, r + 2.7) * 0.12
          const v = Math.round(214 * shade)
          ctx.fillStyle = `rgb(${v},${v},${v})`
          ctx.fillRect(Math.round(ox + c * px), Math.round(oy + r * px), px, px)
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
      const min = Math.min(W, H)
      // Focal point where the target continent (and then Korea) sits — vertically
      // centred so the globe reads head-on, not from below.
      const focalY = H * 0.5
      // The spot on the globe we dive into (screen-space, upper-right ≈ East Asia).
      const TX = 0.16
      const TY = -0.2

      // EARTH — starts as a centred globe, then one continuous accelerating dolly
      // into the target continent. `dive` ramps the target offset in from zero so
      // the opening frame is a centred globe (no "looking up from below"); the
      // exponential radius growth reads as constant-speed flight.
      const dive = easeInOut(seg(t, 0, 2700))
      const eR = min * 0.34 * Math.pow(7, dive)
      const eCx = cx - TX * dive * eR
      const eCy = focalY - TY * dive * eR
      const eAlpha = clamp01(seg(t, 0, 350)) * (1 - easeInOut(seg(t, 1900, 2700)))
      drawEarth(eCx, eCy, eR, t * 0.00045, eAlpha, TX, TY)

      // KOREA — emerges from that same focal point, growing as the Earth blows
      // past and fades, so the two read as one continuous descent.
      const kAlpha = easeInOut(seg(t, 2050, 2750)) * (1 - easeInOut(seg(t, 3300, 3850)))
      const kScale = lerp(0.4, 1.22, easeOut(seg(t, 2050, 3500)))
      drawKorea(cx, focalY, kScale, kAlpha)

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

  // Any fade-out path (auto-finish or a skip click) hides the overlay after the
  // transition. Critically, unlock body scroll NOW: this component renders null
  // when done but stays mounted (the parent keeps it while on "/"), so the main
  // effect's cleanup never runs — without this the body stays overflow:hidden,
  // which turns it into a scroll container and breaks the home's sticky cinema pin.
  useEffect(() => {
    if (!fadingOut) return
    document.body.style.overflow = ''
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
