import { useEffect, useRef } from 'react'
import { showToast } from './Toast'

const boxClass = 'flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--app-text)]'

function formatTime(value: number | string | null | undefined) {
  const date = new Date(value ?? NaN)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Shown after a draft was applied. Also announced through the toast host's polite live region. */
export default function DraftNotice({ onDiscard, className = '' }: { onDiscard: () => void; className?: string }) {
  useEffect(() => { showToast({ message: '임시 저장된 글을 불러왔어요', duration: 2500 }) }, [])
  return (
    <div role="status" className={`${boxClass} ${className}`}>
      <span>임시 저장된 글을 불러왔어요</span>
      <button type="button" onClick={onDiscard} aria-label="임시 저장본 삭제" className="apple-action-secondary inline-flex min-h-9 items-center px-3 text-xs">삭제</button>
    </div>
  )
}

/** Shown instead when the item changed on the server after the draft was saved: the member picks. */
export function DraftConflictNotice({ savedAt, updatedAt, onApply, onKeep, className = '' }: {
  savedAt: number
  updatedAt: string | null | undefined
  onApply: () => void
  onKeep: () => void
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  return (
    <div ref={ref} tabIndex={-1} role="alert" className={`${boxClass} ${className}`}>
      <span>
        임시 저장본({formatTime(savedAt)})보다 나중에 이 글이 수정되었어요({formatTime(updatedAt)}). 어느 쪽을 쓸까요?
      </span>
      <span className="flex gap-2">
        <button type="button" onClick={onApply} className="apple-action-secondary inline-flex min-h-9 items-center px-3 text-xs">임시 저장본 불러오기</button>
        <button type="button" onClick={onKeep} aria-label="현재 내용 유지, 임시 저장본 삭제" className="apple-action-primary inline-flex min-h-9 items-center px-3 text-xs">현재 내용 유지</button>
      </span>
    </div>
  )
}
