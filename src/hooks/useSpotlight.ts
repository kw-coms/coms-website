import { useEffect } from 'react'

// Cards that light up under the pointer. Their stylesheets paint a soft radial highlight at
// --spot-x / --spot-y; this keeps those two properties on whichever card the pointer is over.
const SPOT_SELECTOR = '.coms-card, .apple-product-panel'

/**
 * One passive listener for the whole app (cards come and go with every route). Does nothing
 * on devices without a hovering pointer.
 */
export function useSpotlight() {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return

    let lit: HTMLElement | null = null
    let pending: PointerEvent | null = null
    let raf = 0

    const clear = () => {
      if (!lit) return
      lit.style.removeProperty('--spot-x')
      lit.style.removeProperty('--spot-y')
      lit = null
    }
    const apply = () => {
      raf = 0
      const event = pending
      pending = null
      if (!event) return
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>(SPOT_SELECTOR) : null
      if (target !== lit) clear()
      if (!target) return
      const box = target.getBoundingClientRect()
      target.style.setProperty('--spot-x', `${Math.round(event.clientX - box.left)}px`)
      target.style.setProperty('--spot-y', `${Math.round(event.clientY - box.top)}px`)
      lit = target
    }
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      pending = event
      if (!raf) raf = requestAnimationFrame(apply)
    }
    const onGone = () => {
      pending = null
      clear()
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onGone)
    window.addEventListener('blur', onGone)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onGone)
      window.removeEventListener('blur', onGone)
      clear()
    }
  }, [])
}
