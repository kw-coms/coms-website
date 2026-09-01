import { useEffect, useState } from 'react'
import { listRecruitPromotions, updateRecruitApplicationStatus } from '../../services/adminApi'
import { RECRUIT_STATUS_OPTIONS, recruitStatusLabel } from './recruitStatus'
import { Skeleton, SkeletonGroup } from '../../components/common/Skeleton'

type RecruitApplicationItem = {
  id: string | number
  name?: string
  studentId?: string
  department?: string
  grade?: string
  email?: string
  phone?: string
  status?: string
  submittedAt?: string
  adminNote?: string
  expectation?: string
  motive?: string
  interests?: string
}

export default function AdminRecruitApplications({ applications, loading, error, onReload, onUpdated, formatDateTime }: {
  applications: RecruitApplicationItem[]
  loading: boolean
  error: string
  onReload: () => void
  onUpdated: (updated: unknown) => void
  formatDateTime: (value: string) => string
}) {
  const [drafts, setDrafts] = useState({})
  const [savingId, setSavingId] = useState(null)
  const [message, setMessage] = useState('')
  const [saveError, setSaveError] = useState('')
  const [promotions, setPromotions] = useState<any[]>([])

  const loadPromotions = () => {
    listRecruitPromotions()
      .then((data) => setPromotions(Array.isArray(data) ? data : []))
      .catch(() => setPromotions([]))
  }
  useEffect(loadPromotions, [])

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
      if (updated.status === 'ACCEPTED') {
        setMessage(`${updated.name} 합격 — 명부에 등록하고 지원서를 정리했습니다.`)
        loadPromotions()
      } else {
        setMessage(`${updated.name} 지원서를 저장했습니다.`)
      }
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
      {loading && (
        <SkeletonGroup label="지원서를 불러오는 중">
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-[var(--app-hairline)] bg-black/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              </div>
            ))}
          </div>
        </SkeletonGroup>
      )}
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

      <div className="rounded-lg border border-[var(--app-hairline)] bg-black/5 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-[var(--theme-body-dark)]">합격 이관 이력 (최근 100건)</h3>
            <p className="mt-1 text-xs text-[var(--theme-body-muted)]">합격 처리된 지원서는 명부로 이관 후 삭제되며, 이 목록이 원본 기록입니다.</p>
          </div>
          <button
            type="button"
            onClick={loadPromotions}
            className="shape-cut-sm border border-[var(--app-hairline)] bg-white/60 px-3 py-1.5 text-xs font-semibold text-[var(--theme-body-dark)] hover:bg-white/80"
          >
            새로고침
          </button>
        </div>
        {promotions.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--theme-body-muted)]">이관 기록이 없습니다.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="border-b border-[var(--app-hairline)] text-[var(--theme-body-muted)]">
                <tr>
                  <th className="px-2 py-2">이관일</th>
                  <th className="px-2 py-2">이름</th>
                  <th className="px-2 py-2">학번</th>
                  <th className="px-2 py-2">기수</th>
                  <th className="px-2 py-2">학과</th>
                  <th className="px-2 py-2">전화번호</th>
                  <th className="px-2 py-2">처리자</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10">
                {promotions.map((log) => (
                  <tr key={log.id} className="text-[var(--theme-body-dark)]">
                    <td className="px-2 py-2 whitespace-nowrap">{formatDateTime(log.promotedAt)}</td>
                    <td className="px-2 py-2 font-semibold">{log.name}</td>
                    <td className="px-2 py-2 font-mono">{log.studentId || '-'}</td>
                    <td className="px-2 py-2">{log.generation ? `${log.generation}기` : '-'}</td>
                    <td className="px-2 py-2">{log.department || '-'}</td>
                    <td className="px-2 py-2">{log.phone || '-'}</td>
                    <td className="px-2 py-2">{log.promotedBy || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
