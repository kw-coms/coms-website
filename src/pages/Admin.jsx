import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Download, Eye, RefreshCw, RotateCcw, X } from 'lucide-react'
import { apiUrl } from '../services/apiClient.js'
import { listDeletedCommunityPosts, getDeletedCommunityPost, restoreDeletedCommunityPost, listRecruitApplications } from '../services/adminApi.js'
import { useAuth } from '../contexts/useAuth.js'
import { sanitizeHtml } from '../utils/sanitizeHtml.js'
import AdminActivities from './admin/AdminActivities.jsx'
import AdminAuditLogs from './admin/AdminAuditLogs.jsx'
import AdminAppCatalog from './admin/AdminAppCatalog.jsx'
import AdminBan from './admin/AdminBan.jsx'
import AdminCommunityReports from './admin/AdminCommunityReports.jsx'
import AdminFiles from './admin/AdminFiles.jsx'
import AdminFonts from './admin/AdminFonts.jsx'
import AdminMembers from './admin/AdminMembers.jsx'
import AdminRoster from './admin/AdminRoster.jsx'
import AdminRecruitApplications from './admin/AdminRecruitApplications.jsx'
import { recruitPendingCount, recruitStatusLabel } from './admin/recruitStatus.js'
import AdminScreenCheck from './admin/AdminScreenCheck.jsx'

const DELETED_CONTENT_ALLOWED_STYLES = new Set(['background-color', 'color', 'font-family'])
const DELETED_CONTENT_SANITIZE_OPTIONS = {
  allowedTags: ['b', 'br', 'div', 'em', 'font', 'i', 'p', 'span', 'strong', 'u'],
  allowedAttributes: ['color', 'face', 'style'],
  allowedStyles: DELETED_CONTENT_ALLOWED_STYLES,
}

const ADMIN_TAB_IDS = new Set([
  'overview', 'members', 'recruit', 'roster', 'activities', 'projects', 'files',
  'fonts', 'community', 'deleted-posts', 'screen-check', 'ban', 'logs',
])

export default function Admin({ onBack }) {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState(() => {
    const requested = searchParams.get('tab')
    return requested && ADMIN_TAB_IDS.has(requested) ? requested : 'overview'
  })
  const [recruitApplications, setRecruitApplications] = useState([])
  const [recruitLoading, setRecruitLoading] = useState(true)
  const [recruitError, setRecruitError] = useState('')

  const loadRecruitApplications = async () => {
    setRecruitError('')
    try {
      const data = await listRecruitApplications()
      setRecruitApplications(Array.isArray(data) ? data : [])
    } catch (err) {
      setRecruitError(err.message || '모집 지원서를 불러오지 못했습니다.')
    } finally {
      setRecruitLoading(false)
    }
  }

  useEffect(() => {
    let mounted = true
    listRecruitApplications()
      .then((data) => {
        if (mounted) {
          setRecruitError('')
          setRecruitApplications(Array.isArray(data) ? data : [])
        }
      })
      .catch((err) => { if (mounted) setRecruitError(err.message || '모집 지원서를 불러오지 못했습니다.') })
      .finally(() => { if (mounted) setRecruitLoading(false) })
    return () => { mounted = false }
  }, [])

  if (user?.role !== 'ADMIN') {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="shape-cut-sm border border-[var(--theme-border-soft)] bg-[var(--theme-surface-96)] px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-[var(--app-surface)]"
        >
          메인으로 돌아가기
        </button>
        <p className="text-center text-[var(--theme-body-dark)]">접근 권한이 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-center sm:justify-start">
        <button
          type="button"
          onClick={onBack}
          className="shape-cut-sm border border-[var(--theme-border-soft)] bg-[var(--theme-surface-96)] px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] shadow-[0_18px_40px_rgba(255,255,255,0.2)] transition hover:bg-[var(--app-surface)]"
        >
          메인으로 돌아가기
        </button>
      </div>

      <div className="shape-cut bg-[var(--theme-surface-70)] p-px shadow-[0_22px_70px_var(--theme-shadow-glass)]">
        <section className="shape-cut bg-[var(--theme-surface-96)] p-5 text-[var(--theme-body-dark)] shadow-[0_22px_70px_var(--theme-shadow-glass)] backdrop-blur-md supports-[backdrop-filter]:bg-[var(--theme-surface-94)] sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-[var(--theme-body-muted)]/80">Admin</p>
          <h1 className="mt-2 mb-6 text-2xl font-bold sm:text-3xl">관리자 패널</h1>

          <div className="-mx-1 mb-6 overflow-x-auto pb-1">
            <div className="flex min-w-max gap-2 px-1">
              {[
                { id: 'overview', label: '운영 요약' },
                { id: 'members', label: '회원 관리' },
                { id: 'recruit', label: '모집 관리' },
                { id: 'roster', label: '명부 인증' },
                { id: 'activities', label: '활동 관리' },
                { id: 'projects', label: 'Apps 관리' },
                { id: 'files', label: '파일 관리' },
                { id: 'fonts', label: '폰트 관리' },
                { id: 'community', label: '커뮤니티 관리' },
                { id: 'deleted-posts', label: '삭제 보관함' },
                { id: 'screen-check', label: '화면 점검' },
                { id: 'ban', label: '차단 관리' },
                { id: 'logs', label: '로그' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`shape-cut-sm shrink-0 px-4 py-2 text-sm font-semibold transition ${
                    activeTab === tab.id
                      ? 'bg-[var(--theme-text)] text-[var(--theme-bg)]'
                      : 'border border-[var(--app-hairline)] bg-white/60 text-[var(--theme-body-dark)] hover:bg-white/80'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {activeTab === 'overview' && (
            <OverviewTab
              recruitApplications={recruitApplications}
              recruitLoading={recruitLoading}
              recruitError={recruitError}
              onOpenRecruit={() => setActiveTab('recruit')}
            />
          )}
          {activeTab === 'members' && <AdminMembers currentUser={user} />}
          {activeTab === 'recruit' && (
            <AdminRecruitApplications
              applications={recruitApplications}
              loading={recruitLoading}
              error={recruitError}
              onReload={loadRecruitApplications}
              onUpdated={(updated) => {
                setRecruitApplications((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
              }}
              formatDateTime={formatDateTime}
            />
          )}
          {activeTab === 'roster' && <AdminRoster />}
          {activeTab === 'activities' && <AdminActivities />}
          {activeTab === 'projects' && <AdminAppCatalog />}
          {activeTab === 'files' && <AdminFiles />}
          {activeTab === 'fonts' && <AdminFonts />}
          {activeTab === 'community' && <AdminCommunityReports formatDateTime={formatDateTime} />}
          {activeTab === 'deleted-posts' && <DeletedCommunityPostsTab />}
          {activeTab === 'screen-check' && <AdminScreenCheck />}
          {activeTab === 'ban' && <AdminBan formatDateTime={formatDateTime} />}
          {activeTab === 'logs' && <AdminAuditLogs formatDateTime={formatDateTime} />}
        </section>
      </div>
    </div>
  )
}

function OverviewTab({ recruitApplications, recruitLoading, recruitError, onOpenRecruit }) {
  const pendingCount = recruitPendingCount(recruitApplications)
  const latestApplication = recruitApplications[0]
  const cards = [
    {
      label: '처리 대기 지원',
      value: recruitLoading ? '확인 중' : `${pendingCount.toLocaleString('ko-KR')}건`,
      detail: recruitError || '접수·검토·보류 상태의 지원서',
    },
    {
      label: '최근 지원자',
      value: latestApplication ? latestApplication.name : '없음',
      detail: latestApplication ? `${latestApplication.department} · ${recruitStatusLabel(latestApplication.status)}` : '새 지원서가 들어오면 여기에 표시됩니다.',
    },
    {
      label: '운영 체크',
      value: 'Admin OS',
      detail: '모집, 명부, 자료실, 로그를 한 흐름에서 점검합니다.',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[var(--theme-body-dark)]">운영 요약</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--theme-body-muted)]">
            운영진이 매주 확인해야 할 모집, 회원, 자료, 로그 흐름을 한 화면에서 시작합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenRecruit}
          className="shape-cut-sm bg-[var(--theme-text)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] transition hover:opacity-90"
        >
          모집 관리 열기
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border border-[var(--app-hairline)] bg-black/5 p-4">
            <p className="text-xs font-semibold text-[var(--theme-body-muted)]">{card.label}</p>
            <p className="mt-2 text-2xl font-bold text-[var(--theme-body-dark)]">{card.value}</p>
            <p className="mt-2 text-xs leading-5 text-[var(--theme-body-muted)]">{card.detail}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-[var(--app-hairline)] bg-white/60 p-4">
        <p className="text-sm font-semibold text-[var(--theme-body-dark)]">다음 운영 액션</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {[
            ['모집', '지원 상태와 운영 메모를 정리합니다.'],
            ['커뮤니티', '공지와 활동 글 흐름을 확인합니다.'],
            ['자료실', '최근 세미나·프로젝트 자료를 올립니다.'],
          ].map(([title, body]) => (
            <div key={title} className="shape-cut-sm border border-[var(--app-hairline)] bg-black/5 px-3 py-3">
              <p className="text-sm font-bold text-[var(--theme-body-dark)]">{title}</p>
              <p className="mt-1 text-xs leading-5 text-[var(--theme-body-muted)]">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DeletedCommunityPostsTab() {
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

function DeletedPostDetailModal({ post, onClose, onRestore, restoring, restoreDisabled }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div className="my-auto w-full max-w-3xl overflow-hidden rounded-2xl bg-[var(--app-surface)] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--app-hairline)] bg-[#f7f9ff] px-5 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#3b4890]">삭제 보관함 · 원문 보기</p>
            <p className="truncate text-xs text-[var(--theme-body-muted)]">#{full.originalPostId} · {deletedCategoryLabel(full.category)}</p>
          </div>
          <button
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

function DeletedPostBody({ post }) {
  const blocks = deletedPostBlocks(post)
  const usedImageIds = new Set(blocks.filter((block) => block.type === 'image' && block.imageInfo?.id).map((block) => block.imageInfo.id))
  const usedVideoIds = new Set(blocks.filter((block) => block.type === 'video' && block.mediaInfo?.id).map((block) => block.mediaInfo.id))
  const usedFileIds = new Set(blocks.filter((block) => block.type === 'file' && block.mediaInfo?.id).map((block) => block.mediaInfo.id))
  const extraImages = (post.imageInfos || []).filter((image) => !usedImageIds.has(image.id))
  const extraVideos = (post.videoInfos || []).filter((media) => !usedVideoIds.has(media.id))
  const extraFiles = (post.fileInfos || []).filter((media) => !usedFileIds.has(media.id))
  return (
    <div className="space-y-3">
      {blocks.length === 0 && <p className="text-sm text-[var(--theme-body-muted)]">본문이 없습니다.</p>}
      {blocks.map((block, index) => {
        if (block.type === 'image') {
          if (!block.url) return null
          return (
            <figure
              key={`image-${block.imageInfo?.id || index}`}
              className="overflow-hidden rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)]"
              style={{ width: `${deletedMediaWidth(block.width)}%`, maxWidth: '100%', marginInline: block.align === 'center' ? 'auto' : block.align === 'right' ? 'auto 0' : '0 auto' }}
            >
              <img src={apiUrl(block.url)} alt={block.name || '삭제 게시글 이미지'} className="block w-full object-contain" />
              {block.name && <figcaption className="border-t border-[var(--app-hairline)] px-2 py-1 text-[11px] font-semibold text-[var(--theme-body-muted)]">{block.name}</figcaption>}
            </figure>
          )
        }
        if (block.type === 'externalImage') {
          return (
            <figure key={`external-${index}`} className="overflow-hidden rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)]">
              <img src={block.url} alt={block.title || '외부 이미지'} className="block w-full object-contain" />
            </figure>
          )
        }
        if (block.type === 'video') {
          if (!block.url) return null
          return (
            <figure
              key={`video-${block.mediaInfo?.id || index}`}
              className="overflow-hidden rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)]"
              style={{ width: `${deletedMediaWidth(block.width)}%`, maxWidth: '100%', marginInline: block.align === 'center' ? 'auto' : block.align === 'right' ? 'auto 0' : '0 auto' }}
            >
              <video src={apiUrl(block.url)} className="block w-full bg-black" controls preload="metadata" />
              {block.name && <figcaption className="border-t border-[var(--app-hairline)] px-2 py-1 text-[11px] font-semibold text-[var(--theme-body-muted)]">{block.name}</figcaption>}
            </figure>
          )
        }
        if (block.type === 'file') {
          if (!block.url) return null
          return (
            <a key={`file-${block.mediaInfo?.id || index}`} href={apiUrl(block.url)} className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-sm font-semibold text-[#3b4890] underline">
              <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{block.name || '첨부파일'}</span>
            </a>
          )
        }
        if (block.type === 'poll') {
          return (
            <div key={`poll-${index}`} className="rounded-lg border border-[#3b4890]/15 bg-[#f7f9ff] px-4 py-3 text-sm text-[var(--theme-body-dark)]">
              <strong className="block text-[#3b4890]">투표: {block.question || '투표'}</strong>
              {block.options.length > 0 && (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[var(--theme-body-muted)]">
                  {block.options.map((option, i) => {
                    const label = deletedPollOptionLabel(option)
                    return label ? <li key={i}>{label}</li> : null
                  })}
                </ul>
              )}
            </div>
          )
        }
        return (
          <div key={`text-${index}`} className="whitespace-pre-wrap break-words leading-7 text-[var(--theme-body-dark)]">
            {deletedHasFormattedText(block.content) ? (
              <span dangerouslySetInnerHTML={{ __html: sanitizeDeletedHtml(block.content) }} />
            ) : (
              block.content || ''
            )}
          </div>
        )
      })}
      {extraImages.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {extraImages.map((image) => (
            <figure key={image.id} className="overflow-hidden rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)]">
              <img src={apiUrl(image.url)} alt={image.originalName || '삭제 게시글 이미지'} className="block aspect-square w-full object-contain" />
              <figcaption className="truncate border-t border-[var(--app-hairline)] px-2 py-1 text-[11px] font-semibold text-[var(--theme-body-muted)]">
                {image.kind === 'COVER' ? '대표 이미지' : image.originalName || '이미지'}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {extraVideos.length > 0 && (
        <div className="grid gap-2">
          {extraVideos.map((media) => (
            <figure key={media.id} className="overflow-hidden rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)]">
              <video src={apiUrl(media.url)} className="block w-full bg-black" controls preload="metadata" />
              <figcaption className="truncate border-t border-[var(--app-hairline)] px-2 py-1 text-[11px] font-semibold text-[var(--theme-body-muted)]">{media.originalName || '영상'}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {extraFiles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {extraFiles.map((media) => (
            <a key={media.id} href={apiUrl(media.url)} className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-sm font-semibold text-[#3b4890] underline">
              <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{media.originalName || '첨부파일'}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function buildDeletedCommentTree(comments) {
  const nodes = new Map(comments.map((comment) => [comment.originalCommentId, { ...comment, children: [] }]))
  const roots = []
  comments.forEach((comment) => {
    const node = nodes.get(comment.originalCommentId)
    const parent = comment.originalParentCommentId ? nodes.get(comment.originalParentCommentId) : null
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
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

function deletedCategoryLabel(value) {
  const map = {
    GENERAL: '일반',
    QUESTION: '질문',
    ANONYMOUS: '익명',
    CONCEPT: '컨셉',
    INFO: '정보',
    PROMOTION: '홍보',
    SMALL_GROUP: '소모임',
  }
  return map[value] || value || '일반'
}

function deletedAppealStatusLabel(value) {
  const map = { OPEN: '대기', APPROVED: '승인', REJECTED: '거절', RESOLVED: '처리됨' }
  return map[value] || value
}

function DeletedPostEvidence({ post }) {
  const blocks = deletedPostBlocks(post)
  const usedImageIds = new Set(blocks.filter((block) => block.type === 'image' && block.imageInfo?.id).map((block) => block.imageInfo.id))
  const usedVideoIds = new Set(blocks.filter((block) => block.type === 'video' && block.mediaInfo?.id).map((block) => block.mediaInfo.id))
  const usedFileIds = new Set(blocks.filter((block) => block.type === 'file' && block.mediaInfo?.id).map((block) => block.mediaInfo.id))
  const extraImages = (post.imageInfos || []).filter((image) => !usedImageIds.has(image.id))
  const extraVideos = (post.videoInfos || []).filter((media) => !usedVideoIds.has(media.id))
  const extraFiles = (post.fileInfos || []).filter((media) => !usedFileIds.has(media.id))
  const comments = post.commentInfos || []
  return (
    <div className="space-y-2">
      {blocks.length === 0 && <span className="text-[var(--theme-body-muted)]">-</span>}
      {blocks.map((block, index) => {
        if (block.type === 'image') {
          if (!block.url) return null
          return (
            <figure
              key={`image-${block.imageInfo?.id || index}`}
              className="overflow-hidden rounded-md border border-[var(--app-hairline)] bg-[var(--app-surface)]"
              style={{ width: `${deletedMediaWidth(block.width)}%`, maxWidth: '100%', marginInline: block.align === 'center' ? 'auto' : block.align === 'right' ? 'auto 0' : '0 auto' }}
            >
              <img src={apiUrl(block.url)} alt={block.name || '삭제 게시글 이미지'} className="block max-h-72 w-full object-contain" />
              {block.name && <figcaption className="border-t border-[var(--app-hairline)] px-2 py-1 text-[10px] font-semibold text-[var(--theme-body-muted)]">{block.name}</figcaption>}
            </figure>
          )
        }
        if (block.type === 'externalImage') {
          return (
            <figure key={`external-${index}`} className="overflow-hidden rounded-md border border-[var(--app-hairline)] bg-[var(--app-surface)]">
              <img src={block.url} alt={block.title || '외부 이미지'} className="block max-h-72 w-full object-contain" />
            </figure>
          )
        }
        if (block.type === 'video') {
          if (!block.url) return null
          return (
            <figure
              key={`video-${block.mediaInfo?.id || index}`}
              className="overflow-hidden rounded-md border border-[var(--app-hairline)] bg-[var(--app-surface)]"
              style={{ width: `${deletedMediaWidth(block.width)}%`, maxWidth: '100%', marginInline: block.align === 'center' ? 'auto' : block.align === 'right' ? 'auto 0' : '0 auto' }}
            >
              <video src={apiUrl(block.url)} className="block max-h-72 w-full bg-black" controls preload="metadata" />
              {block.name && <figcaption className="border-t border-[var(--app-hairline)] px-2 py-1 text-[10px] font-semibold text-[var(--theme-body-muted)]">{block.name}</figcaption>}
            </figure>
          )
        }
        if (block.type === 'file') {
          if (!block.url) return null
          return (
            <a key={`file-${block.mediaInfo?.id || index}`} href={apiUrl(block.url)} className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-[var(--app-hairline)] bg-[var(--app-surface)] px-2 py-1 text-[11px] font-semibold text-[#3b4890] underline">
              <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{block.name || '첨부파일'}</span>
            </a>
          )
        }
        if (block.type === 'poll') {
          return (
            <div key={`poll-${index}`} className="rounded-md border border-[#3b4890]/15 bg-[#f7f9ff] px-3 py-2 text-[11px] text-[var(--theme-body-dark)]">
              <strong className="block text-[#3b4890]">투표: {block.question || '투표'}</strong>
              {block.options.length > 0 && <span className="mt-1 block text-[var(--theme-body-muted)]">{block.options.map(deletedPollOptionLabel).filter(Boolean).join(' · ')}</span>}
            </div>
          )
        }
        return (
          <div key={`text-${index}`} className="whitespace-pre-wrap break-words leading-5 text-[var(--theme-body-dark)]">
            {deletedHasFormattedText(block.content) ? (
              <span dangerouslySetInnerHTML={{ __html: sanitizeDeletedHtml(block.content) }} />
            ) : (
              block.content || '-'
            )}
          </div>
        )
      })}
      {extraImages.length > 0 && (
        <div className="grid max-w-[360px] grid-cols-2 gap-2">
          {extraImages.map((image) => (
            <figure key={image.id} className="overflow-hidden rounded-md border border-[var(--app-hairline)] bg-[var(--app-surface)]">
              <img src={apiUrl(image.url)} alt={image.originalName || '삭제 게시글 이미지'} className="block aspect-square w-full object-contain" />
              <figcaption className="truncate border-t border-[var(--app-hairline)] px-2 py-1 text-[10px] font-semibold text-[var(--theme-body-muted)]">
                {image.kind === 'COVER' ? '대표 이미지' : image.originalName || '이미지'}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {extraVideos.length > 0 && (
        <div className="grid max-w-[360px] gap-2">
          {extraVideos.map((media) => (
            <figure key={media.id} className="overflow-hidden rounded-md border border-[var(--app-hairline)] bg-[var(--app-surface)]">
              <video src={apiUrl(media.url)} className="block max-h-72 w-full bg-black" controls preload="metadata" />
              <figcaption className="truncate border-t border-[var(--app-hairline)] px-2 py-1 text-[10px] font-semibold text-[var(--theme-body-muted)]">{media.originalName || '영상'}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {extraFiles.length > 0 && (
        <div className="flex max-w-[360px] flex-wrap gap-2">
          {extraFiles.map((media) => (
            <a key={media.id} href={apiUrl(media.url)} className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-[var(--app-hairline)] bg-[var(--app-surface)] px-2 py-1 text-[11px] font-semibold text-[#3b4890] underline">
              <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{media.originalName || '첨부파일'}</span>
            </a>
          ))}
        </div>
      )}
      {comments.length > 0 && (
        <div className="max-w-[420px] rounded-md border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2">
          <strong className="block text-[11px] text-[var(--theme-body-dark)]">댓글 {post.commentCount || comments.length}개 보관됨</strong>
          <div className="mt-2 space-y-1.5">
            {comments.slice(0, 5).map((comment) => (
              <div key={comment.originalCommentId} className="border-t border-black/5 pt-1.5 text-[11px] leading-5">
                <span className="font-semibold text-[var(--theme-body-dark)]">{deletedPostIdentity(comment.authorName, comment.authorStudentId)}</span>
                <span className="ml-2 text-[10px] text-[var(--theme-body-muted)]">{formatDateTime(comment.createdAt)}{comment.edited ? ' · 수정됨' : ''}</span>
                <p className="whitespace-pre-wrap break-words text-[var(--theme-body-muted)]">{comment.content}</p>
              </div>
            ))}
            {comments.length > 5 && <p className="text-[10px] font-semibold text-[var(--theme-body-muted)]">외 {comments.length - 5}개 댓글</p>}
          </div>
        </div>
      )}
    </div>
  )
}

function deletedPostMatchesSearch(post, normalizedSearch) {
  if (!normalizedSearch) return true
  return deletedPostSearchText(post).includes(normalizedSearch)
}

function deletedPostMatchesStatus(post, statusFilter) {
  if (statusFilter === 'RESTORED') return Boolean(post.restoredPostId)
  if (statusFilter === 'OPEN') return !post.restoredPostId
  return true
}

function deletedPostMatchesEvidence(post, evidenceFilter) {
  if (evidenceFilter === 'MEDIA') {
    return (post.imageInfos || []).length > 0 || (post.videoInfos || []).length > 0 || (post.fileInfos || []).length > 0
  }
  if (evidenceFilter === 'COMMENTS') {
    return Number(post.commentCount || 0) > 0 || (post.commentInfos || []).length > 0
  }
  if (evidenceFilter === 'POLL') {
    return deletedPostBlocks(post).some((block) => block.type === 'poll')
  }
  return true
}

function deletedPostSearchText(post) {
  const blocks = deletedPostBlocks(post)
  return [
    post.title,
    post.originalPostId,
    post.category,
    post.authorName,
    post.authorStudentId,
    post.deletedByName,
    post.deletedByStudentId,
    post.deletionReason,
    post.restoredPostId,
    ...blocks.map((block) => {
      if (block.type === 'poll') return [block.question, ...block.options.map(deletedPollOptionLabel)].join(' ')
      return [block.content, block.name, block.title].join(' ')
    }),
    ...(post.imageInfos || []).map((item) => item.originalName),
    ...(post.videoInfos || []).map((item) => item.originalName),
    ...(post.fileInfos || []).map((item) => item.originalName),
    ...(post.commentInfos || []).flatMap((comment) => [comment.authorName, comment.authorStudentId, comment.content]),
  ].map((value) => String(value || '').toLowerCase()).join(' ')
}

function deletedPostBlocks(post) {
  const images = post.imageInfos || []
  const videos = post.videoInfos || []
  const files = post.fileInfos || []
  const fallback = String(post.content || '').trim()
  if (!fallback) return []
  try {
    const parsed = JSON.parse(fallback)
    if (!Array.isArray(parsed)) return [{ type: 'text', content: fallback }]
    return parsed.map((block) => {
      if (block?.type === 'image') {
        const imageInfo = images.find((image) => image.originalImageId === block.mediaId || image.id === block.mediaId)
        return {
          type: 'image',
          imageInfo,
          url: imageInfo?.url,
          name: block.name || imageInfo?.originalName,
          width: block.width || 75,
          align: block.align || 'center',
        }
      }
      if (block?.type === 'externalEmbed' && block.kind === 'image' && isSafeHttpsUrl(block.url)) {
        return { type: 'externalImage', url: block.url, title: block.title || '외부 이미지' }
      }
      if (block?.type === 'video') {
        const mediaInfo = videos.find((media) => media.originalMediaId === block.mediaId || media.id === block.mediaId)
        return {
          type: 'video',
          mediaInfo,
          url: mediaInfo?.url,
          name: block.name || mediaInfo?.originalName,
          width: block.width || 75,
          align: block.align || 'center',
        }
      }
      if (block?.type === 'file') {
        const mediaInfo = files.find((media) => media.originalMediaId === block.fileId || media.id === block.fileId)
        return {
          type: 'file',
          mediaInfo,
          url: mediaInfo?.url,
          name: block.name || mediaInfo?.originalName,
        }
      }
      if (block?.type === 'poll') {
        return { type: 'poll', question: block.question || '', options: Array.isArray(block.options) ? block.options : [] }
      }
      return { type: 'text', content: block?.content || '' }
    }).filter((block) => block.type !== 'text' || String(block.content || '').trim())
  } catch {
    return [{ type: 'text', content: fallback }]
  }
}

function deletedPollOptionLabel(option) {
  if (typeof option === 'object' && option !== null) {
    return String(option.label || option.text || option.title || option.value || '')
  }
  return String(option || '')
}

function deletedMediaWidth(width) {
  const numeric = Number(width)
  if (Number.isFinite(numeric)) return Math.min(100, Math.max(35, numeric))
  if (width === 'small') return 35
  if (width === 'medium') return 55
  return 75
}

function deletedHasFormattedText(value) {
  return /<\/?(?:b|strong|i|em|u|s|mark|span|br|p|div|font)\b/i.test(String(value || ''))
}

function sanitizeDeletedHtml(value) {
  // Deprecated compatibility adapter: new deleted-content sinks should call sanitizeHtml() directly.
  if (typeof document === 'undefined') return sanitizeHtml(value, DELETED_CONTENT_SANITIZE_OPTIONS)
  const template = document.createElement('template')
  template.innerHTML = String(value || '')
  const container = document.createElement('div')
  appendDeletedCleanChildren(template.content, container)
  return sanitizeHtml(container.innerHTML, DELETED_CONTENT_SANITIZE_OPTIONS)
}

function appendDeletedCleanChildren(source, target) {
  for (const child of Array.from(source.childNodes)) {
    const clean = cleanDeletedNode(child)
    if (clean) target.appendChild(clean)
  }
}

function cleanDeletedNode(node) {
  if (node.nodeType === 3) return document.createTextNode(node.textContent.replace(/\u200B/g, ''))
  if (node.nodeType !== 1) return document.createTextNode('')

  const tag = node.tagName.toLowerCase()
  if (tag === 'br') return document.createElement('br')
  if (['b', 'strong', 'i', 'em', 'u'].includes(tag)) {
    const el = document.createElement(tag)
    appendDeletedCleanChildren(node, el)
    return el
  }
  if (tag === 'span' || tag === 'font') {
    const el = document.createElement('span')
    const style = []
    const color = node.style?.color || node.getAttribute('color')
    const backgroundColor = node.style?.backgroundColor
    const rawFontFamily = node.style?.fontFamily || node.getAttribute('face')
    const fontFamily = typeof rawFontFamily === 'string' && /^[\w\s\-,'"]+$/.test(rawFontFamily) ? rawFontFamily : ''
    if (color && !/url|expression|javascript/i.test(color)) style.push(`color:${color}`)
    if (backgroundColor && !/url|expression|javascript/i.test(backgroundColor)) style.push(`background-color:${backgroundColor}`)
    if (fontFamily) style.push(`font-family:${fontFamily}`)
    if (style.length) el.setAttribute('style', style.join(';'))
    appendDeletedCleanChildren(node, el)
    return el
  }
  if (tag === 'div' || tag === 'p') {
    const fragment = document.createDocumentFragment()
    appendDeletedCleanChildren(node, fragment)
    fragment.appendChild(document.createElement('br'))
    return fragment
  }
  const fragment = document.createDocumentFragment()
  appendDeletedCleanChildren(node, fragment)
  return fragment
}

function isSafeHttpsUrl(value) {
  try {
    return new URL(String(value || '')).protocol === 'https:'
  } catch {
    return false
  }
}

function formatDateTime(value) {
  if (!value) return '영구'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '알 수 없음'
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function deletedPostIdentity(name, studentId) {
  const safeName = name || '-'
  return studentId ? `${safeName}(${studentId})` : safeName
}
