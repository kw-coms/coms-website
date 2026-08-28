import RoleTag from '../../components/common/RoleTag'
import { categoryLabel } from './postEditorUtils'
import Chip from '../../components/common/Chip'
import BookmarkButton from './BookmarkButton'
import AuthorName from './AuthorName'
import {
  isConceptPost,
  isEdited,
  openRowWithKeyboard,
  postHasImages,
  postScore,
  shortDate,
} from './communityBoardUtils'

// Single community post row (card layout). This is the canonical row used by the
// main board mobile list, the 내 스크랩 page, and the member profile page so the
// presentation stays identical everywhere. Admin delete is optional.
type CommunityPostRowData = {
  id: number
  title?: string
  category?: string
  createdAt?: string
  viewCount?: number
  commentCount?: number
  pinned?: boolean
  authorAdmin?: boolean
  authorRole?: string
  videoInfos?: unknown[]
  bookmarked?: boolean
  [key: string]: unknown
}

export default function CommunityPostRow({
  post,
  onOpen,
  onToggleBookmark,
  bookmarkPending,
  showAdminDelete = false,
  onAdminDelete,
}: {
  post: CommunityPostRowData
  onOpen: (post: CommunityPostRowData) => void
  onToggleBookmark: (post: { id: number; bookmarked?: boolean }) => void
  bookmarkPending?: boolean
  showAdminDelete?: boolean
  onAdminDelete?: (event: React.MouseEvent, post: CommunityPostRowData) => void
}) {
  const open = () => onOpen(post)
  const concept = isConceptPost(post)
  const commentCount = Number(post?.commentCount || 0)
  const commentSuffix = commentCount > 0 ? `[${commentCount.toLocaleString('ko-KR')}]` : ''

  return (
    <div
      tabIndex={0}
      aria-label={`${post.title} 게시글 열기`}
      onClick={open}
      onKeyDown={(event) => openRowWithKeyboard(event, open)}
      className={`community-post-card-mobile apple-soft-panel cursor-pointer p-3 text-left text-[var(--app-muted)] transition hover:-translate-y-0.5 focus:bg-[var(--app-surface-soft)] focus:outline-none ${concept ? 'concept-post-card' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="community-post-card-tags flex flex-wrap items-center gap-1.5 text-[11px] font-black">
            <span className="text-[var(--app-subtle)]">#{post.id}</span>
            {post.pinned && <Chip variant="pinned">고정</Chip>}
            <Chip variant="category">{categoryLabel(post.category || 'GENERAL')}</Chip>
            {concept && <Chip variant="concept">개념글</Chip>}
            {postHasImages(post) && <span className="text-[var(--app-accent-text)]">[사진]</span>}
            {(post.videoInfos?.length > 0) && <span className="text-[var(--app-accent-text)]">[영상]</span>}
            {isEdited(post) && <span className="text-[var(--app-subtle)]">수정</span>}
            {post.authorRole ? <RoleTag role={post.authorRole} /> : post.authorAdmin && <Chip variant="admin">운영진</Chip>}
          </div>
          <h3 className="community-post-card-title mt-1.5 min-w-0 text-[15px] font-bold leading-[1.35] text-[var(--app-text)]">
            <span className="inline-flex max-w-full min-w-0 items-baseline" title={post.title}>
              <span className="min-w-0 truncate">{post.title}</span>
              {commentSuffix && <span className="shrink-0 text-[0.82em] text-cyan-200">{commentSuffix}</span>}
            </span>
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <BookmarkButton post={post} onToggle={onToggleBookmark} pending={bookmarkPending} />
          {showAdminDelete && (
            <button
              type="button"
              onClick={(event) => onAdminDelete(event, post)}
              className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-black text-red-700 transition hover:bg-red-100"
            >
              삭제
            </button>
          )}
        </div>
      </div>
      <div className="community-post-card-meta mt-2 flex min-w-0 items-center gap-2 text-xs font-semibold text-[var(--app-subtle)]">
        <span className="flex min-w-0 flex-1 items-center gap-1 text-[var(--app-muted)]">
          <AuthorName post={post} className="truncate" />
        </span>
        <span className="shrink-0">{shortDate(post.createdAt)}</span>
        <span className="shrink-0">조회 {post.viewCount}</span>
        <span className="shrink-0">개추 {postScore(post)}</span>
      </div>
    </div>
  )
}
