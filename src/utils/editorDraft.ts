// Per-browser drafts for the post and notice editors. Only text fields and the serialized body
// are stored: pending uploads never reach the body string, so no attachment is ever kept here.

export const DRAFT_VERSION = 'v1'
// A draft this large is not worth a localStorage slot (browsers allow about 5 MB per origin).
export const MAX_DRAFT_CHARS = 200_000
// Drafts nobody came back to are dropped when read.
export const MAX_DRAFT_AGE_MS = 30 * 24 * 60 * 60 * 1000

export type DraftFields = {
  title: string
  category: string
  anonymousName: string
  /** Serialized body (JSON blocks), or '' when empty. */
  content: string
}
export type EditorDraft = DraftFields & { savedAt: number }

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function browserStorage(): DraftStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** One key per signed-in member, editor and target ("new" or the id being edited). */
export function draftStorageKey(owner: string | number | null | undefined, editor: 'post' | 'notice', target: number | string | null | undefined) {
  return `kwcoms-draft:${DRAFT_VERSION}:${owner ?? 'anon'}:${editor}:${target ?? 'new'}`
}

/** Blank paragraphs and an empty body count as "nothing written". */
export function normalizeDraftContent(content: string): string {
  if (!content) return ''
  try {
    const blocks = JSON.parse(content)
    if (!Array.isArray(blocks)) return content
    const kept = blocks.filter((block) => !(block?.type === 'text' && !String(block.content ?? '').replace(/<[^>]*>|&nbsp;|\s/g, '')))
    return kept.length ? JSON.stringify(kept) : ''
  } catch {
    return content
  }
}

export function draftFieldsEqual(a: DraftFields, b: DraftFields): boolean {
  return a.title.trim() === b.title.trim()
    && a.category === b.category
    && a.anonymousName.trim() === b.anonymousName.trim()
    && normalizeDraftContent(a.content) === normalizeDraftContent(b.content)
}

export function readDraft(key: string, storage: DraftStorage | null = browserStorage(), now = Date.now()): EditorDraft | null {
  try {
    const raw = storage?.getItem(key)
    if (!raw) return null
    const value = JSON.parse(raw)
    if (!value || typeof value !== 'object' || typeof value.title !== 'string' || typeof value.content !== 'string') return null
    if (Number(value.savedAt) > 0 && now - Number(value.savedAt) > MAX_DRAFT_AGE_MS) {
      removeDraft(key, storage)
      return null
    }
    return {
      title: value.title,
      category: typeof value.category === 'string' ? value.category : '',
      anonymousName: typeof value.anonymousName === 'string' ? value.anonymousName : '',
      content: value.content,
      savedAt: Number(value.savedAt) || 0,
    }
  } catch {
    return null
  }
}

/** Returns false when the draft was too large or the browser refused it; never throws. */
export function writeDraft(key: string, fields: DraftFields, storage: DraftStorage | null = browserStorage(), now = Date.now()): boolean {
  try {
    const text = JSON.stringify({ ...fields, savedAt: now })
    if (!storage || text.length > MAX_DRAFT_CHARS) return false
    storage.setItem(key, text)
    return true
  } catch {
    return false
  }
}

export function removeDraft(key: string, storage: DraftStorage | null = browserStorage()) {
  try {
    storage?.removeItem(key)
  } catch {
    // Storage blocked: there is nothing to clear.
  }
}

/**
 * True when the item was changed on the server after the draft was saved, so applying the draft
 * would silently overwrite newer content. Server times are zone-less local date-times.
 */
export function draftIsStale(draft: Pick<EditorDraft, 'savedAt'> | null, itemUpdatedAt: string | null | undefined): boolean {
  if (!draft || !draft.savedAt || !itemUpdatedAt) return false
  const updated = Date.parse(itemUpdatedAt)
  return Number.isFinite(updated) && updated > draft.savedAt
}

/** Removes every draft of one member (used on logout). */
export function clearMemberDrafts(owner: string | number | null | undefined, storage: (DraftStorage & { length: number; key(index: number): string | null }) | null = browserStorage() as never) {
  try {
    if (!storage) return
    const prefix = `kwcoms-draft:${DRAFT_VERSION}:${owner ?? 'anon'}:`
    const keys: string[] = []
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i)
      if (key?.startsWith(prefix)) keys.push(key)
    }
    keys.forEach((key) => storage.removeItem(key))
  } catch {
    // Storage blocked: nothing to clear.
  }
}
