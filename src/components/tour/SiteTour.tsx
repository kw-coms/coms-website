import { Suspense, lazy, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/useAuth'
import { START_TOUR_EVENT, autoStartAllowed, blockingUiOpen, hasSeenTour, homeStillSettling, markTourSeen, type TourKind } from './tourState'

// The overlay, its steps and its stylesheet are fetched the first time a tour starts.
const TourOverlay = lazy(() => import('./TourOverlay'))

const POLL_MS = 150
const AUTO_POLL_MS = 300
// The home page must have looked "done" for this many polls in a row before the tour starts.
const SETTLED_POLLS = 3
const MANUAL_WAIT_POLLS = 40

/**
 * Mounted once, outside the page's Suspense. Starts the tour by itself once for a first-time
 * visitor on "/" (a guest tour or a member tour, each remembered on its own), and on request
 * from the footer, quick jump and the mobile menu. It never opens over another dialog: it waits.
 */
export default function SiteTour() {
  const { user, loading } = useAuth()
  const { pathname } = useLocation()
  const [kind, setKind] = useState<TourKind | null>(null)
  const forWho: TourKind = user ? 'member' : 'guest'

  // First visit: only on the home page, only once the intro and the hero have settled and
  // nothing else is open. Deep links and every other page never start it.
  useEffect(() => {
    if (loading || pathname !== '/' || !autoStartAllowed() || hasSeenTour(forWho)) return undefined
    let settled = 0
    const id = window.setInterval(() => {
      settled = !homeStillSettling() && !blockingUiOpen() && document.visibilityState === 'visible' ? settled + 1 : 0
      if (settled < SETTLED_POLLS) return
      window.clearInterval(id)
      markTourSeen(forWho)
      setKind((current) => current ?? forWho)
    }, AUTO_POLL_MS)
    return () => window.clearInterval(id)
  }, [loading, pathname, forWho])

  // On request, from anywhere: wait (briefly) for a dialog or the open menu to go away.
  useEffect(() => {
    let id = 0
    const onStart = () => {
      window.clearInterval(id)
      let waited = 0
      id = window.setInterval(() => {
        waited += 1
        if (blockingUiOpen()) {
          // Still covered after a few seconds: give up rather than open over it.
          if (waited >= MANUAL_WAIT_POLLS) window.clearInterval(id)
          return
        }
        window.clearInterval(id)
        markTourSeen(forWho)
        setKind((current) => current ?? forWho)
      }, POLL_MS)
    }
    window.addEventListener(START_TOUR_EVENT, onStart)
    return () => {
      window.removeEventListener(START_TOUR_EVENT, onStart)
      window.clearInterval(id)
    }
  }, [forWho])

  // The tour never navigates; if the route changes under it (Back button) it is over.
  // Reset while rendering, as GlobalNavigation does, instead of in a setState effect.
  const [tourPath, setTourPath] = useState(pathname)
  if (pathname !== tourPath) {
    setTourPath(pathname)
    setKind(null)
  }

  if (!kind) return null
  return (
    <Suspense fallback={null}>
      <TourOverlay kind={kind} onClose={() => setKind(null)} />
    </Suspense>
  )
}
