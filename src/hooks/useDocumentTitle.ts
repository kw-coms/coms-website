import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { documentTitleFor } from '../routes/pageTitles'

// The opened item's title, remembered with the path it belongs to. Module-level so the
// app-level route effect and a detail view's effect agree on the result no matter which
// one runs last (child effects run before the parent's on the same commit).
let detail: { pathname: string; title: string } | null = null

function applyTitle(pathname: string) {
  if (typeof document === 'undefined') return ''
  const title = documentTitleFor(pathname, detail?.pathname === pathname ? detail.title : null)
  document.title = title
  return title
}

/**
 * App-level: keeps the tab title in step with the route and returns the text to announce
 * to assistive tech after a client-side navigation ('' on the initial load, which the
 * browser already announces).
 */
export function useRouteDocumentTitle() {
  const { pathname } = useLocation()
  const [initialPathname] = useState(pathname)
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    const title = applyTitle(pathname)
    // Deferred a tick so the live region's text changes after the new page has rendered.
    const id = window.setTimeout(() => {
      setAnnouncement((current) => (current || pathname !== initialPathname ? title : ''))
    }, 0)
    return () => window.clearTimeout(id)
  }, [pathname, initialPathname])

  return announcement
}

/** Detail views: shows the opened item's title in the tab while it is on screen. */
export function useDocumentTitle(title: string | null | undefined) {
  const { pathname } = useLocation()
  const trimmed = typeof title === 'string' ? title.trim() : ''

  useEffect(() => {
    if (!trimmed) return undefined
    detail = { pathname, title: trimmed }
    applyTitle(pathname)
    return () => {
      if (detail?.pathname === pathname && detail.title === trimmed) {
        detail = null
        applyTitle(pathname)
      }
    }
  }, [trimmed, pathname])
}
