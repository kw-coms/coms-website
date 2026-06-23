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

    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-revealed)'))

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) {
      els.forEach((el) => el.classList.add('is-revealed'))
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed')
            io.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    )
    els.forEach((el) => io.observe(el))

    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
