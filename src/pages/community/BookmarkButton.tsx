import { Bookmark } from 'lucide-react'

// Scrap / 스크랩 toggle. Filled icon when the viewer has bookmarked the post.
// Used on list rows (compact) and on the detail action bar (full).
export default function BookmarkButton({ post, onToggle, pending = false, variant = 'compact' }: {
  post: { id: number; bookmarked?: boolean }
  onToggle: (post: { id: number; bookmarked?: boolean }) => void
  pending?: boolean
  variant?: 'compact' | 'full'
}) {
  const bookmarked = Boolean(post?.bookmarked)
  const label = bookmarked ? '스크랩 해제' : '스크랩'

  const handleClick = (event) => {
    event.stopPropagation()
    if (pending) return
    onToggle(post)
  }

  if (variant === 'full') {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-pressed={bookmarked}
        aria-label={label}
        title={label}
        className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border px-3 py-3 text-sm font-black transition disabled:opacity-50 max-md:col-span-2 sm:w-auto sm:px-5 ${
          bookmarked
            ? 'border-[#0071e3] bg-[var(--app-accent)] text-white'
            : 'border-[var(--app-hairline)] bg-[var(--app-surface)] text-[var(--app-accent-text)]'
        }`}
      >
        <Bookmark size={16} fill={bookmarked ? 'currentColor' : 'none'} />
        스크랩 {bookmarked ? '됨' : ''}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={(event) => event.stopPropagation()}
      disabled={pending}
      aria-pressed={bookmarked}
      aria-label={label}
      title={label}
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full border transition disabled:opacity-50 ${
        bookmarked
          ? 'border-[var(--app-accent-border)] bg-[var(--app-accent-soft)] text-[var(--app-accent-text)]'
          : 'border-[var(--app-hairline)] bg-[var(--app-surface)] text-[var(--app-subtle)] hover:text-[var(--app-accent-text)]'
      }`}
    >
      <Bookmark size={15} fill={bookmarked ? 'currentColor' : 'none'} />
    </button>
  )
}
