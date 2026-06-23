import { useEffect, useState } from 'react'
import { Eye, RefreshCw, RotateCcw } from 'lucide-react'
import { listDeletedCommunityPosts, restoreDeletedCommunityPost } from '../../services/adminApi'
import DeletedPostDetailModal from './DeletedPostDetailModal'
import DeletedPostEvidence from './DeletedPostEvidence'
import {
  deletedPostIdentity,
  deletedPostMatchesEvidence,
  deletedPostMatchesSearch,
  deletedPostMatchesStatus,
  formatDateTime,
} from './deletedCommunityPostUtils'

export default function AdminDeletedCommunityPosts() {
  const [posts, setPosts] = useState([])
  const [limit, setLimit] = useState(300)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [restoringId, setRestoringId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [evidenceFilter, setEvidenceFilter] = useState('ALL')
  const [detailPost, setDetailPost] = useState(null)
  const normalizedSearch = searchQuery.trim().toLowerCase()
  const visiblePosts = posts
    .filter((post) => deletedPostMatchesSearch(post, normalizedSearch))
    .filter((post) => deletedPostMatchesStatus(post, statusFilter))
    .filter((post) => deletedPostMatchesEvidence(post, evidenceFilter))

  const load = async (requestedLimit = limit) => {
    setError('')
    try {
      const data = await listDeletedCommunityPosts(requestedLimit)
      setPosts(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || '삭제 보관함을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let mounted = true
    listDeletedCommunityPosts(limit)
      .then((data) => {
        if (mounted) {
          setError('')
          setPosts(Array.isArray(data) ? data : [])
        }
      })
      .catch((err) => { if (mounted) setError(err.message || '삭제 보관함을 불러오지 못했습니다.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [limit])

  const restorePost = async (post) => {
    if (!window.confirm(`"${post.title || '삭제된 게시글'}"을 커뮤니티에 되돌리겠습니까?`)) return
    setRestoringId(post.id)
    setError('')
    try {
      const response = await restoreDeletedCommunityPost(post.id)
      const restoredPostId = response?.restoredPostId
      const restoredAt = new Date().toISOString()
      setPosts((current) => current.map((item) => (
        item.id === post.id
          ? { ...item, restoredPostId, restoredAt }
          : item
      )))
      setDetailPost((current) => (
        current && current.id === post.id
          ? { ...current, restoredPostId, restoredAt }
          : current
      ))
      setStatusFilter('ALL')
    } catch (err) {
      setError(err.message || '삭제 게시글 복원에 실패했습니다.')
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[var(--theme-body-dark)]">커뮤니티 삭제 보관함</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--theme-body-muted)]">
            관리자가 삭제한 게시글의 원문, 사진, 영상, 첨부, 댓글, 작성자, 삭제자, 사유를 확인하고 필요한 경우 복원합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-[var(--theme-body-muted)]">
            <span>표시 개수</span>
            <select
              aria-label="삭제 보관함 표시 개수"
              value={limit}
              onChange={(event) => {
                setLoading(true)
                setLimit(Number(event.target.value))
              }}
              className="shape-cut-sm border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-xs font-semibold text-[var(--theme-body-dark)] outline-none transition focus:border-black/30"
            >
              {[100, 300, 1000].map((option) => (
                <option key={option} value={option}>{option.toLocaleString('ko-KR')}건</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => { setLoading(true); load() }}
            className="shape-cut-sm inline-flex items-center gap-1.5 border border-[var(--app-hairline)] bg-white/60 px-3 py-2 text-xs font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/80 disabled:opacity-50"
            disabled={loading}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            새로고침
          </button>
        </div>
      </div>

      <div className="grid gap-2 rounded-lg border border-[var(--app-hairline)] bg-white/55 p-3 md:grid-cols-[minmax(14rem,1fr)_12rem_12rem]">
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="제목·작성자·댓글·첨부 검색"
          aria-label="삭제 보관함 검색"
          className="shape-cut-sm border border-[var(--app-hairline)] bg-white/80 px-3 py-2 text-xs font-semibold text-[var(--theme-body-dark)] outline-none transition placeholder:text-[var(--theme-body-muted)] focus:border-black/30"
        />
        <select
          aria-label="삭제 보관함 상태"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="shape-cut-sm border border-[var(--app-hairline)] bg-white/80 px-3 py-2 text-xs font-semibold text-[var(--theme-body-dark)] outline-none transition focus:border-black/30"
        >
          <option value="ALL">전체 상태</option>
          <option value="OPEN">복원 전</option>
          <option value="RESTORED">복원됨</option>
        </select>
        <select
          aria-label="삭제 보관함 증거 유형"
          value={evidenceFilter}
          onChange={(event) => setEvidenceFilter(event.target.value)}
          className="shape-cut-sm border border-[var(--app-hairline)] bg-white/80 px-3 py-2 text-xs font-semibold text-[var(--theme-body-dark)] outline-none transition focus:border-black/30"
        >
          <option value="ALL">전체 증거</option>
          <option value="MEDIA">사진·영상·첨부 포함</option>
          <option value="COMMENTS">댓글 포함</option>
          <option value="POLL">투표 포함</option>
        </select>
      </div>

      {loading && <p className="text-sm text-[var(--theme-body-muted)]">삭제 보관함을 불러오는 중...</p>}
      {error && <p className="shape-cut-sm bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      {!loading && !error && posts.length === 0 && (
        <p className="text-sm text-[var(--theme-body-muted)]">보관된 삭제 게시글이 없습니다.</p>
      )}
      {!loading && !error && posts.length > 0 && visiblePosts.length === 0 && (
        <p className="text-sm text-[var(--theme-body-muted)]">조건에 맞는 삭제 게시글이 없습니다.</p>
      )}
      {!loading && !error && visiblePosts.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-[var(--app-hairline)]">
          <table className="w-max min-w-full text-left text-sm">
            <thead className="bg-[var(--app-surface)] text-xs font-semibold text-[var(--theme-body-muted)]">
              <tr>
                <th className="px-3 py-3">삭제</th>
                <th className="px-3 py-3">게시글</th>
                <th className="px-3 py-3">작성자</th>
                <th className="px-3 py-3">삭제자</th>
                <th className="px-3 py-3">사유</th>
                <th className="px-3 py-3">원문</th>
                <th className="px-3 py-3">보기</th>
                <th className="px-3 py-3">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 bg-white/50">
              {visiblePosts.map((post) => (
                <tr key={post.id}>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-[var(--theme-body-muted)]">{formatDateTime(post.deletedAt)}</td>
                  <td className="max-w-[260px] px-3 py-3 text-xs">
                    <span className="block break-words font-semibold text-[#3b4890]">{post.title || '-'}</span>
                    <span className="mt-1 block font-mono text-[10px] text-[var(--theme-body-muted)]">#{post.originalPostId}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-[var(--theme-body-muted)]">{deletedPostIdentity(post.authorName, post.authorStudentId)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-[var(--theme-body-muted)]">{deletedPostIdentity(post.deletedByName, post.deletedByStudentId)}</td>
                  <td className="max-w-[220px] whitespace-pre-wrap break-words px-3 py-3 text-xs font-semibold text-[var(--theme-body-dark)]">{post.deletionReason || '-'}</td>
                  <td className="max-w-[520px] px-3 py-3 text-xs text-[var(--theme-body-muted)]">
                    <DeletedPostEvidence post={post} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs">
                    <button
                      type="button"
                      onClick={() => setDetailPost(post)}
                      className="shape-cut-sm inline-flex items-center gap-1.5 border border-[var(--app-hairline)] bg-white/70 px-3 py-1.5 text-xs font-semibold text-[#3b4890] transition hover:bg-[var(--app-surface)]"
                    >
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      원문 보기
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs">
                    {post.restoredPostId ? (
                      <div className="space-y-1">
                        <span className="block font-semibold text-emerald-700">복원됨</span>
                        <a href={`/community/${post.restoredPostId}`} className="font-mono text-[10px] font-semibold text-[#3b4890] underline">
                          #{post.restoredPostId} 열기
                        </a>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => restorePost(post)}
                        disabled={restoringId !== null}
                        className="shape-cut-sm inline-flex items-center gap-1.5 border border-[#3b4890]/20 bg-[#f4f6ff] px-3 py-1.5 text-xs font-semibold text-[#3b4890] transition hover:bg-[#e8ecff] disabled:opacity-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        {restoringId === post.id ? '복원 중...' : '되돌리기'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {detailPost && (
        <DeletedPostDetailModal
          post={detailPost}
          onClose={() => setDetailPost(null)}
          onRestore={restorePost}
          restoring={restoringId === detailPost.id}
          restoreDisabled={restoringId !== null}
        />
      )}
    </div>
  )
}
