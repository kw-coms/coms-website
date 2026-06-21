import { useState } from 'react'
import { updateRecruitApplicationStatus } from '../../services/adminApi.js'
import { RECRUIT_STATUS_OPTIONS, recruitStatusLabel } from './recruitStatus.js'

export default function AdminRecruitApplications({ applications, loading, error, onReload, onUpdated, formatDateTime }) {
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
