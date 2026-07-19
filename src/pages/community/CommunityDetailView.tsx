import {
  ArrowLeft,
  Pencil,
  Pin,
  PinOff,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from 'lucide-react'
import CommentThread from './CommentThread'
import { BoardDetailBar } from './CommunityChrome'
import BookmarkButton from './BookmarkButton'
import AuthorName from './AuthorName'
import { renderPostBlocks } from './PostBlocks'
import { isConceptPost, isEdited, postScore } from './communityBoardUtils'
import { MAX_ANONYMOUS_NAME_LENGTH, categoryLabel } from './postEditorUtils'
import { Skeleton, SkeletonLine, SkeletonGroup } from '../../components/common/Skeleton'

export default function CommunityDetailView({
  currentPost,
  detailLoading,
  comments,
  commentInput,
  setCommentInput,
  commentAnonymousName,
  setCommentAnonymousName,
  replyTo,
  setReplyTo,
  replyInput,
  setReplyInput,
  replyAnonymousName,
  setReplyAnonymousName,
  replyMentionEnabled,
  setReplyMentionEnabled,
  editingCommentId,
  setEditingCommentId,
  editCommentInput,
  setEditCommentInput,
  commentSaving,
  isAnonymousDetail,
  maxCommentLength,
  replyMentionFor,
  onAddComment,
  onAddReply,
  onUpdateComment,
  onDeleteComment,
  onStartEditComment,
  pollVoting,
  pollClosing,
  onPollVote,
  onPollClose,
  onVote,
  onBackToList,
  onEdit,
  onDelete,
  isAdmin,
  pinning,
  onPin,
  onToggleBookmark,
  bookmarkPending,
}: {
  currentPost: {
    id: number
    title?: string
    category?: string
    createdAt?: string
    updatedAt?: string
    viewCount?: number
    upvotes?: number
    downvotes?: number
    myVote?: number
    pinned?: boolean
    authorAdmin?: boolean
    concept?: boolean
    editable?: boolean
    bookmarked?: boolean
    [key: string]: unknown
  }
  detailLoading?: boolean
  comments: { id: string | number; [key: string]: unknown }[]
  commentInput: string
  setCommentInput: (value: string) => void
  commentAnonymousName: string
  setCommentAnonymousName: (value: string) => void
  replyTo: string | number | null
  setReplyTo: (id: string | number | null) => void
  replyInput: string
  setReplyInput: (value: string) => void
  replyAnonymousName: string
  setReplyAnonymousName: (value: string) => void
  replyMentionEnabled: boolean
  setReplyMentionEnabled: (value: boolean) => void
  editingCommentId: string | number | null
  setEditingCommentId: (id: string | number | null) => void
  editCommentInput: string
  setEditCommentInput: (value: string) => void
  commentSaving: boolean
  isAnonymousDetail: boolean
  maxCommentLength: number
  replyMentionFor: (comment: { id: string | number; [key: string]: unknown }) => string
  onAddComment: () => void
  onAddReply: (parentId: string | number) => void
  onUpdateComment: (id: string | number) => void
  onDeleteComment: (id: string | number) => void
  onStartEditComment: (comment: { id: string | number; [key: string]: unknown }) => void
  pollVoting?: string
  pollClosing?: string
  onPollVote: (...args: unknown[]) => void
  onPollClose: (...args: unknown[]) => void
  onVote: (value: number) => void
  onBackToList: () => void
  onEdit: () => void
  onDelete: (post: unknown) => void
  isAdmin?: boolean
  pinning?: boolean
  onPin: () => void
  onToggleBookmark: (post: { id: number; bookmarked?: boolean }) => void
  bookmarkPending?: boolean
}) {
  const currentPostConcept = currentPost ? isConceptPost(currentPost) : false

  return (
    <>
      <BoardDetailBar post={currentPost} loading={detailLoading}>
        <button type="button" onClick={onBackToList} className="apple-action-secondary inline-flex w-full items-center justify-center gap-1 px-4 py-3 text-sm sm:w-auto sm:py-2">
          <ArrowLeft size={14} />
          목록
        </button>
      </BoardDetailBar>
      {detailLoading || !currentPost ? (
        <SkeletonGroup label="글을 여는 중">
          <div className="m-0 space-y-4 p-4 sm:m-5 sm:space-y-5 sm:p-5">
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <SkeletonLine className="h-7 w-3/4" />
            <SkeletonLine className="w-1/3" />
            <div className="space-y-2 pt-2">
              <SkeletonLine className="w-full" />
              <SkeletonLine className="w-full" />
              <SkeletonLine className="w-5/6" />
              <SkeletonLine className="w-2/3" />
            </div>
          </div>
        </SkeletonGroup>
      ) : (
        <article className="m-0 overflow-hidden bg-[var(--app-surface)] sm:m-5 sm:rounded-lg sm:border sm:border-[var(--app-hairline)]">
          <div className="border-b border-[var(--app-hairline)] px-4 py-4 sm:px-5">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-black text-[var(--app-brand)]">
              {currentPost.pinned && <span className="rounded bg-[#fff1d6] px-1.5 py-0.5 text-[10px] font-black text-[#9a6a00]">고정</span>}
              <span>{categoryLabel(currentPost.category || 'GENERAL')}</span>
              {currentPostConcept && <span className="rounded bg-[#f0c36d] px-1.5 py-0.5 text-[10px] font-black text-[#3a2b00]">개념글</span>}
            </div>
            <h2 className="break-words text-xl font-black leading-8 sm:text-2xl">{currentPost.title}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--theme-body-muted)]">
              <AuthorName post={currentPost} className="font-bold text-[var(--theme-body-mid)]" />
              {currentPost.authorAdmin && <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white">주딱</span>}
              {currentPost.concept && <span className="rounded bg-yellow-400 px-1.5 py-0.5 text-[10px] font-black text-black">개념글</span>}
              <span>{new Date(currentPost.createdAt).toLocaleString('ko-KR')}</span>
              {isEdited(currentPost) && <span>수정 {new Date(currentPost.updatedAt).toLocaleString('ko-KR')}</span>}
              <span>조회 {currentPost.viewCount}</span>
              <span>개추 {postScore(currentPost)}</span>
            </div>
          </div>
          <div className="min-h-[220px] sm:min-h-[280px]">
            {renderPostBlocks(currentPost, {
              onPollVote,
              onPollClose: currentPost.editable ? onPollClose : null,
              pollVoting,
              pollClosing,
            })}
          </div>
          <div className="grid grid-cols-2 gap-2 border-y border-[var(--app-hairline)] bg-[#fafafa] px-4 py-4 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-3 sm:py-5">
            <button type="button" onClick={() => onVote(1)} className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border px-3 py-3 text-sm font-black sm:w-auto sm:px-5 ${currentPost.myVote === 1 ? 'border-[var(--app-accent)] bg-[var(--app-accent)] text-white' : 'border-[var(--app-hairline)] bg-[var(--app-surface)] text-[var(--app-accent-text)]'}`}>
              <ThumbsUp size={16} />
              개추 {currentPost.upvotes}
            </button>
            <button type="button" onClick={() => onVote(-1)} className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border px-3 py-3 text-sm font-black sm:w-auto sm:px-5 ${currentPost.myVote === -1 ? 'border-red-600 bg-red-600 text-white' : 'border-[var(--app-hairline)] bg-[var(--app-surface)] text-red-600'}`}>
              <ThumbsDown size={16} />
              비추 {currentPost.downvotes}
            </button>
            <BookmarkButton post={currentPost} onToggle={onToggleBookmark} pending={bookmarkPending} variant="full" />
          </div>
          <div className="grid grid-cols-2 gap-2 px-4 py-4 sm:flex sm:flex-row sm:flex-wrap sm:justify-between sm:gap-2.5">
            <button type="button" onClick={onBackToList} className="inline-flex min-h-12 items-center justify-center gap-1 rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-2 text-sm font-bold sm:min-h-0">
              목록
            </button>
            {isAdmin && (
              <button type="button" onClick={onPin} disabled={pinning} className="inline-flex min-h-12 items-center justify-center gap-1 rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-2 text-sm font-bold disabled:opacity-50 sm:min-h-0">
                {currentPost.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                {currentPost.pinned ? '고정 해제' : '고정'}
              </button>
            )}
            {currentPost.editable && (
              <>
                <button type="button" onClick={onEdit} className="inline-flex min-h-12 items-center justify-center gap-1 rounded-full border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-2 text-sm font-bold sm:min-h-0">
                  <Pencil size={14} />
                  수정
                </button>
                <button type="button" onClick={() => onDelete(currentPost)} className="inline-flex min-h-12 items-center justify-center gap-1 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 sm:min-h-0">
                  <Trash2 size={14} />
                  삭제
                </button>
              </>
            )}
          </div>

          <CommentThread
            comments={comments}
            commentInput={commentInput}
            setCommentInput={setCommentInput}
            commentAnonymousName={commentAnonymousName}
            setCommentAnonymousName={setCommentAnonymousName}
            replyTo={replyTo}
            setReplyTo={setReplyTo}
            replyInput={replyInput}
            setReplyInput={setReplyInput}
            replyAnonymousName={replyAnonymousName}
            setReplyAnonymousName={setReplyAnonymousName}
            replyMentionEnabled={replyMentionEnabled}
            setReplyMentionEnabled={setReplyMentionEnabled}
            editingCommentId={editingCommentId}
            setEditingCommentId={setEditingCommentId}
            editCommentInput={editCommentInput}
            setEditCommentInput={setEditCommentInput}
            commentSaving={commentSaving}
            isAnonymousDetail={isAnonymousDetail}
            maxCommentLength={maxCommentLength}
            maxAnonymousNameLength={MAX_ANONYMOUS_NAME_LENGTH}
            replyMentionFor={replyMentionFor}
            onAddComment={onAddComment}
            onAddReply={onAddReply}
            onUpdateComment={onUpdateComment}
            onDeleteComment={onDeleteComment}
            onStartEditComment={onStartEditComment}
          />
        </article>
      )}
    </>
  )
}
