import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Download, Link2, Plus, Trash2, UserPlus, Users } from 'lucide-react'
import {
  closeGathering,
  createGathering,
  deleteGathering,
  getGathering,
  joinGathering,
  leaveGathering,
  listGatherings,
  removeGatheringSignup,
} from '../services/gatheringApi'
import {
  GATHERING_STATE_LABELS,
  fillRatio,
  formatGatheringTime,
  gatheringState,
  gatheringToCsv,
  parseCapacity,
  placesLabel,
  toApiDateTime,
  type Gathering,
  type GatheringDetail,
} from '../utils/gathering'
import { showToast } from '../components/common/Toast'
import { confirmDialog } from '../components/common/ConfirmDialog'
import ErrorState from '../components/common/ErrorState'
import { Skeleton, SkeletonGroup } from '../components/common/Skeleton'

/**
 * Gatherings ("모임 신청"). A member opens one for a study, an outing or a dinner, with a
 * limit of places and a closing time if they like; other members put their names down, and
 * everyone sees who is coming. `/gatherings` lists them, `/gatherings/:id` is one of them.
 */

const LIST_KEY = ['gatherings']
const detailKey = (id: number | string) => ['gatherings', String(id)]

export default function Gatherings() {
  const { id } = useParams()
  return id ? <GatheringView key={id} id={id} /> : <GatheringList />
}

function PageHead({ title, copy, children }: { title: string; copy?: string | null; children?: ReactNode }) {
  return (
    <div className="apple-board-hero px-5 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <span className="coms-icon coms-board-icon" aria-hidden="true"><UserPlus size={22} strokeWidth={2} /></span>
          <p className="apple-eyebrow">Gather</p>
          <h1 className="apple-display mt-2 break-words text-4xl sm:text-5xl">{title}</h1>
          {copy && <p className="apple-copy mt-3 max-w-2xl whitespace-pre-line text-base sm:text-lg">{copy}</p>}
        </div>
        {children}
      </div>
    </div>
  )
}

function StateChip({ gathering }: { gathering: Gathering }) {
  const state = gatheringState(gathering)
  return <span className={`coms-gather-chip is-${state}`}>{GATHERING_STATE_LABELS[state]}</span>
}

/** How many have signed up, drawn as a bar when there is a limit to fill. */
function Places({ gathering }: { gathering: Gathering }) {
  const ratio = fillRatio(gathering.participantCount, gathering.capacity)
  return (
    <span className="coms-gather-places">
      <span className="inline-flex items-center gap-1.5 font-bold text-[var(--app-text)]">
        <Users size={14} aria-hidden="true" />
        {placesLabel(gathering.participantCount, gathering.capacity)}
      </span>
      {ratio !== null && (
        <span className="coms-gather-meter" aria-hidden="true">
          <span className={ratio >= 1 ? 'is-full' : ''} style={{ width: `${ratio * 100}%` }} />
        </span>
      )}
    </span>
  )
}

// ---- list ---------------------------------------------------------------------

function GatheringList() {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const listQuery = useQuery({ queryKey: LIST_KEY, queryFn: listGatherings })
  const gatherings = listQuery.data ?? []

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-4">
      <div className="flex justify-center sm:justify-start">
        <button type="button" onClick={() => navigate('/')} className="apple-action-secondary px-4 py-2 text-sm">메인으로 돌아가기</button>
      </div>
      <section className="apple-board-shell">
        <PageHead title="모임 신청" copy="스터디, MT, 회식처럼 사람을 모을 일이 있으면 모임을 열고, 가고 싶은 모임에는 이름을 올리세요.">
          <button
            type="button"
            onClick={() => setCreating((open) => !open)}
            aria-expanded={creating}
            className="apple-action-primary inline-flex min-h-11 items-center justify-center gap-2 px-5 text-sm max-md:w-full sm:min-h-10"
          >
            <Plus size={15} aria-hidden="true" />
            새 모임 열기
          </button>
        </PageHead>

        {creating && (
          <div className="border-b border-[var(--app-hairline)] p-4 sm:p-6">
            <CreateGatheringForm onCancel={() => setCreating(false)} onCreated={(detail) => navigate(`/gatherings/${detail.gathering.id}`)} />
          </div>
        )}

        <div className="p-4 sm:p-6">
          {listQuery.isLoading && (
            <SkeletonGroup label="모임 목록을 불러오는 중">
              <div className="grid gap-3 md:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="apple-soft-panel space-y-3 p-5">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-3 w-56" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                ))}
              </div>
            </SkeletonGroup>
          )}
          {listQuery.isError && (
            <ErrorState message={(listQuery.error as Error)?.message || '모임 목록을 불러오지 못했습니다.'} onRetry={() => listQuery.refetch()} />
          )}
          {listQuery.isSuccess && gatherings.length === 0 && (
            <p className="py-10 text-center text-sm text-[var(--app-muted)]">
              아직 열린 모임이 없습니다. 스터디원을 모으거나 회식 인원을 셀 때 새로 열어 보세요.
            </p>
          )}
          {gatherings.length > 0 && (
            <ul className="grid gap-3 md:grid-cols-2" aria-label="모임 목록">
              {gatherings.map((gathering) => (
                <li key={gathering.id}>
                  <button type="button" onClick={() => navigate(`/gatherings/${gathering.id}`)} className="coms-card w-full">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="coms-card-eyebrow">{gathering.creatorName}</span>
                      <StateChip gathering={gathering} />
                      {gathering.joined && (
                        <span className="coms-gather-chip is-joined">
                          <Check size={11} strokeWidth={3} aria-hidden="true" />
                          신청함
                        </span>
                      )}
                    </span>
                    <span className="coms-card-title block">{gathering.title}</span>
                    {gathering.description && <span className="coms-card-body line-clamp-2 block">{gathering.description}</span>}
                    <span className="mt-4 block">
                      <Places gathering={gathering} />
                    </span>
                    {gathering.closesAt && gathering.open && (
                      <span className="mt-2 block text-xs font-semibold text-[var(--app-muted)]">{formatGatheringTime(gathering.closesAt)}까지</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}

// ---- new gathering ---------------------------------------------------------------

const fieldClass = 'min-h-10 w-full rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text)] outline-none placeholder:text-[var(--app-subtle)]'
const labelClass = 'mb-1 block text-xs font-bold text-[var(--app-text)]'

function CreateGatheringForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (detail: GatheringDetail) => void }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [capacity, setCapacity] = useState('')
  const [closesAt, setClosesAt] = useState('')
  const [noteLabel, setNoteLabel] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: createGathering,
    onSuccess: (detail) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY })
      queryClient.setQueryData(detailKey(detail.gathering.id), detail)
      showToast({ message: '모임을 열었습니다. 링크를 복사해 알려 보세요.', tone: 'success' })
      onCreated(detail)
    },
    onError: (err: Error) => setError(err.message || '모임을 열지 못했습니다.'),
  })

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (mutation.isPending) return
    if (!title.trim()) return setError('제목을 입력해 주세요.')
    const places = parseCapacity(capacity)
    if (Number.isNaN(places)) return setError('정원은 1명에서 500명 사이로 적거나 비워 두세요.')
    const closing = closesAt ? toApiDateTime(closesAt) : null
    if (closing && new Date(closing).getTime() <= Date.now()) return setError('마감 시각은 지금보다 뒤여야 합니다.')
    setError('')
    mutation.mutate({ title: title.trim(), description: description.trim(), capacity: places, noteLabel: noteLabel.trim(), closesAt: closing })
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" aria-label="새 모임 열기">
      <div className="sm:col-span-2">
        <label htmlFor="gatheringTitle" className={labelClass}>제목</label>
        <input id="gatheringTitle" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder="예: 알고리즘 스터디 모집" className={fieldClass} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="gatheringDescription" className={labelClass}>설명 <span className="font-medium text-[var(--app-muted)]">(선택)</span></label>
        <textarea id="gatheringDescription" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={3} placeholder="언제, 어디서, 무엇을 하는지 적어 주세요." className={`${fieldClass} resize-y`} />
      </div>
      <div>
        <label htmlFor="gatheringCapacity" className={labelClass}>정원 <span className="font-medium text-[var(--app-muted)]">(비우면 제한 없음)</span></label>
        <input id="gatheringCapacity" value={capacity} onChange={(event) => setCapacity(event.target.value)} inputMode="numeric" placeholder="예: 8" className={fieldClass} />
      </div>
      <div>
        <label htmlFor="gatheringClosesAt" className={labelClass}>마감 시각 <span className="font-medium text-[var(--app-muted)]">(비우면 직접 마감)</span></label>
        <input id="gatheringClosesAt" type="datetime-local" value={closesAt} onChange={(event) => setClosesAt(event.target.value)} className={fieldClass} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="gatheringNoteLabel" className={labelClass}>신청할 때 물어볼 것 <span className="font-medium text-[var(--app-muted)]">(선택)</span></label>
        <input id="gatheringNoteLabel" value={noteLabel} onChange={(event) => setNoteLabel(event.target.value)} maxLength={40} placeholder="예: 티셔츠 사이즈, 하고 싶은 주제" className={fieldClass} />
        <p className="mt-1 text-xs text-[var(--app-muted)]">답은 연 사람과 답한 본인에게만 보입니다.</p>
      </div>
      {error && <p role="alert" className="text-sm font-semibold text-red-600 sm:col-span-2 dark:text-red-300">{error}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" onClick={onCancel} className="apple-action-secondary min-h-10 px-4 text-sm">취소</button>
        <button type="submit" disabled={mutation.isPending} className="apple-action-primary min-h-10 px-5 text-sm disabled:cursor-not-allowed disabled:opacity-60">
          {mutation.isPending ? '여는 중...' : '모임 열기'}
        </button>
      </div>
    </form>
  )
}

// ---- one gathering ---------------------------------------------------------------

function GatheringView({ id }: { id: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const detailQuery = useQuery({ queryKey: detailKey(id), queryFn: () => getGathering(id) })
  const detail = detailQuery.data
  const [note, setNote] = useState<string | null>(null)

  const settle = (next: GatheringDetail) => {
    queryClient.setQueryData(detailKey(id), next)
    queryClient.invalidateQueries({ queryKey: LIST_KEY, exact: true })
  }
  const fail = (fallback: string) => (err: Error) => {
    showToast({ message: err.message || fallback, tone: 'error' })
    // The refusal usually means the page is behind (it filled up, it closed).
    detailQuery.refetch()
  }
  const joinMutation = useMutation({
    mutationFn: (value: string) => joinGathering(id, value),
    onSuccess: (next) => {
      const already = detail?.gathering.joined
      settle(next)
      setNote(null)
      showToast({ message: already ? '답을 고쳤습니다.' : '신청했습니다.', tone: 'success' })
    },
    onError: fail('신청하지 못했습니다.'),
  })
  const leaveMutation = useMutation({
    mutationFn: () => leaveGathering(id),
    onSuccess: (next) => { settle(next); setNote(null); showToast({ message: '신청을 취소했습니다.' }) },
    onError: fail('취소하지 못했습니다.'),
  })
  const removeMutation = useMutation({
    mutationFn: (signupId: number) => removeGatheringSignup(id, signupId),
    onSuccess: (next) => { settle(next); showToast({ message: '명단에서 뺐습니다.' }) },
    onError: fail('명단에서 빼지 못했습니다.'),
  })
  const closeMutation = useMutation({
    mutationFn: () => closeGathering(id),
    onSuccess: (next) => { settle(next); showToast({ message: '모임을 마감했습니다.' }) },
    onError: fail('마감하지 못했습니다.'),
  })
  const deleteMutation = useMutation({
    mutationFn: () => deleteGathering(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: detailKey(id) })
      queryClient.invalidateQueries({ queryKey: LIST_KEY, exact: true })
      showToast({ message: '모임을 지웠습니다.' })
      navigate('/gatherings')
    },
    onError: (err: Error) => showToast({ message: err.message || '지우지 못했습니다.', tone: 'error' }),
  })

  const back = (
    <div className="flex justify-center sm:justify-start">
      <button type="button" onClick={() => navigate('/gatherings')} className="apple-action-secondary px-4 py-2 text-sm">모임 목록으로</button>
    </div>
  )

  if (detailQuery.isLoading) {
    return (
      <div className="mx-auto w-full min-w-0 max-w-5xl space-y-4">
        {back}
        <section className="apple-board-shell p-6">
          <SkeletonGroup label="모임을 불러오는 중">
            <div className="space-y-3">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-80" />
              <Skeleton className="h-24 w-full" />
            </div>
          </SkeletonGroup>
        </section>
      </div>
    )
  }
  if (detailQuery.isError || !detail) {
    return (
      <div className="mx-auto w-full min-w-0 max-w-5xl space-y-4">
        {back}
        <ErrorState message={(detailQuery.error as Error)?.message || '모임을 불러오지 못했습니다.'} onRetry={() => detailQuery.refetch()} />
      </div>
    )
  }

  const { gathering, participants } = detail
  const state = gatheringState(gathering)
  const mine = participants.find((participant) => participant.mine)
  const noteValue = note ?? mine?.note ?? ''
  const busy = joinMutation.isPending || leaveMutation.isPending

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      showToast({ message: '링크를 복사했습니다.', tone: 'success' })
    } catch {
      showToast({ message: '복사하지 못했습니다. 주소창의 주소를 복사해 주세요.', tone: 'error' })
    }
  }
  const exportCsv = () => {
    const blob = new Blob([gatheringToCsv(detail)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `coms-gathering-${gathering.id}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }
  const handleLeave = async () => {
    // "취소" as the dialog's own way out would read as cancelling the sign-up.
    if (!(await confirmDialog({ message: '신청을 취소할까요?', confirmText: '신청 취소', cancelText: '그대로 두기', tone: 'danger' }))) return
    leaveMutation.mutate()
  }
  const handleRemove = async (signupId: number, name: string) => {
    if (!(await confirmDialog({ message: `${name} 님을 명단에서 뺄까요?`, tone: 'danger' }))) return
    removeMutation.mutate(signupId)
  }
  const handleClose = async () => {
    if (!(await confirmDialog({ message: '지금 마감할까요? 마감하면 더 신청하거나 취소할 수 없습니다.' }))) return
    closeMutation.mutate()
  }
  const handleDelete = async () => {
    if (!(await confirmDialog({ message: `"${gathering.title}" 모임과 ${gathering.participantCount}명의 신청을 지울까요?`, tone: 'danger' }))) return
    deleteMutation.mutate()
  }
  const submitJoin = (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    joinMutation.mutate(noteValue.trim())
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-4">
      {back}
      <section className="apple-board-shell">
        <PageHead title={gathering.title} copy={gathering.description}>
          <button type="button" onClick={copyLink} className="apple-action-secondary inline-flex min-h-10 items-center gap-1.5 px-4 text-sm">
            <Link2 size={14} aria-hidden="true" />
            링크 복사
          </button>
        </PageHead>

        <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="coms-gather-panel">
            <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--app-muted)]">
              <StateChip gathering={gathering} />
              <span>{gathering.creatorName} 님이 열었습니다</span>
            </p>
            <p className="mt-4 text-lg"><Places gathering={gathering} /></p>
            {gathering.closesAt && (
              <p className="mt-2 text-xs font-semibold text-[var(--app-muted)]">
                {gathering.open ? `${formatGatheringTime(gathering.closesAt)}까지 받습니다` : `${formatGatheringTime(gathering.closesAt)} 마감`}
              </p>
            )}

            {state === 'closed' && (
              <p className="mt-5 text-sm font-semibold text-[var(--app-text)]" role="status">
                {gathering.joined ? '신청한 채로 마감되었습니다.' : '마감되었습니다.'}
              </p>
            )}
            {state === 'full' && !gathering.joined && (
              <p className="mt-5 text-sm font-semibold text-[var(--app-text)]" role="status">정원이 찼습니다. 자리가 나면 신청할 수 있습니다.</p>
            )}
            {gathering.open && (gathering.joined || !gathering.full) && (
              <form onSubmit={submitJoin} className="mt-5 space-y-3" aria-label={gathering.joined ? '내 신청' : '신청하기'}>
                {gathering.joined && (
                  <p className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--app-accent-text)]" role="status">
                    <Check size={15} strokeWidth={3} aria-hidden="true" />
                    신청했습니다
                  </p>
                )}
                {gathering.noteLabel && (
                  <div>
                    <label htmlFor="gatheringNote" className={labelClass}>{gathering.noteLabel}</label>
                    <input id="gatheringNote" value={noteValue} onChange={(event) => setNote(event.target.value)} maxLength={100} className={fieldClass} />
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {!gathering.joined && (
                    <button type="submit" disabled={busy} className="apple-action-primary min-h-11 flex-1 px-5 text-sm disabled:cursor-not-allowed disabled:opacity-60">
                      {joinMutation.isPending ? '신청하는 중...' : '신청하기'}
                    </button>
                  )}
                  {gathering.joined && gathering.noteLabel && (
                    <button type="submit" disabled={busy || noteValue.trim() === (mine?.note ?? '')} className="apple-action-secondary min-h-10 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-50">답 고치기</button>
                  )}
                  {gathering.joined && (
                    <button type="button" onClick={handleLeave} disabled={busy} className="apple-action-secondary min-h-10 px-4 text-sm text-red-600 disabled:opacity-50 dark:text-red-300">신청 취소</button>
                  )}
                </div>
              </form>
            )}

            {gathering.canManage && (
              <div className="mt-6 flex flex-wrap gap-2 border-t border-[var(--app-hairline)] pt-4">
                {gathering.open && (
                  <button type="button" onClick={handleClose} disabled={closeMutation.isPending} className="apple-action-secondary min-h-9 px-3 text-xs">지금 마감</button>
                )}
                <button type="button" onClick={exportCsv} disabled={participants.length === 0} className="apple-action-secondary inline-flex min-h-9 items-center gap-1.5 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-50">
                  <Download size={13} aria-hidden="true" />
                  명단 내보내기
                </button>
                <button type="button" onClick={handleDelete} disabled={deleteMutation.isPending} className="apple-action-secondary inline-flex min-h-9 items-center gap-1.5 px-3 text-xs text-red-600 dark:text-red-300">
                  <Trash2 size={13} aria-hidden="true" />
                  모임 지우기
                </button>
              </div>
            )}
          </div>

          <div className="min-w-0">
            <h2 className="text-base font-bold text-[var(--app-text)]">
              신청한 사람 <span className="text-[var(--app-accent-text)]">{participants.length}명</span>
            </h2>
            {participants.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--app-muted)]">아직 신청한 사람이 없습니다. 첫 번째로 이름을 올려 보세요.</p>
            ) : (
              <ol className="coms-gather-list" aria-label="신청한 사람">
                {participants.map((participant, index) => (
                  <li key={participant.id} className={participant.mine ? 'is-mine' : ''}>
                    <span className="coms-gather-order" aria-hidden="true">{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold text-[var(--app-text)]">
                        {participant.name}
                        {participant.mine && <span className="ml-1.5 text-xs font-semibold text-[var(--app-accent-text)]">나</span>}
                      </span>
                      {participant.note && <span className="mt-0.5 block break-words text-xs text-[var(--app-muted)]">{participant.note}</span>}
                    </span>
                    {gathering.canManage && !participant.mine && (
                      <button type="button" onClick={() => handleRemove(participant.id, participant.name)} disabled={removeMutation.isPending} className="shrink-0 text-xs font-semibold text-[var(--app-muted)] hover:text-red-500" aria-label={`${participant.name} 님을 명단에서 빼기`}>
                        빼기
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
