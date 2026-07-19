import {
  Bookmark,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
  Search,
  ShieldAlert,
} from 'lucide-react'
import { categoryLabel } from './postEditorUtils'
import { BoardHeader } from './CommunityChrome'
import BookmarkButton from './BookmarkButton'
import AuthorName from './AuthorName'
import CommunityPostRow from './CommunityPostRow'
import { Skeleton, SkeletonGroup } from '../../components/common/Skeleton'
import {
  SORT_OPTIONS,
  clickableCell,
  isConceptPost,
  isEdited,
  openRowWithKeyboard,
  postHasImages,
  postScore,
  shortDate,
} from './communityBoardUtils'

type ListPost = {
  id: number
  title?: string
  category?: string
  commentCount?: number
  bookmarked?: boolean
  pinned?: boolean
  authorAdmin?: boolean
  videoInfos?: unknown[]
  viewCount?: number
  createdAt?: string
  [key: string]: unknown
}

export default function CommunityListView({
  onOpenDeletedRecords,
  onWrite,
  boardFilterOptions,
  effectiveActiveCategory,
  onCategoryChange,
  searchQuery,
  onSearchChange,
  filteredPosts,
  visiblePosts,
  loading,
  error,
  sortMode,
  onSortChange,
  page,
  totalPages,
  paginationItems,
  showingFrom,
  showingTo,
  onPageChange,
  user,
  onOpenPost,
  onAdminDelete,
  onOpenBookmarks,
  onToggleBookmark,
  bookmarkPending,
}: {
  onOpenDeletedRecords: () => void
  onWrite: () => void
  boardFilterOptions: { value: string; label: string }[]
  effectiveActiveCategory: string
  onCategoryChange: (value: string) => void
  searchQuery: string
  onSearchChange: (value: string) => void
  filteredPosts: ListPost[]
  visiblePosts: ListPost[]
  loading: boolean
  error: string
  sortMode: string
  onSortChange: (value: string) => void
  page: number
  totalPages: number
  paginationItems: (number | string)[]
  showingFrom: number
  showingTo: number
  onPageChange: (page: number | string) => void
  user?: { role?: string } | null
  onOpenPost: (post: ListPost) => void
  onAdminDelete: (event: React.MouseEvent, post: ListPost) => void
  onOpenBookmarks: () => void
  onToggleBookmark: (post: { id: number; bookmarked?: boolean }) => void
  bookmarkPending?: boolean
}) {
  const commentCountSuffix = (post) => {
    const count = Number(post?.commentCount || 0)
    return count > 0 ? `[${count.toLocaleString('ko-KR')}]` : ''
  }

  const renderPostTitleWithCount = (post) => {
    const suffix = commentCountSuffix(post)
    return (
      <span className="inline-flex max-w-full min-w-0 items-baseline" title={post.title}>
        <span className="min-w-0 truncate">{post.title}</span>
        {suffix && <span className="shrink-0 text-[0.82em] text-cyan-200">{suffix}</span>}
      </span>
    )
  }

  const renderPagination = (placement = 'top') => {
    const disabledClass = 'opacity-35'
    const iconButtonClass = 'flex size-10 items-center justify-center rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] text-[var(--app-muted)] transition enabled:hover:bg-[var(--app-surface-soft)] disabled:pointer-events-none sm:size-9'

    return (
      <div className={`community-pagination flex flex-col gap-3 ${placement === 'bottom' ? 'items-center' : 'lg:flex-row lg:items-center lg:justify-between'}`}>
        <div className="community-pagination-summary text-center text-xs font-semibold text-[var(--app-subtle)] lg:text-left">
          {filteredPosts.length > 0
            ? `${showingFrom.toLocaleString('ko-KR')}-${showingTo.toLocaleString('ko-KR')} / ${filteredPosts.length.toLocaleString('ko-KR')}`
            : '0 / 0'}
          <span className="mx-2 text-black/20">|</span>
          {page.toLocaleString('ko-KR')} / {totalPages.toLocaleString('ko-KR')} 페이지
        </div>
        <div className="community-pagination-strip max-w-full overflow-x-auto pb-1">
          <div className="community-pagination-pages flex w-max items-center justify-center gap-1.5 px-1">
            <button
              type="button"
              onClick={() => onPageChange(1)}
              disabled={page === 1}
              className={`hidden sm:flex ${iconButtonClass} ${page === 1 ? disabledClass : ''}`}
              aria-label="첫 페이지"
              title="첫 페이지"
            >
              <ChevronsLeft size={15} />
            </button>
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 1}
              className={`${iconButtonClass} ${page === 1 ? disabledClass : ''}`}
              aria-label="이전 페이지"
              title="이전 페이지"
            >
              <ChevronLeft size={15} />
            </button>
            {paginationItems.map((item) => (
              typeof item === 'string' ? (
                <span key={item} className="flex size-10 items-center justify-center text-sm font-black text-[var(--app-subtle)] sm:size-9">...</span>
              ) : (
                <button
                  key={item}
                  type="button"
                  onClick={() => onPageChange(item)}
                  className={`flex size-10 items-center justify-center rounded-full border text-sm font-black transition sm:size-9 ${
                    page === item
                      ? 'border-[#0071e3] bg-[var(--app-accent)] text-white shadow-[0_8px_22px_rgba(0,113,227,0.22)]'
                      : 'border-[var(--app-hairline)] bg-[var(--app-surface)] text-[var(--app-muted)] hover:bg-[var(--app-surface-soft)] hover:text-[var(--app-text)]'
                  }`}
                  aria-current={page === item ? 'page' : undefined}
                >
                  {item}
                </button>
              )
            ))}
            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={page === totalPages}
              className={`${iconButtonClass} ${page === totalPages ? disabledClass : ''}`}
              aria-label="다음 페이지"
              title="다음 페이지"
            >
              <ChevronRight size={15} />
            </button>
            <button
              type="button"
              onClick={() => onPageChange(totalPages)}
              disabled={page === totalPages}
              className={`hidden sm:flex ${iconButtonClass} ${page === totalPages ? disabledClass : ''}`}
              aria-label="마지막 페이지"
              title="마지막 페이지"
            >
              <ChevronsRight size={15} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderPostCard = (post) => {
    return (
      <CommunityPostRow
        key={post.id}
        post={post}
        onOpen={onOpenPost}
        onToggleBookmark={onToggleBookmark}
        bookmarkPending={bookmarkPending}
        showAdminDelete={user?.role === 'ADMIN'}
        onAdminDelete={onAdminDelete}
      />
    )
  }

  return (
    <>
      <BoardHeader>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <button type="button" onClick={onOpenBookmarks} className="apple-action-secondary inline-flex w-full items-center justify-center gap-1 px-5 py-3 text-sm sm:w-auto sm:py-2.5">
            <Bookmark size={14} />
            내 스크랩
          </button>
          <button type="button" onClick={onOpenDeletedRecords} className="apple-action-secondary inline-flex w-full items-center justify-center gap-1 px-5 py-3 text-sm sm:w-auto sm:py-2.5">
            <ShieldAlert size={14} />
            내 삭제 기록
          </button>
          <button type="button" onClick={onWrite} className="apple-action-primary w-full px-5 py-3 text-sm sm:w-auto sm:py-2.5">
            글쓰기
          </button>
        </div>
      </BoardHeader>
      <div className="apple-control-strip px-4 py-4 sm:px-8">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="-mx-1 overflow-x-auto pb-1 touch-pan-x">
              <div className="flex min-w-max gap-2 px-1 text-sm font-bold lg:min-w-0 lg:flex-wrap">
                {boardFilterOptions.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => onCategoryChange(item.value)}
                    className={`apple-chip min-h-10 px-4 py-2 sm:min-h-9 ${
                      effectiveActiveCategory === item.value
                        ? 'apple-chip-active'
                        : ''
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex items-center">
                <Search size={15} className="pointer-events-none absolute left-3 text-[var(--app-subtle)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder="제목, 본문, 작성자 검색"
                  className="h-11 w-full rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] py-2 pl-9 pr-3 text-base text-[var(--app-text)] placeholder:text-[var(--app-subtle)] outline-none transition focus:ring-2 focus:ring-[var(--app-accent)]/24 sm:h-10 sm:w-64 sm:text-sm"
                />
              </div>
              <span className="rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-center text-xs font-bold text-[var(--app-subtle)]">
                {filteredPosts.length.toLocaleString('ko-KR')}개
              </span>
            </div>
          </div>
          <div className="-mx-1 overflow-x-auto pb-1 touch-pan-x">
            <div className="flex min-w-max items-center gap-2 px-1 text-xs font-black text-[var(--app-muted)]">
              <span className="shrink-0">정렬</span>
              {SORT_OPTIONS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => onSortChange(item.value)}
                  className={`apple-chip min-h-9 px-3 py-1.5 ${sortMode === item.value ? 'apple-chip-active' : ''}`}
                >
                  {item.label}
                </button>
              ))}
              {searchQuery.trim() && (
                <span className="rounded-full border border-[#3b4890]/15 bg-[#f7f9ff] px-3 py-2 text-[#3b4890]">
                  본문까지 검색 중
                </span>
              )}
            </div>
          </div>
          <div className="border-t border-[var(--app-hairline)] pt-4">
            {renderPagination('top')}
          </div>
        </div>
      </div>
      {error && <p className="mx-5 mt-5 rounded-lg border border-red-300/30 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 sm:mx-7">{error}</p>}
      <div className="community-mobile-posts m-4 space-y-3 md:hidden">
        {loading && (
          <SkeletonGroup label="게시글을 불러오는 중">
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-4 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                </div>
              ))}
            </div>
          </SkeletonGroup>
        )}
        {!loading && filteredPosts.length === 0 && (
          <div className="rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-12 text-center text-sm font-semibold text-[var(--app-muted)]">등록된 글이 없습니다.</div>
        )}
        {visiblePosts.map(renderPostCard)}
      </div>
      <div className="m-5 hidden overflow-x-auto rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] md:block sm:m-8">
        <table className="apple-table w-full min-w-[860px] border-collapse text-sm">
          <thead className="border-b border-[var(--app-hairline)]">
            <tr>
              <th className="w-20 px-4 py-3 font-semibold">번호</th>
              <th className="w-24 px-4 py-3 font-semibold">말머리</th>
              <th className="px-4 py-3 text-left font-semibold">제목</th>
              <th className="w-36 px-4 py-3 font-semibold">글쓴이</th>
              <th className="w-28 px-4 py-3 font-semibold">작성일</th>
              <th className="w-20 px-4 py-3 font-semibold">조회</th>
              <th className="w-20 px-4 py-3 font-semibold">개추</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10">
            {loading && Array.from({ length: 6 }).map((_, i) => (
              <tr key={i}>
                <td colSpan={7} className="px-4 py-4">
                  <div className="flex items-center gap-4" role={i === 0 ? 'status' : undefined} aria-label={i === 0 ? '게시글을 불러오는 중' : undefined}>
                    <Skeleton className="h-3 w-8" />
                    <Skeleton className="h-3 w-14" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-10" />
                  </div>
                </td>
              </tr>
            ))}
            {!loading && filteredPosts.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-16 text-center text-[var(--app-muted)]">등록된 글이 없습니다.</td></tr>
            )}
            {visiblePosts.map((post) => {
              const open = () => onOpenPost(post)
              const concept = isConceptPost(post)
              return (
                <tr
                  key={post.id}
                  tabIndex={0}
                  aria-label={`${post.title} 게시글 열기`}
                  onKeyDown={(event) => openRowWithKeyboard(event, open)}
                  className={`cursor-pointer text-[var(--app-muted)] transition hover:bg-[var(--app-surface-soft)] focus:bg-[var(--app-surface-soft)] focus:outline-none ${concept ? 'concept-post-row' : ''}`}
                >
                  <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-center text-xs text-[var(--app-subtle)]">{post.id}</td>
                  <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-center text-xs font-bold text-[var(--app-accent-text)]">{categoryLabel(post.category || 'GENERAL')}</td>
                  <td {...clickableCell(open)} className="cursor-pointer px-4 py-4">
                    <span className="flex max-w-full min-w-0 items-center gap-1 text-left font-semibold text-[var(--app-text)] lg:max-w-[520px]">
                      {post.pinned && <span className="shrink-0 rounded bg-[#fff1d6] px-1.5 py-0.5 text-[10px] font-black text-[#9a6a00]">고정</span>}
                      {concept && <span className="shrink-0 rounded bg-[#f0c36d] px-1.5 py-0.5 text-[10px] font-black text-[#3a2b00]">개념글</span>}
                      {renderPostTitleWithCount(post)}
                    </span>
                    {postHasImages(post) && <span className="ml-1 text-xs text-[var(--app-accent-text)]">[사진]</span>}
                    {(post.videoInfos?.length > 0) && <span className="ml-1 text-xs text-[var(--app-accent-text)]">[영상]</span>}
                    {isEdited(post) && <span className="ml-1 text-[10px] font-bold text-[var(--app-subtle)]">수정</span>}
                    {post.authorAdmin && <span className="ml-1 rounded bg-red-600 px-1 py-0.5 text-[10px] font-black text-white">주딱</span>}
                  </td>
                  <td className="px-4 py-4 text-center text-xs font-semibold">
                    <span className="inline-flex items-center gap-2">
                      <AuthorName post={post} />
                      <BookmarkButton post={post} onToggle={onToggleBookmark} pending={bookmarkPending} />
                    </span>
                    {user?.role === 'ADMIN' && (
                      <button
                        type="button"
                        onClick={(event) => onAdminDelete(event, post)}
                        className="ml-2 rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-black text-red-700 hover:bg-red-100"
                      >
                        삭제
                      </button>
                    )}
                  </td>
                  <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-center text-xs text-[var(--app-subtle)]">{shortDate(post.createdAt)}</td>
                  <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-center text-xs">{post.viewCount}</td>
                  <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-center text-xs">{postScore(post)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="apple-control-strip border-t px-5 py-4 sm:px-8">
        {renderPagination('bottom')}
      </div>
    </>
  )
}
