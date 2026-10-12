// Search and ordering helpers shared by the admin lists (members, roster, applications).
// Pure functions: the screens keep the state, these do the work, and tests/listTools.test.mjs
// pins the behaviour.

export type SortDirection = 'asc' | 'desc'

const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' })

const isBlank = (value: unknown) => value === null || value === undefined || String(value).trim() === ''

/** Lower-cased with spaces and hyphens removed, so "010-1234 5678" matches "01012345678". */
export function searchKey(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[\s-]+/g, '')
}

/** True when every word of the query appears in at least one of the fields. An empty query matches everything. */
export function matchesQuery(query: string, fields: unknown[]): boolean {
  const words = String(query ?? '').split(/\s+/).map(searchKey).filter(Boolean)
  if (words.length === 0) return true
  const haystack = fields.map(searchKey)
  return words.every((word) => haystack.some((field) => field.includes(word)))
}

/** Text order (Korean collation, digits by value). Blank values go last whichever way the list is sorted. */
export function compareText(a: unknown, b: unknown, direction: SortDirection = 'asc'): number {
  const blankA = isBlank(a)
  const blankB = isBlank(b)
  if (blankA || blankB) return blankA === blankB ? 0 : blankA ? 1 : -1
  const result = collator.compare(String(a), String(b))
  return direction === 'asc' ? result : -result
}

/** Number order for values that may arrive as text ("60" and 60). Blank or non-numeric values go last. */
export function compareNumber(a: unknown, b: unknown, direction: SortDirection = 'asc'): number {
  const numA = isBlank(a) ? Number.NaN : Number(a)
  const numB = isBlank(b) ? Number.NaN : Number(b)
  const badA = Number.isNaN(numA)
  const badB = Number.isNaN(numB)
  if (badA || badB) return badA === badB ? 0 : badA ? 1 : -1
  return direction === 'asc' ? numA - numB : numB - numA
}

/** Order by place in a fixed list (role rank, status order). Values not in the list go last. */
export function compareRank(a: unknown, b: unknown, order: readonly string[], direction: SortDirection = 'asc'): number {
  const rankA = order.indexOf(String(a))
  const rankB = order.indexOf(String(b))
  const badA = rankA < 0
  const badB = rankB < 0
  if (badA || badB) return badA === badB ? 0 : badA ? 1 : -1
  return direction === 'asc' ? rankA - rankB : rankB - rankA
}

/** Order by time for ISO date strings. Blank or unreadable values go last. */
export function compareDate(a: unknown, b: unknown, direction: SortDirection = 'asc'): number {
  const timeA = isBlank(a) ? Number.NaN : Date.parse(String(a))
  const timeB = isBlank(b) ? Number.NaN : Date.parse(String(b))
  return compareNumber(Number.isNaN(timeA) ? '' : timeA, Number.isNaN(timeB) ? '' : timeB, direction)
}

/** A sorted copy. Ties keep the order they came in (Array.prototype.sort is stable). */
export function sortedBy<T>(items: readonly T[], compare: (a: T, b: T) => number): T[] {
  return [...items].sort(compare)
}

/** The next state of a column heading that cycles: unsorted, ascending, descending, unsorted. */
export function nextColumnSort<K extends string>(
  current: { key: K; direction: SortDirection } | null,
  key: K,
): { key: K; direction: SortDirection } | null {
  if (!current || current.key !== key) return { key, direction: 'asc' }
  if (current.direction === 'asc') return { key, direction: 'desc' }
  return null
}
