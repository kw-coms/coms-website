import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CalendarClock, CalendarPlus, Check, ChevronLeft, ChevronRight, Plus, Trash2, Users } from 'lucide-react'
import {
  clearMeetingPollAvailability,
  createMeetingPoll,
  deleteMeetingPoll,
  getMeetingPoll,
  listMeetingPolls,
  saveMeetingPollAvailability,
} from '../services/meetingPollApi'
import {
  MAX_POLL_DATES,
  bestRanges,
  countsPerSlot,
  formatMinute,
  formatPollDate,
  monthCells,
  namesAt,
  normalizeSlots,
  paintRectangle,
  shortPollDate,
  slotsPerDay,
  summarizeDates,
  timeOptions,
  toIsoDate,
  toggleDay,
  toggleRow,
  toggleSlot,
  totalSlots,
  type MeetingPollDetail,
  type MeetingPollParticipant,
  type BestRange,
  type MeetingPollSummary,
} from '../utils/meetingPoll'
import { createClubActivity } from '../services/clubActivityApi'
import { CLUB_ACTIVITIES_QUERY_KEY } from '../shared/homeUi'
import { usePermissions } from '../contexts/usePermissions'
import { canManageContent } from '../utils/roleAccess'
import { useAuth } from '../contexts/useAuth'
import { showToast } from '../components/common/Toast'
import { confirmDialog } from '../components/common/ConfirmDialog'
import ErrorState from '../components/common/ErrorState'
import { Skeleton, SkeletonGroup } from '../components/common/Skeleton'

/**
 * Meeting polls ("일정 조율"): a member opens a poll over a few dates and a daily time window,
 * everyone paints the half hours they are free, and the page shows when the most people can
 * meet. /meet is the list (and the form for a new poll), /meet/:id one poll.
 */

const POLLS_KEY = ['meeting-polls']
const pollKey = (id: number | string) => [...POLLS_KEY, String(id)]
const TIME_OPTIONS = timeOptions()
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

export default function MeetingPolls() {
  const { id } = useParams()
  return id ? <PollView id={id} /> : <PollList />
}

function PageHead({ title, copy, children }: { title: string; copy: string; children?: React.ReactNode }) {
  return (
    <div className="apple-board-hero px-5 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <span className="coms-icon coms-board-icon" aria-hidden="true"><CalendarClock size={22} strokeWidth={2} /></span>
          <p className="apple-eyebrow">Meet</p>
          <h1 className="apple-display mt-2 break-words text-4xl sm:text-5xl">{title}</h1>
          <p className="apple-copy mt-3 max-w-2xl text-base sm:text-lg">{copy}</p>
        </div>
        {children}
      </div>
    </div>
  )
}

// ---- list ---------------------------------------------------------------------

function PollList() {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const pollsQuery = useQuery({ queryKey: POLLS_KEY, queryFn: listMeetingPolls })
  const polls = pollsQuery.data ?? []

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-4">
      <div className="flex justify-center sm:justify-start">
        <button type="button" onClick={() => navigate('/')} className="apple-action-secondary px-4 py-2 text-sm">메인으로 돌아가기</button>
      </div>
      <section className="apple-board-shell">
        <PageHead title="일정 조율" copy="여러 날짜와 시간 가운데 모두가 되는 때를 찾습니다. 각자 가능한 시간을 칠하면 겹치는 시간이 보입니다.">
          <button
            type="button"
            onClick={() => setCreating((open) => !open)}
            aria-expanded={creating}
            className="apple-action-primary inline-flex min-h-11 items-center justify-center gap-2 px-5 text-sm max-md:w-full sm:min-h-10"
          >
            <Plus size={15} aria-hidden="true" />
            새 일정 조율
          </button>
        </PageHead>

        {creating && (
          <div className="border-b border-[var(--app-hairline)] p-4 sm:p-6">
            <CreatePollForm onCancel={() => setCreating(false)} onCreated={(detail) => navigate(`/meet/${detail.poll.id}`)} />
          </div>
        )}

        <div className="p-4 sm:p-6">
          {pollsQuery.isLoading && (
            <SkeletonGroup label="일정 조율 목록을 불러오는 중">
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
          {pollsQuery.isError && (
            <ErrorState message={(pollsQuery.error as Error)?.message || '일정 조율 목록을 불러오지 못했습니다.'} onRetry={() => pollsQuery.refetch()} />
          )}
          {pollsQuery.isSuccess && polls.length === 0 && (
            <p className="py-10 text-center text-sm text-[var(--app-muted)]">
              아직 열린 일정 조율이 없습니다. 스터디나 회의 시간을 정할 때 새로 만들어 보세요.
            </p>
          )}
          {polls.length > 0 && (
            <ul className="grid gap-3 md:grid-cols-2">
              {polls.map((poll) => (
                <li key={poll.id}>
                  <button type="button" onClick={() => navigate(`/meet/${poll.id}`)} className="coms-card w-full">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="coms-card-eyebrow">{poll.creatorName}</span>
                      {poll.answered && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--app-accent-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--app-accent-text)]">
                          <Check size={11} strokeWidth={3} aria-hidden="true" />
                          응답함
                        </span>
                      )}
                    </span>
                    <span className="coms-card-title block">{poll.title}</span>
                    <span className="coms-card-body block">
                      {summarizeDates(poll.dates)}
                      <br />
                      {formatMinute(poll.startMinute)} ~ {formatMinute(poll.endMinute)}
                    </span>
                    <span className="coms-card-go">
                      <Users size={15} aria-hidden="true" />
                      {poll.participantCount}명 응답
                    </span>
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

// ---- new poll -------------------------------------------------------------------

function CreatePollForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (detail: MeetingPollDetail) => void }) {
  const queryClient = useQueryClient()
  const today = useMemo(() => new Date(), [])
  const todayIso = toIsoDate(today)
  const lastIso = toIsoDate(new Date(today.getFullYear() + 1, today.getMonth(), today.getDate()))
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dates, setDates] = useState<string[]>([])
  const [startMinute, setStartMinute] = useState(10 * 60)
  const [endMinute, setEndMinute] = useState(22 * 60)
  const [month, setMonth] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: createMeetingPoll,
    onSuccess: (detail) => {
      queryClient.invalidateQueries({ queryKey: POLLS_KEY })
      queryClient.setQueryData(pollKey(detail.poll.id), detail)
      showToast({ message: '일정 조율을 만들었습니다. 가능한 시간을 칠해 주세요.', tone: 'success' })
      onCreated(detail)
    },
    onError: (err: Error) => setError(err.message || '일정 조율을 만들지 못했습니다.'),
  })

  const toggleDate = (iso: string) => {
    setError('')
    setDates((current) => {
      if (current.includes(iso)) return current.filter((date) => date !== iso)
      if (current.length >= MAX_POLL_DATES) {
        setError(`날짜는 ${MAX_POLL_DATES}개까지 고를 수 있습니다.`)
        return current
      }
      return [...current, iso].sort()
    })
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (mutation.isPending) return
    if (!title.trim()) return setError('제목을 입력해 주세요.')
    if (dates.length === 0) return setError('날짜를 하나 이상 골라 주세요.')
    if (startMinute >= endMinute) return setError('끝나는 시간이 시작 시간보다 늦어야 합니다.')
    setError('')
    mutation.mutate({ title: title.trim(), description: description.trim(), dates, startMinute, endMinute })
  }

  const cells = monthCells(month.year, month.month)
  const moveMonth = (delta: number) => {
    const next = new Date(month.year, month.month + delta, 1)
    setMonth({ year: next.getFullYear(), month: next.getMonth() })
  }
  const inputClass = 'w-full rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2.5 text-sm text-[var(--app-text)] outline-none placeholder:text-[var(--app-subtle)]'

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" aria-label="새 일정 조율">
      <div className="space-y-4">
        <div>
          <label htmlFor="meetTitle" className="mb-1.5 block text-xs font-bold text-[var(--app-text)]">제목</label>
          <input id="meetTitle" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder="예: 웹 스터디 첫 모임" className={inputClass} />
        </div>
        <div>
          <label htmlFor="meetDescription" className="mb-1.5 block text-xs font-bold text-[var(--app-text)]">설명 (선택)</label>
          <textarea id="meetDescription" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={3} placeholder="장소나 준비물처럼 함께 알릴 내용" className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="meetStart" className="mb-1.5 block text-xs font-bold text-[var(--app-text)]">하루 중 시작</label>
            <select id="meetStart" value={startMinute} onChange={(event) => setStartMinute(Number(event.target.value))} className={inputClass}>
              {TIME_OPTIONS.slice(0, -1).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="meetEnd" className="mb-1.5 block text-xs font-bold text-[var(--app-text)]">하루 중 끝</label>
            <select id="meetEnd" value={endMinute} onChange={(event) => setEndMinute(Number(event.target.value))} className={inputClass}>
              {TIME_OPTIONS.slice(1).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600 dark:text-red-300">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={mutation.isPending} className="apple-action-primary min-h-10 px-5 text-sm disabled:cursor-not-allowed disabled:opacity-60">
            {mutation.isPending ? '만드는 중...' : '만들기'}
          </button>
          <button type="button" onClick={onCancel} className="apple-action-secondary min-h-10 px-5 text-sm">취소</button>
        </div>
      </div>

      <fieldset className="coms-meet-month">
        <legend className="mb-2 text-xs font-bold text-[var(--app-text)]">
          날짜 고르기 <span className="font-semibold text-[var(--app-muted)]">({dates.length}/{MAX_POLL_DATES})</span>
        </legend>
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => moveMonth(-1)} aria-label="이전 달" className="coms-meet-month-nav"><ChevronLeft size={16} aria-hidden="true" /></button>
          <p className="text-sm font-bold text-[var(--app-text)]" aria-live="polite">{month.year}년 {month.month + 1}월</p>
          <button type="button" onClick={() => moveMonth(1)} aria-label="다음 달" className="coms-meet-month-nav"><ChevronRight size={16} aria-hidden="true" /></button>
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1 text-center">
          {WEEKDAY_LABELS.map((label) => (
            <span key={label} className="py-1 text-[11px] font-bold text-[var(--app-subtle)]" aria-hidden="true">{label}</span>
          ))}
          {cells.map((iso, index) => {
            if (!iso) return <span key={`blank-${index}`} />
            const selected = dates.includes(iso)
            const disabled = iso < todayIso || iso > lastIso
            return (
              <button
                key={iso}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                aria-label={formatPollDate(iso)}
                onClick={() => toggleDate(iso)}
                className={`coms-meet-day ${selected ? 'is-selected' : ''} ${iso === todayIso ? 'is-today' : ''}`}
              >
                {Number(iso.slice(8))}
              </button>
            )
          })}
        </div>
      </fieldset>
    </form>
  )
}

// ---- one poll ---------------------------------------------------------------------

function PollView({ id }: { id: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const pollQuery = useQuery({ queryKey: pollKey(id), queryFn: () => getMeetingPoll(id) })
  const detail = pollQuery.data
  const poll = detail?.poll
  const savedSlots = useMemo(() => {
    if (!detail) return ''
    return normalizeSlots(detail.participants.find((participant) => participant.mine)?.slots, detail.poll)
  }, [detail])
  const hasAnswer = Boolean(detail?.participants.some((participant) => participant.mine))

  // The member's answer while it is being painted. It follows the saved answer until the first
  // change, and again after a save.
  const [draft, setDraft] = useState<string | null>(null)
  const mySlots = draft ?? savedSlots
  const dirty = draft !== null && draft !== savedSlots
  const [focusIndex, setFocusIndex] = useState<number | null>(null)

  const apply = (next: MeetingPollDetail) => {
    queryClient.setQueryData(pollKey(id), next)
    queryClient.invalidateQueries({ queryKey: POLLS_KEY, exact: true })
    setDraft(null)
  }
  const saveMutation = useMutation({
    mutationFn: (slots: string) => saveMeetingPollAvailability(id, slots),
    onSuccess: (next) => { apply(next); showToast({ message: '가능한 시간을 저장했습니다.', tone: 'success' }) },
    onError: (err: Error) => showToast({ message: err.message || '저장하지 못했습니다.', tone: 'error' }),
  })
  const clearMutation = useMutation({
    mutationFn: () => clearMeetingPollAvailability(id),
    onSuccess: (next) => { apply(next); showToast({ message: '내 응답을 지웠습니다.' }) },
    onError: (err: Error) => showToast({ message: err.message || '지우지 못했습니다.', tone: 'error' }),
  })
  const deleteMutation = useMutation({
    mutationFn: () => deleteMeetingPoll(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: pollKey(id) })
      queryClient.invalidateQueries({ queryKey: POLLS_KEY, exact: true })
      showToast({ message: '일정 조율을 지웠습니다.' })
      navigate('/meet')
    },
    onError: (err: Error) => showToast({ message: err.message || '지우지 못했습니다.', tone: 'error' }),
  })

  // Everyone's answers as the group grid shows them: the member's own row follows what is
  // being painted, so the overlap updates before saving.
  const participants = useMemo<MeetingPollParticipant[]>(() => {
    if (!detail) return []
    const others = detail.participants.filter((participant) => !participant.mine)
    const showMine = hasAnswer || mySlots.includes('1')
    return showMine ? [...others, { name: user?.name || '나', mine: true, slots: mySlots }] : others
  }, [detail, hasAnswer, mySlots, user?.name])

  // Whoever may write to the club calendar can put one of the suggested times on it.
  const { permissions } = usePermissions()
  const canRegister = canManageContent(permissions)
  const registerMutation = useMutation({
    mutationFn: (range: BestRange) => createClubActivity({
      kind: 'SCHEDULE',
      category: 'GENERAL',
      title: poll?.title || '모임',
      description: poll?.description || undefined,
      eventDate: range.date,
      endDate: range.date,
      startTime: formatMinute(range.startMinute),
      // The calendar has no 24:00; a stretch that runs to midnight ends at 23:59.
      endTime: range.endMinute >= 24 * 60 ? '23:59' : formatMinute(range.endMinute),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CLUB_ACTIVITIES_QUERY_KEY })
      showToast({ message: '캘린더에 등록했습니다. 일정 캘린더에서 확인할 수 있습니다.', tone: 'success' })
    },
    onError: (err: Error) => showToast({ message: err.message || '캘린더에 등록하지 못했습니다.', tone: 'error' }),
  })
  const handleRegister = async (range: BestRange) => {
    if (!poll || registerMutation.isPending) return
    const when = `${formatPollDate(range.date)} ${formatMinute(range.startMinute)} ~ ${formatMinute(range.endMinute)}`
    if (!(await confirmDialog({ message: `"${poll.title}"을(를) ${when} 일정으로 동아리 캘린더에 등록할까요?` }))) return
    registerMutation.mutate(range)
  }

  const handleDelete = async () => {
    if (!poll) return
    if (!(await confirmDialog({ message: `"${poll.title}" 일정 조율을 지울까요? 모든 응답이 함께 지워집니다.`, tone: 'danger' }))) return
    deleteMutation.mutate()
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl space-y-4">
      <div className="flex justify-center sm:justify-start">
        <button type="button" onClick={() => navigate('/meet')} className="apple-action-secondary inline-flex items-center gap-1.5 px-4 py-2 text-sm">
          <ArrowLeft size={14} aria-hidden="true" />
          일정 조율 목록
        </button>
      </div>
      <section className="apple-board-shell">
        {pollQuery.isLoading && (
          <SkeletonGroup label="일정 조율을 불러오는 중">
            <div className="space-y-4 p-6">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-80" />
              <Skeleton className="h-64 w-full" />
            </div>
          </SkeletonGroup>
        )}
        {pollQuery.isError && (
          <div className="p-6">
            <ErrorState message={(pollQuery.error as Error)?.message || '일정 조율을 불러오지 못했습니다.'} onRetry={() => pollQuery.refetch()} />
          </div>
        )}
        {poll && detail && (
          <>
            <PageHead title={poll.title} copy={poll.description || `${poll.creatorName} 님이 연 일정 조율입니다.`}>
              {poll.canDelete && (
                <button type="button" onClick={handleDelete} disabled={deleteMutation.isPending} className="apple-action-secondary inline-flex min-h-10 items-center gap-1.5 px-4 text-sm text-red-600 dark:text-red-300">
                  <Trash2 size={14} aria-hidden="true" />
                  지우기
                </button>
              )}
            </PageHead>
            <p className="border-b border-[var(--app-hairline)] px-5 py-3 text-xs font-semibold text-[var(--app-muted)] sm:px-8">
              {summarizeDates(poll.dates)} · {formatMinute(poll.startMinute)} ~ {formatMinute(poll.endMinute)} · {poll.creatorName} · {participants.length}명 응답
            </p>

            <div className="grid gap-6 p-4 sm:p-6 xl:grid-cols-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-[var(--app-text)]">내 가능 시간</h2>
                  <div className="flex flex-wrap gap-2">
                    {hasAnswer && (
                      <button type="button" onClick={() => clearMutation.mutate()} disabled={clearMutation.isPending} className="apple-action-secondary min-h-9 px-3 text-xs">
                        내 응답 지우기
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => saveMutation.mutate(mySlots)}
                      disabled={saveMutation.isPending || (!dirty && hasAnswer)}
                      className="apple-action-primary min-h-9 min-w-[6.5rem] px-4 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saveMutation.isPending ? '저장 중...' : dirty || !hasAnswer ? '내 시간 저장' : '저장됨'}
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-[var(--app-muted)]">
                  되는 시간을 누르거나 끌어서 칠하세요. 날짜나 시간을 누르면 한 줄이 한꺼번에 바뀝니다.
                </p>
                {/* Always in the layout, only shown when there is something to say: if it came and
                    went, the grid below would jump under the pointer the moment painting begins. */}
                <p className={`mt-0.5 text-xs font-bold text-[var(--app-accent-text)] ${dirty ? '' : 'invisible'}`} aria-hidden={!dirty}>
                  저장하지 않은 변경이 있습니다.
                </p>
                <EditGrid poll={poll} slots={mySlots} onChange={setDraft} />
              </div>

              <div className="min-w-0">
                <h2 className="text-base font-bold text-[var(--app-text)]">모두의 가능 시간</h2>
                <p className="mt-1 text-xs text-[var(--app-muted)]">색이 진할수록 되는 사람이 많습니다. 칸에 올리거나 누르면 누가 되는지 보입니다.</p>
                <GroupGrid poll={poll} participants={participants} focusIndex={focusIndex} onFocus={setFocusIndex} />
                <SlotInfo poll={poll} participants={participants} index={focusIndex} />
              </div>
            </div>

            <div className="grid gap-6 border-t border-[var(--app-hairline)] p-4 sm:p-6 lg:grid-cols-2">
              <BestTimes poll={poll} participants={participants} onRegister={canRegister ? handleRegister : undefined} busy={registerMutation.isPending} />
              <div>
                <h2 className="text-base font-bold text-[var(--app-text)]">응답한 사람 <span className="text-[var(--app-muted)]">{participants.length}명</span></h2>
                {participants.length === 0 ? (
                  <p className="mt-2 text-sm text-[var(--app-muted)]">아직 응답한 사람이 없습니다. 먼저 칠해 보세요.</p>
                ) : (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {participants.map((participant, index) => (
                      <li key={`${participant.name}-${index}`} className={`rounded-full border px-3 py-1 text-xs font-semibold ${participant.mine ? 'border-[var(--app-accent)] text-[var(--app-accent-text)]' : 'border-[var(--app-hairline)] text-[var(--app-text)]'}`}>
                        {participant.name}{participant.mine ? ' (나)' : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

// ---- grids ------------------------------------------------------------------------

function slotLabel(poll: MeetingPollSummary, day: number, slot: number) {
  const start = poll.startMinute + slot * poll.slotMinutes
  return `${formatPollDate(poll.dates[day])} ${formatMinute(start)}`
}

/** Moves focus between the cells of a grid with the arrow keys. */
function moveCellFocus(event: React.KeyboardEvent<HTMLElement>, day: number, slot: number, days: number, perDay: number) {
  const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
  const move = moves[event.key]
  if (!move) return
  const nextDay = day + move[0]
  const nextSlot = slot + move[1]
  if (nextDay < 0 || nextDay >= days || nextSlot < 0 || nextSlot >= perDay) return
  event.preventDefault()
  event.currentTarget.closest('table')?.querySelector<HTMLElement>(`[data-cell="${nextDay}-${nextSlot}"]`)?.focus()
}

function GridFrame({ poll, label, dayHeader, rowHeader, cell }: {
  poll: MeetingPollSummary
  label: string
  dayHeader: (day: number) => React.ReactNode
  rowHeader: (slot: number, text: string) => React.ReactNode
  cell: (day: number, slot: number) => React.ReactNode
}) {
  const perDay = slotsPerDay(poll)
  return (
    <div className="coms-meet-scroll">
      <table className="coms-meet-grid" aria-label={label}>
        <thead>
          <tr>
            <td />
            {poll.dates.map((date, day) => <th key={date} scope="col">{dayHeader(day)}</th>)}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: perDay }, (_, slot) => {
            const minute = poll.startMinute + slot * poll.slotMinutes
            const onTheHour = minute % 60 === 0
            return (
              <tr key={slot} className={onTheHour ? 'is-hour' : ''}>
                <th scope="row">{rowHeader(slot, onTheHour ? formatMinute(minute) : '')}</th>
                {poll.dates.map((date, day) => <td key={date}>{cell(day, slot)}</td>)}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function DayHeading({ iso }: { iso: string }) {
  const { day, weekday } = shortPollDate(iso)
  return (
    <>
      <span className="block text-[11px] font-bold">{day}</span>
      <span className="block text-[10px] font-semibold opacity-70">{weekday}</span>
    </>
  )
}

function EditGrid({ poll, slots, onChange }: { poll: MeetingPollSummary; slots: string; onChange: (slots: string) => void }) {
  const perDay = slotsPerDay(poll)
  const days = poll.dates.length
  // A drag with the mouse or a pen paints the rectangle from where it began. Touch scrolls
  // the page as usual and toggles one cell per tap.
  const drag = useRef<{ from: { day: number; slot: number }; value: '0' | '1'; base: string } | null>(null)
  const skipClick = useRef(false)

  useEffect(() => {
    const end = () => {
      drag.current = null
      // A press and release on one cell is followed by a click, which the flag tells click()
      // to ignore. A drag released on another cell gets no click, so clear the flag once the
      // click, if any, has been delivered; otherwise the next tap or key press would be lost.
      window.setTimeout(() => { skipClick.current = false }, 0)
    }
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [])

  const begin = (event: React.PointerEvent, day: number, slot: number) => {
    if (event.pointerType === 'touch' || event.button !== 0) return
    const value = slots[day * perDay + slot] === '1' ? '0' : '1'
    drag.current = { from: { day, slot }, value, base: slots }
    skipClick.current = true
    onChange(paintRectangle(slots, perDay, { day, slot }, { day, slot }, value))
  }
  const extend = (day: number, slot: number) => {
    const current = drag.current
    if (!current) return
    onChange(paintRectangle(current.base, perDay, current.from, { day, slot }, current.value))
  }
  const click = (day: number, slot: number) => {
    // The pointer already painted this cell; only taps and the keyboard arrive here unpainted.
    if (skipClick.current) { skipClick.current = false; return }
    onChange(toggleSlot(slots, day * perDay + slot))
  }

  return (
    <GridFrame
      poll={poll}
      label="내 가능 시간"
      dayHeader={(day) => (
        <button type="button" onClick={() => onChange(toggleDay(slots, perDay, day))} aria-label={`${formatPollDate(poll.dates[day])} 전체 바꾸기`} className="coms-meet-head">
          <DayHeading iso={poll.dates[day]} />
        </button>
      )}
      rowHeader={(slot, text) => (
        <button
          type="button"
          onClick={() => onChange(toggleRow(slots, perDay, days, slot))}
          aria-label={`${formatMinute(poll.startMinute + slot * poll.slotMinutes)} 모든 날짜 바꾸기`}
          className="coms-meet-time"
        >
          {text}
        </button>
      )}
      cell={(day, slot) => {
        const on = slots[day * perDay + slot] === '1'
        return (
          <button
            type="button"
            data-cell={`${day}-${slot}`}
            aria-pressed={on}
            aria-label={slotLabel(poll, day, slot)}
            onPointerDown={(event) => begin(event, day, slot)}
            onPointerEnter={() => extend(day, slot)}
            onClick={() => click(day, slot)}
            onKeyDown={(event) => moveCellFocus(event, day, slot, days, perDay)}
            className={`coms-meet-cell coms-meet-cell-edit ${on ? 'is-on' : ''}`}
          />
        )
      }}
    />
  )
}

function GroupGrid({ poll, participants, focusIndex, onFocus }: {
  poll: MeetingPollSummary
  participants: MeetingPollParticipant[]
  focusIndex: number | null
  onFocus: (index: number | null) => void
}) {
  const perDay = slotsPerDay(poll)
  const days = poll.dates.length
  const counts = useMemo(() => countsPerSlot(participants, totalSlots(poll)), [participants, poll])
  const people = participants.length
  return (
    <GridFrame
      poll={poll}
      label="모두의 가능 시간"
      dayHeader={(day) => <span className="coms-meet-head"><DayHeading iso={poll.dates[day]} /></span>}
      rowHeader={(_slot, text) => <span className="coms-meet-time">{text}</span>}
      cell={(day, slot) => {
        const index = day * perDay + slot
        const count = counts[index]
        return (
          <button
            type="button"
            data-cell={`${day}-${slot}`}
            aria-label={`${slotLabel(poll, day, slot)}, ${people}명 중 ${count}명 가능`}
            aria-pressed={focusIndex === index}
            onPointerEnter={() => onFocus(index)}
            onFocus={() => onFocus(index)}
            onClick={() => onFocus(index)}
            onKeyDown={(event) => moveCellFocus(event, day, slot, days, perDay)}
            className={`coms-meet-cell coms-meet-cell-group ${focusIndex === index ? 'is-focus' : ''} ${people > 0 && count === people ? 'is-all' : ''}`}
            style={{ '--level': people > 0 ? count / people : 0 } as React.CSSProperties}
          />
        )
      }}
    />
  )
}

function SlotInfo({ poll, participants, index }: { poll: MeetingPollSummary; participants: MeetingPollParticipant[]; index: number | null }) {
  const perDay = slotsPerDay(poll)
  if (index === null || perDay === 0) {
    return <p className="coms-meet-info" role="status">칸을 고르면 그 시간에 되는 사람이 여기에 보입니다.</p>
  }
  const day = Math.floor(index / perDay)
  const slot = index % perDay
  const start = poll.startMinute + slot * poll.slotMinutes
  const { free, busy } = namesAt(participants, index)
  return (
    <div className="coms-meet-info" role="status">
      <p className="font-bold text-[var(--app-text)]">
        {formatPollDate(poll.dates[day])} {formatMinute(start)} ~ {formatMinute(start + poll.slotMinutes)}
        <span className="ml-2 text-[var(--app-accent-text)]">{participants.length}명 중 {free.length}명 가능</span>
      </p>
      <p className="mt-1"><span className="font-semibold text-[var(--app-text)]">되는 사람</span> {free.length ? free.join(', ') : '없음'}</p>
      {busy.length > 0 && <p className="mt-0.5"><span className="font-semibold text-[var(--app-text)]">안 되는 사람</span> {busy.join(', ')}</p>}
    </div>
  )
}

function BestTimes({ poll, participants, onRegister, busy = false }: {
  poll: MeetingPollSummary
  participants: MeetingPollParticipant[]
  onRegister?: (range: BestRange) => void
  busy?: boolean
}) {
  const ranges = useMemo(() => bestRanges(poll, participants, 5), [poll, participants])
  return (
    <div>
      <h2 className="text-base font-bold text-[var(--app-text)]">가장 많이 되는 시간</h2>
      {ranges.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--app-muted)]">응답이 모이면 겹치는 시간이 여기에 나옵니다.</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {ranges.map((range, index) => (
            <li key={`${range.date}-${range.startMinute}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-3 text-sm">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--app-accent-soft)] text-xs font-bold text-[var(--app-accent-text)]">{index + 1}</span>
              <span className="font-bold text-[var(--app-text)]">{formatPollDate(range.date)}</span>
              <span className="font-semibold text-[var(--app-text)]">{formatMinute(range.startMinute)} ~ {formatMinute(range.endMinute)}</span>
              <span className="ml-auto text-xs font-bold text-[var(--app-accent-text)]">
                {range.count === participants.length ? `${range.count}명 모두 가능` : `${participants.length}명 중 ${range.count}명`}
              </span>
              {onRegister && (
                <button
                  type="button"
                  onClick={() => onRegister(range)}
                  disabled={busy}
                  aria-label={`${formatPollDate(range.date)} ${formatMinute(range.startMinute)} 캘린더에 등록`}
                  className="apple-action-secondary inline-flex min-h-8 items-center gap-1 px-2.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CalendarPlus size={12} aria-hidden="true" />
                  캘린더에 등록
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
