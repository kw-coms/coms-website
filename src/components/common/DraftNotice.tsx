export default function DraftNotice({ onDiscard, className = '' }: { onDiscard: () => void; className?: string }) {
  return (
    <div role="status" className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--app-text)] ${className}`}>
      <span>임시 저장된 글을 불러왔어요</span>
      <button type="button" onClick={onDiscard} className="apple-action-secondary inline-flex min-h-9 items-center px-3 text-xs">삭제</button>
    </div>
  )
}
