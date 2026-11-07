// Per-block persistence (localStorage, every access guarded) and the "공유 링크" hash codec.

/** One block's record: the draft and, optionally, the one-step backup of the draft it replaced ("이전 코드 복원"). */
export interface Saved { code: string; backup?: string; at: number }
type StorageLike = Pick<Storage, 'getItem' | 'setItem'> & Partial<Pick<Storage, 'removeItem'>>

// One localStorage record per block (`<prefix><pageId>:<blockKey>`), so tabs editing different blocks never share a value.
const KEY_PREFIX = 'coms-study-playground:'

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
  const keyOf = (block: string) => `${KEY_PREFIX}${pageId}:${block}`
  return {
    get(block: string): Saved | null {
      try {
        const raw = handle()?.getItem(keyOf(block))
        const v = raw ? JSON.parse(raw) : null
        if (!v || typeof v !== 'object' || typeof v.code !== 'string') return null
        return { code: v.code, backup: typeof v.backup === 'string' ? v.backup : undefined, at: typeof v.at === 'number' ? v.at : 0 }
      } catch { return null }
    },
    put(block: string, rec: Saved) {
      try { handle()?.setItem(keyOf(block), JSON.stringify(rec)) } catch { /* storage blocked or full: the edit just is not kept */ }
    },
    remove(block: string) {
      try { handle()?.removeItem?.(keyOf(block)) } catch { /* ignore */ }
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
export function saveBlock(store: DraftStore, b: DraftState, code: string, initial: string) {
  const stored = store.get(b.key)
  let backup = stored?.backup
  // Another tab saved since this tab last looked: its draft becomes the backup instead of being overwritten unseen.
  if (stored && stored.code !== b.baseline && stored.code !== code) backup = stored.code
  if (code === initial && backup === undefined) store.remove(b.key)
  else store.put(b.key, { code, backup, at: Date.now() })
  b.baseline = code === initial && backup === undefined ? null : code
  b.dirty = false
}

/** "이전 코드 복원": 'declined' when another tab changed the draft since this tab last looked (nothing is touched). */
export function restoreBlock(store: DraftStore, b: DraftState, currentText: string): 'restored' | 'declined' | 'none' {
  const stored = store.get(b.key)
  if (!stored?.backup) return 'none'
  if (stored.code !== b.baseline) return 'declined'
  const old = stored.backup
  store.put(b.key, { code: old, backup: currentText === old ? undefined : currentText, at: Date.now() })
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

