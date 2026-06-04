import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ImagePlus, Pencil, ThumbsDown, ThumbsUp, Trash2, X } from 'lucide-react'
import {
  createCommunityPost,
  deleteCommunityPost,
  getCommunityPost,
  listCommunityPosts,
  updateCommunityPost,
  voteCommunityPost,
} from '../services/communityApi.js'
import { apiUrl } from '../services/apiClient.js'

const PAGE_SIZE = 30

function shortDate(iso) {
  const date = new Date(iso)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })
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

  const submit = async (event) => {
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
    <form onSubmit={submit} className="space-y-3 border border-black/10 bg-white/50 p-4">
      <input
        value={form.title}
        onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
        maxLength={200}
        placeholder="제목"
        className="w-full border border-black/15 bg-white px-3 py-2 text-sm text-[var(--theme-body-dark)] outline-none focus:border-[var(--theme-accent)]"
      />
      <textarea
        value={form.content}
        onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
        rows={14}
        maxLength={5000}
        placeholder="내용을 입력하세요."
        className="w-full resize-y border border-black/15 bg-white px-3 py-2 text-sm leading-7 text-[var(--theme-body-dark)] outline-none focus:border-[var(--theme-accent)]"
      />
      <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--theme-body-muted)]">
        <label className="inline-flex cursor-pointer items-center gap-2 border border-black/15 bg-white px-3 py-2 font-semibold text-[var(--theme-body-mid)] hover:bg-black/5">
          <ImagePlus size={15} />
          사진 선택
          <input
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
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
          className="bg-[var(--theme-text)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] disabled:opacity-50"
        >
          {saving ? '저장 중...' : initialPost ? '수정 완료' : '글 등록'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 border border-black/15 bg-white px-3 py-2 text-sm font-semibold text-[var(--theme-body-mid)]"
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
  const [currentPost, setCurrentPost] = useState(null)
  const [mode, setMode] = useState('list')
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
    setCurrentPost(post)
  }

  const openPost = async (post) => {
    setDetailLoading(true)
    setError('')
    try {
      const detail = await getCommunityPost(post.id)
      mergePost(detail)
      setMode('detail')
    } catch (err) {
      setError(err.message || '글을 불러오지 못했습니다.')
    } finally {
      setDetailLoading(false)
    }
  }

  const backToList = () => {
    setMode('list')
    setCurrentPost(null)
  }

  const handleSave = (saved) => {
    mergePost(saved)
    setMode('detail')
  }

  const handleDelete = async (post) => {
    if (!window.confirm('게시글을 삭제하시겠습니까?')) return
    try {
      await deleteCommunityPost(post.id)
      setPosts((prev) => prev.filter((item) => item.id !== post.id))
      backToList()
    } catch (err) {
      alert(err.message || '삭제 중 오류가 발생했습니다.')
    }
  }

  const handleVote = async (value) => {
    if (!currentPost) return
    try {
      const updated = await voteCommunityPost(currentPost.id, value)
      mergePost(updated)
    } catch (err) {
      alert(err.message || '추천 처리 중 오류가 발생했습니다.')
    }
  }

  const BoardHeader = ({ title = "COM's 게시판", children }) => (
    <div className="border-b border-black/20 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--theme-body-muted)]">Community</p>
          <h1 className="mt-1 text-2xl font-black text-[var(--theme-body-dark)]">{title}</h1>
        </div>
        {children}
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex justify-center sm:justify-start">
        <button type="button" onClick={onBack} className="shape-cut-sm border border-[var(--theme-border-soft)] bg-[var(--theme-surface-96)] px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white">
          메인으로 돌아가기
        </button>
      </div>

      <section className="overflow-hidden border border-black/20 bg-[#f7f7f7] text-[var(--theme-body-dark)] shadow-[0_22px_70px_var(--theme-shadow-glass)]">
        {mode === 'list' && (
          <>
            <BoardHeader>
              <button type="button" onClick={() => setMode('write')} className="bg-[#3b4890] px-4 py-2 text-sm font-bold text-white">
                글쓰기
              </button>
            </BoardHeader>
            <div className="flex flex-wrap gap-1 border-b border-black/15 bg-[#f1f3f8] px-3 py-2 text-xs font-bold">
              <span className="bg-white px-3 py-1 text-[#3b4890]">전체글</span>
              <span className="px-3 py-1 text-[var(--theme-body-muted)]">일반</span>
              <span className="px-3 py-1 text-[var(--theme-body-muted)]">질문</span>
              <span className="px-3 py-1 text-[var(--theme-body-muted)]">정보</span>
            </div>
            {error && <p className="px-4 py-3 text-sm font-semibold text-red-500">{error}</p>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead className="border-b border-[#29367c] bg-white text-xs text-[#333]">
                  <tr>
                    <th className="w-20 px-2 py-2 font-bold">번호</th>
                    <th className="w-24 px-2 py-2 font-bold">말머리</th>
                    <th className="px-2 py-2 text-left font-bold">제목</th>
                    <th className="w-32 px-2 py-2 font-bold">글쓴이</th>
                    <th className="w-24 px-2 py-2 font-bold">작성일</th>
                    <th className="w-16 px-2 py-2 font-bold">조회</th>
                    <th className="w-16 px-2 py-2 font-bold">추천</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10 bg-white">
                  {loading && (
                    <tr><td colSpan="7" className="px-4 py-12 text-center text-[var(--theme-body-muted)]">불러오는 중...</td></tr>
                  )}
                  {!loading && posts.length === 0 && (
                    <tr><td colSpan="7" className="px-4 py-12 text-center text-[var(--theme-body-muted)]">아직 등록된 글이 없습니다.</td></tr>
                  )}
                  {visiblePosts.map((post) => (
                    <tr key={post.id} className="hover:bg-[#f8f8f8]">
                      <td className="px-2 py-2 text-center text-xs text-[var(--theme-body-muted)]">{post.id}</td>
                      <td className="px-2 py-2 text-center text-xs text-[#3b4890]">일반</td>
                      <td className="px-2 py-2">
                        <button type="button" onClick={() => openPost(post)} className="max-w-[420px] truncate text-left font-semibold hover:underline">
                          {post.title}
                        </button>
                        {post.imageUrl && <span className="ml-1 text-xs text-[#3b4890]">[사진]</span>}
                        {post.authorAdmin && <span className="ml-1 rounded bg-red-600 px-1 py-0.5 text-[10px] font-black text-white">주딱</span>}
                      </td>
                      <td className="px-2 py-2 text-center text-xs font-semibold">{post.authorDisplayName || post.authorName}</td>
                      <td className="px-2 py-2 text-center text-xs text-[var(--theme-body-muted)]">{shortDate(post.createdAt)}</td>
                      <td className="px-2 py-2 text-center text-xs">{post.viewCount}</td>
                      <td className="px-2 py-2 text-center text-xs">{post.upvotes - post.downvotes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hasMore && (
              <button type="button" onClick={() => setPage((p) => p + 1)} className="w-full border-t border-black/10 bg-white py-3 text-sm font-bold text-[#3b4890]">
                더 보기 ({posts.length - visiblePosts.length}개)
              </button>
            )}
          </>
        )}

        {mode === 'write' && (
          <>
            <BoardHeader title="글쓰기">
              <button type="button" onClick={backToList} className="inline-flex items-center gap-1 border border-black/20 bg-white px-3 py-2 text-sm font-bold">
                <ArrowLeft size={14} />
                목록
              </button>
            </BoardHeader>
            <div className="p-4">
              <PostForm onCancel={backToList} onSave={handleSave} />
            </div>
          </>
        )}

        {mode === 'edit' && currentPost && (
          <>
            <BoardHeader title="글 수정">
              <button type="button" onClick={() => setMode('detail')} className="inline-flex items-center gap-1 border border-black/20 bg-white px-3 py-2 text-sm font-bold">
                <ArrowLeft size={14} />
                본문
              </button>
            </BoardHeader>
            <div className="p-4">
              <PostForm initialPost={currentPost} onCancel={() => setMode('detail')} onSave={handleSave} />
            </div>
          </>
        )}

        {mode === 'detail' && (
          <>
            <BoardHeader title={detailLoading ? '글 여는 중...' : currentPost?.title || '게시글'}>
              <button type="button" onClick={backToList} className="inline-flex items-center gap-1 border border-black/20 bg-white px-3 py-2 text-sm font-bold">
                <ArrowLeft size={14} />
                목록
              </button>
            </BoardHeader>
            {detailLoading || !currentPost ? (
              <p className="px-4 py-16 text-center text-sm text-[var(--theme-body-muted)]">글을 여는 중...</p>
            ) : (
              <article className="bg-white">
                <div className="border-b border-black/10 px-4 py-3">
                  <h2 className="break-words text-xl font-black">{currentPost.title}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--theme-body-muted)]">
                    <span className="font-bold text-[var(--theme-body-mid)]">{currentPost.authorDisplayName || currentPost.authorName}</span>
                    {currentPost.authorAdmin && <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white">주딱</span>}
                    <span>{new Date(currentPost.createdAt).toLocaleString('ko-KR')}</span>
                    <span>조회 {currentPost.viewCount}</span>
                    <span>추천 {currentPost.upvotes - currentPost.downvotes}</span>
                  </div>
                </div>
                {currentPost.imageUrl && (
                  <div className="border-b border-black/10 bg-[#f7f7f7] px-4 py-5">
                    <img src={apiUrl(currentPost.imageUrl)} alt={currentPost.imageOriginalName || currentPost.title} className="mx-auto max-h-[560px] max-w-full object-contain" />
                  </div>
                )}
                <div className="min-h-[280px] whitespace-pre-wrap px-4 py-6 text-[15px] leading-8">{currentPost.content}</div>
                <div className="flex flex-wrap items-center justify-center gap-3 border-y border-black/10 bg-[#fafafa] px-4 py-5">
                  <button type="button" onClick={() => handleVote(1)} className={`inline-flex items-center gap-2 border px-5 py-3 text-sm font-black ${currentPost.myVote === 1 ? 'border-[#3b4890] bg-[#3b4890] text-white' : 'border-black/15 bg-white text-[#3b4890]'}`}>
                    <ThumbsUp size={16} />
                    추천 {currentPost.upvotes}
                  </button>
                  <button type="button" onClick={() => handleVote(-1)} className={`inline-flex items-center gap-2 border px-5 py-3 text-sm font-black ${currentPost.myVote === -1 ? 'border-red-600 bg-red-600 text-white' : 'border-black/15 bg-white text-red-600'}`}>
                    <ThumbsDown size={16} />
                    비추천 {currentPost.downvotes}
                  </button>
                </div>
                <div className="flex flex-wrap justify-between gap-2 px-4 py-4">
                  <button type="button" onClick={backToList} className="border border-black/15 bg-white px-4 py-2 text-sm font-bold">
                    목록
                  </button>
                  {currentPost.editable && (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setMode('edit')} className="inline-flex items-center gap-1 border border-black/15 bg-white px-4 py-2 text-sm font-bold">
                        <Pencil size={14} />
                        수정
                      </button>
                      <button type="button" onClick={() => handleDelete(currentPost)} className="inline-flex items-center gap-1 border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-600">
                        <Trash2 size={14} />
                        삭제
                      </button>
                    </div>
                  )}
                </div>
              </article>
            )}
          </>
        )}
      </section>
    </div>
  )
}
