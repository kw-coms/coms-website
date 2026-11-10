import { ChevronRight } from 'lucide-react'
import { useAdminAnalytics } from './useAdminAnalytics'
import { recruitPendingCount } from './recruitStatus'
import { Skeleton, SkeletonGroup } from '../../components/common/Skeleton'

type Row = { key: string; label: string; count: number; tab: string }

// To-do list from data the panel already loads: the recruit list (kept by Admin) and the
// analytics counts. A source that failed says so; it is never counted as zero.
export default function AdminOverview({ recruitApplications, recruitLoading, recruitError, onReloadRecruit, onOpenTab }: {
  recruitApplications: { status?: string }[]
  recruitLoading: boolean
  recruitError: string
  onReloadRecruit: () => void
  onOpenTab: (id: string) => void
}) {
  const { analytics, loading: analyticsLoading, error: analyticsError, refetch } = useAdminAnalytics()

  const rows: Row[] = []
  const pending = recruitPendingCount(recruitApplications)
  if (!recruitLoading && !recruitError && pending > 0) {
    rows.push({ key: 'recruit', label: '처리 대기 중인 지원서', count: pending, tab: 'recruit' })
  }
  const reportsOpen = Number(analytics?.communityReportsOpen || 0)
  if (!analyticsLoading && !analyticsError && reportsOpen > 0) {
    rows.push({ key: 'reports', label: '처리하지 않은 커뮤니티 신고', count: reportsOpen, tab: 'community' })
  }

  const loading = recruitLoading || analyticsLoading
  const hasError = Boolean(recruitError || analyticsError)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-[var(--theme-body-dark)]">운영 요약</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--theme-body-muted)]">지금 처리할 일을 모았습니다. 누르면 해당 탭이 열립니다.</p>
      </div>

      {loading && (
        <SkeletonGroup label="할 일을 불러오는 중">
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        </SkeletonGroup>
      )}

      {!loading && rows.length > 0 && (
        <ul data-testid="admin-todo" className="space-y-2">
          {rows.map((row) => (
            <li key={row.key}>
              <button
                type="button"
                onClick={() => onOpenTab(row.tab)}
                className="shape-cut-sm flex min-h-14 w-full items-center justify-between gap-3 border border-[var(--app-hairline)] bg-white/60 px-4 py-3 text-left transition hover:bg-white/80"
              >
                <span className="text-sm font-semibold text-[var(--theme-body-dark)]">{row.label}</span>
                <span className="flex items-center gap-1 text-sm font-bold text-[var(--theme-body-dark)]">
                  {row.count.toLocaleString('ko-KR')}건
                  <ChevronRight size={16} aria-hidden="true" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!loading && !hasError && rows.length === 0 && (
        <p className="shape-cut-sm border border-[var(--app-hairline)] bg-black/5 px-4 py-4 text-sm font-semibold text-[var(--theme-body-dark)]">처리할 일이 없어요</p>
      )}

      {!loading && recruitError && (
        <div role="alert" className="shape-cut-sm flex flex-wrap items-center justify-between gap-2 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700">
          <span>지원서 현황을 불러오지 못했습니다. {recruitError}</span>
          <button type="button" onClick={onReloadRecruit} className="apple-action-secondary min-h-10 px-3 text-xs">다시 시도</button>
        </div>
      )}
      {!loading && analyticsError && (
        <div role="alert" className="shape-cut-sm flex flex-wrap items-center justify-between gap-2 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700">
          <span>커뮤니티 신고 현황을 불러오지 못했습니다. {analyticsError}</span>
          <button type="button" onClick={() => refetch()} className="apple-action-secondary min-h-10 px-3 text-xs">다시 시도</button>
        </div>
      )}
    </div>
  )
}
