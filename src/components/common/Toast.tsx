import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// ─── Lightweight, dependency-free toast ──────────────────────────────────────
// Theme-aware (reuses --app-* tokens), slides in from the top-right and
// auto-dismisses. Trigger imperatively from anywhere via `showToast(...)`;
// mount a single <ToastHost /> near the app root so it is available app-wide.

type ToastTone = 'default' | 'success' | 'error'

type ToastInput = {
  message: string
  tone?: ToastTone
  duration?: number
}

type ToastItem = ToastInput & {
  id: number
  tone: ToastTone
  duration: number
  leaving: boolean
}

type ToastListener = (toasts: ToastItem[]) => void

const DEFAULT_DURATION = 3200
const LEAVE_MS = 240

let toasts: ToastItem[] = []
const listeners = new Set<ToastListener>()
let nextId = 1
const timers = new Map<number, ReturnType<typeof setTimeout>>()

function emit() {
  for (const listener of listeners) listener(toasts)
}

function removeToast(id: number) {
  const existing = toasts.find((toast) => toast.id === id)
  if (!existing || existing.leaving) return
  // Flag as leaving so the host can play the slide-out, then drop it.
  toasts = toasts.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast))
  emit()
  const cleanup = setTimeout(() => {
    toasts = toasts.filter((toast) => toast.id !== id)
    timers.delete(id)
    emit()
  }, LEAVE_MS)
  timers.set(id, cleanup)
}

// eslint-disable-next-line react-refresh/only-export-components
export function showToast(input: ToastInput | string): number {
  const normalized: ToastInput = typeof input === 'string' ? { message: input } : input
  const id = nextId++
  const item: ToastItem = {
    id,
    message: normalized.message,
    tone: normalized.tone ?? 'default',
    duration: normalized.duration ?? DEFAULT_DURATION,
    leaving: false,
  }
  toasts = [...toasts, item]
  emit()
  if (item.duration > 0) {
    timers.set(id, setTimeout(() => removeToast(id), item.duration))
  }
  return id
}

// eslint-disable-next-line react-refresh/only-export-components
export function dismissToast(id: number) {
  const timer = timers.get(id)
  if (timer) {
    clearTimeout(timer)
    timers.delete(id)
  }
  removeToast(id)
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>(toasts)

  useEffect(() => {
    listeners.add(setItems)
    return () => {
      listeners.delete(setItems)
    }
  }, [])

  if (typeof document === 'undefined' || items.length === 0) return null

  return createPortal(
    <div className="coms-toast-host" role="region" aria-live="polite" aria-label="알림">
      {items.map((toast) => (
        <div
          key={toast.id}
          className={`coms-toast coms-toast-${toast.tone}${toast.leaving ? ' is-leaving' : ''}`}
          role="status"
        >
          <span className="coms-toast-message">{toast.message}</span>
          <button
            type="button"
            className="coms-toast-close"
            aria-label="알림 닫기"
            onClick={() => dismissToast(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>,
    document.body,
  )
}

export default ToastHost
