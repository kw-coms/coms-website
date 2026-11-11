import { useEffect, useMemo, useRef, useState } from 'react'
import { listRecruitPromotions, updateRecruitApplicationStatus } from '../../services/adminApi'
import { Download } from 'lucide-react'
import { downloadRecruitApplicationsCsv } from './recruitCsv'
import { RECRUIT_PENDING_STATUSES, RECRUIT_STATUS_OPTIONS, recruitStatusLabel, recruitDecisionLabel, recruitDecisionChipVariant } from './recruitStatus'
import { ListCount, ListSearch, ListSelect, SortDirectionButton } from '../../components/common/ListTools'
import { compareDate, compareRank, compareText, matchesQuery, sortedBy, type SortDirection } from '../../utils/listTools'

const STATUS_FILTER_OPTIONS = [
  { value: 'ALL', label: '전체 상태' },
  { value: 'PENDING', label: '처리 대기' },
  ...RECRUIT_STATUS_OPTIONS,
]
const APPLICATION_SORT_OPTIONS = [
  { value: 'default', label: '기본 순서' },
  { value: 'submittedAt', label: '접수일순' },
  { value: 'name', label: '이름순' },
  { value: 'status', label: '상태순' },
]
const STATUS_ORDER = RECRUIT_STATUS_OPTIONS.map((option) => option.value)
import { Skeleton, SkeletonGroup } from '../../components/common/Skeleton'
import { confirmDialog } from '../../components/common/ConfirmDialog'
import Chip from '../../components/common/Chip'

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

type RecruitSaveResult = { application: RecruitApplicationItem; error?: string }

// Mirrors backend/openapi.json → RecruitPromotionLogResponse.
type RecruitPromotion = {
  id: number
  applicationId?: number
  name?: string
  studentId?: string
  department?: string
  phone?: string
  email?: string
  generation?: string
  promotedBy?: string
  decision?: string
  adminNote?: string
  promotedAt?: string
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
  // Per card: the last save's outcome, and what to put back if the admin undoes it.
  const [saveStates, setSaveStates] = useState<Record<string, { kind: 'saving' | 'saved' | 'failed'; message?: string; undo?: { status: string; adminNote: string } }>>({})
  const pendingSaves = useRef(new Map<string | number, Promise<RecruitSaveResult>>())
  const draftVersions = useRef<Record<string, number>>({})
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [sortKey, setSortKey] = useState('default')
  const [direction, setDirection] = useState<SortDirection>('asc')

  // What the list shows: narrowed by the search and the status, then ordered. "기본 순서" is
  // the order the server sent.
  const visibleApplications = useMemo(() => {
    const narrowed = applications.filter((application) => {
      const status = application.status || 'RECEIVED'
      const statusOk = statusFilter === 'ALL' || (statusFilter === 'PENDING' ? RECRUIT_PENDING_STATUSES.has(status) : status === statusFilter)
      return statusOk && matchesQuery(query, [application.name, application.studentId, application.department, application.phone, application.email])
    })
    if (sortKey === 'submittedAt') return sortedBy(narrowed, (a, b) => compareDate(a.submittedAt, b.submittedAt, direction))
    if (sortKey === 'name') return sortedBy(narrowed, (a, b) => compareText(a.name, b.name, direction))
    if (sortKey === 'status') return sortedBy(narrowed, (a, b) => compareRank(a.status || 'RECEIVED', b.status || 'RECEIVED', STATUS_ORDER, direction))
    return narrowed
  }, [applications, query, statusFilter, sortKey, direction])
  // Newest first is what one wants from a date; the other orders start ascending.
  const chooseSort = (key: string) => {
    setSortKey(key)
    setDirection(key === 'submittedAt' ? 'desc' : 'asc')
  }
  const [message, setMessage] = useState('')
  const [promotions, setPromotions] = useState<RecruitPromotion[]>([])

  // The promotion log is fetched on mount, from the 새로고침 button and after every
  // 합격 save; any of those can resolve after the admin has switched tabs, so gate
  // the setState on a mounted flag rather than warning on an unmounted update.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const loadPromotions = () => {
    listRecruitPromotions()
      .then((data) => { if (mounted.current) setPromotions(Array.isArray(data) ? data : []) })
      .catch(() => { if (mounted.current) setPromotions([]) })
  }
  useEffect(loadPromotions, [])

  const updateDraft = (id, patch) => {
    draftVersions.current[id] = (draftVersions.current[id] || 0) + 1
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), ...patch },
    }))
  }

  const setSaveState = (id, state) => setSaveStates((prev) => ({ ...prev, [id]: state }))
  // A missing date is "-"; the shared formatter reads a missing value as "no expiry".
  const dateText = (value?: string) => (value ? formatDateTime(value) : '-')

  const persist = (application: RecruitApplicationItem, status: string | undefined, adminNote: string, isUndo = false) => {
    const earlier = pendingSaves.current.get(application.id)
    const version = draftVersions.current[application.id] || 0
    setSaveState(application.id, { kind: 'saving' })
    setMessage('')
    const operation = (async (): Promise<RecruitSaveResult> => {
      const last: RecruitSaveResult = earlier ? await earlier : { application }
      const current = last.application
      const previous = { status: current.status || 'RECEIVED', adminNote: current.adminNote || '' }
      try {
        const updated = await updateRecruitApplicationStatus(application.id, { status: status ?? previous.status, adminNote })
        onUpdated(updated)
        if (pendingSaves.current.get(application.id) === operation) {
          const edited = (draftVersions.current[application.id] || 0) !== version
          setDrafts((prev) => ({ ...prev, [updated.id]: {
            status: updated.status,
            adminNote: edited ? prev[updated.id]?.adminNote ?? updated.adminNote ?? '' : updated.adminNote || '',
          } }))
        }
        if (updated.status === 'ACCEPTED' || updated.status === 'REJECTED') {
          setMessage(
            updated.status === 'ACCEPTED'
              ? `${updated.name} 합격 — 명부에 등록하고 지원서를 정리했습니다.`
              : `${updated.name} 불합격 — 지원서를 삭제하고 처리 이력을 남겼습니다.`,
          )
          loadPromotions()
          // The parent removes a decided row; reload in case the server did not delete it.
          onReload()
        } else if (pendingSaves.current.get(application.id) === operation) {
          setSaveState(application.id, last.error
            ? { kind: 'failed', message: last.error }
            : { kind: 'saved', undo: isUndo ? undefined : previous })
        }
        return { application: updated, error: last.error }
      } catch (err) {
        const error = err.message || '지원서 상태를 저장하지 못했습니다.'
        // A later queued edit still owns the draft shown on screen.
        if (pendingSaves.current.get(application.id) === operation) {
          setDrafts((prev) => ({ ...prev, [application.id]: { ...previous, adminNote: prev[application.id]?.adminNote ?? previous.adminNote } }))
          setSaveState(application.id, { kind: 'failed', message: error })
        }
        return { application: current, error }
      }
    })()
    pendingSaves.current.set(application.id, operation)
    void operation.then(() => {
      if (pendingSaves.current.get(application.id) === operation) pendingSaves.current.delete(application.id)
    })
    return operation
  }

  const changeStatus = async (application, status: string) => {
    if (status === (application.status || 'RECEIVED')) return
    if (status === 'ACCEPTED' || status === 'REJECTED') {
      const confirmed = await confirmDialog({
        message: status === 'ACCEPTED'
          ? '합격 처리하면 명부에 등록되고 지원서는 삭제됩니다. 계속할까요?'
          : '불합격 처리하면 지원서는 삭제됩니다. 처리 이력만 남습니다. 계속할까요?',
        tone: 'danger',
      })
      if (!confirmed) return
    }
    updateDraft(application.id, { status })
    // `?? application.adminNote` — only an edit the admin actually made may change the stored 운영 메모.
    await persist(application, status, drafts[application.id]?.adminNote ?? application.adminNote ?? '')
  }

  const saveNote = (application) => {
    const note = drafts[application.id]?.adminNote
    if (note === undefined || (note === (application.adminNote || '') && !pendingSaves.current.has(application.id))) return
    persist(application, undefined, note)
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
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => downloadRecruitApplicationsCsv(applications)}
            disabled={applications.length === 0}
            className="apple-action-secondary inline-flex min-h-10 items-center gap-1.5 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={13} aria-hidden="true" />
            CSV 내보내기
          </button>
          <button
            type="button"
            onClick={onReload}
            className="shape-cut-sm border border-[var(--app-hairline)] bg-white/60 px-3 py-2 text-xs font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/80"
          >
            새로고침
          </button>
        </div>
      </div>

      {message && <p role="status" className="shape-cut-sm bg-[var(--app-accent-soft)] px-4 py-3 text-sm font-semibold text-[var(--app-accent-text)]">{message}</p>}
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
      {error && <p role="alert" className="shape-cut-sm bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      {!loading && !error && applications.length === 0 && (
        <p className="text-sm text-[var(--theme-body-muted)]">아직 접수된 지원서가 없습니다.</p>
      )}

      {!loading && !error && applications.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="search" aria-label="지원서 찾기">
          <ListSearch value={query} onChange={setQuery} placeholder="이름, 학번, 학과, 연락처" label="지원서 검색" />
          <ListSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} label="상태로 거르기" />
          <ListSelect value={sortKey} onChange={chooseSort} options={APPLICATION_SORT_OPTIONS} label="정렬 기준" />
          <SortDirectionButton direction={direction} onChange={setDirection} disabled={sortKey === 'default'} />
          <ListCount shown={visibleApplications.length} total={applications.length} unit="건" />
        </div>
      )}
      {!loading && !error && applications.length > 0 && visibleApplications.length === 0 && (
        <p className="text-sm text-[var(--theme-body-muted)]">조건에 맞는 지원서가 없습니다.</p>
      )}

      {!loading && !error && visibleApplications.length > 0 && (
        <div className="space-y-3">
          {visibleApplications.map((application) => {
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
                      {application.studentId} · {application.department} · {application.grade || '학년 미입력'} · {dateText(application.submittedAt)}
                    </p>
                    <p className="mt-1 text-xs text-[var(--theme-body-muted)]">{application.phone} · {application.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--theme-body-muted)]">
                      <span>상태</span>
                      <select
                        aria-label={`${application.name} 지원 상태`}
                        value={draft.status}
                        onChange={(event) => changeStatus(application, event.target.value)}
                        disabled={saveStates[application.id]?.kind === 'saving'}
                        className="shape-cut-sm min-h-11 border border-[var(--app-hairline)] bg-white/70 px-3 py-2 text-xs font-semibold text-[var(--theme-body-dark)] outline-none"
                      >
                        {RECRUIT_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <SaveStatus
                      name={application.name}
                      state={saveStates[application.id]}
                      onUndo={(undo) => persist(application, undo.status, undo.adminNote, true)}
                    />
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
                        onBlur={() => saveNote(application)}
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
            <h3 className="text-base font-bold text-[var(--theme-body-dark)]">지원 처리 이력 (최근 100건)</h3>
            <p className="mt-1 text-xs text-[var(--theme-body-muted)]">합격/불합격 처리된 지원서는 삭제되며, 이 목록이 원본 기록입니다.</p>
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
                  <th className="px-2 py-2">처리일</th>
                  <th className="px-2 py-2">결과</th>
                  <th className="px-2 py-2">이름</th>
                  <th className="px-2 py-2">학번</th>
                  <th className="px-2 py-2">기수</th>
                  <th className="px-2 py-2">학과</th>
                  <th className="px-2 py-2">전화번호</th>
                  <th className="px-2 py-2">처리자</th>
                  <th className="px-2 py-2">메모</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10">
                {promotions.map((log) => (
                  <tr key={log.id} className="text-[var(--theme-body-dark)]">
                    <td className="px-2 py-2 whitespace-nowrap">{dateText(log.promotedAt)}</td>
                    <td className="px-2 py-2">
                      <Chip variant={recruitDecisionChipVariant(log.decision)}>{recruitDecisionLabel(log.decision)}</Chip>
                    </td>
                    <td className="px-2 py-2 font-semibold">{log.name}</td>
                    <td className="px-2 py-2 font-mono">{log.studentId || '-'}</td>
                    <td className="px-2 py-2">{log.generation ? `${log.generation}기` : '-'}</td>
                    <td className="px-2 py-2">{log.department || '-'}</td>
                    <td className="px-2 py-2">{log.phone || '-'}</td>
                    <td className="px-2 py-2">{log.promotedBy || '-'}</td>
                    <td className="px-2 py-2 max-w-[220px] truncate" title={log.adminNote || ''}>{log.adminNote || '-'}</td>
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

function SaveStatus({ name, state, onUndo }: {
  name: string
  state?: { kind: 'saving' | 'saved' | 'failed'; message?: string; undo?: { status: string; adminNote: string } }
  onUndo: (undo: { status: string; adminNote: string }) => void
}) {
  return (
    <p role="status" aria-label={`${name} 저장 상태`} className="mt-5 flex min-h-11 items-center gap-2 text-xs font-semibold text-[var(--theme-body-muted)]">
      {state?.kind === 'saving' && '저장 중...'}
      {state?.kind === 'saved' && (
        <>
          <span className="text-[var(--app-accent-text)]">저장됨</span>
          {state.undo && (
            <button type="button" onClick={() => onUndo(state.undo)} className="min-h-11 px-1 text-blue-500 underline-offset-2 hover:underline">되돌리기</button>
          )}
        </>
      )}
      {state?.kind === 'failed' && <span className="text-red-700">저장하지 못했습니다. {state.message}</span>}
    </p>
  )
}
