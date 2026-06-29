import { useAdminAnalytics } from './useAdminAnalytics'
import { recruitStatusLabel } from './recruitStatus'

const ROLE_LABELS: Record<string, string> = {
  USER: '일반 회원',
  ADMIN: '운영진',
}

// Per-status accent tints. Kept as inline rgb so we stay Tailwind-utility-only
// (no index.css edits) while still giving each state a distinct, legible color
// in both light and dark mode.
const STATUS_ACCENTS: Record<string, string> = {
  RECEIVED: '99, 102, 241', // indigo
  REVIEWING: '234, 179, 8', // amber
  ACCEPTED: '16, 185, 129', // emerald
  HOLD: '148, 163, 184', // slate
  REJECTED: '244, 63, 94', // rose
}

function roleLabel(key: string) {
  return ROLE_LABELS[key] || key
}

function statusAccent(key: string) {
  return STATUS_ACCENTS[key] || '99, 102, 241'
}

type CountRow = { key: string; count: number }
type MonthRow = { month: string; count: number }
type StatCard = { label: string; value: number; hint: string; alert?: boolean }

function formatNumber(value: number | string | null | undefined) {
  return Number(value || 0).toLocaleString('ko-KR')
}

function formatMonth(month: string) {
  if (typeof month !== 'string') return month
  const [, mm] = month.split('-')
  return mm ? `${Number(mm)}월` : month
}

const cardBase =
  'rounded-2xl border border-[var(--app-hairline)] bg-[var(--app-surface)] shadow-[0_10px_30px_var(--theme-shadow-glass)]'

export default function AdminAnalytics() {
  const { analytics, loading, fetching, error, refetch } = useAdminAnalytics()

  const statCards: StatCard[] = analytics
    ? [
        { label: '전체 회원', value: analytics.totalMembers, hint: '가입 완료 기준' },
        { label: '공지', value: analytics.totalNotices, hint: '게시된 공지' },
        { label: '커뮤니티 글', value: analytics.totalCommunityPosts, hint: '활성 게시글' },
        { label: '커뮤니티 댓글', value: analytics.totalCommunityComments, hint: '누적 댓글' },
        { label: '활동', value: analytics.totalClubActivities, hint: '동아리 활동' },
        { label: '이벤트', value: analytics.totalClubEvents, hint: '등록 이벤트' },
        { label: '자료실 파일', value: analytics.totalArchiveFiles, hint: '업로드 자료' },
        {
          label: '미처리 신고',
          value: analytics.communityReportsOpen,
          hint: '확인 필요',
          alert: Number(analytics.communityReportsOpen || 0) > 0,
        },
      ]
    : []

  const membersByRole: CountRow[] = analytics?.membersByRole || []
  const roleTotal = membersByRole.reduce((sum: number, r) => sum + Number(r.count || 0), 0)

  const recruitByStatus: CountRow[] = analytics?.recruitApplicationsByStatus || []
  const recruitTotal = recruitByStatus.reduce((sum: number, r) => sum + Number(r.count || 0), 0)
  const recruitMax = recruitByStatus.reduce((max: number, item) => Math.max(max, item.count || 0), 0)

  const monthly: MonthRow[] = analytics?.recruitApplicationsByMonth || []
  const monthlyMax = monthly.reduce((max: number, item) => Math.max(max, item.count || 0), 0)
  const reportsResolved = Number(analytics?.communityReportsResolved || 0)
  const reportsOpen = Number(analytics?.communityReportsOpen || 0)
  const reportsTotal = reportsResolved + reportsOpen

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[var(--theme-body-muted)]/80">
            Analytics
          </p>
          <h2 className="mt-1 text-xl font-bold text-[var(--theme-body-dark)]">통계 대시보드</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--theme-body-muted)]">
            회원, 콘텐츠, 모집 현황을 한 화면에서 집계해 운영 흐름을 빠르게 점검합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={fetching}
          className="shape-cut-sm inline-flex items-center gap-2 border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-[var(--app-surface-elevated)] disabled:opacity-60"
        >
          <span
            className={`inline-block h-2 w-2 rounded-full ${fetching ? 'animate-pulse bg-[var(--theme-text)]' : 'bg-[var(--app-hairline-strong)]'}`}
            aria-hidden="true"
          />
          {fetching ? '불러오는 중…' : '새로고침'}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="shape-cut-sm flex flex-wrap items-center justify-between gap-3 border border-[var(--app-hairline)] bg-[var(--app-surface-soft)] px-4 py-3 text-sm text-[var(--theme-body-dark)]"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="shape-cut-sm bg-[var(--theme-text)] px-3 py-1.5 text-xs font-semibold text-[var(--theme-bg)] transition hover:opacity-90"
          >
            다시 시도
          </button>
        </div>
      )}

      {loading && !analytics ? (
        <LoadingSkeleton />
      ) : analytics ? (
        <>
          {/* Stat card grid — mobile-first 2-up, scaling to 4-up */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {statCards.map((card) => (
              <div
                key={card.label}
                className={`${cardBase} group relative overflow-hidden p-4 transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_var(--theme-shadow-glass)]`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[var(--theme-body-muted)]">{card.label}</p>
                  {card.alert && (
                    <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-rose-500" aria-hidden="true" />
                  )}
                </div>
                <p
                  className={`mt-3 text-3xl font-bold tabular-nums tracking-tight ${
                    card.alert ? 'text-rose-500' : 'text-[var(--theme-body-dark)]'
                  }`}
                >
                  {formatNumber(card.value)}
                </p>
                <p className="mt-1 text-[0.7rem] text-[var(--theme-body-muted)]/80">{card.hint}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Members by role */}
            <section className={`${cardBase} p-5`}>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-bold text-[var(--theme-body-dark)]">역할별 회원</h3>
                <span className="text-xs text-[var(--theme-body-muted)]">총 {formatNumber(roleTotal)}명</span>
              </div>
              <div className="mt-4 space-y-3">
                {membersByRole.length === 0 ? (
                  <EmptyRow />
                ) : (
                  membersByRole.map((role) => {
                    const pct = roleTotal > 0 ? Math.round((Number(role.count || 0) / roleTotal) * 100) : 0
                    return (
                      <BarRow
                        key={role.key}
                        label={roleLabel(role.key)}
                        count={role.count}
                        pct={pct}
                        accent="var(--theme-text)"
                        showPct
                      />
                    )
                  })
                )}
              </div>
            </section>

            {/* Recruit applications by status */}
            <section className={`${cardBase} p-5`}>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-bold text-[var(--theme-body-dark)]">모집 지원 상태별</h3>
                <span className="text-xs text-[var(--theme-body-muted)]">총 {formatNumber(recruitTotal)}건</span>
              </div>
              <div className="mt-4 space-y-3">
                {recruitByStatus.length === 0 ? (
                  <EmptyRow />
                ) : (
                  recruitByStatus.map((item) => {
                    const pct = recruitMax > 0 ? Math.round((Number(item.count || 0) / recruitMax) * 100) : 0
                    return (
                      <BarRow
                        key={item.key}
                        label={recruitStatusLabel(item.key)}
                        count={item.count}
                        pct={pct}
                        accent={`rgb(${statusAccent(item.key)})`}
                        track={`rgba(${statusAccent(item.key)}, 0.12)`}
                      />
                    )
                  })
                )}
              </div>
            </section>
          </div>

          {/* Monthly recruit applications — flex bar chart, no chart lib */}
          <section className={`${cardBase} p-5`}>
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-bold text-[var(--theme-body-dark)]">월별 모집 지원</h3>
              <span className="text-xs text-[var(--theme-body-muted)]">최근 {monthly.length || 6}개월</span>
            </div>

            {monthly.length === 0 ? (
              <div className="mt-4">
                <EmptyRow />
              </div>
            ) : (
              <MonthlyBarChart monthly={monthly} monthlyMax={monthlyMax} />
            )}
          </section>

          {/* Community reports split */}
          <section className={`${cardBase} p-5`}>
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-bold text-[var(--theme-body-dark)]">커뮤니티 신고 처리</h3>
              <span className="text-xs text-[var(--theme-body-muted)]">총 {formatNumber(reportsTotal)}건</span>
            </div>
            <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-[var(--app-hairline)]">
              <div
                className="h-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${reportsTotal > 0 ? (reportsResolved / reportsTotal) * 100 : 0}%` }}
              />
              <div
                className="h-full bg-rose-500 transition-all duration-500"
                style={{ width: `${reportsTotal > 0 ? (reportsOpen / reportsTotal) * 100 : 0}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1.5 text-[var(--theme-body-muted)]">
                <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                처리 완료 <strong className="text-[var(--theme-body-dark)]">{formatNumber(reportsResolved)}</strong>건
              </span>
              <span className="inline-flex items-center gap-1.5 text-[var(--theme-body-muted)]">
                <span className="h-2 w-2 rounded-full bg-rose-500" aria-hidden="true" />
                미처리 <strong className="text-[var(--theme-body-dark)]">{formatNumber(reportsOpen)}</strong>건
              </span>
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}

function BarRow({ label, count, pct, accent, track, showPct }: {
  label: string
  count: number
  pct: number
  accent: string
  track?: string
  showPct?: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 truncate text-xs font-semibold text-[var(--theme-body-muted)]" title={label}>
        {label}
      </span>
      <div
        className="h-3 flex-1 overflow-hidden rounded-full"
        style={{ backgroundColor: track || 'rgba(0,0,0,0.08)' }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%`, backgroundColor: accent }}
        />
      </div>
      <span className="w-12 shrink-0 text-right text-sm font-bold tabular-nums text-[var(--theme-body-dark)]">
        {formatNumber(count)}
        {showPct && <span className="ml-1 text-[0.65rem] font-medium text-[var(--theme-body-muted)]">{pct}%</span>}
      </span>
    </div>
  )
}

function EmptyRow() {
  return <p className="py-2 text-xs text-[var(--theme-body-muted)]">표시할 데이터가 없습니다.</p>
}

const BAR_H = 120

function MonthlyBarChart({ monthly, monthlyMax }: { monthly: MonthRow[]; monthlyMax: number }) {
  return (
    <div className="relative mt-6 pl-7">
      {/* Y-axis gridlines — absolutely positioned inside BAR_H region */}
      <div className="pointer-events-none absolute left-0 right-0" style={{ height: BAR_H }}>
        {[1, 0.5, 0].map((frac) => (
          <div
            key={frac}
            className="absolute left-0 right-0 flex items-center"
            style={{ top: `${(1 - frac) * 100}%` }}
          >
            <span className="w-6 shrink-0 text-right text-[0.6rem] tabular-nums text-[var(--theme-body-muted)]/70">
              {Math.round(monthlyMax * frac)}
            </span>
            <span className="ml-1 h-px flex-1 bg-[var(--app-hairline)]" />
          </div>
        ))}
      </div>

      {/* Count labels above bars */}
      <div className="flex gap-1.5 sm:gap-3">
        {monthly.map((item) => (
          <div key={item.month} className="flex flex-1 justify-center">
            <span className="text-xs font-bold tabular-nums text-[var(--theme-body-dark)] opacity-70">
              {formatNumber(item.count)}
            </span>
          </div>
        ))}
      </div>

      {/* Bar area: explicit px height on container + px height on each bar — % never used */}
      <div className="flex items-end gap-1.5 sm:gap-3" style={{ height: BAR_H }}>
        {monthly.map((item) => {
          const ratio = monthlyMax > 0 ? Number(item.count || 0) / monthlyMax : 0
          const barPx = Math.max(Math.round(ratio * BAR_H), Number(item.count || 0) > 0 ? 5 : 2)
          return (
            <div key={item.month} className="group flex flex-1 items-end justify-center">
              <div
                className="w-full max-w-[44px] rounded-t-md bg-[var(--theme-text)] transition-[opacity] duration-300"
                style={{ height: barPx, opacity: 0.85 }}
                role="img"
                aria-label={`${formatMonth(item.month)} ${formatNumber(item.count)}건`}
              />
            </div>
          )
        })}
      </div>

      {/* Month labels below bars */}
      <div className="mt-2 flex gap-1.5 sm:gap-3">
        {monthly.map((item) => (
          <div key={item.month} className="flex flex-1 justify-center">
            <span className="text-xs text-[var(--theme-body-muted)]">{formatMonth(item.month)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className={`${cardBase} p-4`}>
            <div className="h-3 w-16 animate-pulse rounded bg-[var(--app-hairline)]" />
            <div className="mt-3 h-7 w-12 animate-pulse rounded bg-[var(--app-hairline)]" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className={`${cardBase} space-y-3 p-5`}>
            <div className="h-4 w-24 animate-pulse rounded bg-[var(--app-hairline)]" />
            {Array.from({ length: 4 }).map((__, j) => (
              <div key={j} className="h-3 w-full animate-pulse rounded-full bg-[var(--app-hairline)]" />
            ))}
          </div>
        ))}
      </div>
      <div className={`${cardBase} p-5`}>
        <div className="h-4 w-28 animate-pulse rounded bg-[var(--app-hairline)]" />
        <div className="mt-6 flex items-end gap-3" style={{ height: '180px' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 animate-pulse rounded-t-md bg-[var(--app-hairline)]"
              style={{ height: `${30 + ((i * 13) % 60)}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
