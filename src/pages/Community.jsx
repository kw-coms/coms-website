import { useEffect, useMemo, useState } from 'react'
import { ImagePlus, Pencil, ThumbsDown, ThumbsUp, Trash2, X } from 'lucide-react'
import {
  createCommunityPost,
  deleteCommunityPost,
  getCommunityPost,
  listCommunityPosts,
  updateCommunityPost,
  voteCommunityPost,
} from '../services/communityApi.js'
import { apiUrl } from '../services/apiClient.js'

const PAGE_SIZE = 12

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

function PostForm({ initialPost, onCancel, onSave }) {
  const [form, setForm] = useState({
    title: initialPost?.title || '',
    content: initialPost?.content || '',
    removeImage: false,
  })
  const [image, setImage] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.title.trim() || !form.content.trim()) return
    setSaving(true)
    setError('')
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        removeImage: form.removeImage,
      }
      const saved = initialPost
        ? await updateCommunityPost(initialPost.id, payload, image)
        : await createCommunityPost(payload, image)
      onSave(saved)
    } catch (err) {
      setError(err.message || '저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 border-b border-black/10 bg-black/5 p-3 sm:p-4">
      <input
        value={form.title}
        onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
        placeholder="제목"
        maxLength={200}
        className="w-full shape-cut-sm bg-white/72 px-4 py-2.5 text-[var(--theme-body-dark)] outline-none placeholder:text-[var(--theme-body-muted)]/70 focus:ring-2 focus:ring-[var(--theme-accent)]/55"
      />
      <textarea
        value={form.content}
        onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
        placeholder="내용을 입력하세요."
        rows={8}
        maxLength={5000}
        className="w-full shape-cut-sm resize-y bg-white/72 px-4 py-2.5 text-[var(--theme-body-dark)] outline-none placeholder:text-[var(--theme-body-muted)]/70 focus:ring-2 focus:ring-[var(--theme-accent)]/55"
      />
      <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--theme-body-muted)]">
        <label className="shape-cut-sm inline-flex cursor-pointer items-center gap-2 border border-black/10 bg-white/60 px-3 py-2 font-semibold text-[var(--theme-body-mid)] transition hover:bg-white/80">
          <ImagePlus size={15} />
          사진 선택
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => setImage(event.target.files?.[0] || null)}
          />
        </label>
        <span className="min-w-0 truncate">{image ? image.name : initialPost?.imageOriginalName || '선택된 사진 없음'}</span>
        {initialPost?.imageUrl && !image && (
          <label className="inline-flex items-center gap-2 text-xs font-semibold">
            <input
              type="checkbox"
              checked={form.removeImage}
              onChange={(event) => setForm((prev) => ({ ...prev, removeImage: event.target.checked }))}
            />
            기존 사진 삭제
          </label>
        )}
      </div>
      {error && <p className="text-sm font-semibold text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || !form.title.trim() || !form.content.trim()}
          className="shape-cut-sm bg-[var(--theme-text)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? '저장 중...' : initialPost ? '수정 완료' : '글 등록'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="shape-cut-sm inline-flex items-center gap-1 border border-black/10 bg-white/60 px-3 py-2 text-sm font-semibold text-[var(--theme-body-mid)] transition hover:bg-white/80"
        >
          <X size={14} />
          취소
        </button>
      </div>
    </form>
  )
}

export default function Community({ onBack }) {
  const [posts, setPosts] = useState([])
  const [selectedPost, setSelectedPost] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
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

  const visiblePosts = useMemo(() => posts.slice(0, page * PAGE_SIZE), [posts, page])
  const hasMore = visiblePosts.length < posts.length

  const mergePost = (post) => {
    setPosts((prev) => {
      const exists = prev.some((item) => item.id === post.id)
      if (!exists) return [post, ...prev]
      return prev.map((item) => (item.id === post.id ? { ...item, ...post } : item))
    })
    setSelectedPost(post)
  }

  const openPost = async (post) => {
    setDetailLoading(true)
    setError('')
    setShowForm(false)
    setEditing(false)
    try {
      const detail = await getCommunityPost(post.id)
      mergePost(detail)
    } catch (err) {
      setError(err.message || '글을 불러오지 못했습니다.')
    } finally {
      setDetailLoading(false)
    }
  }

  const handleSave = (saved) => {
    mergePost(saved)
    setShowForm(false)
    setEditing(false)
  }

  const handleDelete = async (post) => {
    if (!window.confirm('게시글을 삭제하시겠습니까?')) return
    try {
      await deleteCommunityPost(post.id)
      setPosts((prev) => prev.filter((item) => item.id !== post.id))
      setSelectedPost(null)
      setEditing(false)
    } catch (err) {
      alert(err.message || '삭제 중 오류가 발생했습니다.')
    }
  }

  const handleVote = async (value) => {
    if (!selectedPost) return
    try {
      const updated = await voteCommunityPost(selectedPost.id, value)
      mergePost(updated)
    } catch (err) {
      alert(err.message || '추천 처리 중 오류가 발생했습니다.')
    }
  }

  const authorLabel = selectedPost?.authorDisplayName || selectedPost?.authorName || ''

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

      <section className="shape-cut bg-[var(--theme-surface-96)] p-4 text-[var(--theme-body-dark)] shadow-[0_22px_70px_var(--theme-shadow-glass)] backdrop-blur-md supports-[backdrop-filter]:bg-[var(--theme-surface-94)] sm:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4 border-b border-black/10 pb-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-[var(--theme-body-muted)]/80">Community</p>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">COM&apos;s 게시판</h1>
            <p className="mt-2 text-sm text-[var(--theme-body-muted)]/85">
              글을 눌러 상세로 들어가고, 사진과 추천/비추천을 함께 남길 수 있습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowForm(true)
              setEditing(false)
              setSelectedPost(null)
            }}
            className="shape-cut-sm bg-[var(--theme-text)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] transition hover:opacity-90"
          >
            글쓰기
          </button>
        </div>

        {showForm && <PostForm onCancel={() => setShowForm(false)} onSave={handleSave} />}

        {error && <p className="mb-4 text-sm font-semibold text-red-500">{error}</p>}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="overflow-hidden border border-black/10 bg-black/5">
            <div className="grid grid-cols-[64px_minmax(0,1fr)_72px] border-b border-black/10 bg-black/8 px-3 py-2 text-xs font-bold text-[var(--theme-body-muted)] sm:grid-cols-[64px_minmax(0,1fr)_120px_64px_72px]">
              <span>번호</span>
              <span>제목</span>
              <span className="hidden sm:block">작성자</span>
              <span className="hidden text-right sm:block">추천</span>
              <span className="text-right">조회</span>
            </div>
            {loading && <p className="px-4 py-8 text-sm text-[var(--theme-body-muted)]">불러오는 중...</p>}
            {!loading && posts.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-[var(--theme-body-muted)]">아직 등록된 글이 없습니다.</p>
            )}
            {visiblePosts.map((post) => {
              const active = selectedPost?.id === post.id
              return (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => openPost(post)}
                  className={`grid w-full grid-cols-[64px_minmax(0,1fr)_72px] items-center border-b border-black/10 px-3 py-2 text-left text-sm transition last:border-b-0 sm:grid-cols-[64px_minmax(0,1fr)_120px_64px_72px] ${
                    active ? 'bg-white/80' : 'bg-white/40 hover:bg-white/70'
                  }`}
                >
                  <span className="text-xs text-[var(--theme-body-muted)]">{post.id}</span>
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-semibold text-[var(--theme-body-dark)]">{post.title}</span>
                      {post.imageUrl && <ImagePlus size={13} className="shrink-0 text-[var(--theme-body-muted)]" />}
                      {post.authorAdmin && <span className="shrink-0 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white">주딱</span>}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-[var(--theme-body-muted)] sm:hidden">
                      {post.authorDisplayName || post.authorName} · {relativeTime(post.createdAt)}
                    </span>
                  </span>
                  <span className="hidden truncate text-xs font-semibold text-[var(--theme-body-mid)] sm:block">
                    {post.authorDisplayName || post.authorName}
                  </span>
                  <span className="hidden text-right text-xs font-semibold text-[var(--theme-body-muted)] sm:block">
                    {post.upvotes - post.downvotes}
                  </span>
                  <span className="text-right text-xs text-[var(--theme-body-muted)]">{post.viewCount}</span>
                </button>
              )
            })}
            {hasMore && (
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                className="w-full bg-black/5 py-3 text-sm font-semibold text-[var(--theme-body-muted)] transition hover:bg-black/10"
              >
                더 보기 ({posts.length - visiblePosts.length}개)
              </button>
            )}
          </div>

          <div className="min-h-[420px] border border-black/10 bg-white/48">
            {detailLoading && <p className="px-4 py-8 text-sm text-[var(--theme-body-muted)]">글을 여는 중...</p>}
            {!detailLoading && !selectedPost && (
              <div className="flex min-h-[420px] items-center justify-center px-4 text-center text-sm text-[var(--theme-body-muted)]">
                왼쪽 목록에서 글을 선택하세요.
              </div>
            )}
            {!detailLoading && selectedPost && !editing && (
              <article>
                <div className="border-b border-black/10 px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="break-words text-xl font-bold text-[var(--theme-body-dark)]">{selectedPost.title}</h2>
                      <p className="mt-2 text-xs text-[var(--theme-body-muted)]">
                        <span className="font-semibold text-[var(--theme-body-mid)]">{authorLabel}</span>
                        {selectedPost.authorAdmin && <span className="ml-2 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white">주딱</span>}
                        <span className="mx-1">·</span>
                        <span title={new Date(selectedPost.createdAt).toLocaleString('ko-KR')}>{relativeTime(selectedPost.createdAt)}</span>
                        <span className="mx-1">·</span>
                        <span>조회 {selectedPost.viewCount}</span>
                      </p>
                    </div>
                    {selectedPost.editable && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(true)}
                          className="shape-cut-sm inline-flex h-8 w-8 items-center justify-center border border-black/10 bg-white/60 text-[var(--theme-body-mid)] transition hover:bg-white/80"
                          title="수정"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(selectedPost)}
                          className="shape-cut-sm inline-flex h-8 w-8 items-center justify-center border border-black/10 bg-white/60 text-red-500 transition hover:bg-white/80"
                          title="삭제"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {selectedPost.imageUrl && (
                  <div className="border-b border-black/10 bg-black/5 px-4 py-4">
                    <img
                      src={apiUrl(selectedPost.imageUrl)}
                      alt={selectedPost.imageOriginalName || selectedPost.title}
                      className="max-h-[420px] w-full object-contain"
                    />
                  </div>
                )}

                <div className="min-h-[220px] whitespace-pre-wrap px-4 py-5 text-sm leading-7 text-[var(--theme-body-mid)]">
                  {selectedPost.content}
                </div>

                <div className="flex items-center justify-center gap-3 border-t border-black/10 px-4 py-4">
                  <button
                    type="button"
                    onClick={() => handleVote(1)}
                    className={`shape-cut-sm inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold transition ${
                      selectedPost.myVote === 1
                        ? 'bg-blue-600 text-white'
                        : 'border border-black/10 bg-white/60 text-[var(--theme-body-mid)] hover:bg-white/80'
                    }`}
                  >
                    <ThumbsUp size={15} />
                    추천 {selectedPost.upvotes}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleVote(-1)}
                    className={`shape-cut-sm inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold transition ${
                      selectedPost.myVote === -1
                        ? 'bg-red-600 text-white'
                        : 'border border-black/10 bg-white/60 text-[var(--theme-body-mid)] hover:bg-white/80'
                    }`}
                  >
                    <ThumbsDown size={15} />
                    비추천 {selectedPost.downvotes}
                  </button>
                </div>
              </article>
            )}
            {!detailLoading && selectedPost && editing && (
              <PostForm
                initialPost={selectedPost}
                onCancel={() => setEditing(false)}
                onSave={handleSave}
              />
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
