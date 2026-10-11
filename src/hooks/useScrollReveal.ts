import { useEffect } from 'react'

// Pages currently mounted with the hook. `reveal-ready` hides every `[data-reveal]` element
// until something reveals it, so it may only stay on the root while a page is doing that.
let activeRevealPages = 0

/**
 * Kakao/Apple-style reveal-on-scroll. Adds `.is-revealed` to every
 * `[data-reveal]` element once it scrolls into view. The visual styling lives
 * in index.css (`.reveal-ready [data-reveal]`), so this hook only wires up the
 * observer and is safe to call from any page.
 *
 * Elements that mount after the hook ran (a view switched in place, rows
 * arriving from a query) are picked up automatically. `deps` is still accepted
 * and re-runs the scan, but callers no longer have to list every state change
 * that can add a reveal element.
 */
export function useScrollReveal(deps: unknown[] = []) {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const root = (document.querySelector('[data-reveal-root]') as HTMLElement | null) ?? document.body
    root.classList.add('reveal-ready')
    activeRevealPages += 1
    const release = () => {
      activeRevealPages -= 1
      // Left on after the last page using the hook unmounted, the class kept hiding the reveal
      // blocks of whatever page came next — a page that never calls this hook rendered blank.
      if (activeRevealPages === 0) root.classList.remove('reveal-ready')
    }

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) {
      // The stylesheet already shows everything under reduced motion; mark what is here so the
      // state is consistent if the preference changes while the page is open.
      document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => el.classList.add('is-revealed'))
      return release
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
    const observe = (el: Element) => {
      if (!el.classList.contains('is-revealed')) io.observe(el)
    }
    document.querySelectorAll('[data-reveal]').forEach(observe)

    // A reveal element that mounts later would otherwise sit at opacity 0 forever: the board
    // header re-mounting when a member cancels out of the editor, for one.
    const mutations = new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return
          if (node.matches('[data-reveal]')) observe(node)
          node.querySelectorAll('[data-reveal]').forEach(observe)
        })
      })
    })
    mutations.observe(root, { childList: true, subtree: true })

    return () => {
      mutations.disconnect()
      io.disconnect()
      release()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
