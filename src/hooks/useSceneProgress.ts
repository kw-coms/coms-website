import { useEffect } from 'react'
import { getPerfState, subscribePerf } from '../utils/perfMode'

// Scroll-tied scenes for the home page. Everything here is driven by the visitor's scroll and
// does nothing under reduced motion or in lite mode (CSS shows the finished state there).

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const REDUCED = '(prefers-reduced-motion: reduce)'
const SCENE = '[data-scene]'

function measure(el: HTMLElement) {
  const rect = el.getBoundingClientRect()
  const vh = window.innerHeight
  // A pinned track (data-scene-pin) is taller than the screen: progress runs while it is stuck.
  // Any other scene runs from its top edge entering at the bottom to its bottom edge leaving at the top.
  const pinned = el.hasAttribute('data-scene-pin') && rect.height > vh + 1
  const p = pinned ? -rect.top / (rect.height - vh) : (vh - rect.top) / (vh + rect.height)
  el.style.setProperty('--p', clamp01(p).toFixed(4))
  // The opening scene also reports how far it has scrolled away.
  if (el.dataset.scene === 'opening') {
    el.style.setProperty('--hero-out', clamp01(-rect.top / Math.max(1, rect.height * 0.85)).toFixed(3))
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
      if (off()) return
      near.forEach(measure)
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(run)
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const el = entry.target as HTMLElement
          if (entry.isIntersecting) near.add(el)
          else near.delete(el)
        })
        schedule()
      },
      { rootMargin: '100% 0px' },
    )
    root.querySelectorAll<HTMLElement>(SCENE).forEach((el) => io.observe(el))

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
      offPerf()
      reduced.removeEventListener('change', sync)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])
}

const REVEAL = '.cine-lines:not([data-cine-hold]), .cine-wipe, [data-cine]:not([data-cine-hold])'

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
    root.querySelectorAll(REVEAL).forEach((el) => {
      if (!el.classList.contains('is-revealed')) io.observe(el)
    })
    return () => io.disconnect()
  }, [dep])

  useEffect(() => {
    return () => document.querySelector('.cine-root')?.classList.remove('cine-ready')
  }, [])
}
