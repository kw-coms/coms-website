import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/useAuth'
import {
  createClubProjectComment,
  deleteClubProjectComment,
  listClubProjectComments,
  updateClubProjectComment,
} from '../../services/clubProjectApi'
import { confirmDialog } from '../common/ConfirmDialog'
import { orderWorkComments, removeWorkCommentThread } from './workCommentUtils'

type WorkComment = {
  id: number
  parentCommentId: number | null
  authorName: string
  content: string
  createdAt: string
  updatedAt: string
  editable: boolean
  deletable: boolean
}

export default function WorkComments({ workId, onCountChange }: { workId: number; onCountChange: (count: number) => void }) {
  const { user, loading: authLoading } = useAuth()
  const location = useLocation()
  const [comments, setComments] = useState<WorkComment[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<number | null>(null)
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({})
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')

  useEffect(() => {
    let active = true
    listClubProjectComments(workId)
      .then((result) => {
        if (!active) return
        if (!Array.isArray(result)) throw new Error('댓글 목록을 확인하지 못했습니다.')
        setComments(result)
        onCountChange(result.length)
        setLoadState('ready')
      })
      .catch(() => { if (active) setLoadState('error') })
    return () => { active = false }
  }, [workId, attempt, onCountChange])

  const fail = (cause: unknown) => setError(cause instanceof Error ? cause.message : '요청을 처리하지 못했습니다. 다시 시도해 주세요.')

  const create = async (parentCommentId?: number) => {
    if (pending || !user) return
    const content = (parentCommentId == null ? draft : replyDrafts[parentCommentId] || '').trim()
    if (!content || content.length > 1000) { setError('댓글은 1~1000자로 입력해 주세요.'); return }
    setPending(parentCommentId == null ? 'create' : `reply:${parentCommentId}`)
    setError('')
    try {
      const comment = await createClubProjectComment(workId, parentCommentId == null ? { content } : { content, parentCommentId })
      const next = [...comments, comment]
      setComments(next)
      onCountChange(next.length)
      if (parentCommentId == null) setDraft('')
      else {
        setReplyDrafts((current) => { const copy = { ...current }; delete copy[parentCommentId]; return copy })
        setReplyTo(null)
      }
    } catch (cause) { fail(cause) }
    finally { setPending(null) }
  }

  const saveEdit = async (commentId: number) => {
    if (pending || !user) return
    const content = editDraft.trim()
    if (!content || content.length > 1000) { setError('댓글은 1~1000자로 입력해 주세요.'); return }
    setPending(`edit:${commentId}`)
    setError('')
    try {
      const updated = await updateClubProjectComment(workId, commentId, { content })
      setComments((current) => current.map((comment) => comment.id === commentId ? { ...comment, ...updated } : comment))
      setEditingId(null)
      setEditDraft('')
    } catch (cause) { fail(cause) }
    finally { setPending(null) }
  }

  const remove = async (commentId: number) => {
    if (pending || !user || !await confirmDialog({
      title: '댓글을 삭제할까요?', message: '이 댓글과 모든 답글이 함께 삭제됩니다.', confirmText: '삭제', tone: 'danger',
    })) return
    setPending(`delete:${commentId}`)
    setError('')
    try {
      await deleteClubProjectComment(workId, commentId)
      const next = removeWorkCommentThread(comments, commentId)
      setComments(next)
      onCountChange(next.length)
      if (editingId === commentId) { setEditingId(null); setEditDraft('') }
      if (replyTo === commentId) setReplyTo(null)
    } catch (cause) { fail(cause) }
    finally { setPending(null) }
  }

  return (
    <section aria-labelledby="work-comments-title" className="mt-10">
      <h2 id="work-comments-title" className="text-xl font-bold text-[var(--app-text)]">댓글 {loadState === 'ready' ? comments.length : ''}</h2>
      {loadState === 'loading' && <p role="status" className="mt-4 text-sm text-[var(--app-muted)]">댓글을 불러오는 중...</p>}
      {loadState === 'error' && <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[var(--app-muted)]">댓글을 불러오지 못했습니다.<button type="button" className="apple-action-secondary min-h-11 px-4" onClick={() => { setLoadState('loading'); setAttempt((value) => value + 1) }}>다시 불러오기</button></div>}
      {loadState === 'ready' && comments.length === 0 && <p className="mt-4 text-sm text-[var(--app-muted)]">첫 댓글을 남겨 보세요.</p>}
      {error && <p role="alert" className="mt-3 text-sm text-[var(--app-danger)]">{error}</p>}

      {loadState === 'ready' && (
        <ol className="mt-5 space-y-3">
          {orderWorkComments(comments).map(({ comment, depth }) => (
            <li key={comment.id} className="min-w-0" style={{ paddingInlineStart: `${Math.min(depth, 2) * 14}px` }}>
              <article className="rounded-xl border border-[var(--app-hairline)] bg-[var(--app-surface)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--app-muted)]">
                  <span className="font-semibold text-[var(--app-text)]">{comment.authorName}</span>
                  <time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString('ko-KR')}</time>
                </div>
                {editingId === comment.id ? (
                  <form aria-label="댓글 수정" onSubmit={(event) => { event.preventDefault(); saveEdit(comment.id) }} className="mt-3 grid gap-2">
                    <label className="sr-only" htmlFor={`work-edit-${comment.id}`}>댓글 수정 내용</label>
                    <textarea id={`work-edit-${comment.id}`} maxLength={1000} rows={3} value={editDraft} onChange={(event) => setEditDraft(event.target.value)} disabled={Boolean(pending)} className="min-w-0 rounded-lg border border-[var(--app-hairline)] bg-[var(--app-bg)] p-3 text-sm" />
                    <div className="flex gap-2"><button type="submit" disabled={Boolean(pending) || !editDraft.trim()} className="apple-action-primary min-h-11 px-4 text-sm">저장</button><button type="button" disabled={Boolean(pending)} onClick={() => setEditingId(null)} className="apple-action-secondary min-h-11 px-4 text-sm">취소</button></div>
                  </form>
                ) : <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--app-text)]">{comment.content}</p>}
                <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                  {user && <button type="button" disabled={Boolean(pending)} onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)} className="min-h-11 px-2 text-[var(--app-accent-text)]">답글</button>}
                  {user && comment.editable && editingId !== comment.id && <button type="button" disabled={Boolean(pending)} onClick={() => { setEditingId(comment.id); setEditDraft(comment.content) }} className="min-h-11 px-2 text-[var(--app-muted)]">수정</button>}
                  {user && comment.deletable && <button type="button" disabled={Boolean(pending)} onClick={() => remove(comment.id)} className="min-h-11 px-2 text-[var(--app-danger)]">삭제</button>}
                </div>
                {user && replyTo === comment.id && (
                  <form aria-label={`${comment.authorName}에게 답글`} onSubmit={(event) => { event.preventDefault(); create(comment.id) }} className="mt-2 grid gap-2">
                    <label className="sr-only" htmlFor={`work-reply-${comment.id}`}>답글 내용</label>
                    <textarea id={`work-reply-${comment.id}`} maxLength={1000} rows={3} value={replyDrafts[comment.id] || ''} onChange={(event) => setReplyDrafts((current) => ({ ...current, [comment.id]: event.target.value }))} disabled={Boolean(pending)} className="min-w-0 rounded-lg border border-[var(--app-hairline)] bg-[var(--app-bg)] p-3 text-sm" />
                    <div className="flex gap-2"><button type="submit" disabled={Boolean(pending) || !replyDrafts[comment.id]?.trim()} className="apple-action-primary min-h-11 px-4 text-sm">답글 등록</button><button type="button" disabled={Boolean(pending)} onClick={() => setReplyTo(null)} className="apple-action-secondary min-h-11 px-4 text-sm">취소</button></div>
                  </form>
                )}
              </article>
            </li>
          ))}
        </ol>
      )}

      {loadState === 'ready' && (user ? (
        <form aria-label="새 댓글" onSubmit={(event) => { event.preventDefault(); create() }} className="mt-6 grid gap-2">
          <label htmlFor="work-comment-draft" className="text-sm font-semibold text-[var(--app-text)]">댓글 작성</label>
          <textarea id="work-comment-draft" maxLength={1000} rows={4} value={draft} onChange={(event) => setDraft(event.target.value)} disabled={Boolean(pending)} className="min-w-0 rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] p-3 text-sm" />
          <button type="submit" disabled={Boolean(pending) || !draft.trim()} className="apple-action-primary min-h-11 w-fit px-5 text-sm">{pending === 'create' ? '등록 중…' : '댓글 등록'}</button>
        </form>
      ) : !authLoading && (
        <p className="mt-5 text-sm text-[var(--app-muted)]">댓글과 답글을 쓰려면 <Link to="/login" state={{ from: location }} className="font-semibold text-[var(--app-accent-text)] underline">로그인</Link>해 주세요.</p>
      ))}
    </section>
  )
}
