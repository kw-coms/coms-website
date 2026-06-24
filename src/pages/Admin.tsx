import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listRecruitApplications } from '../services/adminApi'
import { useAuth } from '../contexts/useAuth'
import AdminActivities from './admin/AdminActivities'
import AdminAnalytics from './admin/AdminAnalytics'
import AdminAuditLogs from './admin/AdminAuditLogs'
import AdminAppCatalog from './admin/AdminAppCatalog'
import AdminBan from './admin/AdminBan'
import AdminCommunityReports from './admin/AdminCommunityReports'
import AdminDeletedCommunityPosts from './admin/AdminDeletedCommunityPosts'
import AdminFiles from './admin/AdminFiles'
import AdminFonts from './admin/AdminFonts'
import AdminMembers from './admin/AdminMembers'
import AdminRoster from './admin/AdminRoster'
import AdminRecruitApplications from './admin/AdminRecruitApplications'
import { recruitPendingCount, recruitStatusLabel } from './admin/recruitStatus'
import AdminScreenCheck from './admin/AdminScreenCheck'

const ADMIN_TAB_IDS = new Set([
  'overview', 'analytics', 'members', 'recruit', 'roster', 'activities', 'projects', 'files',
  'fonts', 'community', 'deleted-posts', 'screen-check', 'ban', 'logs',
])

const ADMIN_TABS = [
  { id: 'overview', label: '운영 요약' },
  { id: 'analytics', label: '분석' },
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
]

export default function Admin({ onBack }: any) {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState(() => {
    const requested = searchParams.get('tab')
    return requested && ADMIN_TAB_IDS.has(requested) ? requested : 'overview'
  })
  const activeTabLabel = ADMIN_TABS.find((tab) => tab.id === activeTab)?.label || '관리자 탭'
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
            <div className="flex min-w-max gap-2 px-1" role="tablist" aria-label="관리자 패널 섹션">
              {ADMIN_TABS.map((tab) => (
                <button
                  id={`admin-tab-${tab.id}`}
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`admin-panel-${tab.id}`}
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

          <div
            id={`admin-panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`admin-tab-${activeTab}`}
            aria-label={activeTabLabel}
          >
            {activeTab === 'overview' && (
              <OverviewTab
                recruitApplications={recruitApplications}
                recruitLoading={recruitLoading}
                recruitError={recruitError}
                onOpenRecruit={() => setActiveTab('recruit')}
              />
            )}
            {activeTab === 'analytics' && <AdminAnalytics />}
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
            {activeTab === 'deleted-posts' && <AdminDeletedCommunityPosts />}
            {activeTab === 'screen-check' && <AdminScreenCheck />}
            {activeTab === 'ban' && <AdminBan formatDateTime={formatDateTime} />}
            {activeTab === 'logs' && <AdminAuditLogs formatDateTime={formatDateTime} />}
          </div>
        </section>
      </div>
    </div>
  )
}

function OverviewTab({ recruitApplications, recruitLoading, recruitError, onOpenRecruit }: any) {
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
