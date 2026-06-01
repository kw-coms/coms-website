import { useEffect, useState } from 'react'
import { MessageSquarePlus, Trash2 } from 'lucide-react'
import { createCommunityPost, deleteCommunityPost, listCommunityPosts } from '../services/communityApi.js'

export default function Community({ onBack }) {
  const [posts, setPosts] = useState([])
  const [form, setForm] = useState({ title: '', content: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    listCommunityPosts()
      .then((data) => {
        if (mounted) setPosts(data)
      })
      .catch((err) => {
        if (mounted) setError(err.message || '커뮤니티 글을 불러오지 못했습니다.')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.title.trim() || !form.content.trim()) return
    setSaving(true)
    setError('')
    try {
      const created = await createCommunityPost({
        title: form.title.trim(),
        content: form.content.trim(),
      })
      setPosts((prev) => [created, ...prev])
      setForm({ title: '', content: '' })
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

  const formatDate = (iso) => new Date(iso).toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

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
          <div className="shape-cut-sm bg-black/5 px-4 py-2 text-xs font-semibold text-[var(--theme-body-muted)]">
            MEMBER ONLY
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
            className="w-full shape-cut-sm bg-white/72 px-4 py-2.5 text-[var(--theme-body-dark)] outline-none placeholder:text-[var(--theme-body-muted)]/70 focus:ring-2 focus:ring-[var(--theme-accent)]/55"
          />
          <textarea
            value={form.content}
            onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
            placeholder="스터디 모집, 질문, 공유할 내용을 적어주세요."
            rows={5}
            className="w-full shape-cut-sm resize-none bg-white/72 px-4 py-2.5 text-[var(--theme-body-dark)] outline-none placeholder:text-[var(--theme-body-muted)]/70 focus:ring-2 focus:ring-[var(--theme-accent)]/55"
          />
          <button
            type="submit"
            disabled={saving || !form.title.trim() || !form.content.trim()}
            className="shape-cut-sm bg-[var(--theme-text)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? '등록 중...' : '게시'}
          </button>
        </form>

        {error && <p className="mb-4 text-sm font-semibold text-red-500">{error}</p>}
        {loading && <p className="text-sm text-[var(--theme-body-muted)]">불러오는 중...</p>}
        {!loading && posts.length === 0 && (
          <p className="rounded-lg border border-black/10 bg-black/5 px-4 py-6 text-sm text-[var(--theme-body-muted)]">
            아직 등록된 글이 없습니다.
          </p>
        )}

        <div className="space-y-3">
          {posts.map((post) => (
            <article key={post.id} className="rounded-lg border border-black/10 bg-black/5 px-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-[var(--theme-body-dark)]">{post.title}</h2>
                  <p className="mt-1 text-xs text-[var(--theme-body-muted)]">
                    {post.authorName} · {formatDate(post.createdAt)}
                  </p>
                </div>
                {post.editable && (
                  <button
                    type="button"
                    onClick={() => handleDelete(post)}
                    className="shape-cut-sm inline-flex items-center gap-1 border border-black/10 bg-white/60 px-2.5 py-1.5 text-xs font-semibold text-red-500 transition hover:bg-white/80"
                  >
                    <Trash2 size={13} />
                    삭제
                  </button>
                )}
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[var(--theme-body-mid)]">
                {post.content}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
