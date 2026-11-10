import { useContext, useEffect, useRef, useState } from 'react'
import { UNSAFE_NavigationContext as NavigationContext } from 'react-router-dom'
import { confirmDialog } from '../components/common/ConfirmDialog'
import { draftFieldsEqual, removeDraft, writeDraft, type DraftFields } from '../utils/editorDraft'
import { canWriteMember, memberSessionEpoch } from '../utils/memberSession'

const SAVE_INTERVAL_MS = 1500
const INPUT_DEBOUNCE_MS = 250

type SaveState = 'saved' | 'failed' | 'none'
let activeLeaveCheck: (() => Promise<boolean>) | null = null

export function confirmEditorLeave(): Promise<boolean> {
  return activeLeaveCheck?.() ?? Promise.resolve(true)
}

function leaveMessage(state: SaveState) {
  if (state === 'failed') return '저장하지 않은 내용이 있고, 임시 저장도 하지 못했습니다. 떠나면 작성한 내용이 사라집니다.'
  if (state === 'none') return '첨부한 파일이 있습니다. 떠나면 첨부한 파일이 사라집니다.'
  return '저장하지 않은 내용이 있습니다. 떠나도 작성한 글은 임시 저장되어 있고, 첨부한 파일은 사라집니다.'
}

type NavigateTarget = string | { pathname?: string; search?: string }

function isSameAddress(to: NavigateTarget) {
  const current = window.location.pathname + window.location.search
  if (typeof to === 'string') return to === current || to === window.location.pathname
  return (to.pathname ?? window.location.pathname) + (to.search ?? '') === current
}

/**
 * Autosaves an editor's text to localStorage and warns before the editor is left with unsaved
 * changes. `current()` returns null while the editor is not mounted yet; `hasPending()` is true
 * while a file is attached that a draft cannot keep; `paused` holds saving while the member still
 * has to choose between a stored draft and newer server content.
 *
 * In-app navigation is guarded by wrapping the router's navigator (BrowserRouter has no blocker),
 * which covers Links and every navigate() call. Browser Back is not intercepted; the draft is
 * flushed first, so it is still there afterwards.
 */
export function useEditorDraft({ storageKey, baseline, current, hasPending, paused = false }: {
  storageKey: string
  baseline: () => DraftFields
  current: () => DraftFields | null
  hasPending: () => boolean
  paused?: boolean
}) {
  const { navigator } = useContext(NavigationContext)
  const [dirty, setDirty] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const dirtyRef = useRef(false)
  const closedRef = useRef(false)
  const saveState = useRef<SaveState>('none')
  const lastFields = useRef<DraftFields | null>(null)
  const sessionEpoch = useRef(memberSessionEpoch())
  const approvedNavigation = useRef(false)
  const latest = useRef({ baseline, current, hasPending, paused })
  useEffect(() => { latest.current = { baseline, current, hasPending, paused } })

  // Saves and recomputes dirtiness right now. `fallback` is used when the editor is already gone.
  const flush = (fallback = false) => {
    if (closedRef.current || latest.current.paused || !canWriteMember(storageKey.split(':')[2], sessionEpoch.current)) return
    const fields = latest.current.current() ?? (fallback ? lastFields.current : null)
    if (!fields) return
    lastFields.current = fields
    const differs = !draftFieldsEqual(fields, latest.current.baseline())
    const changed = latest.current.hasPending() || differs
    dirtyRef.current = changed
    setDirty(changed)
    if (differs) {
      const ok = writeDraft(storageKey, fields, undefined, Date.now(), sessionEpoch.current)
      saveState.current = ok ? 'saved' : 'failed'
      setSaveFailed(!ok)
    } else {
      removeDraft(storageKey, undefined, sessionEpoch.current)
      saveState.current = 'none'
      setSaveFailed(false)
    }
  }

  // eslint-disable-next-line react-hooks/immutability
  useEffect(() => {
    closedRef.current = false
    sessionEpoch.current = memberSessionEpoch()
    const timer = window.setInterval(flush, SAVE_INTERVAL_MS)
    let debounce = 0
    const onInput = () => {
      window.clearTimeout(debounce)
      debounce = window.setTimeout(flush, INPUT_DEBOUNCE_MS)
    }
    const onHide = () => { if (document.visibilityState === 'hidden') flush() }
    const onUnload = (event: BeforeUnloadEvent) => {
      flush()
      if (!dirtyRef.current || !canWriteMember(storageKey.split(':')[2], sessionEpoch.current)) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onUnload)
    const onPageHide = () => flush()
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onHide)
    document.addEventListener('input', onInput, true)

    const checkLeave = async () => {
      flush()
      if (!dirtyRef.current || !canWriteMember(storageKey.split(':')[2], sessionEpoch.current)) return true
      const leave = await confirmDialog({ message: leaveMessage(saveState.current), confirmText: '떠나기', cancelText: '계속 작성' })
      if (leave) {
        approvedNavigation.current = true
        window.setTimeout(() => { approvedNavigation.current = false }, 0)
      }
      return leave
    }
    activeLeaveCheck = checkLeave

    // Guard the router's own push/replace; `leaving` lets the confirmed navigation through.
    // The navigator is the router's long-lived history object; wrapping it is the only hook BrowserRouter offers.
    const original = { push: navigator.push, replace: navigator.replace }
    let leaving = false
    const guard = (kind: 'push' | 'replace') => (...args: Parameters<typeof navigator.push>) => {
      const run = () => original[kind].apply(navigator, args as never)
      if (leaving || isSameAddress(args[0] as NavigateTarget) || !canWriteMember(storageKey.split(':')[2], sessionEpoch.current)) return run()
      if (approvedNavigation.current) {
        approvedNavigation.current = false
        return run()
      }
      flush()
      if (!dirtyRef.current) return run()
      void checkLeave().then((leave) => {
        if (!leave) return
        leaving = true
        try { run() } finally { leaving = false }
      })
      return undefined
    }
    const pushGuard = guard('push')
    const replaceGuard = guard('replace')
    // eslint-disable-next-line react-hooks/immutability
    navigator.push = pushGuard as typeof navigator.push
    navigator.replace = replaceGuard as typeof navigator.replace

    return () => {
      window.clearInterval(timer)
      window.clearTimeout(debounce)
      window.removeEventListener('beforeunload', onUnload)
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onHide)
      document.removeEventListener('input', onInput, true)
      if (activeLeaveCheck === checkLeave) activeLeaveCheck = null
      if (navigator.push === pushGuard) navigator.push = original.push
      if (navigator.replace === replaceGuard) navigator.replace = original.replace
      // Leaving by Back or any other route still keeps what was typed.
      flush(true)
    }
    // flush reads everything through refs; storageKey and the navigator are the only inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, navigator])

  /** Call after a successful submit (or an explicit discard): removes the draft and stops saving. */
  const clear = () => {
    closedRef.current = true
    dirtyRef.current = false
    saveState.current = 'none'
    setDirty(false)
    setSaveFailed(false)
    removeDraft(storageKey, undefined, sessionEpoch.current)
  }
  /** Re-arms saving after `clear()` when the editor stays open (draft discarded, editing continues). */
  const reset = () => {
    removeDraft(storageKey, undefined, sessionEpoch.current)
    closedRef.current = false
    dirtyRef.current = false
    saveState.current = 'none'
    setDirty(false)
    setSaveFailed(false)
  }

  return { dirty, saveFailed, clear, reset }
}
