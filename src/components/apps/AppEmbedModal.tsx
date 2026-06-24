import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, X } from 'lucide-react'
import { useModalFocus } from '../../hooks/useModalFocus'

// Lightweight in-site embed for mini-apps. The <iframe> is only rendered while
// the modal is open (lazy-mounted via conditional render), sandboxed to let the
// embedded app run scripts/forms while staying same-origin-capable. Theme-aware
// (reuses --app-* tokens); full-width on mobile, framed on desktop.
export default function AppEmbedModal({ open, title, url, onClose }: {
  open: boolean
  title: string
  url: string
  onClose: () => void
}) {
  const containerRef = useModalFocus(open, onClose)

  // Lock background scroll while the embed is open.
  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-stretch justify-center bg-black/60 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} 미리보기`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={containerRef as any}
        className="flex h-full w-full flex-col overflow-hidden bg-[var(--app-surface)] text-[var(--app-text)] shadow-2xl sm:h-[85vh] sm:max-w-5xl sm:rounded-2xl"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--app-hairline)] bg-[var(--app-surface-soft)] px-4 py-3">
          <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--app-text)]">{title}</h2>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 text-xs font-bold text-[var(--app-accent-text)] no-underline transition hover:bg-[var(--app-surface-elevated)]"
          >
            <ExternalLink size={14} aria-hidden="true" />
            새 탭에서 열기
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="inline-flex size-9 items-center justify-center rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] text-[var(--app-muted)] transition hover:bg-[var(--app-surface-elevated)]"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <iframe
          src={url}
          title={title}
          className="min-h-0 w-full flex-1 border-0 bg-white"
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals"
          loading="lazy"
        />
      </div>
    </div>,
    document.body,
  )
}
