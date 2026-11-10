// "자주 가는 곳": how often a visitor opens each menu item, kept in this browser only.
// The functions are pure (storage is passed in), so tests need no DOM.

export const NAV_VISITS_KEY = 'kwcoms-nav-visits:v1'
/** The row shows once the visitor has this many counted visits in all. */
export const MIN_VISITS_FOR_ROW = 3
export const FREQUENT_COUNT = 3

export type NavVisits = Record<string, number>

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

/** Whether `pathname` is on the page of a menu item (`/lab/` counts for `/lab`, `/recruit-notice` for `/recruit`). */
export function matchesNavPath(pathname: string, itemPath: string): boolean {
  const base = itemPath.replace(/\/+$/, '')
  return pathname === base || pathname.startsWith(`${base}/`) || pathname.startsWith(`${base}-`)
}

/** The item path that `pathname` belongs to, or null. */
export function navPathFor(pathname: string, itemPaths: string[]): string | null {
  return itemPaths.find((path) => matchesNavPath(pathname, path)) ?? null
}

/** Reads what is stored; anything that is not a map of non-negative whole numbers is dropped. */
export function parseNavVisits(raw: string | null | undefined): NavVisits {
  if (!raw) return {}
  try {
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
    const visits: NavVisits = {}
    for (const [path, count] of Object.entries(data)) {
      if (typeof count === 'number' && Number.isInteger(count) && count > 0) visits[path] = count
    }
    return visits
  } catch {
    return {}
  }
}

export function addNavVisit(visits: NavVisits, path: string): NavVisits {
  return { ...visits, [path]: (visits[path] ?? 0) + 1 }
}

/**
 * The most visited paths, most first (ties keep the order of `itemPaths`, the menu's order).
 * Empty until the visitor has `MIN_VISITS_FOR_ROW` visits in all. Paths no longer in the menu are ignored.
 */
export function frequentNavPaths(visits: NavVisits, itemPaths: string[], limit = FREQUENT_COUNT): string[] {
  const counted = itemPaths.filter((path) => (visits[path] ?? 0) > 0)
  const total = counted.reduce((sum, path) => sum + visits[path], 0)
  if (total < MIN_VISITS_FOR_ROW) return []
  // Array.prototype.sort is stable, so equal counts stay in menu order.
  return counted.sort((a, b) => visits[b] - visits[a]).slice(0, limit)
}

// A browser that refuses storage (even reading `localStorage` can throw) just never builds a row.
const defaultStorage = (): StorageLike | undefined => {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

export function readNavVisits(storage: StorageLike | undefined = defaultStorage()): NavVisits {
  try {
    return parseNavVisits(storage?.getItem(NAV_VISITS_KEY))
  } catch {
    return {}
  }
}

export function countNavVisit(path: string, storage: StorageLike | undefined = defaultStorage()): NavVisits {
  const next = addNavVisit(readNavVisits(storage), path)
  try {
    storage?.setItem(NAV_VISITS_KEY, JSON.stringify(next))
  } catch {
    // Storage full or blocked: the count lives for this page only.
  }
  return next
}
