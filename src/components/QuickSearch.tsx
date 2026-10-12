import { Suspense, lazy, useEffect, useState } from 'react'
import { QUICK_SEARCH_EVENT } from '../utils/quickSearch'

// The dialog and the lists it searches are loaded the first time it is opened.
const QuickSearchDialog = lazy(() => import('./QuickSearchDialog'))

/** True while the key press is going into a rich-text editor, which has its own Ctrl+K. */
function inEditor(target: EventTarget | null) {
  return target instanceof HTMLElement && target.isContentEditable
}

/** True while the key press is text being typed somewhere. */
function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/** Another dialog is up (a confirmation, an editor): quick jump stays out of its way. */
function anotherDialogOpen() {
  return Boolean(document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"]'))
}

/**
 * Mounted once beside the header. Opens quick jump on Ctrl+K (or Cmd+K), on "/" when nothing
 * is being typed, and when a header button asks for it; Ctrl+K again closes it.
 */
export default function QuickSearch() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return
      const key = event.key.toLowerCase()
      const shortcut = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && key === 'k'
      const slash = key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey
      if (open) {
        if (shortcut) {
          event.preventDefault()
          setOpen(false)
        }
        return
      }
      if (shortcut ? inEditor(event.target) : !slash || isTyping(event.target)) return
      if (anotherDialogOpen()) return
      event.preventDefault()
      setOpen(true)
    }
    const onAsk = () => { if (!anotherDialogOpen()) setOpen(true) }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener(QUICK_SEARCH_EVENT, onAsk)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener(QUICK_SEARCH_EVENT, onAsk)
    }
  }, [open])

  if (!open) return null
  return (
    <Suspense fallback={null}>
      <QuickSearchDialog onClose={() => setOpen(false)} />
    </Suspense>
  )
}
