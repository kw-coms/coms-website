// Per-browser drafts for the post and notice editors. Only text fields and the serialized body
// are stored: pending uploads never reach the body string, so no attachment is ever kept here.
import { canWriteMember } from './memberSession'
import { blockJsonToPmDoc, pmDocToBlockJson } from '../pages/community/tiptapBlockConverters'

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
export type EditorDraft = DraftFields & { savedAt: number; baseRevision?: string }

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
  return owner == null || String(owner).trim() === '' ? '' : `kwcoms-draft:${DRAFT_VERSION}:${owner}:${editor}:${target ?? 'new'}`
}

function keyOwner(key: string) {
  if (!key.startsWith(`kwcoms-draft:${DRAFT_VERSION}:`)) return undefined
  return key.split(':')[2] || null
}

function mayUseKey(key: string, epoch?: number) {
  if (!key) return false
  const owner = keyOwner(key)
  return owner === undefined || canWriteMember(owner, epoch)
}

/** Blank paragraphs and an empty body count as "nothing written". */
export function normalizeDraftContent(content: string): string {
  if (!content) return ''
  try {
    const blocks = JSON.parse(content)
    if (!Array.isArray(blocks)) return content
    // Compare the same representation the mounted editor returns.
    const canonical = pmDocToBlockJson(blockJsonToPmDoc(blocks))
    const kept = canonical.filter((block) => !(block?.type === 'text' && !String(block.content ?? '').replace(/<[^>]*>|&nbsp;|\s/g, '')))
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
  if (!mayUseKey(key)) return null
  try {
    const raw = storage?.getItem(key)
    if (!raw) return null
    const value = JSON.parse(raw)
    if (!value || typeof value !== 'object' || typeof value.title !== 'string' || typeof value.content !== 'string') return null
    if (!Number.isFinite(Number(value.savedAt)) || Number(value.savedAt) <= 0 || now - Number(value.savedAt) > MAX_DRAFT_AGE_MS) {
      removeDraft(key, storage)
      return null
    }
    return {
      title: value.title,
      category: typeof value.category === 'string' ? value.category : '',
      anonymousName: typeof value.anonymousName === 'string' ? value.anonymousName : '',
      content: value.content,
      savedAt: Number(value.savedAt) || 0,
      ...(typeof value.baseRevision === 'string' ? { baseRevision: value.baseRevision } : {}),
    }
  } catch {
    return null
  }
}

/** Returns false when the draft was too large or the browser refused it; never throws. */
export function writeDraft(key: string, fields: DraftFields, storage: DraftStorage | null = browserStorage(), now = Date.now(), epoch?: number, baseRevision?: string): boolean {
  if (!mayUseKey(key, epoch)) return false
  try {
    const text = JSON.stringify({ ...fields, savedAt: now, baseRevision })
    if (!storage || text.length > MAX_DRAFT_CHARS || !mayUseKey(key, epoch)) return false
    storage.setItem(key, text)
    return true
  } catch {
    return false
  }
}

export function removeDraft(key: string, storage: DraftStorage | null = browserStorage(), epoch?: number) {
  if (!mayUseKey(key, epoch)) return
  try {
    storage?.removeItem(key)
  } catch {
    // Storage blocked: there is nothing to clear.
  }
}

/** The loaded server revision, independent of when an autosave happens. */
export function draftRevision(item: { updatedAt?: unknown; title?: unknown; content?: unknown }): string {
  if (typeof item.updatedAt === 'string' && item.updatedAt) return item.updatedAt
  // FNV-1a 64-bit fingerprint for items whose API has no updatedAt.
  let hash = 14695981039346656037n
  const text = JSON.stringify([item.title ?? '', item.content ?? ''])
  for (let i = 0; i < text.length; i += 1) hash = BigInt.asUintN(64, (hash ^ BigInt(text.charCodeAt(i))) * 1099511628211n)
  return `content:${hash.toString(16)}`
}

/** Legacy drafts have no known base, so editing an existing item requires an explicit choice. */
export function draftIsStale(draft: Pick<EditorDraft, 'savedAt' | 'baseRevision'> | null, currentRevision: string | null | undefined): boolean {
  return Boolean(draft && currentRevision != null && draft.baseRevision !== currentRevision)
}

/** Removes every draft of one member (used on logout). */
export function clearMemberDrafts(owner: string | number | null | undefined, storage: (DraftStorage & { length: number; key(index: number): string | null }) | null = browserStorage() as never) {
  try {
    if (!storage || owner == null || String(owner).trim() === '') return
    const prefix = `kwcoms-draft:${DRAFT_VERSION}:${owner}:`
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
