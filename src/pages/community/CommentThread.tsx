import { useMemo } from 'react'
import { MessageSquare, Send } from 'lucide-react'
import { linkify } from '../../utils/linkify'

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
}: any) {
  const commentTree = useMemo(() => buildCommentTree(comments), [comments])

  return (
    <div className="border-t border-[var(--app-hairline)]">
      <div className="flex items-center gap-2 bg-[var(--app-surface-soft)] px-4 py-3">
        <MessageSquare size={15} className="text-[#3b4890]" />
        <span className="text-sm font-black text-[#3b4890]">댓글 {comments.length}</span>
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
            className="rounded border border-black/15 bg-[#fafafa] px-3 py-2 text-base outline-none focus:border-[#3b4890] focus:bg-[var(--app-surface)] sm:text-sm"
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
          className="min-h-24 rounded border border-black/15 bg-[#fafafa] px-3 py-2 text-base outline-none focus:border-[#3b4890] focus:bg-[var(--app-surface)] sm:text-sm"
          disabled={commentSaving}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold text-[var(--theme-body-muted)]">Enter는 줄바꿈, Ctrl/⌘+Enter 또는 버튼으로 등록</p>
          <button
            type="button"
            onClick={onAddComment}
            disabled={commentSaving || !commentInput.trim()}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded bg-[#3b4890] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#2d3a7a] disabled:opacity-40"
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
}: any) {
  const depth = Math.min(level, 6)
  const indent = depth === 0 ? 0 : `clamp(8px, ${depth * 3}vw, ${depth * 16}px)`
  const isEditing = editingCommentId === comment.id
  const isReplying = replyTo === comment.id
  const mention = replyMentionFor(comment)

  return (
    <div className="divide-y divide-black/8">
      <div
        id={`comment-${comment.id}`}
        className={`scroll-mt-28 flex items-start gap-3 px-4 py-3 ${level > 0 ? 'border-l-2 border-[#3b4890]/20 bg-black/[0.02]' : ''}`}
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
                className="w-full rounded border border-black/15 bg-[#fafafa] px-3 py-2 text-base outline-none focus:border-[#3b4890] focus:bg-[var(--app-surface)] sm:text-sm"
                disabled={commentSaving}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onUpdateComment(comment.id)}
                  disabled={commentSaving || !editCommentInput.trim()}
                  className="rounded bg-[#3b4890] px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                >
                  저장
                </button>
                <button
                  type="button"
                  onClick={() => { setEditingCommentId(null); setEditCommentInput('') }}
                  className="rounded border border-black/15 bg-[var(--app-surface)] px-3 py-2 text-xs font-bold text-[var(--theme-body-muted)]"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <p className="text-size-container auto-text-comment whitespace-pre-wrap break-words text-[var(--theme-body-dark)]">{linkify(comment.content)}</p>
          )}
          {!isEditing && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
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
                className="text-xs font-bold text-[#3b4890] hover:underline"
              >
                댓글 달기
              </button>
              {comment.deletable && (
                <button
                  type="button"
                  onClick={() => onStartEditComment(comment)}
                  className="text-xs font-bold text-[#3b4890] hover:underline"
                >
                  수정
                </button>
              )}
              {comment.deletable && (
                <button
                  type="button"
                  onClick={() => onDeleteComment(comment.id)}
                  className="text-xs font-bold text-red-500 hover:underline"
                >
                  삭제
                </button>
              )}
            </div>
          )}
          {isReplying && (
            <div className="mt-2 space-y-2">
              {replyMentionEnabled && mention && (
                <div className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#3b4890]/20 bg-[#eef3ff] px-2.5 py-1 text-xs font-bold text-[#3b4890]">
                  <span className="truncate">{mention}</span>
                  <button
                    type="button"
                    onClick={() => setReplyMentionEnabled(false)}
                    className="rounded-full px-1 text-[#3b4890]/70 hover:bg-[#3b4890]/10 hover:text-[#3b4890]"
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
                  className="w-full rounded border border-black/15 bg-[#fafafa] px-3 py-2 text-base outline-none focus:border-[#3b4890] focus:bg-[var(--app-surface)] sm:text-sm"
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
                className="w-full rounded border border-black/15 bg-[#fafafa] px-3 py-2 text-base outline-none focus:border-[#3b4890] focus:bg-[var(--app-surface)] sm:text-sm"
                disabled={commentSaving}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onAddReply(comment.id)}
                  disabled={commentSaving || !replyInput.trim()}
                  className="rounded bg-[#3b4890] px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                >
                  등록
                </button>
                <button
                  type="button"
                  onClick={() => { setReplyTo(null); setReplyInput(''); setReplyAnonymousName('') }}
                  className="rounded border border-black/15 bg-[var(--app-surface)] px-3 py-2 text-xs font-bold text-[var(--theme-body-muted)]"
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
