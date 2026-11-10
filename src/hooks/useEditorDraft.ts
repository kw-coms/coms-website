import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { confirmDialog } from '../components/common/ConfirmDialog'
import { draftFieldsEqual, removeDraft, writeDraft, type DraftFields } from '../utils/editorDraft'

const SAVE_INTERVAL_MS = 1500

/**
 * Autosaves an editor's text to localStorage and warns before the page is left with unsaved
 * changes. `current()` returns null while the editor is not mounted yet; `hasPending()` is true
 * while a file is attached that a draft cannot keep.
 *
 * The app uses BrowserRouter, which has no navigation blocker, so in-app links are caught by a
 * capture-phase click listener instead. Browser Back is not intercepted (the draft is saved).
 */
export function useEditorDraft({ storageKey, baseline, current, hasPending }: {
  storageKey: string
  baseline: () => DraftFields
  current: () => DraftFields | null
  hasPending: () => boolean
}) {
  const navigate = useNavigate()
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)
  const closedRef = useRef(false)
  const latest = useRef({ baseline, current, hasPending })
  useEffect(() => { latest.current = { baseline, current, hasPending } })

  const tick = () => {
    if (closedRef.current) return
    const fields = latest.current.current()
    if (!fields) return
    const changed = latest.current.hasPending() || !draftFieldsEqual(fields, latest.current.baseline())
    dirtyRef.current = changed
    setDirty(changed)
    if (!changed) removeDraft(storageKey)
    else if (!draftFieldsEqual(fields, latest.current.baseline())) writeDraft(storageKey, fields)
  }

  useEffect(() => {
    closedRef.current = false
    const timer = window.setInterval(tick, SAVE_INTERVAL_MS)
    const onUnload = (event: BeforeUnloadEvent) => {
      tick()
      if (!dirtyRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    const onClick = (event: MouseEvent) => {
      if (!dirtyRef.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download') || anchor.closest('[contenteditable="true"]')) return
      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search)) return
      event.preventDefault()
      event.stopPropagation()
      void confirmDialog({ message: '저장하지 않은 내용이 있습니다. 이 페이지를 떠날까요? 작성한 글은 임시 저장되고, 첨부한 파일은 사라집니다.', confirmText: '떠나기', cancelText: '계속 작성' }).then((leave) => {
        if (leave) navigate(url.pathname + url.search + url.hash)
      })
    }
    window.addEventListener('beforeunload', onUnload)
    document.addEventListener('click', onClick, true)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('beforeunload', onUnload)
      document.removeEventListener('click', onClick, true)
    }
    // tick reads everything through refs; storageKey is the only input that can change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  /** Call after a successful submit (or an explicit discard): removes the draft and stops saving. */
  const clear = () => {
    closedRef.current = true
    dirtyRef.current = false
    setDirty(false)
    removeDraft(storageKey)
  }
  /** Re-arms saving after `clear()` when the editor stays open (draft discarded, editing continues). */
  const reset = () => {
    removeDraft(storageKey)
    closedRef.current = false
    dirtyRef.current = false
    setDirty(false)
  }

  return { dirty, clear, reset }
}
