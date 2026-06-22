import { useEffect, useRef, useState } from 'react'
import { RotateCcw, X } from 'lucide-react'
import { getDeletedCommunityPost } from '../../services/adminApi.js'
import DeletedPostBody from './DeletedPostBody.jsx'
import {
  buildDeletedCommentTree,
  deletedAppealStatusLabel,
  deletedCategoryLabel,
  deletedPostIdentity,
  formatDateTime,
} from './deletedCommunityPostUtils.js'

export default function DeletedPostDetailModal({ post, onClose, onRestore, restoring, restoreDisabled }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const closeButtonRef = useRef(null)
  const dialogRef = useRef(null)

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const previousActiveElement = document.activeElement
    closeButtonRef.current?.focus()
    return () => {
      previousActiveElement?.focus?.()
    }
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const onKeyDown = (event) => {
      if (event.key !== 'Tab') return
      const focusable = dialogRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const activeEl = document.activeElement
      if (event.shiftKey && (activeEl === first || !dialogRef.current?.contains(activeEl))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && activeEl === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [])

  useEffect(() => {
    let mounted = true
    getDeletedCommunityPost(post.id)
      .then((data) => { if (mounted && data) setDetail(data) })
      .catch((err) => { if (mounted) setError(err.message || '원문을 불러오지 못했습니다.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [post.id])

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Detail comes from the API once loaded; restore status always tracks the live parent row.
  const full = { ...(detail || post), restoredPostId: post.restoredPostId, restoredAt: post.restoredAt }
  const commentTree = buildDeletedCommentTree(full.commentInfos || [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deleted-post-detail-title"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div ref={dialogRef} className="my-auto w-full max-w-3xl overflow-hidden rounded-2xl bg-[var(--app-surface)] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--app-hairline)] bg-[#f7f9ff] px-5 py-3">
          <div className="min-w-0">
            <p id="deleted-post-detail-title" className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#3b4890]">삭제 보관함 · 원문 보기</p>
            <p className="truncate text-xs text-[var(--theme-body-muted)]">#{full.originalPostId} · {deletedCategoryLabel(full.category)}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 rounded-full p-1.5 text-[var(--theme-body-muted)] transition hover:bg-black/5 hover:text-[var(--theme-body-dark)]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[calc(100vh-10rem)] overflow-y-auto">
          <div className="border-b border-[var(--app-hairline)] bg-amber-50/70 px-5 py-3 text-xs leading-5 text-amber-900">
            <div className="grid gap-1 sm:grid-cols-2">
              <span><strong>삭제자</strong> {deletedPostIdentity(full.deletedByName, full.deletedByStudentId)}{full.deletedByRole ? ` · ${full.deletedByRole}` : ''}</span>
              <span><strong>삭제 시각</strong> {formatDateTime(full.deletedAt)}</span>
              <span className="sm:col-span-2 whitespace-pre-wrap break-words"><strong>사유</strong> {full.deletionReason || '-'}</span>
            </div>
            {full.latestAppealStatus && (
              <div className="mt-2 border-t border-amber-900/15 pt-2">
                <span className="font-semibold">복원 요청({deletedAppealStatusLabel(full.latestAppealStatus)})</span>
                {full.latestAppealRequesterName && <span> · {deletedPostIdentity(full.latestAppealRequesterName, full.latestAppealRequesterStudentId)}</span>}
                {full.latestAppealCreatedAt && <span> · {formatDateTime(full.latestAppealCreatedAt)}</span>}
                {full.latestAppealMessage && <p className="mt-1 whitespace-pre-wrap break-words text-amber-900/90">{full.latestAppealMessage}</p>}
                {full.latestAppealResolutionNote && <p className="mt-1 whitespace-pre-wrap break-words text-amber-900/80">처리 메모: {full.latestAppealResolutionNote}</p>}
              </div>
            )}
          </div>

          <article className="px-5 py-5">
            <h2 className="text-xl font-black leading-7 text-[var(--theme-body-dark)] break-words">{full.title || '제목 없음'}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--theme-body-muted)]">
              <span className="font-semibold text-[var(--theme-body-dark)]">{deletedPostIdentity(full.authorName, full.authorStudentId)}</span>
              <span>{formatDateTime(full.originalCreatedAt)}</span>
              {full.originalUpdatedAt && full.originalUpdatedAt !== full.originalCreatedAt && <span>수정 {formatDateTime(full.originalUpdatedAt)}</span>}
              <span>조회 {Number(full.viewCount || 0).toLocaleString('ko-KR')}</span>
            </div>

            {error && <p className="mt-3 shape-cut-sm bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}
            {loading && <p className="mt-3 text-xs text-[var(--theme-body-muted)]">원문을 불러오는 중...</p>}

            <div className="mt-4 border-t border-[var(--app-hairline)] pt-4 text-sm text-[var(--theme-body-dark)]">
              <DeletedPostBody post={full} />
            </div>

            <section className="mt-6 border-t border-[var(--app-hairline)] pt-4">
              <h3 className="mb-3 text-sm font-bold text-[var(--theme-body-dark)]">댓글 {Number(full.commentCount || (full.commentInfos || []).length || 0).toLocaleString('ko-KR')}개</h3>
              {commentTree.length === 0 ? (
                <p className="text-xs text-[var(--theme-body-muted)]">보관된 댓글이 없습니다.</p>
              ) : (
                <div className="space-y-1">
                  {commentTree.map((comment) => renderDeletedComment(comment, 0))}
                </div>
              )}
            </section>
          </article>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--app-hairline)] bg-[var(--app-surface)] px-5 py-3">
          {full.restoredPostId ? (
            <div className="mr-auto flex items-center gap-2 text-xs font-semibold text-emerald-700">
              <span>복원됨</span>
              <a href={`/community/${full.restoredPostId}`} className="font-mono underline">#{full.restoredPostId} 열기</a>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onRestore(full)}
              disabled={restoreDisabled}
              className="shape-cut-sm mr-auto inline-flex items-center gap-1.5 border border-[#3b4890]/20 bg-[#f4f6ff] px-3 py-2 text-xs font-semibold text-[#3b4890] transition hover:bg-[#e8ecff] disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {restoring ? '복원 중...' : '커뮤니티로 되돌리기'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="shape-cut-sm border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-xs font-semibold text-[var(--theme-body-dark)] transition hover:bg-black/5"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

function renderDeletedComment(comment, level) {
  const depth = Math.min(level, 6)
  const indent = depth === 0 ? 0 : `clamp(8px, ${depth * 3}vw, ${depth * 16}px)`
  const displayName = comment.anonymousName
    ? deletedPostIdentity(comment.anonymousName, comment.authorStudentId)
    : deletedPostIdentity(comment.authorName, comment.authorStudentId)
  return (
    <div key={comment.originalCommentId}>
      <div
        className={`rounded-md px-3 py-2 text-sm ${level > 0 ? 'border-l-2 border-[#3b4890]/20 bg-black/[0.02]' : 'bg-black/[0.015]'}`}
        style={{ marginLeft: indent }}
      >
        <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xs font-bold text-[var(--theme-body-dark)]">{displayName}</span>
          <span className="text-[11px] text-[var(--theme-body-muted)]">{formatDateTime(comment.createdAt)}</span>
          {comment.edited && <span className="text-[11px] font-bold text-[var(--theme-body-muted)]">수정됨</span>}
        </div>
        <p className="whitespace-pre-wrap break-words text-[var(--theme-body-dark)]">{comment.content}</p>
      </div>
      {comment.children?.length > 0 && (
        <div className="mt-1 space-y-1">
          {comment.children.map((child) => renderDeletedComment(child, level + 1))}
        </div>
      )}
    </div>
  )
}
