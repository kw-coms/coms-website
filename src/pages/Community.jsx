import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, MessageSquarePlus, Pencil, Trash2, X } from 'lucide-react'
import { createCommunityPost, deleteCommunityPost, listCommunityPosts, updateCommunityPost } from '../services/communityApi.js'

const CONTENT_PREVIEW_LINES = 4
const PAGE_SIZE = 10

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금 전'
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}일 전`
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

function PostCard({ post, onDelete, onUpdate }) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ title: post.title, content: post.content })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const lines = post.content.split('\n')
  const needsExpand = lines.length > CONTENT_PREVIEW_LINES || post.content.length > 280
  const displayContent = expanded || !needsExpand
    ? post.content
    : lines.slice(0, CONTENT_PREVIEW_LINES).join('\n').slice(0, 280)

  const handleUpdate = async (e) => {
    e.preventDefault()
    if (!editForm.title.trim() || !editForm.content.trim()) return
    setSaving(true)
    setError('')
    try {
      const updated = await updateCommunityPost(post.id, {
        title: editForm.title.trim(),
        content: editForm.content.trim(),
      })
      onUpdate(updated)
      setEditing(false)
    } catch (err) {
      setError(err.message || '수정 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const cancelEdit = () => {
    setEditForm({ title: post.title, content: post.content })
    setEditing(false)
    setError('')
  }

  return (
    <article className="rounded-lg border border-black/10 bg-black/5 px-4 py-4">
      {editing ? (
        <form onSubmit={handleUpdate} className="space-y-3">
          <input
            value={editForm.title}
            onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
            className="w-full shape-cut-sm bg-white/72 px-4 py-2.5 text-[var(--theme-body-dark)] outline-none placeholder:text-[var(--theme-body-muted)]/70 focus:ring-2 focus:ring-[var(--theme-accent)]/55"
            placeholder="제목"
            maxLength={200}
          />
          <textarea
            value={editForm.content}
            onChange={(e) => setEditForm((p) => ({ ...p, content: e.target.value }))}
            rows={5}
            className="w-full shape-cut-sm resize-none bg-white/72 px-4 py-2.5 text-[var(--theme-body-dark)] outline-none placeholder:text-[var(--theme-body-muted)]/70 focus:ring-2 focus:ring-[var(--theme-accent)]/55"
            placeholder="내용을 입력하세요."
            maxLength={5000}
          />
          {error && <p className="text-xs font-semibold text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || !editForm.title.trim() || !editForm.content.trim()}
              className="shape-cut-sm bg-[var(--theme-text)] px-4 py-2 text-xs font-semibold text-[var(--theme-bg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="shape-cut-sm inline-flex items-center gap-1 border border-black/10 bg-white/60 px-3 py-2 text-xs font-semibold text-[var(--theme-body-mid)] transition hover:bg-white/80"
            >
              <X size={12} />
              취소
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-[var(--theme-body-dark)]">{post.title}</h2>
              <p className="mt-1 text-xs text-[var(--theme-body-muted)]">
                {post.authorName} · <span title={new Date(post.createdAt).toLocaleString('ko-KR')}>{relativeTime(post.createdAt)}</span>
                {post.updatedAt !== post.createdAt && (
                  <span className="ml-1 opacity-60">(수정됨)</span>
                )}
              </p>
            </div>
            {post.editable && (
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="shape-cut-sm inline-flex items-center gap-1 border border-black/10 bg-white/60 px-2.5 py-1.5 text-xs font-semibold text-[var(--theme-body-mid)] transition hover:bg-white/80"
                >
                  <Pencil size={12} />
                  수정
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(post)}
                  className="shape-cut-sm inline-flex items-center gap-1 border border-black/10 bg-white/60 px-2.5 py-1.5 text-xs font-semibold text-red-500 transition hover:bg-white/80"
                >
                  <Trash2 size={12} />
                  삭제
                </button>
              </div>
            )}
          </div>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[var(--theme-body-mid)]">
            {displayContent}
            {needsExpand && !expanded && '…'}
          </p>
          {needsExpand && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--theme-body-muted)] transition hover:text-[var(--theme-body-dark)]"
            >
              {expanded ? <><ChevronUp size={13} /> 접기</> : <><ChevronDown size={13} /> 더 보기</>}
            </button>
          )}
        </>
      )}
    </article>
  )
}

export default function Community({ onBack }) {
  const [posts, setPosts] = useState([])
  const [form, setForm] = useState({ title: '', content: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    let mounted = true
    listCommunityPosts()
      .then((data) => { if (mounted) setPosts(data) })
      .catch((err) => { if (mounted) setError(err.message || '커뮤니티 글을 불러오지 못했습니다.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.title.trim() || !form.content.trim()) return
    setSaving(true)
    setError('')
    try {
      const created = await createCommunityPost({ title: form.title.trim(), content: form.content.trim() })
      setPosts((prev) => [created, ...prev])
      setForm({ title: '', content: '' })
      setPage(1)
    } catch (err) {
      setError(err.message || '글 작성 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (post) => {
    if (!window.confirm('게시글을 삭제하시겠습니까?')) return
    try {
      await deleteCommunityPost(post.id)
      setPosts((prev) => prev.filter((item) => item.id !== post.id))
    } catch (err) {
      alert(err.message || '삭제 중 오류가 발생했습니다.')
    }
  }

  const handleUpdate = (updated) => {
    setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  }

  const visiblePosts = posts.slice(0, page * PAGE_SIZE)
  const hasMore = visiblePosts.length < posts.length

  return (
    <div className="space-y-4">
      <div className="flex justify-center sm:justify-start">
        <button
          type="button"
          onClick={onBack}
          className="shape-cut-sm border border-[var(--theme-border-soft)] bg-[var(--theme-surface-96)] px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] shadow-[0_18px_40px_rgba(255,255,255,0.2)] transition hover:bg-white"
        >
          메인으로 돌아가기
        </button>
      </div>

      <section className="shape-cut bg-[var(--theme-surface-96)] p-5 text-[var(--theme-body-dark)] shadow-[0_22px_70px_var(--theme-shadow-glass)] backdrop-blur-md supports-[backdrop-filter]:bg-[var(--theme-surface-94)] sm:p-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-[var(--theme-body-muted)]/80">Community</p>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">COM&apos;s 커뮤니티</h1>
            <p className="mt-2 text-sm text-[var(--theme-body-muted)]/85">
              명부 인증을 통과한 회원만 글을 남길 수 있는 내부 공간입니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!loading && (
              <span className="shape-cut-sm bg-black/5 px-3 py-2 text-xs font-semibold text-[var(--theme-body-muted)]">
                {posts.length}개의 글
              </span>
            )}
            <div className="shape-cut-sm bg-black/5 px-4 py-2 text-xs font-semibold text-[var(--theme-body-muted)]">
              MEMBER ONLY
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mb-6 space-y-3 rounded-lg border border-black/10 bg-black/5 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--theme-body-dark)]">
            <MessageSquarePlus size={16} />
            새 글 작성
          </div>
          <input
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="제목"
            maxLength={200}
            className="w-full shape-cut-sm bg-white/72 px-4 py-2.5 text-[var(--theme-body-dark)] outline-none placeholder:text-[var(--theme-body-muted)]/70 focus:ring-2 focus:ring-[var(--theme-accent)]/55"
          />
          <div className="relative">
            <textarea
              value={form.content}
              onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
              placeholder="스터디 모집, 질문, 공유할 내용을 적어주세요."
              rows={5}
              maxLength={5000}
              className="w-full shape-cut-sm resize-none bg-white/72 px-4 py-2.5 text-[var(--theme-body-dark)] outline-none placeholder:text-[var(--theme-body-muted)]/70 focus:ring-2 focus:ring-[var(--theme-accent)]/55"
            />
            <span className="absolute bottom-2 right-3 text-[10px] text-[var(--theme-body-muted)]/60">
              {form.content.length}/5000
            </span>
          </div>
          <div className="flex items-center justify-between">
            <button
              type="submit"
              disabled={saving || !form.title.trim() || !form.content.trim()}
              className="shape-cut-sm bg-[var(--theme-text)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? '등록 중...' : '게시'}
            </button>
            {(form.title || form.content) && (
              <button
                type="button"
                onClick={() => setForm({ title: '', content: '' })}
                className="text-xs text-[var(--theme-body-muted)] transition hover:text-[var(--theme-body-dark)]"
              >
                초기화
              </button>
            )}
          </div>
        </form>

        {error && <p className="mb-4 text-sm font-semibold text-red-500">{error}</p>}
        {loading && <p className="text-sm text-[var(--theme-body-muted)]">불러오는 중...</p>}
        {!loading && posts.length === 0 && (
          <p className="rounded-lg border border-black/10 bg-black/5 px-4 py-8 text-center text-sm text-[var(--theme-body-muted)]">
            아직 등록된 글이 없습니다.
          </p>
        )}

        <div className="space-y-3">
          {visiblePosts.map((post) => (
            <PostCard key={post.id} post={post} onDelete={handleDelete} onUpdate={handleUpdate} />
          ))}
        </div>

        {hasMore && (
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            className="mt-4 w-full shape-cut-sm border border-black/10 bg-black/5 py-3 text-sm font-semibold text-[var(--theme-body-muted)] transition hover:bg-black/10"
          >
            더 보기 ({posts.length - visiblePosts.length}개 더)
          </button>
        )}
      </section>
    </div>
  )
}
