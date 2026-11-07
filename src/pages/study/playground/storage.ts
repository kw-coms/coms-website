// Per-block persistence (localStorage, every access guarded) and the "공유 링크" hash codec.

/** One block's record: the draft and, optionally, the one-step backup of the draft it replaced ("이전 코드 복원"). */
export interface Saved { code: string; backup?: string; at: number }
type StorageLike = Pick<Storage, 'getItem' | 'setItem'> & Partial<Pick<Storage, 'removeItem' | 'key' | 'length'>>

// One localStorage record per block (`<prefix><pageId>:<blockKey>`), so tabs editing different blocks never share a value.
// The earlier page-wide `<prefix><pageId>` object never shipped (PR #520 is the first release): an intentional pre-release reset, no migration.
const KEY_PREFIX = 'coms-study-playground:'
// Block keys include a hash of the original code, so lesson revisions orphan records. Each mounted block refreshes a
// `<record key>:seen` timestamp (on mount, when the tab becomes visible, and daily while open), and a page prunes only
// its own orphans whose record AND `seen` are both older than 30 days. A tab that stays open refreshes `seen` at least
// daily, so a live tab's draft (even for an older lesson version) cannot be pruned, and growth is bounded per page by
// 30 days of lesson revisions. A global size cap was rejected because it can delete other tabs' live drafts.
const ORPHAN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const SEEN = ':seen'

export function fnv1a(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(36)
}

/** Stable id of a block: position + a hash of its original text, so an edited page invalidates old edits. */
export const blockKey = (index: number, originalCode: string) => `${index}-${fnv1a(originalCode)}`

export function createStore(pageId: string, storage?: StorageLike | null) {
  const handle = (): StorageLike | null => {
    if (storage !== undefined) return storage
    try { return window.localStorage } catch { return null }
  }
  const pagePrefix = `${KEY_PREFIX}${pageId}:`
  const keyOf = (block: string) => pagePrefix + block

  return {
    /** Marks a mounted block as alive. Writes only the timestamp (never reads the draft); a failure is ignored. */
    touch(block: string, now = Date.now()): void {
      try { handle()?.setItem(keyOf(block) + SEEN, String(now)) } catch { /* the draft does not depend on it */ }
    },
    /** Deletes this page's records (and their `seen` keys) of blocks not in `current` when both the record and `seen` are older than 30 days; unparseable and missing count as old. Never touches another page's keys or a current block's. */
    prune(current: string[], now = Date.now()): void {
      const st = handle()
      if (!st || typeof st.key !== 'function' || typeof st.length !== 'number') return
      try {
        const live = new Set(current)
        const newest = new Map<string, number>() // block -> newest of its record `at` and `seen`
        for (let i = 0; i < st.length; i++) {
          const k = st.key(i)
          if (!k || !k.startsWith(pagePrefix)) continue
          const isSeen = k.endsWith(SEEN)
          const block = k.slice(pagePrefix.length, isSeen ? -SEEN.length : undefined)
          let at = -Infinity
          try {
            const raw = st.getItem(k) ?? ''
            if (isSeen) { const n = Number(raw); if (raw !== '' && Number.isFinite(n)) at = n }
            else { const v = JSON.parse(raw); if (v && typeof v.code === 'string' && typeof v.at === 'number') at = v.at }
          } catch { /* unparseable: old */ }
          newest.set(block, Math.max(newest.get(block) ?? -Infinity, at))
        }
        for (const [block, at] of newest) {
          if (live.has(block) || now - at <= ORPHAN_MAX_AGE_MS) continue
          st.removeItem?.(keyOf(block)); st.removeItem?.(keyOf(block) + SEEN)
        }
      } catch { /* pruning is best effort */ }
    },
    get(block: string): Saved | null {
      try {
        const raw = handle()?.getItem(keyOf(block))
        const v = raw ? JSON.parse(raw) : null
        if (!v || typeof v !== 'object' || typeof v.code !== 'string') return null
        return { code: v.code, backup: typeof v.backup === 'string' ? v.backup : undefined, at: typeof v.at === 'number' ? v.at : 0 }
      } catch { return null }
    },
    /** True when the record was written. A full storage fails the write (nothing is evicted); the caller keeps the edit pending. */
    put(block: string, rec: Saved): boolean {
      try { const st = handle(); if (!st) return false; st.setItem(keyOf(block), JSON.stringify(rec)); return true } catch { return false }
    },
    /** True when the record is gone; false when storage or removeItem is unavailable or throws. */
    remove(block: string): boolean {
      try { const st = handle(); if (!st?.removeItem) return false; st.removeItem(keyOf(block)); return true } catch { return false }
    },
  }
}
export type DraftStore = ReturnType<typeof createStore>

/** What a block remembers about its stored draft: the value this tab last read or wrote (`baseline`) and whether it holds an unsaved user edit. */
export interface DraftState { key: string; baseline: string | null; dirty: boolean }

/**
 * The only place a draft is written. Synchronous on purpose: nothing is ever queued, so an exit flush cannot miss it.
 * Accepted limit: localStorage has no cross-process atomicity, so another tab's write can land between the getItem
 * and the setItem below (one task, microseconds). That window is traded for an end-to-end synchronous design.
 */
export function saveBlock(store: DraftStore, b: DraftState, code: string, initial: string): boolean {
  const stored = store.get(b.key)
  let backup = stored?.backup
  // Another tab saved since this tab last looked: its draft becomes the backup instead of being overwritten unseen.
  if (stored && stored.code !== b.baseline && stored.code !== code) backup = stored.code
  const unedited = code === initial && backup === undefined
  const ok = unedited ? store.remove(b.key) : store.put(b.key, { code, backup, at: Date.now() })
  if (!ok) return false // baseline and dirty stay, so the next flush retries
  b.baseline = unedited ? null : code
  b.dirty = false
  return true
}

/** "이전 코드 복원": 'declined' when another tab changed the draft since this tab last looked, 'failed' when the write did not go through (nothing is touched either way). */
export function restoreBlock(store: DraftStore, b: DraftState, currentText: string): 'restored' | 'declined' | 'failed' | 'none' {
  const stored = store.get(b.key)
  if (stored?.backup === undefined) return 'none'
  if (stored.code !== b.baseline) return 'declined'
  const old = stored.backup
  if (!store.put(b.key, { code: old, backup: currentText === old ? undefined : currentText, at: Date.now() })) return 'failed'
  b.baseline = old
  b.dirty = false
  return 'restored'
}

// ---- share link: #pg=<blockIndex>.<base64url(utf8 code)> ----
export const SHARE_MAX_CHARS = 6000

function toBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function fromBase64Url(text: string) {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

/** The hash for a block's code, or null when it would be longer than SHARE_MAX_CHARS. */
export function encodeShareHash(index: number, code: string): string | null {
  const payload = toBase64Url(new TextEncoder().encode(code))
  return payload.length > SHARE_MAX_CHARS ? null : `#pg=${index}.${payload}`
}

export function decodeShareHash(hash: string): { index: number; code: string } | null {
  const m = /^#pg=(\d{1,4})\.([A-Za-z0-9_-]+)$/.exec(hash)
  if (!m || m[2].length > SHARE_MAX_CHARS) return null
  try { return { index: Number(m[1]), code: new TextDecoder('utf-8', { fatal: true }).decode(fromBase64Url(m[2])) } } catch { return null }
}

export const blockAnchor = (index: number) => `code-${index}`

