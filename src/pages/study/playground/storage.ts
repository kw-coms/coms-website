// Per-block persistence (localStorage, every access guarded) and the "공유 링크" hash codec.

export interface Saved { code: string; at: number }
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

const KEY_PREFIX = 'coms-study-playground:'
const MAX_ENTRIES = 80
// The one-step backup of a block's previous draft lives next to it under this suffix.
const BACKUP = '~prev'

export function fnv1a(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(36)
}

/** Stable id of a block: position + a hash of its original text, so an edited page invalidates old edits. */
export const blockKey = (index: number, originalCode: string) => `${index}-${fnv1a(originalCode)}`

export function createStore(pageId: string, storage?: StorageLike | null) {
  const key = KEY_PREFIX + pageId
  const handle = (): StorageLike | null => {
    if (storage !== undefined) return storage
    try { return window.localStorage } catch { return null }
  }
  const read = (): Record<string, Saved> => {
    try {
      const raw = handle()?.getItem(key)
      const data = raw ? JSON.parse(raw) : {}
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
    } catch { return {} }
  }
  const write = (data: Record<string, Saved>) => {
    const keys = Object.keys(data)
    if (keys.length > MAX_ENTRIES) keys.sort((x, y) => data[x].at - data[y].at).slice(0, keys.length - MAX_ENTRIES).forEach((k) => delete data[k])
    try { handle()?.setItem(key, JSON.stringify(data)) } catch { /* storage blocked or full: the edit just is not kept */ }
  }
  return {
    get(block: string): Saved | null {
      const v = read()[block]
      return v && typeof v.code === 'string' ? v : null
    },
    set(block: string, code: string) { const data = read(); data[block] = { code, at: Date.now() }; write(data) },
    clear(block: string) { const data = read(); delete data[block]; write(data) },
    /** The draft a block had before a shared code was saved over it ("이전 코드 복원"). */
    getBackup(block: string): Saved | null {
      const v = read()[block + BACKUP]
      return v && typeof v.code === 'string' ? v : null
    },
    setBackup(block: string, code: string) { const data = read(); data[block + BACKUP] = { code, at: Date.now() }; write(data) },
    clearBackup(block: string) { const data = read(); delete data[block + BACKUP]; write(data) },
  }
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

