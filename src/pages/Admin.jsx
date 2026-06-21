import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Download, Eye, RefreshCw, RotateCcw, Upload, X } from 'lucide-react'
import { apiUrl } from '../services/apiClient.js'
import { listMembers, updateMemberRole, deleteMember, importEligibleMembers, addEligibleMember, listEligibleMembers, updateEligibleMember, deleteEligibleMember, listBannedStudents, banStudent, unbanStudent, resetMemberPassword, listAuditLogs, clearAdminCache, listCommunityReports, listDeletedCommunityPosts, getDeletedCommunityPost, restoreDeletedCommunityPost, resolveCommunityReport, listRecruitApplications, updateRecruitApplicationStatus } from '../services/adminApi.js'
import { listFiles, createPost, deleteFile } from '../services/archiveApi.js'
import {
  createClubActivity,
  deleteClubActivity,
  listClubActivities,
  updateClubActivity,
  uploadClubActivityImages,
  deleteClubActivityImage,
  uploadClubActivityFile,
  deleteClubActivityFile,
  listClubActivityCategories,
  createClubActivityCategory,
  updateClubActivityCategory,
  deleteClubActivityCategory,
} from '../services/clubActivityApi.js'
import {
  listClubProjects,
  listClubProjectCategories,
  createClubProject,
  updateClubProject,
  deleteClubProject,
  uploadClubProjectFile,
  deleteClubProjectFile,
  createClubProjectCategory,
  updateClubProjectCategory,
  deleteClubProjectCategory,
} from '../services/clubProjectApi.js'
import { listAdminFonts, setFontActive, uploadFont } from '../services/fontApi.js'
import { buildFontFaceCss, fontFamilyValue } from '../services/fontPreferences.js'
import { useAuth } from '../contexts/useAuth.js'
import { sanitizeHtml } from '../utils/sanitizeHtml.js'
import AppProjectCard from '../components/apps/AppProjectCard.jsx'

const BAN_DURATIONS = [
  { value: '6H', label: '6시간' },
  { value: '12H', label: '12시간' },
  { value: '24H', label: '24시간' },
  { value: '3D', label: '3일' },
  { value: '7D', label: '7일' },
  { value: '31D', label: '31일' },
  { value: '3M', label: '3달' },
  { value: '6M', label: '6달' },
  { value: '1Y', label: '1년' },
  { value: '3Y', label: '3년' },
]

const SCREEN_CHECK_ROUTES = [
  { path: '/', label: '홈' },
  { path: '/activities', label: '활동' },
  { path: '/projects', label: '프로젝트' },
  { path: '/notices', label: '공지' },
  { path: '/login', label: '로그인' },
  { path: '/signup', label: '회원가입' },
  { path: '/recruit', label: '지원하기' },
]

const SCREEN_CHECK_APIS = [
  { path: '/api/auth/me', label: '로그인 상태' },
  { path: '/api/fonts', label: '폰트 목록' },
  { path: '/api/notices', label: '공지 목록' },
]

const AUDIT_LOG_LIMITS = [300, 1000, 2000]

const AUDIT_LOG_FILTERS = [
  { value: 'ALL', label: '전체 로그' },
  { value: 'COMMUNITY_POST_DELETE', label: '커뮤니티 삭제' },
  { value: 'COMMUNITY_COMMENT_DELETE', label: '댓글 삭제' },
  { value: 'COMMUNITY_REPORT_ACCEPT', label: '신고 처리 완료' },
  { value: 'COMMUNITY_REPORT_REJECT', label: '신고 기각' },
  { value: 'ADMIN_MEMBER_DELETE', label: '회원 삭제' },
  { value: 'ADMIN_ELIGIBLE_MEMBER_DELETE', label: '명부 삭제' },
  { value: 'ADMIN_STUDENT_BAN', label: '학번 차단' },
  { value: 'ADMIN_RECRUIT_APPLICATION_STATUS_UPDATE', label: '모집 상태 변경' },
]
const DELETED_CONTENT_ALLOWED_STYLES = new Set(['background-color', 'color', 'font-family'])
const DELETED_CONTENT_SANITIZE_OPTIONS = {
  allowedTags: ['b', 'br', 'div', 'em', 'font', 'i', 'p', 'span', 'strong', 'u'],
  allowedAttributes: ['color', 'face', 'style'],
  allowedStyles: DELETED_CONTENT_ALLOWED_STYLES,
}

const AUDIT_ACTION_LABELS = {
  COMMUNITY_POST_CREATE: '커뮤니티 글 작성',
  COMMUNITY_POST_UPDATE: '커뮤니티 글 수정',
  COMMUNITY_POST_DELETE: '커뮤니티 글 삭제',
  COMMUNITY_COMMENT_CREATE: '댓글 작성',
  COMMUNITY_COMMENT_UPDATE: '댓글 수정',
  COMMUNITY_COMMENT_DELETE: '댓글 삭제',
  COMMUNITY_POST_VOTE: '추천/비추천',
  COMMUNITY_POLL_VOTE: '투표',
  COMMUNITY_POLL_CLOSE: '투표 종료',
  COMMUNITY_REPORT_ACCEPT: '신고 처리 완료',
  COMMUNITY_REPORT_REJECT: '신고 기각',
  ADMIN_MEMBER_ROLE_UPDATE: '회원 권한 변경',
  ADMIN_MEMBER_DELETE: '회원 삭제',
  ADMIN_MEMBER_PASSWORD_RESET: '비밀번호 초기화',
  ADMIN_ELIGIBLE_MEMBER_ADD: '명부 추가',
  ADMIN_ELIGIBLE_MEMBER_UPDATE: '명부 수정',
  ADMIN_ELIGIBLE_MEMBER_DELETE: '명부 삭제',
  ADMIN_ELIGIBLE_MEMBER_IMPORT: '명부 가져오기',
  ADMIN_STUDENT_BAN: '학번 차단',
  ADMIN_STUDENT_UNBAN: '차단 해제',
  ADMIN_RECRUIT_APPLICATION_STATUS_UPDATE: '모집 상태 변경',
  ADMIN_CACHE_CLEAR: '캐시 초기화',
}

const COMMUNITY_REPORT_REASONS = {
  SPAM: '스팸/홍보',
  ABUSE: '비방/괴롭힘',
  PRIVACY: '개인정보',
  PROFANITY: '욕설/혐오',
  MISLEADING: '허위/오해 소지',
  OTHER: '기타',
}

const RECRUIT_STATUS_OPTIONS = [
  { value: 'RECEIVED', label: '접수됨' },
  { value: 'REVIEWING', label: '검토중' },
  { value: 'ACCEPTED', label: '합격' },
  { value: 'HOLD', label: '보류' },
  { value: 'REJECTED', label: '불합격' },
]

const RECRUIT_PENDING_STATUSES = new Set(['RECEIVED', 'REVIEWING', 'HOLD'])

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
          {activeTab === 'members' && <MembersTab currentUser={user} />}
          {activeTab === 'recruit' && (
            <RecruitApplicationsTab
              applications={recruitApplications}
              loading={recruitLoading}
              error={recruitError}
              onReload={loadRecruitApplications}
              onUpdated={(updated) => {
                setRecruitApplications((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
              }}
            />
          )}
          {activeTab === 'roster' && <RosterTab />}
          {activeTab === 'activities' && <ActivitiesAdminTab />}
          {activeTab === 'projects' && <ClubProjectsAdminTab />}
          {activeTab === 'files' && <FilesTab />}
          {activeTab === 'fonts' && <FontsTab />}
          {activeTab === 'community' && <CommunityReportsTab />}
          {activeTab === 'deleted-posts' && <DeletedCommunityPostsTab />}
          {activeTab === 'screen-check' && <ScreenCheckTab />}
          {activeTab === 'ban' && <BanTab />}
          {activeTab === 'logs' && <AuditLogTab />}
        </section>
      </div>
    </div>
  )
}

function parseInterests(raw) {
  if (!raw) return []
  return raw.split(',').map((item) => {
    if (item.startsWith('기타:')) return `기타 (${item.slice(3)})`
    return item
  })
}

function recruitStatusLabel(status) {
  return RECRUIT_STATUS_OPTIONS.find((option) => option.value === status)?.label || status || '알 수 없음'
}

function recruitPendingCount(applications) {
  return applications.filter((application) => RECRUIT_PENDING_STATUSES.has(application.status)).length
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

function RecruitApplicationsTab({ applications, loading, error, onReload, onUpdated }) {
  const [drafts, setDrafts] = useState({})
  const [savingId, setSavingId] = useState(null)
  const [message, setMessage] = useState('')
  const [saveError, setSaveError] = useState('')

  const updateDraft = (id, patch) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), ...patch },
    }))
  }

  const saveApplication = async (application) => {
    const draft = drafts[application.id] || {}
    setSavingId(application.id)
    setMessage('')
    setSaveError('')
    try {
      const updated = await updateRecruitApplicationStatus(application.id, {
        status: draft.status || application.status,
        adminNote: draft.adminNote || '',
      })
      onUpdated(updated)
      setDrafts((prev) => ({
        ...prev,
        [updated.id]: {
          status: updated.status,
          adminNote: updated.adminNote || '',
        },
      }))
      setMessage(`${updated.name} 지원서를 저장했습니다.`)
    } catch (err) {
      setSaveError(err.message || '지원서 상태를 저장하지 못했습니다.')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[var(--theme-body-dark)]">모집 지원 관리</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--theme-body-muted)]">
            지원서 접수 이후 검토 상태와 운영 메모를 남겨 학기 모집 흐름을 끊기지 않게 관리합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onReload}
          className="shape-cut-sm border border-[var(--app-hairline)] bg-white/60 px-3 py-2 text-xs font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/80"
        >
          새로고침
        </button>
      </div>

      {message && <p className="shape-cut-sm bg-[var(--app-accent-soft)] px-4 py-3 text-sm font-semibold text-[var(--app-accent-text)]">{message}</p>}
      {saveError && <p className="shape-cut-sm bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700">{saveError}</p>}
      {loading && <p className="text-sm text-[var(--theme-body-muted)]">지원서를 불러오는 중...</p>}
      {error && <p className="shape-cut-sm bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      {!loading && !error && applications.length === 0 && (
        <p className="text-sm text-[var(--theme-body-muted)]">아직 접수된 지원서가 없습니다.</p>
      )}

      {!loading && !error && applications.length > 0 && (
        <div className="space-y-3">
          {applications.map((application) => {
            const draft = drafts[application.id] || {
              status: application.status || 'RECEIVED',
              adminNote: application.adminNote || '',
            }
            return (
              <article key={application.id} className="rounded-lg border border-[var(--app-hairline)] bg-black/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold text-[var(--theme-body-dark)]">{application.name}</h3>
                      <span className="rounded bg-[var(--app-accent-soft)] px-2 py-1 text-xs font-bold text-[var(--app-accent-text)]">{recruitStatusLabel(application.status)}</span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--theme-body-muted)]">
                      {application.studentId} · {application.department} · {application.grade || '학년 미입력'} · {formatDateTime(application.submittedAt)}
                    </p>
                    <p className="mt-1 text-xs text-[var(--theme-body-muted)]">{application.phone} · {application.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
                      <span>상태</span>
                      <select
                        aria-label={`${application.name} 지원 상태`}
                        value={draft.status}
                        onChange={(event) => updateDraft(application.id, { status: event.target.value })}
                        className="shape-cut-sm border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-xs font-semibold text-[var(--theme-body-dark)] outline-none"
                      >
                        {RECRUIT_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => saveApplication(application)}
                      disabled={savingId === application.id}
                      aria-label={`${application.name} 저장`}
                      className="mt-5 shape-cut-sm bg-[var(--theme-text)] px-4 py-2 text-xs font-semibold text-[var(--theme-bg)] transition hover:opacity-90 disabled:opacity-50"
                    >
                      {savingId === application.id ? '저장 중...' : '저장'}
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-[var(--theme-body-muted)]">관심 분야</p>
                      <p className="mt-1 text-sm text-[var(--theme-body-dark)]">{application.interests || '미선택'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[var(--theme-body-muted)]">지원 동기</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--theme-body-dark)]">{application.motive}</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-[var(--theme-body-muted)]">기대하는 활동</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--theme-body-dark)]">{application.expectation}</p>
                    </div>
                    <label className="block text-xs font-semibold text-[var(--theme-body-muted)]">
                      <span>운영 메모</span>
                      <textarea
                        aria-label={`${application.name} 운영 메모`}
                        value={draft.adminNote}
                        onChange={(event) => updateDraft(application.id, { adminNote: event.target.value })}
                        maxLength={1000}
                        className="mt-1 min-h-24 w-full rounded-lg border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-sm text-[var(--theme-body-dark)] outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/50"
                        placeholder="면담 일정, 연락 결과, 합격 안내 여부 등을 남깁니다."
                      />
                    </label>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ScreenCheckTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--theme-body-dark)]">배포 전 화면 점검</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--theme-body-muted)]">
          `npm run smoke`와 같은 핵심 공개 경로를 관리자 화면에서 바로 열어봅니다. 배포 직전 라우팅, 폰트, 회원가입, 지원하기 화면이 깨지지 않았는지 빠르게 확인할 때 사용합니다.
        </p>
      </div>

      <div className="rounded-lg border border-[var(--app-hairline)] bg-black/5 p-4">
        <p className="text-sm font-semibold text-[var(--theme-body-dark)]">Smoke 대상 경로</p>
        <div data-testid="screen-check-routes" className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SCREEN_CHECK_ROUTES.map((route) => (
            <a
              key={route.path}
              href={route.path}
              target="_blank"
              rel="noreferrer"
              className="shape-cut-sm border border-[var(--app-hairline)] bg-white/70 px-3 py-3 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-[var(--app-surface)]"
            >
              <span className="block text-xs text-[var(--theme-body-muted)]">{route.label}</span>
              <span className="mt-1 block font-mono">{route.path}</span>
            </a>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-[var(--app-hairline)] bg-black/5 p-4">
        <p className="text-sm font-semibold text-[var(--theme-body-dark)]">API 상태 확인 표면</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {SCREEN_CHECK_APIS.map((api) => (
            <div key={api.path} className="shape-cut-sm border border-[var(--app-hairline)] bg-white/70 px-3 py-3">
              <span className="block text-xs font-semibold text-[var(--theme-body-muted)]">{api.label}</span>
              <span className="mt-1 block break-all font-mono text-sm text-[var(--theme-body-dark)]">{api.path}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-[var(--theme-body-muted)]">
          자동 판정은 Playwright smoke가 담당합니다. 이 탭은 운영자가 브라우저에서 직접 눈으로 확인할 체크리스트입니다.
        </p>
      </div>
    </div>
  )
}

function RosterTab() {
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [roster, setRoster] = useState([])
  const [loadingRoster, setLoadingRoster] = useState(true)
  const [rosterError, setRosterError] = useState('')
  const [addForm, setAddForm] = useState({ mode: 'current', studentId: '', name: '', admissionYear: '', generation: '' })
  const [adding, setAdding] = useState(false)
  const [addResult, setAddResult] = useState('')
  const [addError, setAddError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ studentId: '', name: '', phone: '' })
  const [editSaving, setEditSaving] = useState(false)

  const loadRoster = async () => {
    setRosterError('')
    try {
      const data = await listEligibleMembers()
      setRoster(data)
    } catch (err) {
      setRosterError(err.message || '명부를 불러오지 못했습니다.')
    } finally {
      setLoadingRoster(false)
    }
  }

  useEffect(() => {
    let mounted = true
    listEligibleMembers()
      .then((data) => { if (mounted) setRoster(data) })
      .catch((err) => { if (mounted) setRosterError(err.message || '명부를 불러오지 못했습니다.') })
      .finally(() => { if (mounted) setLoadingRoster(false) })
    return () => { mounted = false }
  }, [])

  const handleUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploading(true)
    setResult(null)
    setError('')
    try {
      const data = await importEligibleMembers(file)
      setResult(data)
      await loadRoster()
    } catch (err) {
      setError(err.message || '명부를 가져오지 못했습니다.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    const isGraduate = addForm.mode === 'graduate'
    if (!addForm.name.trim()) return
    if (!isGraduate && !addForm.studentId.trim()) return
    if (isGraduate && !addForm.admissionYear.trim() && !addForm.generation.trim()) return
    if (isGraduate && !addForm.admissionYear.trim() && parseInt(addForm.generation.trim(), 10) < 1) return
    setAdding(true)
    setAddResult('')
    setAddError('')
    try {
      const payload = { name: addForm.name.trim() }
      if (!isGraduate) {
        payload.studentId = addForm.studentId.trim()
      } else if (addForm.admissionYear.trim()) {
        payload.admissionYear = addForm.admissionYear.trim()
      } else {
        payload.generation = addForm.generation.trim()
      }
      await addEligibleMember(payload)
      const label = !isGraduate
        ? `${addForm.name} (${addForm.studentId})`
        : addForm.admissionYear.trim()
          ? `${addForm.name} (${addForm.admissionYear}학번)`
          : `${addForm.name} (${addForm.generation}기)`
      setAddResult(`${label} 명부에 추가됐습니다.`)
      setAddForm((p) => ({ ...p, studentId: '', name: '', admissionYear: '', generation: '' }))
      await loadRoster()
    } catch (err) {
      setAddError(err.message || '추가 중 오류가 발생했습니다.')
    } finally {
      setAdding(false)
    }
  }

  const startEdit = (member) => {
    setEditingId(member.id)
    setEditForm({ studentId: member.studentId || '', name: member.name, phone: member.phone || '' })
  }

  const handleEditSave = async (id) => {
    if (!editForm.name.trim()) return
    setEditSaving(true)
    try {
      await updateEligibleMember(id, editForm.studentId.trim() || null, editForm.name.trim(), editForm.phone.trim())
      setEditingId(null)
      await loadRoster()
    } catch (err) {
      alert(err.message || '수정 중 오류가 발생했습니다.')
    } finally {
      setEditSaving(false)
    }
  }

  const handleDelete = async (member) => {
    if (!window.confirm(`${member.name} (${member.studentId}) 항목을 명부에서 삭제하시겠습니까?`)) return
    try {
      await deleteEligibleMember(member.id)
      setRoster((prev) => prev.filter((m) => m.id !== member.id))
    } catch (err) {
      alert(err.message || '삭제 중 오류가 발생했습니다.')
    }
  }

  const GRAD_BASE_YEAR = 1966
  const currentYY = new Date().getFullYear() % 100

  const thisYear = new Date().getFullYear()

  const handleAdmissionYearChange = (raw) => {
    const digits = raw.replace(/\D/g, '').slice(0, 2)
    setAddForm((p) => {
      if (digits.length === 2) {
        const n = parseInt(digits, 10)
        const fullYear = n <= currentYY ? 2000 + n : 1900 + n
        if (fullYear >= GRAD_BASE_YEAR && fullYear <= thisYear) {
          return { ...p, admissionYear: digits, generation: String(fullYear - GRAD_BASE_YEAR) }
        }
      }
      return { ...p, admissionYear: digits }
    })
  }

  const handleGenerationChange = (raw) => {
    const digits = raw.replace(/\D/g, '').slice(0, 2)
    setAddForm((p) => {
      const gen = parseInt(digits, 10)
      if (!isNaN(gen) && gen > 0 && gen + GRAD_BASE_YEAR <= thisYear) {
        const twoDigit = String(gen + GRAD_BASE_YEAR).slice(-2)
        return { ...p, generation: digits, admissionYear: twoDigit }
      }
      return { ...p, generation: digits }
    })
  }

  const inputCls = 'shape-cut-sm border border-[var(--app-hairline)] bg-white/70 px-2 py-1 text-sm text-[var(--theme-body-dark)] outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/50'

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[var(--app-hairline)] bg-black/5 p-4">
        <p className="text-sm font-semibold text-[var(--theme-body-dark)]">개별 회원 추가</p>
        <p className="mt-1 text-xs text-[var(--theme-body-muted)]">명부에 직접 추가합니다. 재학생은 10자리 학번, 졸업생은 입학년도 끝 두자리 또는 기수로 추가합니다. 둘 중 하나 입력 시 나머지 자동 계산됩니다.</p>
        <div className="mt-3 flex gap-1">
          {[{ id: 'current', label: '재학생' }, { id: 'graduate', label: '졸업생' }].map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setAddForm((p) => ({ ...p, mode: m.id }))}
              className={`shape-cut-sm px-3 py-1 text-xs font-semibold transition ${
                addForm.mode === m.id
                  ? 'bg-[var(--theme-text)] text-[var(--theme-bg)]'
                  : 'border border-[var(--app-hairline)] bg-white/60 text-[var(--theme-body-dark)] hover:bg-white/80'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <form onSubmit={handleAdd} className="mt-3 flex flex-wrap gap-2">
          {addForm.mode === 'current' ? (
            <input
              value={addForm.studentId}
              onChange={(e) => setAddForm((p) => ({ ...p, studentId: e.target.value }))}
              placeholder="학번 (10자리)"
              maxLength={10}
              className="shape-cut-sm w-40 border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-sm text-[var(--theme-body-dark)] outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/50"
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              <input
                value={addForm.admissionYear}
                onChange={(e) => handleAdmissionYearChange(e.target.value)}
                placeholder="입학년도 끝 두자리 (예: 19)"
                maxLength={2}
                inputMode="numeric"
                className="shape-cut-sm w-44 border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-sm text-[var(--theme-body-dark)] outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/50"
              />
              <input
                value={addForm.generation}
                onChange={(e) => handleGenerationChange(e.target.value)}
                placeholder="기수 (예: 53)"
                maxLength={2}
                inputMode="numeric"
                className="shape-cut-sm w-32 border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-sm text-[var(--theme-body-dark)] outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/50"
              />
            </div>
          )}
          <input
            value={addForm.name}
            onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="이름"
            maxLength={20}
            className="shape-cut-sm w-32 border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-sm text-[var(--theme-body-dark)] outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/50"
          />
          <button
            type="submit"
            disabled={
              adding || !addForm.name.trim() ||
              (addForm.mode === 'current'
                ? !addForm.studentId.trim()
                : !addForm.admissionYear.trim() && !addForm.generation.trim())
            }
            className="shape-cut-sm bg-[var(--theme-text)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] transition hover:opacity-90 disabled:opacity-50"
          >
            {adding ? '추가 중...' : '추가'}
          </button>
        </form>
        {addResult && <p className="mt-2 text-xs font-semibold text-[var(--app-accent-text)]">{addResult}</p>}
        {addError && <p className="mt-2 text-xs font-semibold text-red-600">{addError}</p>}
      </div>

      <div className="rounded-lg border border-[var(--app-hairline)] bg-black/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--theme-body-dark)]">명부 확인 · 편집</p>
            <p className="mt-1 text-xs text-[var(--theme-body-muted)]">가입 허용 명부에 등록된 학번과 이름을 확인하고 수정합니다.</p>
          </div>
          <button
            type="button"
            onClick={() => { setLoadingRoster(true); loadRoster() }}
            className="shape-cut-sm border border-[var(--app-hairline)] bg-white/60 px-3 py-2 text-xs font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/80"
          >
            새로고침
          </button>
        </div>

        {loadingRoster && <p className="mt-4 text-sm text-[var(--theme-body-muted)]">명부를 불러오는 중...</p>}
        {rosterError && <p className="mt-4 shape-cut-sm bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700">{rosterError}</p>}
        {!loadingRoster && !rosterError && roster.length === 0 && (
          <p className="mt-4 text-sm text-[var(--theme-body-muted)]">등록된 명부가 없습니다.</p>
        )}
        {!loadingRoster && !rosterError && roster.length > 0 && (
          <div className="mt-4 max-h-96 overflow-auto rounded-lg border border-[var(--app-hairline)]">
            <table className="w-max min-w-full table-fixed divide-y divide-black/10 text-left text-sm">
              <colgroup>
                <col style={{ width: '136px' }} />
                <col style={{ width: '88px' }} />
                <col style={{ width: '64px' }} />
                <col style={{ width: '124px' }} />
                <col style={{ width: '88px' }} />
              </colgroup>
              <thead className="sticky top-0 bg-[var(--app-surface)] text-xs font-semibold text-[var(--theme-body-muted)]">
                <tr>
                  <th className="px-3 py-3 whitespace-nowrap">학번</th>
                  <th className="px-3 py-3 whitespace-nowrap">이름</th>
                  <th className="px-3 py-3 whitespace-nowrap">기수</th>
                  <th className="px-3 py-3 whitespace-nowrap">전화번호</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 bg-white/50">
                {roster.map((member) => (
                  <tr key={member.id}>
                    {editingId === member.id ? (
                      <td colSpan={5} className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {editForm.studentId ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-[var(--theme-body-muted)]">학번</span>
                              <input value={editForm.studentId} onChange={(e) => setEditForm((p) => ({ ...p, studentId: e.target.value }))} maxLength={10} className={`${inputCls} w-36`} />
                            </div>
                          ) : (
                            <span className="text-xs italic text-[var(--theme-body-muted)]">졸업생 (학번 없음)</span>
                          )}
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-[var(--theme-body-muted)]">이름</span>
                            <input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} maxLength={20} className={`${inputCls} w-28`} />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-[var(--theme-body-muted)]">전화번호</span>
                            <input value={editForm.phone} onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))} maxLength={11} placeholder="01012345678" className={`${inputCls} w-36`} />
                          </div>
                          <div className="flex items-end gap-2 self-end pb-px">
                            <button type="button" onClick={() => handleEditSave(member.id)} disabled={editSaving} className="shape-cut-sm bg-[var(--app-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--app-accent-hover)] disabled:opacity-50">저장</button>
                            <button type="button" onClick={() => setEditingId(null)} className="text-xs font-semibold text-[var(--theme-body-muted)] hover:underline">취소</button>
                          </div>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="px-3 py-3 font-mono text-xs text-[var(--theme-body-dark)]">{member.studentId || '-'}</td>
                        <td className="px-3 py-3 font-semibold text-[var(--theme-body-dark)]">{member.name}</td>
                        <td className="px-3 py-3 text-xs text-[var(--theme-body-muted)]">{member.generation ? `${member.generation}기` : '-'}</td>
                        <td className="px-3 py-3 text-xs text-[var(--theme-body-muted)]">{member.phone || '-'}</td>
                        <td className="px-3 py-3">
                          <div className="flex gap-3">
                            <button type="button" onClick={() => startEdit(member)} className="text-xs font-semibold text-blue-500 hover:underline">편집</button>
                            <button type="button" onClick={() => handleDelete(member)} className="text-xs font-semibold text-red-500 hover:underline">삭제</button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-[var(--app-hairline)] bg-black/5 p-4">
        <p className="text-sm font-semibold text-[var(--theme-body-dark)]">명부 일괄 업로드</p>
        <p className="mt-2 text-sm leading-6 text-[var(--theme-body-muted)]">
          엑셀(.xlsx) 또는 구글 폼 CSV를 업로드하면 회원가입 시 학번·이름을 대조합니다.
          전화번호 열이 있으면 저장해 관리자가 확인할 수 있습니다. 기수는 학번에서 자동 계산됩니다.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          onChange={handleUpload}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="mt-3 shape-cut-sm border border-[var(--app-hairline)] bg-white/60 px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/80 disabled:opacity-50"
        >
          {uploading ? '명부 가져오는 중...' : '명부 업로드 (.xlsx / .csv)'}
        </button>

        {result && (
          <p className="mt-3 shape-cut-sm bg-[var(--app-accent-soft)] px-4 py-3 text-sm font-semibold text-[var(--app-accent-text)]">
            {result.message} 가져온 행: {result.imported}, 건너뜀: {result.skipped}
          </p>
        )}
        {error && (
          <p className="mt-3 shape-cut-sm bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}

function MembersTab({ currentUser }) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    let mounted = true
    listMembers()
      .then((data) => { if (mounted) setMembers(data) })
      .catch((err) => { if (mounted) setError(err.message || '회원 목록을 불러오지 못했습니다.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const handleRoleUpdate = async (member) => {
    const newRole = member.role === 'ADMIN' ? 'USER' : 'ADMIN'
    try {
      const updated = await updateMemberRole(member.id, newRole)
      setMembers((prev) => prev.map((m) => (m.id === member.id ? updated : m)))
    } catch (err) {
      alert(err.message || '역할 변경 중 오류가 발생했습니다.')
    }
  }

  const handleDelete = async (member) => {
    if (!window.confirm(`${member.name} 회원을 삭제하시겠습니까?`)) return
    try {
      await deleteMember(member.id)
      setMembers((prev) => prev.filter((m) => m.id !== member.id))
    } catch (err) {
      alert(err.message || '삭제 중 오류가 발생했습니다.')
    }
  }

  const handlePasswordReset = async (member) => {
    const newPassword = window.prompt(`${member.name} (${member.studentId}) 회원의 새 임시 비밀번호를 입력하세요.\n(관리자 초기화는 공백만 입력할 수 없습니다.)`)
    if (!newPassword) return
    try {
      await resetMemberPassword(member.id, newPassword)
      alert('비밀번호가 초기화되었습니다.')
    } catch (err) {
      alert(err.message || '비밀번호 초기화 중 오류가 발생했습니다.')
    }
  }

  if (loading) return <p className="text-sm text-[var(--theme-body-muted)]">불러오는 중...</p>
  if (error) return <p className="text-sm text-red-500">{error}</p>
  if (members.length === 0) return <p className="text-sm text-[var(--theme-body-muted)]">회원이 없습니다.</p>

  return (
    <div className="space-y-2">
      {members.map((member) => {
        const isSelf = member.studentId === currentUser.studentId
        const isExpanded = expanded === member.id
        const interests = parseInterests(member.interests)
        const hasExtra = member.aspiration || interests.length > 0

        return (
          <div key={member.id} className="shape-cut-sm border border-[var(--app-hairline)] bg-black/5">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[var(--theme-body-dark)]">{member.name}</span>
                  <span className="text-xs text-[var(--theme-body-muted)]">{member.studentId}</span>
                  {member.role === 'ADMIN' && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-700">관리자</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-[var(--theme-body-muted)]">
                  {member.email}
                  {member.emailVerified ? ' · 이메일 인증' : ' · 이메일 미인증'}
                  {member.phone && ` · ${member.phone}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {hasExtra && (
                  <button
                    type="button"
                    onClick={() => setExpanded(isExpanded ? null : member.id)}
                    className="text-xs font-semibold text-blue-500 transition hover:underline"
                  >
                    {isExpanded ? '접기' : '상세'}
                  </button>
                )}
                {!isSelf && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleRoleUpdate(member)}
                      className="text-xs font-semibold text-blue-500 transition hover:underline"
                    >
                      {member.role === 'ADMIN' ? '일반 회원으로' : '관리자 지정'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePasswordReset(member)}
                      className="text-xs font-semibold text-amber-600 transition hover:underline"
                    >
                      비번 초기화
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(member)}
                      className="text-xs font-semibold text-red-500 transition hover:underline"
                    >
                      삭제
                    </button>
                  </>
                )}
              </div>
            </div>

            {isExpanded && hasExtra && (
              <div className="border-t border-[var(--app-hairline)] px-4 py-3 space-y-2 bg-black/3">
                {interests.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-[var(--theme-body-muted)] uppercase tracking-wide">관심 분야</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {interests.map((item) => (
                        <span key={item} className="rounded bg-black/8 px-2 py-0.5 text-xs font-semibold text-[var(--theme-body-dark)]">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {member.aspiration && (
                  <div>
                    <p className="text-xs font-semibold text-[var(--theme-body-muted)] uppercase tracking-wide">포부</p>
                    <p className="mt-1 text-sm leading-6 text-[var(--theme-body-dark)] whitespace-pre-wrap">{member.aspiration}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const ADMIN_INPUT_CLASS = 'shape-cut-sm border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-sm text-[var(--theme-body-dark)] outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/50'

function ActivitiesAdminTab() {
  const imageInputRef = useRef(null)
  const filesInputRef = useRef(null)
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState({
    kind: 'ACTIVITY',
    category: '',
    title: '',
    description: '',
    eventDate: '',
    image: null,
    images: [],
    files: [],
  })

  const loadActivities = () => {
    setError('')
    listClubActivities()
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message || '활동 기록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }

  const loadCategories = () => {
    listClubActivityCategories()
      .then((data) => {
        const list = Array.isArray(data) ? data : []
        setCategories(list)
        setForm((prev) => (prev.category || list.length === 0 ? prev : { ...prev, category: list[0].key }))
      })
      .catch(() => {})
  }

  useEffect(() => {
    let mounted = true
    Promise.all([listClubActivities(), listClubActivityCategories()])
      .then(([activityData, categoryData]) => {
        if (!mounted) return
        setItems(Array.isArray(activityData) ? activityData : [])
        const list = Array.isArray(categoryData) ? categoryData : []
        setCategories(list)
        setForm((prev) => (prev.category || list.length === 0 ? prev : { ...prev, category: list[0].key }))
      })
      .catch((err) => { if (mounted) setError(err.message || '활동 기록을 불러오지 못했습니다.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const submit = async (event) => {
    event.preventDefault()
    if (!form.title.trim() || !form.eventDate) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const created = await createClubActivity({
        kind: form.kind,
        category: form.category,
        title: form.title.trim(),
        description: form.description.trim(),
        eventDate: form.eventDate,
        image: form.image,
      })
      if (form.kind === 'ACTIVITY' && form.images.length > 0) {
        await uploadClubActivityImages(created.id, form.images)
      }
      if (form.kind === 'ACTIVITY' && form.files.length > 0) {
        for (const file of form.files) {
          await uploadClubActivityFile(created.id, file)
        }
      }
      // Re-fetch the list so the new media counts are reflected.
      if (form.images.length > 0 || form.files.length > 0) {
        const refreshed = await listClubActivities()
        setItems(Array.isArray(refreshed) ? refreshed : [])
      } else {
        setItems((prev) => [created, ...prev])
      }
      setNotice('활동 기록을 등록했습니다.')
      event.currentTarget.reset()
      if (imageInputRef.current) imageInputRef.current.value = ''
      if (filesInputRef.current) filesInputRef.current.value = ''
      setForm((prev) => ({ ...prev, title: '', description: '', eventDate: '', image: null, images: [], files: [] }))
    } catch (err) {
      setError(err.message || '활동 기록 등록 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item) => {
    if (!window.confirm(`${item.title} 기록을 삭제하시겠습니까?`)) return
    try {
      await deleteClubActivity(item.id)
      setItems((prev) => prev.filter((entry) => entry.id !== item.id))
    } catch (err) {
      alert(err.message || '활동 기록을 삭제하지 못했습니다.')
    }
  }

  const handleUpdated = (updated) => {
    setItems((prev) => prev.map((entry) => (entry.id === updated.id ? { ...entry, ...updated } : entry)))
  }

  const inputClass = ADMIN_INPUT_CLASS

  return (
    <div className="space-y-8">
      <ClubActivityCategoriesAdmin
        categories={categories}
        onChanged={() => { loadCategories(); loadActivities() }}
      />

      <form onSubmit={submit} className="rounded-lg border border-[var(--app-hairline)] bg-black/5 p-4">
        <p className="text-sm font-semibold text-[var(--theme-body-dark)]">활동 기록 등록</p>
        <p className="mt-1 text-xs leading-5 text-[var(--theme-body-muted)]">회원에게만 보이는 실제 활동 기록과 일정을 등록합니다. 사진 여러 장과 파일 첨부를 함께 올릴 수 있습니다.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            활동 제목
            <input
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              maxLength={120}
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            활동 날짜
            <input
              type="date"
              value={form.eventDate}
              onChange={(event) => setForm((prev) => ({ ...prev, eventDate: event.target.value }))}
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            활동 종류
            <select
              value={form.kind}
              onChange={(event) => {
                if (event.target.value === 'SCHEDULE') {
                  if (imageInputRef.current) imageInputRef.current.value = ''
                  if (filesInputRef.current) filesInputRef.current.value = ''
                }
                setForm((prev) => ({
                  ...prev,
                  kind: event.target.value,
                  image: event.target.value === 'SCHEDULE' ? null : prev.image,
                  images: event.target.value === 'SCHEDULE' ? [] : prev.images,
                  files: event.target.value === 'SCHEDULE' ? [] : prev.files,
                }))
              }}
              className={inputClass}
            >
              <option value="ACTIVITY">활동 기록</option>
              <option value="SCHEDULE">일정</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            활동 분류
            <select
              value={form.category}
              onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
              className={inputClass}
            >
              {categories.map((category) => (
                <option key={category.key} value={category.key}>{category.name}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)] md:col-span-2">
            활동 내용
            <textarea
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              rows={4}
              className={inputClass}
            />
          </label>
          {form.kind === 'ACTIVITY' && (
            <>
              <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)] md:col-span-2">
                활동 사진 (여러 장 선택 가능)
                <input
                  ref={imageInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={(event) => setForm((prev) => ({ ...prev, images: Array.from(event.target.files || []) }))}
                  className="text-sm text-[var(--theme-body-dark)]"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)] md:col-span-2">
                파일 첨부 (여러 개 선택 가능)
                <input
                  ref={filesInputRef}
                  type="file"
                  multiple
                  onChange={(event) => setForm((prev) => ({ ...prev, files: Array.from(event.target.files || []) }))}
                  className="text-sm text-[var(--theme-body-dark)]"
                />
              </label>
            </>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={saving || !form.title.trim() || !form.eventDate}
            className="shape-cut-sm bg-[var(--theme-text)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] disabled:opacity-50"
          >
            {saving ? '등록 중...' : '활동 등록'}
          </button>
          <button
            type="button"
            onClick={() => { setLoading(true); loadActivities() }}
            className="shape-cut-sm border border-[var(--app-hairline)] bg-white/60 px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/80"
          >
            새로고침
          </button>
        </div>
        {notice && <p className="mt-2 text-xs font-semibold text-[var(--app-accent-text)]">{notice}</p>}
        {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
      </form>

      {loading ? (
        <p className="text-sm text-[var(--theme-body-muted)]">활동 기록을 불러오는 중...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--theme-body-muted)]">등록된 활동 기록이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <ActivityAdminRow
              key={item.id}
              item={item}
              categories={categories}
              onDelete={handleDelete}
              onUpdated={handleUpdated}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Inline editor + media manager for a single activity record.
function ActivityAdminRow({ item, categories, onDelete, onUpdated }) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rowError, setRowError] = useState('')
  const [draft, setDraft] = useState({
    category: item.category,
    title: item.title,
    description: item.description || '',
    eventDate: item.eventDate || '',
  })
  const imageInputRef = useRef(null)
  const fileInputRef = useRef(null)

  const startEdit = () => {
    setDraft({
      category: item.category,
      title: item.title,
      description: item.description || '',
      eventDate: item.eventDate || '',
    })
    setRowError('')
    setEditing(true)
  }

  const saveEdit = async () => {
    if (!draft.title.trim() || !draft.eventDate) return
    setBusy(true)
    setRowError('')
    try {
      const updated = await updateClubActivity(item.id, {
        category: draft.category,
        title: draft.title.trim(),
        description: draft.description,
        eventDate: draft.eventDate,
      })
      onUpdated(updated)
      setEditing(false)
    } catch (err) {
      setRowError(err.message || '활동 기록을 수정하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const refreshFromServer = async () => {
    const list = await listClubActivities()
    const refreshed = (Array.isArray(list) ? list : []).find((entry) => entry.id === item.id)
    if (refreshed) onUpdated(refreshed)
  }

  const addImages = async (event) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return
    setBusy(true)
    setRowError('')
    try {
      await uploadClubActivityImages(item.id, files)
      await refreshFromServer()
    } catch (err) {
      setRowError(err.message || '사진을 추가하지 못했습니다.')
    } finally {
      setBusy(false)
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  const addFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true)
    setRowError('')
    try {
      await uploadClubActivityFile(item.id, file)
      await refreshFromServer()
    } catch (err) {
      setRowError(err.message || '파일을 추가하지 못했습니다.')
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeImage = async (imageId) => {
    setBusy(true)
    setRowError('')
    try {
      await deleteClubActivityImage(item.id, imageId)
      await refreshFromServer()
    } catch (err) {
      setRowError(err.message || '사진을 삭제하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const removeFile = async (fileId) => {
    setBusy(true)
    setRowError('')
    try {
      await deleteClubActivityFile(item.id, fileId)
      await refreshFromServer()
    } catch (err) {
      setRowError(err.message || '파일을 삭제하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const categoryName = categories.find((category) => category.key === item.category)?.name || item.categoryName || item.category
  const isActivity = item.kind !== 'SCHEDULE'

  return (
    <article className="shape-cut-sm border border-[var(--app-hairline)] bg-black/5 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-[var(--theme-body-dark)]">{item.title}</p>
          <p className="text-xs text-[var(--theme-body-muted)]">
            {item.kind === 'SCHEDULE' ? '일정' : '활동'} · {categoryName} · {item.eventDate}
            {(item.imageInfos?.length ?? 0) > 0 && ` · 사진 ${item.imageInfos.length}장`}
            {(item.fileInfos?.length ?? 0) > 0 && ` · 첨부 ${item.fileInfos.length}개`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => (editing ? setEditing(false) : startEdit())}
            className="text-xs font-semibold text-[var(--app-accent-text)] transition hover:underline"
          >
            {editing ? '닫기' : '수정'}
          </button>
          <button
            type="button"
            onClick={() => onDelete(item)}
            className="text-xs font-semibold text-red-500 transition hover:underline"
          >
            삭제
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-3 grid gap-3 border-t border-[var(--app-hairline)] pt-3 md:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            활동 제목
            <input
              value={draft.title}
              onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
              maxLength={120}
              className={ADMIN_INPUT_CLASS}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            활동 날짜
            <input
              type="date"
              value={draft.eventDate}
              onChange={(event) => setDraft((prev) => ({ ...prev, eventDate: event.target.value }))}
              className={ADMIN_INPUT_CLASS}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            활동 분류
            <select
              value={draft.category}
              onChange={(event) => setDraft((prev) => ({ ...prev, category: event.target.value }))}
              className={ADMIN_INPUT_CLASS}
            >
              {categories.map((category) => (
                <option key={category.key} value={category.key}>{category.name}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)] md:col-span-2">
            활동 내용
            <textarea
              value={draft.description}
              onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
              rows={4}
              className={ADMIN_INPUT_CLASS}
            />
          </label>

          {isActivity && (
            <div className="md:col-span-2">
              <p className="text-xs font-semibold text-[var(--theme-body-muted)]">사진</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(item.imageInfos || []).map((image) => (
                  <div key={image.id} className="relative">
                    <img src={image.url} alt="" className="h-16 w-16 rounded object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(image.id)}
                      disabled={busy}
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white disabled:opacity-50"
                      aria-label="사진 삭제"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <input
                ref={imageInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={addImages}
                disabled={busy}
                className="mt-2 text-sm text-[var(--theme-body-dark)]"
              />
            </div>
          )}

          {isActivity && (
            <div className="md:col-span-2">
              <p className="text-xs font-semibold text-[var(--theme-body-muted)]">파일 첨부</p>
              <ul className="mt-2 flex flex-col gap-1">
                {(item.fileInfos || []).map((file) => (
                  <li key={file.id} className="flex items-center gap-2 text-xs">
                    <a href={file.url} className="font-semibold text-[var(--app-accent-text)] hover:underline">{file.originalName || '첨부파일'}</a>
                    <button
                      type="button"
                      onClick={() => removeFile(file.id)}
                      disabled={busy}
                      className="font-semibold text-red-500 hover:underline disabled:opacity-50"
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
              <input
                ref={fileInputRef}
                type="file"
                onChange={addFile}
                disabled={busy}
                className="mt-2 text-sm text-[var(--theme-body-dark)]"
              />
            </div>
          )}

          {rowError && <p className="text-xs font-semibold text-red-600 md:col-span-2">{rowError}</p>}

          <div className="flex items-center gap-2 md:col-span-2">
            <button
              type="button"
              onClick={saveEdit}
              disabled={busy || !draft.title.trim() || !draft.eventDate}
              className="shape-cut-sm bg-[var(--theme-text)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] disabled:opacity-50"
            >
              {busy ? '저장 중...' : '변경 저장'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="shape-cut-sm border border-[var(--app-hairline)] bg-white/60 px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)]"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </article>
  )
}

// Admin CRUD for the DB-backed activity categories.
function ClubActivityCategoriesAdmin({ categories, onChanged }) {
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')

  const addCategory = async (event) => {
    event.preventDefault()
    if (!newName.trim()) return
    setBusy(true)
    setError('')
    try {
      await createClubActivityCategory({ name: newName.trim() })
      setNewName('')
      onChanged()
    } catch (err) {
      setError(err.message || '분류를 추가하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const saveRename = async (category) => {
    if (!editName.trim()) return
    setBusy(true)
    setError('')
    try {
      await updateClubActivityCategory(category.id, { name: editName.trim() })
      setEditingId(null)
      setEditName('')
      onChanged()
    } catch (err) {
      setError(err.message || '분류를 수정하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const removeCategory = async (category) => {
    if (!window.confirm(`'${category.name}' 분류를 삭제하시겠습니까?`)) return
    setBusy(true)
    setError('')
    try {
      await deleteClubActivityCategory(category.id)
      onChanged()
    } catch (err) {
      setError(err.message || '분류를 삭제하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-[var(--app-hairline)] bg-black/5 p-4">
      <p className="text-sm font-semibold text-[var(--theme-body-dark)]">활동 분류 관리</p>
      <p className="mt-1 text-xs leading-5 text-[var(--theme-body-muted)]">활동 분류를 추가, 이름 변경, 삭제할 수 있습니다. 사용 중인 분류는 삭제할 수 없습니다.</p>

      <form onSubmit={addCategory} className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          maxLength={60}
          placeholder="새 분류 이름"
          className={ADMIN_INPUT_CLASS}
        />
        <button
          type="submit"
          disabled={busy || !newName.trim()}
          className="shape-cut-sm bg-[var(--theme-text)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] disabled:opacity-50"
        >
          분류 추가
        </button>
      </form>

      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}

      <ul className="mt-3 flex flex-col gap-2">
        {categories.map((category) => (
          <li key={category.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--app-hairline)] bg-white/60 px-3 py-2">
            {editingId === category.id ? (
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  maxLength={60}
                  className={ADMIN_INPUT_CLASS}
                />
                <button
                  type="button"
                  onClick={() => saveRename(category)}
                  disabled={busy || !editName.trim()}
                  className="text-xs font-semibold text-[var(--app-accent-text)] hover:underline disabled:opacity-50"
                >
                  저장
                </button>
                <button
                  type="button"
                  onClick={() => { setEditingId(null); setEditName('') }}
                  className="text-xs font-semibold text-[var(--theme-body-muted)] hover:underline"
                >
                  취소
                </button>
              </div>
            ) : (
              <>
                <div className="text-sm text-[var(--theme-body-dark)]">
                  <span className="font-semibold">{category.name}</span>
                  <span className="ml-2 text-xs text-[var(--theme-body-muted)]">{category.key} · 사용 {category.activityCount ?? 0}건</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => { setEditingId(category.id); setEditName(category.name) }}
                    className="text-xs font-semibold text-[var(--app-accent-text)] hover:underline"
                  >
                    이름 변경
                  </button>
                  <button
                    type="button"
                    onClick={() => removeCategory(category)}
                    disabled={busy}
                    className="text-xs font-semibold text-red-500 hover:underline disabled:opacity-50"
                  >
                    삭제
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Club projects (동아리 부원들이 만든 프로젝트 모음) admin ────────────────────────

function ClubProjectsAdminTab() {
  const fileInputRef = useRef(null)
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState({
    category: '',
    title: '',
    eyebrow: '',
    description: '',
    madeBy: '최준혁',
    linkUrl: '',
    displayUrl: '',
    files: [],
  })

  const loadProjects = () => {
    setError('')
    listClubProjects()
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message || 'Apps 항목을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }

  const loadCategories = () => {
    listClubProjectCategories()
      .then((data) => {
        const list = Array.isArray(data) ? data : []
        setCategories(list)
        setForm((prev) => (prev.category || list.length === 0 ? prev : { ...prev, category: list[0].key }))
      })
      .catch(() => {})
  }

  useEffect(() => {
    let mounted = true
    Promise.all([listClubProjects(), listClubProjectCategories()])
      .then(([projectData, categoryData]) => {
        if (!mounted) return
        setItems(Array.isArray(projectData) ? projectData : [])
        const list = Array.isArray(categoryData) ? categoryData : []
        setCategories(list)
        setForm((prev) => (prev.category || list.length === 0 ? prev : { ...prev, category: list[0].key }))
      })
      .catch((err) => { if (mounted) setError(err.message || 'Apps 항목을 불러오지 못했습니다.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const submit = async (event) => {
    event.preventDefault()
    if (!form.title.trim() || !form.category) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const created = await createClubProject({
        category: form.category,
        title: form.title.trim(),
        eyebrow: form.eyebrow.trim(),
        description: form.description.trim(),
        madeBy: form.madeBy.trim() || '최준혁',
        linkUrl: form.linkUrl.trim(),
        displayUrl: form.displayUrl.trim(),
      })
      if (form.files.length > 0) {
        for (const file of form.files) {
          await uploadClubProjectFile(created.id, file)
        }
        const refreshed = await listClubProjects()
        setItems(Array.isArray(refreshed) ? refreshed : [])
      } else {
        setItems((prev) => [...prev, created])
      }
      setNotice('Apps 항목을 등록했습니다.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      setForm((prev) => ({ ...prev, title: '', eyebrow: '', description: '', linkUrl: '', displayUrl: '', files: [] }))
    } catch (err) {
      setError(err.message || 'Apps 항목 등록 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item) => {
    if (!window.confirm(`${item.title} Apps 항목을 삭제하시겠습니까?`)) return
    try {
      await deleteClubProject(item.id)
      setItems((prev) => prev.filter((entry) => entry.id !== item.id))
    } catch (err) {
      alert(err.message || 'Apps 항목을 삭제하지 못했습니다.')
    }
  }

  const handleUpdated = (updated) => {
    setItems((prev) => prev.map((entry) => (entry.id === updated.id ? { ...entry, ...updated } : entry)))
  }

  const draftCategoryName = categories.find((category) => category.key === form.category)?.name || form.category
  const draftProject = {
    id: 'draft',
    category: form.category,
    categoryName: draftCategoryName,
    title: form.title.trim(),
    eyebrow: form.eyebrow.trim(),
    description: form.description.trim(),
    madeBy: form.madeBy.trim() || '최준혁',
    linkUrl: form.linkUrl.trim(),
    displayUrl: form.displayUrl.trim(),
    files: form.files.map((file, index) => ({
      id: `draft-file-${index}`,
      url: '#',
      originalName: file.name,
      fileSize: file.size,
    })),
  }

  return (
    <div className="space-y-8">
      <ClubProjectCategoriesAdmin
        categories={categories}
        onChanged={() => { loadCategories(); loadProjects() }}
      />

      <form onSubmit={submit} className="rounded-lg border border-[var(--app-hairline)] bg-black/5 p-4">
        <p className="text-sm font-semibold text-[var(--theme-body-dark)]">Apps 항목 등록</p>
        <p className="mt-1 text-xs leading-5 text-[var(--theme-body-muted)]">COM&apos;s Apps에 노출할 웹사이트·앱·게임을 등록합니다. 외부 링크와 배포 파일(apk/zip)을 함께 또는 따로 추가할 수 있습니다.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            제목
            <input
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              maxLength={120}
              className={ADMIN_INPUT_CLASS}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            분류
            <select
              value={form.category}
              onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
              className={ADMIN_INPUT_CLASS}
            >
              {categories.map((category) => (
                <option key={category.key} value={category.key}>{category.name}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            짧은 태그 (선택)
            <input
              value={form.eyebrow}
              onChange={(event) => setForm((prev) => ({ ...prev, eyebrow: event.target.value }))}
              maxLength={60}
              placeholder="예: Worldcup"
              className={ADMIN_INPUT_CLASS}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            만든 사람
            <input
              value={form.madeBy}
              onChange={(event) => setForm((prev) => ({ ...prev, madeBy: event.target.value }))}
              maxLength={100}
              className={ADMIN_INPUT_CLASS}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            링크 URL (선택)
            <input
              value={form.linkUrl}
              onChange={(event) => setForm((prev) => ({ ...prev, linkUrl: event.target.value }))}
              maxLength={500}
              placeholder="https://..."
              className={ADMIN_INPUT_CLASS}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            표시 주소 (선택)
            <input
              value={form.displayUrl}
              onChange={(event) => setForm((prev) => ({ ...prev, displayUrl: event.target.value }))}
              maxLength={255}
              placeholder="예: coms.kw.ac.kr/worldcup"
              className={ADMIN_INPUT_CLASS}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)] md:col-span-2">
            설명
            <textarea
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              rows={3}
              className={ADMIN_INPUT_CLASS}
            />
          </label>
          <div className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)] md:col-span-2">
            <span>배포 파일 (apk/zip 등, 여러 개 선택 가능)</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="shape-cut-sm inline-flex items-center gap-2 border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white"
              >
                <Upload size={14} aria-hidden="true" />
                파일 선택
              </button>
              <span className="text-xs font-semibold text-[var(--theme-body-muted)]">
                {form.files.length > 0 ? `${form.files.length}개 선택됨` : '선택된 파일 없음'}
              </span>
            </div>
            <input
              ref={fileInputRef}
              aria-label="배포 파일 (apk/zip 등, 여러 개 선택 가능)"
              type="file"
              multiple
              onChange={(event) => setForm((prev) => ({ ...prev, files: Array.from(event.target.files || []) }))}
              className="hidden"
            />
          </div>
          {form.files.length > 0 && (
            <div className="rounded-lg border border-[var(--app-hairline)] bg-white/60 p-3 md:col-span-2" aria-label="선택한 Apps 배포 파일">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold text-[var(--theme-body-dark)]">선택한 파일 {form.files.length}개</p>
                <button
                  type="button"
                  onClick={() => {
                    setForm((prev) => ({ ...prev, files: [] }))
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  className="text-xs font-semibold text-red-500 hover:underline"
                >
                  전체 삭제
                </button>
              </div>
              <ul className="mt-2 grid gap-1">
                {form.files.map((file, index) => (
                  <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`} className="flex min-w-0 items-center justify-between gap-2 rounded border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-xs">
                    <span className="min-w-0 truncate font-semibold text-[var(--theme-body-dark)]">{file.name}</span>
                    <span className="shrink-0 text-[var(--theme-body-muted)]">{formatFileSize(file.size)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="mt-4 rounded-lg border border-[var(--app-hairline)] bg-white/60 p-3">
          <p className="text-xs font-bold text-[var(--theme-body-dark)]">공개 카드 미리보기</p>
          <p className="mt-1 text-xs leading-5 text-[var(--theme-body-muted)]">Apps 페이지와 같은 카드 형태로 노출 상태를 확인합니다.</p>
          <AppProjectCard
            project={draftProject}
            showStatusBadges
            interactive={false}
            testId="admin-app-preview-draft"
            className="mt-3"
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={saving || !form.title.trim() || !form.category}
            className="shape-cut-sm bg-[var(--theme-text)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] disabled:opacity-50"
          >
            {saving ? '등록 중...' : 'Apps 항목 등록'}
          </button>
          <button
            type="button"
            onClick={() => { setLoading(true); loadProjects() }}
            className="shape-cut-sm border border-[var(--app-hairline)] bg-white/60 px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/80"
          >
            새로고침
          </button>
        </div>
        {notice && <p className="mt-2 text-xs font-semibold text-[var(--app-accent-text)]">{notice}</p>}
        {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
      </form>

      {loading ? (
        <p className="text-sm text-[var(--theme-body-muted)]">Apps 항목을 불러오는 중...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--theme-body-muted)]">등록된 Apps 항목이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <ClubProjectAdminRow
              key={item.id}
              item={item}
              categories={categories}
              onDelete={handleDelete}
              onUpdated={handleUpdated}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ClubProjectAdminRow({ item, categories, onDelete, onUpdated }) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rowError, setRowError] = useState('')
  const fileInputRef = useRef(null)
  const [draft, setDraft] = useState({
    category: item.category,
    title: item.title,
    eyebrow: item.eyebrow || '',
    description: item.description || '',
    madeBy: item.madeBy || '최준혁',
    linkUrl: item.linkUrl || '',
    displayUrl: item.displayUrl || '',
  })

  const startEdit = () => {
    setDraft({
      category: item.category,
      title: item.title,
      eyebrow: item.eyebrow || '',
      description: item.description || '',
      madeBy: item.madeBy || '최준혁',
      linkUrl: item.linkUrl || '',
      displayUrl: item.displayUrl || '',
    })
    setRowError('')
    setEditing(true)
  }

  const saveEdit = async () => {
    if (!draft.title.trim() || !draft.category) return
    setBusy(true)
    setRowError('')
    try {
      const updated = await updateClubProject(item.id, {
        category: draft.category,
        title: draft.title.trim(),
        eyebrow: draft.eyebrow,
        description: draft.description,
        madeBy: draft.madeBy.trim() || '최준혁',
        linkUrl: draft.linkUrl,
        displayUrl: draft.displayUrl,
      })
      onUpdated(updated)
      setEditing(false)
    } catch (err) {
      setRowError(err.message || 'Apps 항목을 수정하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const refreshFromServer = async () => {
    const list = await listClubProjects()
    const refreshed = (Array.isArray(list) ? list : []).find((entry) => entry.id === item.id)
    if (refreshed) onUpdated(refreshed)
  }

  const addFile = async (event) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return
    setBusy(true)
    setRowError('')
    try {
      for (const file of files) {
        await uploadClubProjectFile(item.id, file)
      }
      await refreshFromServer()
    } catch (err) {
      setRowError(err.message || '파일을 추가하지 못했습니다.')
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeFile = async (fileId) => {
    setBusy(true)
    setRowError('')
    try {
      await deleteClubProjectFile(item.id, fileId)
      await refreshFromServer()
    } catch (err) {
      setRowError(err.message || '파일을 삭제하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const categoryName = categories.find((category) => category.key === item.category)?.name || item.categoryName || item.category

  return (
    <article className="shape-cut-sm border border-[var(--app-hairline)] bg-black/5 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-[var(--theme-body-dark)]">{item.title}</p>
          <p className="text-xs text-[var(--theme-body-muted)]">
            {categoryName} · 만든 사람 {item.madeBy || '최준혁'}
            {item.linkUrl && ' · 링크 있음'}
            {(item.files?.length ?? 0) > 0 && ` · 파일 ${item.files.length}개`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => (editing ? setEditing(false) : startEdit())}
            className="text-xs font-semibold text-[var(--app-accent-text)] transition hover:underline"
          >
            {editing ? '닫기' : '수정'}
          </button>
          <button
            type="button"
            onClick={() => onDelete(item)}
            className="text-xs font-semibold text-red-500 transition hover:underline"
          >
            삭제
          </button>
        </div>
      </div>

      <div className="mt-3" data-testid={`admin-app-preview-${item.id}`}>
        <AppProjectCard
          project={{ ...item, categoryName }}
          showStatusBadges
          interactive={false}
          className="min-h-0"
        />
      </div>

      {editing && (
        <div className="mt-3 grid gap-3 border-t border-[var(--app-hairline)] pt-3 md:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            제목
            <input
              value={draft.title}
              onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
              maxLength={120}
              className={ADMIN_INPUT_CLASS}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            분류
            <select
              value={draft.category}
              onChange={(event) => setDraft((prev) => ({ ...prev, category: event.target.value }))}
              className={ADMIN_INPUT_CLASS}
            >
              {categories.map((category) => (
                <option key={category.key} value={category.key}>{category.name}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            짧은 태그
            <input
              value={draft.eyebrow}
              onChange={(event) => setDraft((prev) => ({ ...prev, eyebrow: event.target.value }))}
              maxLength={60}
              className={ADMIN_INPUT_CLASS}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            만든 사람
            <input
              value={draft.madeBy}
              onChange={(event) => setDraft((prev) => ({ ...prev, madeBy: event.target.value }))}
              maxLength={100}
              className={ADMIN_INPUT_CLASS}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            링크 URL
            <input
              value={draft.linkUrl}
              onChange={(event) => setDraft((prev) => ({ ...prev, linkUrl: event.target.value }))}
              maxLength={500}
              className={ADMIN_INPUT_CLASS}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
            표시 주소
            <input
              value={draft.displayUrl}
              onChange={(event) => setDraft((prev) => ({ ...prev, displayUrl: event.target.value }))}
              maxLength={255}
              className={ADMIN_INPUT_CLASS}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--theme-body-muted)] md:col-span-2">
            설명
            <textarea
              value={draft.description}
              onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
              rows={3}
              className={ADMIN_INPUT_CLASS}
            />
          </label>

          <div className="md:col-span-2">
            <p className="text-xs font-semibold text-[var(--theme-body-muted)]">배포 파일</p>
            <ul className="mt-2 flex flex-col gap-1">
              {(item.files || []).map((file) => (
                <li key={file.id} className="flex items-center gap-2 text-xs">
                  <a href={apiUrl(file.url)} className="font-semibold text-[var(--app-accent-text)] hover:underline">{file.originalName || '배포파일'}</a>
                  <button
                    type="button"
                    onClick={() => removeFile(file.id)}
                    disabled={busy}
                    className="font-semibold text-red-500 hover:underline disabled:opacity-50"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
            <input
              ref={fileInputRef}
              aria-label={`${item.title} 배포 파일 추가`}
              type="file"
              multiple
              onChange={addFile}
              disabled={busy}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="shape-cut-sm mt-2 inline-flex items-center gap-2 border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-xs font-semibold text-[var(--theme-body-dark)] transition hover:bg-white disabled:opacity-50"
            >
              <Upload size={13} aria-hidden="true" />
              파일 추가
            </button>
          </div>

          {rowError && <p className="text-xs font-semibold text-red-600 md:col-span-2">{rowError}</p>}

          <div className="flex items-center gap-2 md:col-span-2">
            <button
              type="button"
              onClick={saveEdit}
              disabled={busy || !draft.title.trim() || !draft.category}
              className="shape-cut-sm bg-[var(--theme-text)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] disabled:opacity-50"
            >
              {busy ? '저장 중...' : '변경 저장'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="shape-cut-sm border border-[var(--app-hairline)] bg-white/60 px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)]"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </article>
  )
}

// Admin CRUD for the DB-backed project categories.
function ClubProjectCategoriesAdmin({ categories, onChanged }) {
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')

  const addCategory = async (event) => {
    event.preventDefault()
    if (!newName.trim()) return
    setBusy(true)
    setError('')
    try {
      await createClubProjectCategory({ name: newName.trim() })
      setNewName('')
      onChanged()
    } catch (err) {
      setError(err.message || '분류를 추가하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const saveRename = async (category) => {
    if (!editName.trim()) return
    setBusy(true)
    setError('')
    try {
      await updateClubProjectCategory(category.id, { name: editName.trim() })
      setEditingId(null)
      setEditName('')
      onChanged()
    } catch (err) {
      setError(err.message || '분류를 수정하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const removeCategory = async (category) => {
    if (!window.confirm(`'${category.name}' 분류를 삭제하시겠습니까?`)) return
    setBusy(true)
    setError('')
    try {
      await deleteClubProjectCategory(category.id)
      onChanged()
    } catch (err) {
      setError(err.message || '분류를 삭제하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-[var(--app-hairline)] bg-black/5 p-4">
      <p className="text-sm font-semibold text-[var(--theme-body-dark)]">Apps 분류 관리</p>
      <p className="mt-1 text-xs leading-5 text-[var(--theme-body-muted)]">COM&apos;s Apps 분류를 추가, 이름 변경, 삭제할 수 있습니다. 사용 중인 분류는 삭제할 수 없습니다.</p>

      <form onSubmit={addCategory} className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          maxLength={60}
          placeholder="새 분류 이름"
          className={ADMIN_INPUT_CLASS}
        />
        <button
          type="submit"
          disabled={busy || !newName.trim()}
          className="shape-cut-sm bg-[var(--theme-text)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] disabled:opacity-50"
        >
          분류 추가
        </button>
      </form>

      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}

      <ul className="mt-3 flex flex-col gap-2">
        {categories.map((category) => (
          <li key={category.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--app-hairline)] bg-white/60 px-3 py-2">
            {editingId === category.id ? (
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  maxLength={60}
                  className={ADMIN_INPUT_CLASS}
                />
                <button
                  type="button"
                  onClick={() => saveRename(category)}
                  disabled={busy || !editName.trim()}
                  className="text-xs font-semibold text-[var(--app-accent-text)] hover:underline disabled:opacity-50"
                >
                  저장
                </button>
                <button
                  type="button"
                  onClick={() => { setEditingId(null); setEditName('') }}
                  className="text-xs font-semibold text-[var(--theme-body-muted)] hover:underline"
                >
                  취소
                </button>
              </div>
            ) : (
              <>
                <div className="text-sm text-[var(--theme-body-dark)]">
                  <span className="font-semibold">{category.name}</span>
                  <span className="ml-2 text-xs text-[var(--theme-body-muted)]">{category.key} · 사용 {category.projectCount ?? 0}건</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => { setEditingId(category.id); setEditName(category.name) }}
                    className="text-xs font-semibold text-[var(--app-accent-text)] hover:underline"
                  >
                    이름 변경
                  </button>
                  <button
                    type="button"
                    onClick={() => removeCategory(category)}
                    disabled={busy}
                    className="text-xs font-semibold text-red-500 hover:underline disabled:opacity-50"
                  >
                    삭제
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function FilesTab() {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  const loadFiles = () => {
    listFiles()
      .then(setFiles)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let mounted = true
    listFiles()
      .then(d => { if (mounted) setFiles(d) })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await createPost({ title: file.name, file })
      loadFiles()
    } catch (err) {
      alert(err.message || '업로드 중 오류가 발생했습니다.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('파일을 삭제하시겠습니까?')) return
    try {
      await deleteFile(id)
      setFiles((prev) => prev.filter((f) => f.id !== id))
    } catch (err) {
      alert(err.message || '삭제 중 오류가 발생했습니다.')
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="shape-cut-sm border border-[var(--app-hairline)] bg-white/60 px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/80 disabled:opacity-50"
        >
          {uploading ? '업로드 중...' : '파일 업로드'}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--theme-body-muted)]">불러오는 중...</p>
      ) : files.length === 0 ? (
        <p className="text-sm text-[var(--theme-body-muted)]">등록된 파일이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {files.map((file) => (
            <div
              key={file.id}
              className="shape-cut-sm flex items-center justify-between gap-3 border border-[var(--app-hairline)] bg-black/5 px-4 py-3"
            >
              <div>
                <p className="font-semibold text-[var(--theme-body-dark)]">{file.originalName}</p>
                <p className="text-xs text-[var(--theme-body-muted)]">
                  {file.uploadedBy} · {formatFileSize(file.fileSize)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(file.id)}
                className="text-xs font-semibold text-red-500 transition hover:underline"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FontsTab() {
  const [fonts, setFonts] = useState([])
  const [name, setName] = useState('')
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    listAdminFonts()
      .then((data) => { if (mounted) setFonts(data) })
      .catch((err) => { if (mounted) setError(err.message || '폰트 목록을 불러오지 못했습니다.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    const styleId = 'admin-font-faces'
    let styleEl = document.getElementById(styleId)
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = styleId
      document.head.appendChild(styleEl)
    }
    styleEl.textContent = buildFontFaceCss(fonts)
  }, [fonts])

  const submit = async (event) => {
    event.preventDefault()
    if (!name.trim() || !file) return
    setSaving(true)
    setError('')
    try {
      const uploaded = await uploadFont(name.trim(), file)
      setFonts((prev) => [uploaded, ...prev])
      setName('')
      setFile(null)
      event.currentTarget.reset()
    } catch (err) {
      setError(err.message || '폰트 업로드에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (font) => {
    try {
      const updated = await setFontActive(font.id, !font.active)
      setFonts((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
    } catch (err) {
      alert(err.message || '폰트 상태를 변경하지 못했습니다.')
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="rounded-lg border border-[var(--app-hairline)] bg-black/5 p-4">
        <p className="text-sm font-semibold text-[var(--theme-body-dark)]">폰트 업로드</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="폰트 이름"
            maxLength={100}
            className="shape-cut-sm border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-sm text-[var(--theme-body-dark)] outline-none"
          />
          <input
            type="file"
            accept=".woff,.woff2,.ttf,.otf,font/woff,font/woff2,font/ttf,font/otf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="text-sm text-[var(--theme-body-dark)]"
          />
          <button
            type="submit"
            disabled={saving || !name.trim() || !file}
            className="shape-cut-sm bg-[var(--theme-text)] px-4 py-2 text-sm font-semibold text-[var(--theme-bg)] disabled:opacity-50"
          >
            {saving ? '업로드 중...' : '업로드'}
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--theme-body-muted)]">woff, woff2 우선 지원. ttf, otf도 허용하며 최대 2MB입니다.</p>
        {error && <p className="mt-2 text-sm font-semibold text-red-600">{error}</p>}
      </form>

      <p className="rounded-lg border border-[var(--app-hairline)] bg-black/5 px-4 py-3 text-xs leading-5 text-[var(--theme-body-muted)]">
        활성 폰트만 사이트 폰트 선택 목록에 표시됩니다. 비활성화해도 폰트 파일과 기존 회원의 저장값은 삭제되지 않습니다.
      </p>

      {loading ? (
        <p className="text-sm text-[var(--theme-body-muted)]">폰트를 불러오는 중...</p>
      ) : fonts.length === 0 ? (
        <p className="text-sm text-[var(--theme-body-muted)]">등록된 폰트가 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {fonts.map((font) => (
            <div key={font.id} className="shape-cut-sm flex flex-wrap items-center justify-between gap-3 border border-[var(--app-hairline)] bg-black/5 px-4 py-3">
              <div>
                <p className="font-semibold text-[var(--theme-body-dark)]">{font.name}</p>
                <p className="text-xs text-[var(--theme-body-muted)]">{new Date(font.createdAt).toLocaleString('ko-KR')}</p>
                <p
                  data-testid={`admin-font-preview-${font.id}`}
                  className="mt-2 text-base text-[var(--theme-body-dark)]"
                  style={{ fontFamily: fontFamilyValue(font) }}
                >
                  한글 English 123 · 폰트 미리보기
                </p>
              </div>
              <button
                type="button"
                onClick={() => toggle(font)}
                aria-label={`${font.name} ${font.active ? '비활성화' : '활성화'}`}
                className={`shape-cut-sm px-3 py-1.5 text-xs font-bold ${font.active ? 'bg-[var(--app-accent-soft)] text-[var(--app-accent-text)]' : 'bg-black/10 text-[var(--theme-body-muted)]'}`}
              >
                {font.active ? '비활성화' : '활성화'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BanTab() {
  const [banned, setBanned] = useState([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [duration, setDuration] = useState(BAN_DURATIONS[0].value)
  const [error, setError] = useState('')

  const load = () => {
    listBannedStudents()
      .then(setBanned)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let mounted = true
    listBannedStudents()
      .then(d => { if (mounted) setBanned(d) })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const handleBan = async (e) => {
    e.preventDefault()
    const id = input.trim()
    if (!id) return
    setError('')
    try {
      await banStudent(id, duration)
      setInput('')
      await load()
    } catch (err) {
      setError(err.message || '차단 중 오류가 발생했습니다.')
    }
  }

  const handleUnban = async (studentId) => {
    if (!window.confirm(`${studentId} 차단을 해제하시겠습니까?`)) return
    try {
      await unbanStudent(studentId)
      await load()
    } catch (err) {
      alert(err.message || '해제 중 오류가 발생했습니다.')
    }
  }

  const inputCls = 'rounded border border-black/15 bg-[var(--app-surface)] px-2 py-1 text-sm outline-none focus:border-black/40'

  return (
    <div className="space-y-6">
      <form onSubmit={handleBan} className="flex flex-wrap items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="학번 10자리"
          maxLength={10}
          className={`${inputCls} w-40`}
        />
        <select
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          className={`${inputCls} w-28`}
        >
          {BAN_DURATIONS.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
        <button type="submit" className="shape-cut-sm bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
          임시 차단
        </button>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </form>

      {loading ? (
        <p className="text-sm text-[var(--theme-body-muted)]">불러오는 중...</p>
      ) : banned.length === 0 ? (
        <p className="text-sm text-[var(--theme-body-muted)]">차단된 학번이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--app-hairline)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--theme-body-muted)]">
                <th className="px-3 py-2">학번</th>
                <th className="px-3 py-2">차단일</th>
                <th className="px-3 py-2">만료</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 bg-white/50">
              {banned.map((b) => (
                <tr key={b.id}>
                  <td className="px-3 py-3 font-mono text-xs text-[var(--theme-body-dark)]">{b.studentId}</td>
                  <td className="px-3 py-3 text-xs text-[var(--theme-body-muted)]">{formatDateTime(b.bannedAt)}</td>
                  <td className="px-3 py-3 text-xs text-[var(--theme-body-muted)]">{formatDateTime(b.expiresAt)}</td>
                  <td className="px-3 py-3">
                    <button type="button" onClick={() => handleUnban(b.studentId)} className="text-xs font-semibold text-blue-500 hover:underline">
                      차단 해제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function CommunityReportsTab() {
  const [reports, setReports] = useState([])
  const [notes, setNotes] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [workingId, setWorkingId] = useState(null)

  const load = async () => {
    setError('')
    try {
      const data = await listCommunityReports()
      setReports(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || '신고 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let mounted = true
    listCommunityReports()
      .then((data) => {
        if (mounted) {
          setError('')
          setReports(Array.isArray(data) ? data : [])
        }
      })
      .catch((err) => { if (mounted) setError(err.message || '신고 목록을 불러오지 못했습니다.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const resolveReport = async (report, action) => {
    const verb = action === 'ACCEPT' ? '처리 완료' : '기각'
    if (!window.confirm(`신고 #${report.id}을 ${verb}하시겠습니까?`)) return
    setWorkingId(report.id)
    try {
      await resolveCommunityReport(report.id, { action, note: notes[report.id] || '' })
      setReports((prev) => prev.filter((item) => item.id !== report.id))
      setNotes((prev) => {
        const next = { ...prev }
        delete next[report.id]
        return next
      })
    } catch (err) {
      alert(err.message || '신고 처리 중 오류가 발생했습니다.')
    } finally {
      setWorkingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[var(--theme-body-dark)]">커뮤니티 신고 큐</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--theme-body-muted)]">
            접수된 게시글 신고를 확인하고 처리 결과와 운영 메모를 남깁니다.
          </p>
        </div>
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

      {loading && <p className="text-sm text-[var(--theme-body-muted)]">신고 목록을 불러오는 중...</p>}
      {error && <p className="shape-cut-sm bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      {!loading && !error && reports.length === 0 && (
        <p className="text-sm text-[var(--theme-body-muted)]">처리 대기 중인 신고가 없습니다.</p>
      )}
      {!loading && !error && reports.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-[var(--app-hairline)]">
          <table className="w-max min-w-full text-left text-sm">
            <thead className="bg-[var(--app-surface)] text-xs font-semibold text-[var(--theme-body-muted)]">
              <tr>
                <th className="px-3 py-3">접수</th>
                <th className="px-3 py-3">게시글</th>
                <th className="px-3 py-3">신고자</th>
                <th className="px-3 py-3">사유</th>
                <th className="px-3 py-3">상세</th>
                <th className="px-3 py-3">처리 메모</th>
                <th className="px-3 py-3">처리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 bg-white/50">
              {reports.map((report) => (
                <tr key={report.id}>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-[var(--theme-body-muted)]">{formatDateTime(report.createdAt)}</td>
                  <td className="max-w-[260px] px-3 py-3 text-xs">
                    <span className="block break-words font-semibold text-[#3b4890]">{report.postTitle || '삭제되었거나 찾을 수 없는 글'}</span>
                    <span className="mt-1 block font-mono text-[10px] text-[var(--theme-body-muted)]">#{report.postId}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-[var(--theme-body-muted)]">{report.reporterStudentId}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs font-semibold text-[var(--theme-body-dark)]">{COMMUNITY_REPORT_REASONS[report.reason] || report.reason}</td>
                  <td className="max-w-[320px] whitespace-pre-wrap break-words px-3 py-3 text-xs text-[var(--theme-body-muted)]">{report.detail || '-'}</td>
                  <td className="px-3 py-3">
                    <input
                      value={notes[report.id] || ''}
                      onChange={(event) => setNotes((prev) => ({ ...prev, [report.id]: event.target.value }))}
                      placeholder="운영 메모"
                      maxLength={500}
                      className="w-56 rounded border border-black/15 bg-[var(--app-surface)] px-2 py-1.5 text-xs outline-none focus:border-black/40"
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => resolveReport(report, 'ACCEPT')}
                        disabled={workingId !== null}
                        className="shape-cut-sm bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                      >
                        {workingId === report.id ? '처리 중...' : '처리 완료'}
                      </button>
                      <button
                        type="button"
                        onClick={() => resolveReport(report, 'REJECT')}
                        disabled={workingId !== null}
                        className="shape-cut-sm border border-[var(--app-hairline)] bg-white/70 px-3 py-1.5 text-xs font-semibold text-[var(--theme-body-dark)] transition hover:bg-[var(--app-surface)] disabled:opacity-50"
                      >
                        기각
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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

function AuditLogTab() {
  const [logs, setLogs] = useState([])
  const [limit, setLimit] = useState(1000)
  const [actionFilter, setActionFilter] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [clearingCache, setClearingCache] = useState(false)
  const [cacheMessage, setCacheMessage] = useState('')
  const [cacheError, setCacheError] = useState('')
  const normalizedSearch = searchQuery.trim().toLowerCase()
  const visibleLogs = logs.filter((log) => {
    if (actionFilter !== 'ALL' && log.action !== actionFilter) return false
    if (!normalizedSearch) return true
    return auditLogSearchText(log).includes(normalizedSearch)
  })

  const load = async (requestedLimit = limit) => {
    setError('')
    try {
      const data = await listAuditLogs(requestedLimit)
      setLogs(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || '로그를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let mounted = true
    listAuditLogs(limit)
      .then((data) => {
        if (mounted) {
          setError('')
          setLogs(Array.isArray(data) ? data : [])
        }
      })
      .catch((err) => { if (mounted) setError(err.message || '로그를 불러오지 못했습니다.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [limit])

  const handleClearCache = async () => {
    setClearingCache(true)
    setCacheMessage('')
    setCacheError('')
    try {
      const response = await clearAdminCache()
      const count = Number(response?.clearedCount || 0)
      setCacheMessage(`캐시 ${count}개를 초기화했습니다.`)
      setLoading(true)
      await load(limit)
    } catch (err) {
      setCacheError(err.message || '캐시 초기화에 실패했습니다.')
    } finally {
      setClearingCache(false)
    }
  }

  const exportVisibleLogs = () => {
    if (visibleLogs.length === 0) return
    const headers = ['createdAt', 'actorName', 'actorStudentId', 'action', 'targetType', 'targetId', 'ipAddress', 'detail']
    const rows = visibleLogs.map((log) => headers.map((key) => csvCell(log[key] || '')).join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `coms-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--theme-body-dark)]">서버 감사 로그</p>
          <p className="mt-1 text-xs leading-5 text-[var(--theme-body-muted)]">로그인, 관리자 로그인, 커뮤니티 글/댓글/추천/비추천, 공지사항, 관리자 주요 작업을 최근 {limit.toLocaleString('ko-KR')}건까지 봅니다. 커뮤니티 삭제 로그는 삭제한 관리자와 삭제된 글 스냅샷을 함께 표시합니다.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-[var(--theme-body-muted)]">
            <span>종류</span>
            <select
              aria-label="로그 종류"
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value)}
              className="shape-cut-sm border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-xs font-semibold text-[var(--theme-body-dark)] outline-none transition focus:border-black/30"
            >
              {AUDIT_LOG_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="사용자, 행위, 상세 검색"
            className="shape-cut-sm w-48 border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-xs font-semibold text-[var(--theme-body-dark)] outline-none transition placeholder:text-[var(--theme-body-muted)] focus:border-black/30"
          />
          <label className="flex items-center gap-2 text-xs font-semibold text-[var(--theme-body-muted)]">
            <span>로그 표시 개수</span>
            <select
              aria-label="로그 표시 개수"
              value={limit}
              onChange={(event) => {
                setLoading(true)
                setLimit(Number(event.target.value))
              }}
              className="shape-cut-sm border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-xs font-semibold text-[var(--theme-body-dark)] outline-none transition focus:border-black/30"
            >
              {AUDIT_LOG_LIMITS.map((option) => (
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
          <button
            type="button"
            onClick={handleClearCache}
            className="shape-cut-sm inline-flex items-center gap-1.5 border border-amber-300/70 bg-amber-100/70 px-3 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
            disabled={clearingCache}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {clearingCache ? '초기화 중...' : '캐시 초기화'}
          </button>
          <button
            type="button"
            onClick={exportVisibleLogs}
            className="shape-cut-sm inline-flex items-center gap-1.5 border border-[var(--app-hairline)] bg-white/60 px-3 py-2 text-xs font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/80 disabled:opacity-50"
            disabled={visibleLogs.length === 0}
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            CSV
          </button>
        </div>
      </div>

      {cacheMessage && <p className="shape-cut-sm bg-[var(--app-accent-soft)] px-4 py-3 text-sm font-semibold text-[var(--app-accent-text)]">{cacheMessage}</p>}
      {cacheError && <p className="shape-cut-sm bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700">{cacheError}</p>}
      {loading && <p className="text-sm text-[var(--theme-body-muted)]">로그를 불러오는 중...</p>}
      {error && <p className="shape-cut-sm bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      {!loading && !error && logs.length === 0 && (
        <p className="text-sm text-[var(--theme-body-muted)]">저장된 로그가 없습니다.</p>
      )}
      {!loading && !error && logs.length > 0 && visibleLogs.length === 0 && (
        <p className="text-sm text-[var(--theme-body-muted)]">선택한 종류의 로그가 없습니다.</p>
      )}
      {!loading && !error && visibleLogs.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-[var(--app-hairline)]">
          <table className="w-max min-w-full text-left text-sm">
            <thead className="bg-[var(--app-surface)] text-xs font-semibold text-[var(--theme-body-muted)]">
              <tr>
                <th className="px-3 py-3">시간</th>
                <th className="px-3 py-3">사용자</th>
                <th className="px-3 py-3">행위</th>
                <th className="px-3 py-3">대상</th>
                <th className="px-3 py-3">IP</th>
                <th className="px-3 py-3">상세</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 bg-white/50">
              {visibleLogs.map((log) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-[var(--theme-body-muted)]">{formatDateTime(log.createdAt)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs">
                    <span className="font-semibold text-[var(--theme-body-dark)]">{log.actorName || '-'}</span>
                    {log.actorStudentId && <span className="ml-1 font-mono text-[var(--theme-body-muted)]">({log.actorStudentId})</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs">
                    <span className="font-semibold text-[#3b4890]">{AUDIT_ACTION_LABELS[log.action] || log.action}</span>
                    <span className="mt-1 block font-mono text-[10px] text-[var(--theme-body-muted)]">{log.action}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-[var(--theme-body-muted)]">
                    {log.targetType}{log.targetId ? ` #${log.targetId}` : ''}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-[var(--theme-body-muted)]">{log.ipAddress || '-'}</td>
                  <td className="max-w-[360px] whitespace-pre-wrap break-words px-3 py-3 text-xs text-[var(--theme-body-muted)]">{log.detail || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function formatFileSize(size) {
  if (!Number.isFinite(size)) return '알 수 없음'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
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

function auditLogSearchText(log) {
  return [
    log.actorName,
    log.actorStudentId,
    AUDIT_ACTION_LABELS[log.action],
    log.action,
    log.targetType,
    log.targetId,
    log.ipAddress,
    log.detail,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function csvCell(value) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}
