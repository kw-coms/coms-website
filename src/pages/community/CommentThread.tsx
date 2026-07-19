import { useMemo } from 'react'
import { MessageSquare, Send } from 'lucide-react'
import { linkify } from '../../utils/linkify'

type Comment = {
  id: string | number
  authorName?: string
  content?: string
  createdAt?: string
  updatedAt?: string
  edited?: boolean
  deletable?: boolean
  parentCommentId?: string | number | null
  children?: Comment[]
}

type CommentNodeSharedProps = {
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
  maxAnonymousNameLength: number
  replyMentionFor: (comment: Comment) => string
  onAddReply: (parentId: string | number) => void
  onUpdateComment: (id: string | number) => void
  onDeleteComment: (id: string | number) => void
  onStartEditComment: (comment: Comment) => void
}

export default function CommentThread({
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
  maxAnonymousNameLength,
  replyMentionFor,
  onAddComment,
  onAddReply,
  onUpdateComment,
  onDeleteComment,
  onStartEditComment,
}: CommentNodeSharedProps & {
  comments: Comment[]
  commentInput: string
  setCommentInput: (value: string) => void
  commentAnonymousName: string
  setCommentAnonymousName: (value: string) => void
  onAddComment: () => void
}) {
  const commentTree = useMemo(() => buildCommentTree(comments), [comments])

  return (
    <div className="border-t border-[var(--app-hairline)]">
      <div className="flex items-center gap-2 bg-[var(--app-surface-soft)] px-4 py-3">
        <MessageSquare size={15} className="text-[var(--app-brand)]" />
        <span className="text-sm font-black text-[var(--app-brand)]">댓글 {comments.length}</span>
      </div>
      {comments.length > 0 && (
        <div className="divide-y divide-black/8">
          {commentTree.map((comment) => (
            <CommentNode
              key={comment.id}
              comment={comment}
              level={0}
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
              maxAnonymousNameLength={maxAnonymousNameLength}
              replyMentionFor={replyMentionFor}
              onAddReply={onAddReply}
              onUpdateComment={onUpdateComment}
              onDeleteComment={onDeleteComment}
              onStartEditComment={onStartEditComment}
            />
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2 border-t border-black/8 bg-[var(--app-surface)] px-4 py-3">
        {isAnonymousDetail && (
          <input
            value={commentAnonymousName}
            onChange={(e) => setCommentAnonymousName(e.target.value)}
            maxLength={maxAnonymousNameLength}
            placeholder="ㅇㅇ"
            className="rounded border border-black/15 bg-[var(--app-surface-soft)] px-3 py-2 text-base outline-none focus:border-[var(--app-brand)] focus:bg-[var(--app-surface)] sm:text-sm"
            disabled={commentSaving}
          />
        )}
        <textarea
          value={commentInput}
          onChange={(e) => setCommentInput(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              onAddComment()
            }
          }}
          placeholder="댓글을 입력하세요"
          maxLength={maxCommentLength}
          rows={3}
          className="min-h-24 rounded border border-black/15 bg-[var(--app-surface-soft)] px-3 py-2 text-base outline-none focus:border-[var(--app-brand)] focus:bg-[var(--app-surface)] sm:text-sm"
          disabled={commentSaving}
        />
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
          <p className="text-xs font-semibold text-[var(--theme-body-muted)]">Enter는 줄바꿈, Ctrl/⌘+Enter 또는 버튼으로 등록</p>
          <button
            type="button"
            onClick={onAddComment}
            disabled={commentSaving || !commentInput.trim()}
            className="inline-flex min-h-12 w-full items-center justify-center gap-1.5 rounded bg-[var(--app-brand)] px-4 py-2 text-sm font-bold text-white transition hover:bg-[var(--app-brand-strong)] disabled:opacity-40 sm:min-h-11 sm:w-auto"
          >
            <Send size={13} />
            등록
          </button>
        </div>
      </div>
    </div>
  )
}

function CommentNode({
  comment,
  level,
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
  maxAnonymousNameLength,
  replyMentionFor,
  onAddReply,
  onUpdateComment,
  onDeleteComment,
  onStartEditComment,
}: CommentNodeSharedProps & {
  comment: Comment
  level: number
}) {
  const depth = Math.min(level, 6)
  const indent = depth === 0 ? 0 : `clamp(8px, ${depth * 3}vw, ${depth * 16}px)`
  const isEditing = editingCommentId === comment.id
  const isReplying = replyTo === comment.id
  const mention = replyMentionFor(comment)

  return (
    <div className="divide-y divide-black/8">
      <div
        id={`comment-${comment.id}`}
        className={`scroll-mt-28 flex items-start gap-3 px-4 py-3 ${level > 0 ? 'border-l-2 border-[var(--app-brand)]/20 bg-black/[0.02]' : ''}`}
        style={{ marginLeft: indent }}
      >
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs font-bold text-[var(--theme-body-dark)]">{comment.authorName}</span>
            <span className="text-[11px] text-[var(--theme-body-muted)]">{new Date(comment.createdAt).toLocaleString('ko-KR')}</span>
            {comment.edited && (
              <span className="text-[11px] font-bold text-[var(--theme-body-muted)]">
                수정 {comment.updatedAt ? new Date(comment.updatedAt).toLocaleString('ko-KR') : ''}
              </span>
            )}
          </div>
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editCommentInput}
                onChange={(e) => setEditCommentInput(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault()
                    onUpdateComment(comment.id)
                  }
                }}
                maxLength={maxCommentLength}
                rows={3}
                className="w-full rounded border border-black/15 bg-[var(--app-surface-soft)] px-3 py-2 text-base outline-none focus:border-[var(--app-brand)] focus:bg-[var(--app-surface)] sm:text-sm"
                disabled={commentSaving}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onUpdateComment(comment.id)}
                  disabled={commentSaving || !editCommentInput.trim()}
                  className="inline-flex min-h-11 items-center justify-center rounded bg-[var(--app-brand)] px-4 py-2 text-xs font-bold text-white disabled:opacity-40 sm:min-h-0 sm:px-3"
                >
                  저장
                </button>
                <button
                  type="button"
                  onClick={() => { setEditingCommentId(null); setEditCommentInput('') }}
                  className="inline-flex min-h-11 items-center justify-center rounded border border-black/15 bg-[var(--app-surface)] px-4 py-2 text-xs font-bold text-[var(--theme-body-muted)] sm:min-h-0 sm:px-3"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <p className="text-size-container auto-text-comment whitespace-pre-wrap break-words text-[var(--theme-body-dark)]">{linkify(comment.content)}</p>
          )}
          {!isEditing && (
            <div className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5 max-md:-ml-2 sm:mt-2 sm:gap-3">
              <button
                type="button"
                onClick={() => {
                  setReplyTo(isReplying ? null : comment.id)
                  setReplyInput('')
                  setReplyAnonymousName('')
                  setReplyMentionEnabled(true)
                  setEditingCommentId(null)
                  setEditCommentInput('')
                }}
                className="inline-flex min-h-11 items-center px-2 text-xs font-bold text-[var(--app-brand)] hover:underline sm:min-h-0 sm:px-0"
              >
                댓글 달기
              </button>
              {comment.deletable && (
                <button
                  type="button"
                  onClick={() => onStartEditComment(comment)}
                  className="inline-flex min-h-11 items-center px-2 text-xs font-bold text-[var(--app-brand)] hover:underline sm:min-h-0 sm:px-0"
                >
                  수정
                </button>
              )}
              {comment.deletable && (
                <button
                  type="button"
                  onClick={() => onDeleteComment(comment.id)}
                  className="inline-flex min-h-11 items-center px-2 text-xs font-bold text-red-500 hover:underline sm:min-h-0 sm:px-0"
                >
                  삭제
                </button>
              )}
            </div>
          )}
          {isReplying && (
            <div className="mt-2 space-y-2">
              {replyMentionEnabled && mention && (
                <div className="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--app-brand)]/20 bg-[var(--app-brand-soft)] px-2.5 py-1 text-xs font-bold text-[var(--app-brand)]">
                  <span className="truncate">{mention}</span>
                  <button
                    type="button"
                    onClick={() => setReplyMentionEnabled(false)}
                    className="rounded-full px-1 text-[var(--app-brand)]/70 hover:bg-[var(--app-brand)]/10 hover:text-[var(--app-brand)]"
                    aria-label="답글 태그 제거"
                  >
                    ×
                  </button>
                </div>
              )}
              {isAnonymousDetail && (
                <input
                  value={replyAnonymousName}
                  onChange={(e) => setReplyAnonymousName(e.target.value)}
                  maxLength={maxAnonymousNameLength}
                  placeholder="ㅇㅇ"
                  className="w-full rounded border border-black/15 bg-[var(--app-surface-soft)] px-3 py-2 text-base outline-none focus:border-[var(--app-brand)] focus:bg-[var(--app-surface)] sm:text-sm"
                  disabled={commentSaving}
                />
              )}
              <textarea
                value={replyInput}
                onChange={(e) => setReplyInput(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault()
                    onAddReply(comment.id)
                  }
                }}
                placeholder="댓글을 입력하세요"
                maxLength={Math.max(0, maxCommentLength - (replyMentionEnabled ? mention.length + 1 : 0))}
                rows={3}
                className="w-full rounded border border-black/15 bg-[var(--app-surface-soft)] px-3 py-2 text-base outline-none focus:border-[var(--app-brand)] focus:bg-[var(--app-surface)] sm:text-sm"
                disabled={commentSaving}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onAddReply(comment.id)}
                  disabled={commentSaving || !replyInput.trim()}
                  className="inline-flex min-h-11 items-center justify-center rounded bg-[var(--app-brand)] px-4 py-2 text-xs font-bold text-white disabled:opacity-40 sm:min-h-0 sm:px-3"
                >
                  등록
                </button>
                <button
                  type="button"
                  onClick={() => { setReplyTo(null); setReplyInput(''); setReplyAnonymousName('') }}
                  className="inline-flex min-h-11 items-center justify-center rounded border border-black/15 bg-[var(--app-surface)] px-4 py-2 text-xs font-bold text-[var(--theme-body-muted)] sm:min-h-0 sm:px-3"
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {comment.children?.map((child) => (
        <CommentNode
          key={child.id}
          comment={child}
          level={level + 1}
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
          maxAnonymousNameLength={maxAnonymousNameLength}
          replyMentionFor={replyMentionFor}
          onAddReply={onAddReply}
          onUpdateComment={onUpdateComment}
          onDeleteComment={onDeleteComment}
          onStartEditComment={onStartEditComment}
        />
      ))}
    </div>
  )
}

function buildCommentTree(comments) {
  const nodes = new Map<any, any>(comments.map((comment) => [comment.id, { ...comment, children: [] }]))
  const roots = []
  comments.forEach((comment) => {
    const node = nodes.get(comment.id)
    const parent = comment.parentCommentId ? nodes.get(comment.parentCommentId) : null
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}
