// What the site tour remembers and how it is asked to start. No React and no icons in here:
// the footer, the quick-jump dialog and the menu import this, and must not pull the tour in.

export type TourKind = 'guest' | 'member'

export const START_TOUR_EVENT = 'coms:start-tour'

export type TourSurface = 'menu' | 'club' | 'learn' | 'members' | 'tools' | 'account' | 'ask' | null
export const TOUR_SURFACE_EVENT = 'coms:tour-surface'

/** Show real controls during guidance; null releases any surface the tour opened. */
export function setTourSurface(surface: TourSurface) {
  window.dispatchEvent(new CustomEvent<TourSurface>(TOUR_SURFACE_EVENT, { detail: surface }))
}

/** Opens the tour from anywhere (footer, quick jump, mobile menu). */
export function startSiteTour() {
  window.dispatchEvent(new Event(START_TOUR_EVENT))
}

// One "seen" flag per tour: a guest who saw the guest tour still gets the member tour once
// after their first login.
const SEEN_KEYS: Record<TourKind, string> = {
  guest: 'coms.tour.guest.seen:v1',
  member: 'coms.tour.member.seen:v1',
}

// A browser that refuses localStorage (a private window, a full quota) falls back to
// sessionStorage, so a reload in the same tab does not start the tour again; and past that,
// to memory, which at least covers navigation inside the app.
const seenInMemory = new Set<TourKind>()

function readFlag(store: () => Storage, key: string): boolean {
  try {
    return store().getItem(key) === '1'
  } catch {
    return false
  }
}

export function hasSeenTour(kind: TourKind): boolean {
  const key = SEEN_KEYS[kind]
  return seenInMemory.has(kind) || readFlag(() => window.localStorage, key) || readFlag(() => window.sessionStorage, key)
}

export function markTourSeen(kind: TourKind) {
  seenInMemory.add(kind)
  try {
    window.localStorage.setItem(SEEN_KEYS[kind], '1')
    return
  } catch {
    // Fall through to the tab's storage.
  }
  try {
    window.sessionStorage.setItem(SEEN_KEYS[kind], '1')
  } catch {
    // No storage at all: the in-memory flag above is all there is.
  }
}

/**
 * Self-starting is off in automated browsers (navigator.webdriver: Playwright, CI): a fresh
 * visit to "/" would otherwise put the tour over every other test's page. The tour spec turns
 * it back on by setting this localStorage key before the page loads.
 */
export const TOUR_FORCE_AUTO_KEY = 'coms.tour.force-auto:v1'

export function autoStartAllowed(): boolean {
  if (!window.navigator?.webdriver) return true
  try {
    return window.localStorage.getItem(TOUR_FORCE_AUTO_KEY) === '1'
  } catch {
    return false
  }
}

/** Something else owns the screen: a dialog, the quick-jump box, the appearance panel, the open menu. */
export function blockingUiOpen(): boolean {
  return Boolean(document.querySelector('[role="dialog"]:not([data-site-tour]), [role="alertdialog"], .coms-quick, .appearance-popover, #mobile-menu'))
}

/** The boot intro is still drawn, or the hero's entrance (which hangs off .coms-booted) is still running. */
export function homeStillSettling(): boolean {
  return Boolean(document.querySelector('[data-coms-intro]')) || document.documentElement.classList.contains('coms-booted')
}
