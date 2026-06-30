import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// ─── Dependency-free confirm / prompt modal ──────────────────────────────────
// Promise-based replacement for window.confirm / window.prompt: non-blocking,
// theme-aware, accessible (role=dialog, aria-modal, Escape cancels, focus trap +
// focus return). Trigger imperatively from anywhere via confirmDialog(...) /
// promptDialog(...); mount a single <ConfirmHost /> near the app root.

type DialogTone = 'default' | 'danger'

type BaseRequest = {
  message: string
  title?: string
  confirmText?: string
  cancelText?: string
  tone?: DialogTone
}

type ConfirmState = BaseRequest & {
  id: number
  kind: 'confirm' | 'prompt'
  placeholder?: string
  defaultValue?: string
  required?: boolean
  resolve: (value: boolean | string | null) => void
}

type Listener = (state: ConfirmState | null) => void

let current: ConfirmState | null = null
const listeners = new Set<Listener>()
let nextId = 1

function emit() {
  for (const listener of listeners) listener(current)
}

function settle(value: boolean | string | null) {
  if (!current) return
  const { resolve } = current
  current = null
  emit()
  resolve(value)
}

// eslint-disable-next-line react-refresh/only-export-components
export function confirmDialog(input: BaseRequest | string): Promise<boolean> {
  const req: BaseRequest = typeof input === 'string' ? { message: input } : input
  // If a dialog is already open, cancel it first (one modal at a time).
  if (current) settle(current.kind === 'prompt' ? null : false)
  return new Promise<boolean>((resolve) => {
    current = { ...req, id: nextId++, kind: 'confirm', resolve: (v) => resolve(v === true) }
    emit()
  })
}

// eslint-disable-next-line react-refresh/only-export-components
export function promptDialog(
  input: (BaseRequest & { placeholder?: string; defaultValue?: string; required?: boolean }) | string,
): Promise<string | null> {
  const req = typeof input === 'string' ? { message: input } : input
  if (current) settle(current.kind === 'prompt' ? null : false)
  return new Promise<string | null>((resolve) => {
    current = {
      ...req,
      id: nextId++,
      kind: 'prompt',
      defaultValue: req.defaultValue ?? '',
      resolve: (v) => resolve(typeof v === 'string' ? v : null),
    }
    emit()
  })
}

function DialogCard({ state }: { state: ConfirmState }) {
  const isPrompt = state.kind === 'prompt'
  const [value, setValue] = useState(() => state.defaultValue ?? '')
  const inputRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  // Move focus into the dialog on open, return it to the trigger on unmount.
  useEffect(() => {
    restoreFocusRef.current = (document.activeElement as HTMLElement) ?? null
    const frame = requestAnimationFrame(() => {
      if (isPrompt) inputRef.current?.focus()
      else confirmRef.current?.focus()
    })
    return () => {
      cancelAnimationFrame(frame)
      restoreFocusRef.current?.focus?.()
    }
  }, [isPrompt])

  const confirmDisabled = isPrompt && state.required === true && !value.trim()
  const onCancel = () => settle(isPrompt ? null : false)
  const onConfirm = () => {
    if (confirmDisabled) return
    settle(isPrompt ? value : true)
  }

  return (
    <div
      className="coms-confirm-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        className="coms-confirm-card"
        role="dialog"
        aria-modal="true"
        aria-label={state.title || state.message}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            onCancel()
          }
        }}
      >
        {state.title && <p className="coms-confirm-title">{state.title}</p>}
        <p className="coms-confirm-message">{state.message}</p>
        {isPrompt && (
          <input
            ref={inputRef}
            type="text"
            className="coms-confirm-input"
            value={value}
            placeholder={state.placeholder}
            aria-label={state.title || state.message}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onConfirm()
              }
            }}
          />
        )}
        <div className="coms-confirm-actions">
          <button type="button" className="coms-confirm-cancel" onClick={onCancel}>
            {state.cancelText || '취소'}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`coms-confirm-ok${state.tone === 'danger' ? ' is-danger' : ''}`}
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {state.confirmText || '확인'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ConfirmHost() {
  const [state, setState] = useState<ConfirmState | null>(current)

  useEffect(() => {
    listeners.add(setState)
    return () => {
      listeners.delete(setState)
    }
  }, [])

  if (typeof document === 'undefined' || !state) return null
  // key=id remounts the card per dialog so its input seeds from defaultValue
  // via a lazy useState initializer (no setState-in-effect).
  return createPortal(<DialogCard key={state.id} state={state} />, document.body)
}

export default ConfirmHost
