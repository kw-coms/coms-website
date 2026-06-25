import { useEffect } from 'react'

/**
 * Kakao/Apple-style reveal-on-scroll. Adds `.is-revealed` to every
 * `[data-reveal]` element once it scrolls into view. The visual styling lives
 * in index.css (`.reveal-ready [data-reveal]`), so this hook only wires up the
 * observer and is safe to call from any page.
 *
 * Pass changing values (e.g. a query's data length) as `deps` so freshly
 * rendered elements get observed after async content loads.
 */
export function useScrollReveal(deps: unknown[] = []) {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const root = (document.querySelector('[data-reveal-root]') as HTMLElement | null) ?? document.body
    root.classList.add('reveal-ready')

    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'))

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) {
      els.forEach((el) => el.classList.add('is-revealed'))
      return
    }

    // One-way reveal: show on first entry, then stop observing so content
    // never un-reveals. threshold:0 (any pixel) is required because a tall
    // element (e.g. a full post list on a phone) can never reach a fractional
    // threshold — its max visible ratio is viewport/elementHeight, which on
    // mobile drops below 0.12 and would leave content stuck at opacity:0.
    // ponytail: dropped replay-on-scroll-up; keeping content visible wins.
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.classList.add('is-revealed')
          io.unobserve(entry.target)
        })
      },
      { threshold: 0, rootMargin: '0px 0px -8% 0px' },
    )
    els.forEach((el) => io.observe(el))

    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
