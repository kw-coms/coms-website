import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusableElements(container) {
  if (!container) return []
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el: any) => el.offsetParent !== null || el === document.activeElement,
  )
}

/**
 * Shared modal focus management: traps Tab focus inside the container, closes on
 * Escape, focuses an element on open (the `initialFocusRef` target if given, else
 * the first focusable child), and restores focus to the previously active element
 * on unmount.
 *
 * @param {boolean} active whether the modal is currently open
 * @param {() => void} onClose called when Escape is pressed
 * @param {{ initialFocusRef?: import('react').RefObject<HTMLElement> }} [options]
 * @returns {import('react').RefObject<HTMLElement>} ref to attach to the modal container
 */
export function useModalFocus(active, onClose, { initialFocusRef }: any = {}) {
  const containerRef = useRef(null)
  // Callers usually pass an inline arrow, which is a new function on every render. Keeping it
  // in the effect's dependencies re-ran the whole effect on each keystroke inside the dialog:
  // the cleanup handed focus back to the opener and the setup then focused the first control,
  // so typing into any field of the dialog lost focus after one character.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!active || typeof document === 'undefined') return undefined
    const previousActiveElement: any = document.activeElement

    const focusInitial = () => {
      const target = initialFocusRef?.current || focusableElements(containerRef.current)[0]
      target?.focus?.()
    }
    focusInitial()

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current?.()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = focusableElements(containerRef.current)
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }
      const first: any = focusable[0]
      const last: any = focusable[focusable.length - 1]
      const activeEl: any = document.activeElement
      if (event.shiftKey && (activeEl === first || !containerRef.current?.contains(activeEl))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && activeEl === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      previousActiveElement?.focus?.()
    }
  }, [active, initialFocusRef])

  return containerRef
}
