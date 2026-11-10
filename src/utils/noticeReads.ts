// Which notices are new to this browser. A notice is new when it was posted after the member's
// previous visit to the list and they have not opened it since. Kept per browser, not per account.

export const NOTICE_READ_KEY = 'kwcoms-notice-read:v1'
// Revisits within this gap belong to the same visit, so going to a notice and back keeps the dots.
export const VISIT_GAP_MS = 30 * 60 * 1000
const MAX_READ_IDS = 200

export type NoticeReadState = { seenAt: number; lastVisit: number; readIds: number[] }

/** The state after opening the list at `now`. The first visit marks everything as seen. */
export function visitList(state: NoticeReadState | null, now: number): NoticeReadState {
  if (!state) return { seenAt: now, lastVisit: now, readIds: [] }
  if (now - state.lastVisit > VISIT_GAP_MS) return { seenAt: state.lastVisit, lastVisit: now, readIds: [] }
  return { ...state, lastVisit: now }
}

export function markNoticeRead(state: NoticeReadState, id: number): NoticeReadState {
  if (state.readIds.includes(id)) return state
  return { ...state, readIds: [...state.readIds, id].slice(-MAX_READ_IDS) }
}

export function markAllNoticesRead(state: NoticeReadState, now: number): NoticeReadState {
  return { ...state, seenAt: now, lastVisit: now, readIds: [] }
}

export function isNoticeUnread(state: NoticeReadState | null, notice: { id: number; createdAt?: string | null }): boolean {
  if (!state) return false
  const created = Date.parse(notice.createdAt || '')
  return Number.isFinite(created) && created > state.seenAt && !state.readIds.includes(notice.id)
}

export function loadNoticeReadState(storage: Pick<Storage, 'getItem'> | null = safeStorage()): NoticeReadState | null {
  try {
    const value = JSON.parse(storage?.getItem(NOTICE_READ_KEY) || 'null')
    if (!value || !Number.isFinite(value.seenAt) || !Number.isFinite(value.lastVisit) || !Array.isArray(value.readIds)) return null
    return { seenAt: value.seenAt, lastVisit: value.lastVisit, readIds: value.readIds.filter(Number.isSafeInteger) }
  } catch {
    return null
  }
}

export function saveNoticeReadState(state: NoticeReadState, storage: Pick<Storage, 'setItem'> | null = safeStorage()) {
  try {
    storage?.setItem(NOTICE_READ_KEY, JSON.stringify(state))
  } catch {
    // Storage full or blocked: the dots just come back next visit.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
