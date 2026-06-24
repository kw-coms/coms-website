import { useEffect, useState } from 'react'
import { getAdminAnalytics } from '../../services/adminApi'
import { recruitStatusLabel } from './recruitStatus'

const ROLE_LABELS = {
  USER: '일반 회원',
  ADMIN: '운영진',
}

function roleLabel(key) {
  return ROLE_LABELS[key] || key
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('ko-KR')
}

function formatMonth(month) {
  if (typeof month !== 'string') return month
  const [, mm] = month.split('-')
  return mm ? `${Number(mm)}월` : month
}

export default function AdminAnalytics() {
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    setError('')
    getAdminAnalytics()
      .then((data) => setAnalytics(data))
      .catch((err) => setError(err.message || '분석 데이터를 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let mounted = true
    getAdminAnalytics()
      .then((data) => { if (mounted) { setAnalytics(data); setError('') } })
      .catch((err) => { if (mounted) setError(err.message || '분석 데이터를 불러오지 못했습니다.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const statCards = analytics
    ? [
        { label: '전체 회원', value: analytics.totalMembers },
        { label: '공지', value: analytics.totalNotices },
        { label: '커뮤니티 글', value: analytics.totalCommunityPosts },
        { label: '커뮤니티 댓글', value: analytics.totalCommunityComments },
        { label: '활동', value: analytics.totalClubActivities },
        { label: '이벤트', value: analytics.totalClubEvents },
        { label: '자료실 파일', value: analytics.totalArchiveFiles },
        { label: '미처리 신고', value: analytics.communityReportsOpen },
      ]
    : []

  const recruitByStatus = analytics?.recruitApplicationsByStatus || []
  const recruitMax = recruitByStatus.reduce((max, item) => Math.max(max, item.count || 0), 0)
  const monthly = analytics?.recruitApplicationsByMonth || []
  const monthlyMax = monthly.reduce((max, item) => Math.max(max, item.count || 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[var(--theme-body-dark)]">분석</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--theme-body-muted)]">
            회원, 콘텐츠, 모집 현황을 한 화면에서 집계해 확인합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="shape-cut-sm border border-[var(--app-hairline)] bg-white/60 px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/80 disabled:opacity-60"
        >
          {loading ? '불러오는 중…' : '새로고침'}
        </button>
      </div>

      {error && (
        <p className="shape-cut-sm border border-[var(--app-hairline)] bg-black/5 px-4 py-3 text-sm text-[var(--theme-body-dark)]">
          {error}
        </p>
      )}

      {loading && !analytics ? (
        <p className="text-sm text-[var(--theme-body-muted)]">집계 데이터를 불러오는 중입니다…</p>
      ) : analytics ? (
        <>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            {statCards.map((card) => (
              <div key={card.label} className="rounded-lg border border-[var(--app-hairline)] bg-black/5 p-4">
                <p className="text-xs font-semibold text-[var(--theme-body-muted)]">{card.label}</p>
                <p className="mt-2 text-2xl font-bold text-[var(--theme-body-dark)]">{formatNumber(card.value)}</p>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-[var(--app-hairline)] bg-white/60 p-4">
            <p className="text-sm font-semibold text-[var(--theme-body-dark)]">회원 구성</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {(analytics.membersByRole || []).map((role) => (
                <div key={role.key} className="shape-cut-sm border border-[var(--app-hairline)] bg-black/5 px-3 py-2">
                  <span className="text-xs font-semibold text-[var(--theme-body-muted)]">{roleLabel(role.key)}</span>
                  <span className="ml-2 text-sm font-bold text-[var(--theme-body-dark)]">{formatNumber(role.count)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-[var(--app-hairline)] bg-white/60 p-4">
            <p className="text-sm font-semibold text-[var(--theme-body-dark)]">모집 지원 상태별</p>
            <div className="mt-4 space-y-3">
              {recruitByStatus.map((item) => (
                <div key={item.key} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-xs font-semibold text-[var(--theme-body-muted)]">
                    {recruitStatusLabel(item.key)}
                  </span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-black/10">
                    <div
                      className="h-full rounded-full bg-[var(--theme-text)] transition-[width]"
                      style={{ width: `${recruitMax > 0 ? Math.round((item.count / recruitMax) * 100) : 0}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right text-sm font-bold text-[var(--theme-body-dark)]">
                    {formatNumber(item.count)}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-[var(--theme-body-muted)]">
              처리 완료 신고 {formatNumber(analytics.communityReportsResolved)}건 · 미처리 {formatNumber(analytics.communityReportsOpen)}건
            </p>
          </div>

          <div className="rounded-lg border border-[var(--app-hairline)] bg-white/60 p-4">
            <p className="text-sm font-semibold text-[var(--theme-body-dark)]">월별 모집 지원 (최근 6개월)</p>
            <div className="mt-4 flex items-end gap-2 sm:gap-3" style={{ height: '160px' }}>
              {monthly.map((item) => {
                const ratio = monthlyMax > 0 ? item.count / monthlyMax : 0
                return (
                  <div key={item.month} className="flex flex-1 flex-col items-center justify-end gap-2">
                    <span className="text-xs font-bold text-[var(--theme-body-dark)]">{formatNumber(item.count)}</span>
                    <div
                      className="w-full rounded-t bg-[var(--theme-text)] transition-[height]"
                      style={{ height: `${Math.max(ratio * 100, item.count > 0 ? 6 : 2)}%` }}
                      aria-hidden="true"
                    />
                    <span className="text-xs text-[var(--theme-body-muted)]">{formatMonth(item.month)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
