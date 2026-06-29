import { Link } from 'react-router-dom'

// Renders the post author's display name. Links to the member profile only when
// authorStudentId is present — anonymous posts (null studentId) must never link.
export default function AuthorName({ post, className = '', onNavigate }: {
  post?: { authorDisplayName?: string; authorName?: string; authorStudentId?: string | null; [key: string]: unknown } | null
  className?: string
  onNavigate?: () => void
}) {
  const name = post?.authorDisplayName || post?.authorName || ''
  const studentId = post?.authorStudentId

  if (studentId == null) {
    return <span className={className}>{name}</span>
  }

  return (
    <Link
      to={`/community/members/${encodeURIComponent(studentId)}`}
      onClick={(event) => {
        event.stopPropagation()
        onNavigate?.()
      }}
      className={`${className} underline-offset-2 transition hover:text-[var(--app-accent-text)] hover:underline`}
      title={`${name} 님의 프로필 보기`}
    >
      {name}
    </Link>
  )
}
