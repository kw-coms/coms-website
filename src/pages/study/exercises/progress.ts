import { useSyncExternalStore } from 'react'
import type { ExLang } from './types'

export const PROGRESS_KEY = 'coms-study-exercises:v1'
export type CodeLang = ExLang | 'html' | 'css' | 'js'
export interface ProgressEntry {
  solved: boolean
  tries: number
  lastAt: number
  code: Partial<Record<CodeLang, string>>
  solvedLangs: ExLang[]
  viewed?: boolean
}
export type ProgressMap = Record<string, ProgressEntry>

const empty: ProgressMap = {}
let snapshot: ProgressMap | null = null
let persistenceFailed = false
const listeners = new Set<() => void>()
const pending = new Map<string, { id: string; lang: CodeLang; code: string; timer: ReturnType<typeof setTimeout> }>()

function storage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

export function readProgress(): ProgressMap {
  try {
    if (persistenceFailed) return snapshot ?? {}
    const handle = storage()
    if (!handle) return snapshot ?? {}
    const raw = handle.getItem(PROGRESS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const result: ProgressMap = {}
    for (const [id, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue
      const v = value as Partial<ProgressEntry>
      const code: ProgressEntry['code'] = {}
      if (v.code && typeof v.code === 'object' && !Array.isArray(v.code)) {
        for (const lang of ['c', 'java', 'python', 'html', 'css', 'js'] as const) {
          if (typeof v.code[lang] === 'string') code[lang] = v.code[lang]
        }
      }
      result[id] = {
        solved: v.solved === true,
        tries: Number.isSafeInteger(v.tries) && (v.tries ?? -1) >= 0 ? v.tries! : 0,
        lastAt: Number.isFinite(v.lastAt) && (v.lastAt ?? -1) >= 0 ? v.lastAt! : 0,
        code,
        solvedLangs: Array.isArray(v.solvedLangs) ? v.solvedLangs.filter((lang): lang is ExLang => lang === 'c' || lang === 'java' || lang === 'python') : [],
        ...(v.viewed === true ? { viewed: true } : {}),
      }
    }
    return result
  } catch { return snapshot ?? {} }
}

function notify() { for (const listener of listeners) listener() }
function write(next: ProgressMap) {
  snapshot = next
  try {
    const handle = storage()
    if (handle) { handle.setItem(PROGRESS_KEY, JSON.stringify(next)); persistenceFailed = false }
    else persistenceFailed = true
  } catch { persistenceFailed = true }
  notify()
}
function update(id: string, change: (value: ProgressEntry) => ProgressEntry) {
  const data = { ...readProgress() }
  const current = data[id] ?? { solved: false, tries: 0, lastAt: 0, code: {}, solvedLangs: [] }
  data[id] = change(current)
  write(data)
}

export function saveCode(id: string, lang: CodeLang, code: string): void {
  const key = `${id}:${lang}`
  const queued = pending.get(key)
  if (queued) { clearTimeout(queued.timer); pending.delete(key) }
  update(id, (value) => ({ ...value, lastAt: Date.now(), code: { ...value.code, [lang]: code } }))
}

export function scheduleSaveCode(id: string, lang: CodeLang, code: string): void {
  const key = `${id}:${lang}`
  const previous = pending.get(key)
  if (previous) clearTimeout(previous.timer)
  const timer = setTimeout(() => { pending.delete(key); saveCode(id, lang, code) }, 450)
  pending.set(key, { id, lang, code, timer })
}

export function flushSaves(): void {
  for (const item of [...pending.values()]) saveCode(item.id, item.lang, item.code)
}

if (typeof window !== 'undefined') window.addEventListener('pagehide', flushSaves)

export function recordAttempt(id: string, lang: ExLang | 'web', solved: boolean): void {
  update(id, (value) => ({
    ...value, solved: value.solved || solved, tries: value.tries + 1, lastAt: Date.now(),
    solvedLangs: solved && lang !== 'web' && !value.solvedLangs.includes(lang) ? [...value.solvedLangs, lang] : value.solvedLangs,
  }))
}

export function markViewed(id: string): void {
  update(id, (value) => ({ ...value, viewed: true, lastAt: Date.now() }))
}

export function markOpened(id: string): void {
  update(id, (value) => ({ ...value, lastAt: Date.now() }))
}

function subscribe(listener: () => void) {
  const firstSubscriber = listeners.size === 0
  listeners.add(listener)
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  // A tab can change storage while this page has no mounted practice components.
  if (firstSubscriber && !persistenceFailed) {
    snapshot = readProgress()
    notify()
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  }
}
function onStorage(event: StorageEvent) {
  if (event.key !== PROGRESS_KEY && event.key !== null) return
  persistenceFailed = false
  snapshot = readProgress()
  notify()
}
function getSnapshot() { return snapshot ?? (snapshot = readProgress()) }
export function useProgress(): ProgressMap {
  return useSyncExternalStore(subscribe, getSnapshot, () => empty)
}
