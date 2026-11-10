import { useEffect } from 'react'
import { getPerfState, subscribePerf } from '../utils/perfMode'

// Scroll-tied scenes for the home page. Everything here is driven by the visitor's scroll and
// does nothing under reduced motion or in lite mode (CSS shows the finished state there).

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const REDUCED = '(prefers-reduced-motion: reduce)'
const SCENE = '[data-scene]'

// One measurement pass per frame: every rect is read first, then every write is made, so the
// scroll frame never forces layout more than once. Other fixed pieces (the scene rail) join the
// same pass through onSceneFrame.
type Writer = () => void
type Reader = () => Writer | void
const readers = new Set<Reader>()
let kick: () => void = () => {}

/** Registers a reader for the shared per-frame pass. It reads layout and returns what to write. */
export function onSceneFrame(reader: Reader) {
  readers.add(reader)
  kick()
  return () => {
    readers.delete(reader)
  }
}

function read(el: HTMLElement): Writer {
  const rect = el.getBoundingClientRect()
  const vh = window.innerHeight
  // A pinned track (data-scene-pin) is taller than the screen: progress runs while it is stuck.
  // Any other scene runs from its top edge entering at the bottom to its bottom edge leaving at the top.
  const pinned = el.hasAttribute('data-scene-pin') && rect.height > vh + 1
  const p = pinned ? -rect.top / (rect.height - vh) : (vh - rect.top) / (vh + rect.height)
  const isOpening = el.dataset.scene === 'opening'
  const out = clamp01(-rect.top / Math.max(1, rect.height * 0.85))
  return () => {
    el.style.setProperty('--p', clamp01(p).toFixed(4))
    // The opening scene also reports how far it has scrolled away.
    if (isOpening) el.style.setProperty('--hero-out', out.toFixed(3))
  }
}

function clear(el: HTMLElement) {
  el.style.removeProperty('--p')
  el.style.removeProperty('--hero-out')
}

/** Sets `--p` (0..1) on every `[data-scene]` element inside `.cine-root` while it is near the screen. */
export function useSceneProgress() {
  useEffect(() => {
    const root = document.querySelector('.cine-root')
    if (!root || typeof IntersectionObserver === 'undefined') return
    const reduced = window.matchMedia(REDUCED)
    const near = new Set<HTMLElement>()
    let raf = 0

    const off = () => reduced.matches || getPerfState().mode === 'lite'
    const run = () => {
      raf = 0
      const writes: Writer[] = []
      if (!off()) near.forEach((el) => writes.push(read(el)))
      readers.forEach((reader) => {
        const write = reader()
        if (write) writes.push(write)
      })
      writes.forEach((write) => write())
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(run)
    }
    kick = schedule

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const el = entry.target as HTMLElement
          if (entry.isIntersecting) near.add(el)
          else {
            near.delete(el)
            // Far from the screen a scene rests in its finished state (its CSS falls back to it).
            clear(el)
          }
        })
        schedule()
      },
      { rootMargin: '100% 0px' },
    )
    // Looping animation runs only while its scene is on the screen (see cinema-core.css).
    let openingOn = true
    const live = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        entry.target.classList.toggle('is-onscreen', entry.isIntersecting)
        if ((entry.target as HTMLElement).dataset.scene === 'opening') openingOn = entry.isIntersecting
      })
    })
    root.querySelectorAll<HTMLElement>(SCENE).forEach((el) => {
      io.observe(el)
      live.observe(el)
    })

    // Tickers speed up with the scroll velocity and settle back. Only while the opening is on
    // screen, one read per frame, and the animation list is looked up once.
    const tickers = Array.from(root.querySelectorAll<HTMLElement>('[data-ticker]'))
    let anims: Animation[] | null = null
    let lastY = window.scrollY
    let rate = 1
    let rateRaf = 0
    let velRaf = 0
    const setRate = (value: number) => {
      anims ??= tickers.flatMap((el) => el.getAnimations({ subtree: true }))
      anims.forEach((a) => {
        a.playbackRate = value
      })
    }
    const settle = () => {
      rate += (1 - rate) * 0.06
      if (!openingOn || Math.abs(rate - 1) < 0.02) {
        rate = 1
        rateRaf = 0
      } else rateRaf = requestAnimationFrame(settle)
      setRate(rate)
    }
    const velocity = () => {
      velRaf = 0
      const y = window.scrollY
      const v = Math.min(6, Math.abs(y - lastY) / 16)
      lastY = y
      if (!openingOn || !tickers.length || off() || v < 0.05) return
      rate = Math.max(rate, 1 + v)
      setRate(rate)
      if (!rateRaf) rateRaf = requestAnimationFrame(settle)
    }
    const onVelocity = () => {
      if (!velRaf) velRaf = requestAnimationFrame(velocity)
    }
    window.addEventListener('scroll', onVelocity, { passive: true })

    const sync = () => {
      if (off()) root.querySelectorAll<HTMLElement>(SCENE).forEach(clear)
      else schedule()
    }
    const offPerf = subscribePerf(sync)
    reduced.addEventListener('change', sync)
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      io.disconnect()
      live.disconnect()
      if (rateRaf) cancelAnimationFrame(rateRaf)
      if (velRaf) cancelAnimationFrame(velRaf)
      kick = () => {}
      window.removeEventListener('scroll', onVelocity)
      offPerf()
      reduced.removeEventListener('change', sync)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])
}

const REVEAL = '.cine-lines:not([data-cine-hold]), .cine-wipe, [data-cine]:not([data-cine-hold]), [data-rule]'

/**
 * Marks `.cine-root` ready (hidden states only apply once this ran, so the page reads without
 * JS) and adds `.is-revealed` once to each reveal element as it enters the screen. Never
 * removes it again. `dep` re-scans after a scene was swapped in.
 */
export function useCineReveal(dep?: unknown) {
  useEffect(() => {
    const root = document.querySelector('.cine-root')
    if (!root || typeof IntersectionObserver === 'undefined') return
    root.classList.add('cine-ready')
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.classList.add('is-revealed')
          io.unobserve(entry.target)
        })
      },
      { threshold: 0.15, rootMargin: '0px 0px -6% 0px' },
    )
    const scan = () => {
      root.querySelectorAll(REVEAL).forEach((el) => {
        // observe() on an element that is already watched does nothing, so a rescan is safe.
        if (!el.classList.contains('is-revealed')) io.observe(el)
      })
    }
    scan()
    // Elements that mount later (after a query resolves) are picked up too.
    const mo = new MutationObserver(scan)
    mo.observe(root, { childList: true, subtree: true })
    return () => {
      mo.disconnect()
      io.disconnect()
    }
  }, [dep])

  useEffect(() => {
    return () => document.querySelector('.cine-root')?.classList.remove('cine-ready')
  }, [])
}

/**
 * Pointer effects (full mode only): the opening's layers shift a few pixels against the pointer
 * (--px, --py in -1..1 on the opening scene) and a `[data-tilt]` frame tilts toward it with a
 * moving highlight (--tx, --ty, --mx, --my). One listener, rAF-throttled.
 */
export function usePointerFx() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.cine-root')
    if (!root || typeof window.matchMedia !== 'function') return
    const reduced = window.matchMedia(REDUCED)
    let raf = 0
    let ev: PointerEvent | null = null
    let tilted: HTMLElement | null = null
    const reset = (el: HTMLElement) => ['--tx', '--ty', '--mx', '--my'].forEach((k) => el.style.removeProperty(k))
    const run = () => {
      raf = 0
      if (!ev || reduced.matches || getPerfState().mode === 'lite') return
      const opening = root.querySelector<HTMLElement>('[data-scene="opening"]')
      if (opening && ev.clientY < opening.getBoundingClientRect().bottom) {
        opening.style.setProperty('--px', ((ev.clientX / window.innerWidth) * 2 - 1).toFixed(3))
        opening.style.setProperty('--py', ((ev.clientY / window.innerHeight) * 2 - 1).toFixed(3))
      }
      const target = (ev.target as Element | null)?.closest?.<HTMLElement>('[data-tilt]') ?? null
      if (tilted && tilted !== target) reset(tilted)
      tilted = target
      if (target) {
        const r = target.getBoundingClientRect()
        const x = (ev.clientX - r.left) / r.width
        const y = (ev.clientY - r.top) / r.height
        target.style.setProperty('--tx', (x * 2 - 1).toFixed(3))
        target.style.setProperty('--ty', (y * 2 - 1).toFixed(3))
        target.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`)
        target.style.setProperty('--my', `${(y * 100).toFixed(1)}%`)
      }
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      ev = e
      if (!raf) raf = requestAnimationFrame(run)
    }
    const onLeave = () => {
      ev = null
      if (tilted) reset(tilted)
      tilted = null
      const opening = root.querySelector<HTMLElement>('[data-scene="opening"]')
      opening?.style.removeProperty('--px')
      opening?.style.removeProperty('--py')
    }
    root.addEventListener('pointermove', onMove, { passive: true })
    root.addEventListener('pointerleave', onLeave)
    return () => {
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('pointerleave', onLeave)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])
}
