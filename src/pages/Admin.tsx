import PageHeading from '../components/PageHeading'
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
import AdminPermissions from './admin/AdminPermissions'
import AdminRoster from './admin/AdminRoster'
import AdminRecruitApplications from './admin/AdminRecruitApplications'
import AdminScreenCheck from './admin/AdminScreenCheck'
import AdminOverview from './admin/AdminOverview'
import AdminTabNav from './admin/AdminTabNav'
import { ADMIN_TABS } from './admin/adminTabs'
import AdminSiteSettings from './admin/AdminSiteSettings'
import AdminSponsors from './admin/AdminSponsors'
import {
  adminTabsForRole,
  ROLE_LABELS,
  canAccessOperationsPanel,
  canEditSiteSettings,
  canManageArchive,
  canManageContent,
  canManageProjects,
  canManageSensitiveAdmin,
  canModerateCommunity,
  defaultOperationsTab,
} from '../utils/roleAccess'
import { usePermissions } from '../contexts/usePermissions'

type RecruitApplication = {
  id: string | number
  name: string
  department: string
  status: string
  [key: string]: unknown
}

export default function Admin({ onBack }: { onBack: () => void }) {
  const { user } = useAuth()
  const { permissions, settled } = usePermissions()
  const [searchParams, setSearchParams] = useSearchParams()
  const isSensitiveAdmin = canManageSensitiveAdmin(user?.role)
  const visibleTabs = adminTabsForRole(user?.role, permissions, ADMIN_TABS)
  // The address holds the tab. An unknown or forbidden value falls back to the first tab the
  // operator may open.
  const requestedTab = searchParams.get('tab')
  const resolvedActiveTab = visibleTabs.some((tab) => tab.id === requestedTab)
    ? requestedTab
    : defaultOperationsTab(user?.role, permissions, null)
  const selectTab = (id: string) => setSearchParams({ tab: id })
  useEffect(() => {
    // Wait for the real permissions so a tab they allow is not replaced by the default one.
    if (settled && resolvedActiveTab && requestedTab !== resolvedActiveTab) {
      setSearchParams({ tab: resolvedActiveTab }, { replace: true })
    }
  }, [settled, resolvedActiveTab, requestedTab, setSearchParams])
  const activeTabLabel = visibleTabs.find((tab) => tab.id === resolvedActiveTab)?.label || '운영 탭'
  const [recruitApplications, setRecruitApplications] = useState<RecruitApplication[]>([])
  const [recruitLoading, setRecruitLoading] = useState(true)
  const [recruitError, setRecruitError] = useState('')

  const loadRecruitApplications = async () => {
    if (!isSensitiveAdmin) {
      setRecruitLoading(false)
      return
    }
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
    if (!isSensitiveAdmin) {
      return undefined
    }
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
  }, [isSensitiveAdmin])

  if (!canAccessOperationsPanel(permissions) || (!isSensitiveAdmin && !resolvedActiveTab)) {
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
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-[var(--theme-body-muted)]/80">
            {ROLE_LABELS[user?.role] || 'Officer'}
          </p>
          <PageHeading className="mt-2 mb-6 text-2xl font-bold sm:text-3xl">운영 패널</PageHeading>

          <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
            <AdminTabNav visibleTabs={visibleTabs} activeId={resolvedActiveTab ?? ''} onSelect={selectTab} />
            <div className="mt-6 min-w-0 lg:mt-0">
          <div
            id={`admin-panel-${resolvedActiveTab}`}
            role="tabpanel"
            aria-labelledby={`admin-tab-${resolvedActiveTab}`}
            aria-label={activeTabLabel}
          >
            {isSensitiveAdmin && (resolvedActiveTab === 'members' || resolvedActiveTab === 'roster') && (
              <p className="mb-4 text-xs text-[var(--theme-body-muted)]">
                {resolvedActiveTab === 'members' ? '가입 전 명단은 ' : '가입한 회원 목록은 '}
                <button
                  type="button"
                  onClick={() => selectTab(resolvedActiveTab === 'members' ? 'roster' : 'members')}
                  className="font-semibold text-blue-500 underline-offset-2 hover:underline"
                >
                  {resolvedActiveTab === 'members' ? '명부 인증 탭' : '회원 관리 탭'}
                </button>
                에서 봅니다.
              </p>
            )}
            {isSensitiveAdmin && resolvedActiveTab === 'overview' && (
              <AdminOverview
                recruitApplications={recruitApplications}
                recruitLoading={recruitLoading}
                recruitError={recruitError}
                onReloadRecruit={loadRecruitApplications}
                onOpenTab={selectTab}
              />
            )}
            {isSensitiveAdmin && resolvedActiveTab === 'analytics' && <AdminAnalytics />}
            {isSensitiveAdmin && resolvedActiveTab === 'members' && <AdminMembers currentUser={user} />}
            {isSensitiveAdmin && resolvedActiveTab === 'recruit' && (
              <AdminRecruitApplications
                applications={recruitApplications}
                loading={recruitLoading}
                error={recruitError}
                onReload={loadRecruitApplications}
                onUpdated={(updated) => {
                  const next = updated as RecruitApplication
                  if (next.status === 'ACCEPTED' || next.status === 'REJECTED') {
                    // 합격/불합격 처리 시 서버가 지원서를 삭제한다(합격은 명부 이관 후,
                    // 불합격은 이력만 남기고) — 어느 쪽이든 목록에서도 제거.
                    setRecruitApplications((prev) => prev.filter((item) => item.id !== next.id))
                    return
                  }
                  setRecruitApplications((prev) => prev.map((item) => (item.id === next.id ? next : item)))
                }}
                formatDateTime={formatDateTime}
              />
            )}
            {isSensitiveAdmin && resolvedActiveTab === 'roster' && <AdminRoster />}
            {canManageContent(permissions) && resolvedActiveTab === 'activities' && <AdminActivities />}
            {canManageProjects(permissions) && resolvedActiveTab === 'projects' && <AdminAppCatalog />}
            {canManageArchive(permissions) && resolvedActiveTab === 'files' && <AdminFiles />}
            {canEditSiteSettings(permissions) && resolvedActiveTab === 'site-settings' && <AdminSiteSettings />}
            {isSensitiveAdmin && resolvedActiveTab === 'sponsors' && <AdminSponsors />}
            {isSensitiveAdmin && resolvedActiveTab === 'fonts' && <AdminFonts />}
            {canModerateCommunity(permissions) && resolvedActiveTab === 'community' && <AdminCommunityReports formatDateTime={formatDateTime} />}
            {canModerateCommunity(permissions) && resolvedActiveTab === 'deleted-posts' && <AdminDeletedCommunityPosts />}
            {isSensitiveAdmin && resolvedActiveTab === 'screen-check' && <AdminScreenCheck />}
            {isSensitiveAdmin && resolvedActiveTab === 'ban' && <AdminBan formatDateTime={formatDateTime} />}
            {isSensitiveAdmin && resolvedActiveTab === 'permissions' && <AdminPermissions />}
            {isSensitiveAdmin && resolvedActiveTab === 'logs' && <AdminAuditLogs formatDateTime={formatDateTime} />}
          </div>
            </div>
          </div>
        </section>
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
