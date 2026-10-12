import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ClipboardCheck, Download, Maximize2, Minimize2, Trash2, Users } from 'lucide-react'
import {
  checkInToAttendance,
  closeAttendanceSession,
  deleteAttendanceSession,
  getAttendanceSession,
  getAttendanceSummary,
  listAttendanceSessions,
  openAttendanceSession,
  type AttendanceSession,
  type AttendanceSummary,
} from '../services/attendanceApi'
import {
  attendanceSummaryToCsv,
  cleanAttendanceCode,
  formatAttendanceDay,
  formatAttendanceTime,
  remainingLabel,
  secondsLeft,
} from '../utils/attendance'
import { compareNumber, compareText, matchesQuery, nextColumnSort, sortedBy, type SortDirection } from '../utils/listTools'
import { ListCount, ListSearch, SortableTh } from '../components/common/ListTools'
import { usePermissions } from '../contexts/usePermissions'
import { canManageContent } from '../utils/roleAccess'
import { showToast } from '../components/common/Toast'
import { confirmDialog } from '../components/common/ConfirmDialog'
import ErrorState from '../components/common/ErrorState'
import { Skeleton, SkeletonGroup } from '../components/common/Skeleton'

/**
 * Attendance ("출석 체크"). Whoever runs a seminar opens a check and shows its four-digit
 * code; members type the code here from their own devices while it is open. Every member sees
 * their own attendance; who attended, and how often, is shown to those who may run attendance.
 */

const SESSIONS_KEY = ['attendance', 'sessions']
const SUMMARY_KEY = ['attendance', 'summary']
const DURATIONS = [10, 20, 30, 60, 120]
/** How many of the latest checks the summary draws as dots per member. */
const RECENT_DOTS = 12

export default function Attendance() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { permissions } = usePermissions()
  const manager = canManageContent(permissions)
  const sessionsQuery = useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: listAttendanceSessions,
    // While a check is open the head count moves: whoever runs it sees it without reloading.
    refetchInterval: (query) => (manager && (query.state.data ?? []).some((session) => session.open) ? 5000 : false),
  })
  const sessions = sessionsQuery.data ?? []
  const openSessions = sessions.filter((session) => session.open)
  const attended = sessions.filter((session) => session.attended)
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: SESSIONS_KEY })
    queryClient.invalidateQueries({ queryKey: SUMMARY_KEY })
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-4">
      <div className="flex justify-center sm:justify-start">
        <button type="button" onClick={() => navigate('/')} className="apple-action-secondary px-4 py-2 text-sm">메인으로 돌아가기</button>
      </div>
      <section className="apple-board-shell">
        <div className="apple-board-hero px-5 py-6 sm:px-8 sm:py-8">
          <span className="coms-icon coms-board-icon" aria-hidden="true"><ClipboardCheck size={22} strokeWidth={2} /></span>
          <p className="apple-eyebrow">Attendance</p>
          <h1 className="apple-display mt-2 text-4xl sm:text-5xl">출석 체크</h1>
          <p className="apple-copy mt-3 max-w-2xl text-base sm:text-lg">세미나와 모임에서 화면에 뜬 네 자리 코드를 입력하면 출석이 기록됩니다.</p>
        </div>

        <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-2">
          <CheckInPanel openSessions={openSessions} loaded={sessionsQuery.isSuccess} onChecked={refresh} />
          <div>
            <h2 className="text-base font-bold text-[var(--app-text)]">
              내 출석 <span className="text-[var(--app-accent-text)]">{attended.length}회</span>
            </h2>
            {sessionsQuery.isLoading && (
              <SkeletonGroup label="출석 기록을 불러오는 중">
                <div className="mt-3 space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </SkeletonGroup>
            )}
            {sessionsQuery.isError && (
              <ErrorState message={(sessionsQuery.error as Error)?.message || '출석 기록을 불러오지 못했습니다.'} onRetry={() => sessionsQuery.refetch()} />
            )}
            {sessionsQuery.isSuccess && attended.length === 0 && (
              <p className="mt-2 text-sm text-[var(--app-muted)]">아직 출석한 기록이 없습니다.</p>
            )}
            {attended.length > 0 && (
              <ul className="mt-3 space-y-2" aria-label="내 출석 기록">
                {attended.map((session) => (
                  <li key={session.id} className="flex items-center gap-3 rounded-xl border border-[var(--app-hairline)] bg-[var(--app-surface)] px-4 py-3 text-sm">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--app-accent)] text-white"><Check size={13} strokeWidth={3} aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1 truncate font-bold text-[var(--app-text)]">{session.title}</span>
                    <span className="shrink-0 text-xs font-semibold text-[var(--app-muted)]">{formatAttendanceTime(session.openedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {manager && (
          <ManagerPanel sessions={sessions} openSessions={openSessions} receivedAt={sessionsQuery.dataUpdatedAt} onChanged={refresh} />
        )}
      </section>
    </div>
  )
}

function CheckInPanel({ openSessions, loaded, onChecked }: {
  openSessions: AttendanceSession[]
  loaded: boolean
  onChecked: () => void
}) {
  const [code, setCode] = useState('')
  const [result, setResult] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const mutation = useMutation({
    mutationFn: checkInToAttendance,
    onSuccess: (checked) => {
      setCode('')
      setResult({
        tone: 'ok',
        text: checked.alreadyChecked ? `"${checked.title}"에는 이미 출석했습니다.` : `"${checked.title}" 출석이 기록되었습니다.`,
      })
      onChecked()
    },
    onError: (err: Error) => setResult({ tone: 'error', text: err.message || '출석하지 못했습니다.' }),
  })
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (mutation.isPending || code.length !== 4) return
    setResult(null)
    mutation.mutate(code)
  }
  return (
    <form onSubmit={submit} className="coms-attend-panel" aria-label="출석하기">
      <h2 className="text-base font-bold text-[var(--app-text)]">출석하기</h2>
      <p className="mt-1 text-xs text-[var(--app-muted)]">진행하는 사람이 화면에 띄운 네 자리 숫자를 입력하세요.</p>
      <label htmlFor="attendanceCode" className="sr-only">출석 코드</label>
      <input
        id="attendanceCode"
        value={code}
        onChange={(event) => setCode(cleanAttendanceCode(event.target.value))}
        inputMode="numeric"
        autoComplete="one-time-code"
        // No maxLength: the browser would cut a pasted "48 21" to four characters before the
        // spaces are dropped. cleanAttendanceCode keeps the four digits.
        placeholder="0000"
        className="coms-attend-input"
      />
      <button type="submit" disabled={mutation.isPending || code.length !== 4} className="apple-action-primary min-h-11 w-full px-5 text-sm disabled:cursor-not-allowed disabled:opacity-50">
        {mutation.isPending ? '확인 중...' : '출석하기'}
      </button>
      <p role="status" className={`mt-3 min-h-5 text-sm font-semibold ${result?.tone === 'error' ? 'text-red-600 dark:text-red-300' : 'text-[var(--app-accent-text)]'}`}>
        {result?.text}
      </p>
      {/* What can be checked in to right now, so nobody types a code into nothing. */}
      {loaded && (
        openSessions.length === 0 ? (
          <p className="mt-1 text-xs text-[var(--app-muted)]">지금 받고 있는 출석이 없습니다.</p>
        ) : (
          <ul className="mt-1 space-y-1.5" aria-label="지금 받고 있는 출석">
            {openSessions.map((session) => (
              <li key={session.id} className="flex items-center gap-2 text-xs font-semibold text-[var(--app-text)]">
                <span className={`coms-attend-pulse ${session.attended ? 'is-done' : ''}`} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{session.title}</span>
                <span className={session.attended ? 'text-[var(--app-accent-text)]' : 'text-[var(--app-muted)]'}>{session.attended ? '출석 완료' : '받는 중'}</span>
              </li>
            ))}
          </ul>
        )
      )}
    </form>
  )
}

function ManagerPanel({ sessions, openSessions, receivedAt, onChanged }: {
  sessions: AttendanceSession[]
  openSessions: AttendanceSession[]
  /** When the list of sessions arrived: the seconds left in it are counted from then. */
  receivedAt: number
  onChanged: () => void
}) {
  const [title, setTitle] = useState('')
  const [minutes, setMinutes] = useState(30)
  const [error, setError] = useState('')
  const [rosterId, setRosterId] = useState<number | null>(null)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const now = useNow(openSessions.length > 0)
  const pastSessions = sessions.filter((session) => !session.open)

  const openMutation = useMutation({
    mutationFn: openAttendanceSession,
    onSuccess: () => {
      setTitle('')
      setError('')
      showToast({ message: '출석을 열었습니다. 코드를 화면에 보여 주세요.', tone: 'success' })
      onChanged()
    },
    onError: (err: Error) => setError(err.message || '출석을 열지 못했습니다.'),
  })
  const closeMutation = useMutation({
    mutationFn: closeAttendanceSession,
    onSuccess: () => { showToast({ message: '출석을 마감했습니다.' }); onChanged() },
    onError: (err: Error) => showToast({ message: err.message || '마감하지 못했습니다.', tone: 'error' }),
  })
  const deleteMutation = useMutation({
    mutationFn: deleteAttendanceSession,
    onSuccess: () => { setRosterId(null); showToast({ message: '출석 기록을 지웠습니다.' }); onChanged() },
    onError: (err: Error) => showToast({ message: err.message || '지우지 못했습니다.', tone: 'error' }),
  })

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (openMutation.isPending) return
    if (!title.trim()) return setError('출석 이름을 입력해 주세요.')
    openMutation.mutate({ title: title.trim(), minutes })
  }
  const handleDelete = async (session: AttendanceSession) => {
    if (!(await confirmDialog({ message: `"${session.title}" 출석과 ${session.attendeeCount}명의 기록을 지울까요?`, tone: 'danger' }))) return
    deleteMutation.mutate(session.id)
  }
  const inputClass = 'min-h-10 rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text)] outline-none placeholder:text-[var(--app-subtle)]'

  return (
    <div className="border-t border-[var(--app-hairline)] p-4 sm:p-6">
      <h2 className="text-base font-bold text-[var(--app-text)]">출석 진행</h2>
      <p className="mt-1 text-xs text-[var(--app-muted)]">출석을 열면 네 자리 코드가 나옵니다. 정한 시간이 지나면 저절로 마감됩니다.</p>
      <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2" aria-label="출석 열기">
        <div className="min-w-0 flex-1 basis-56">
          <label htmlFor="attendanceTitle" className="mb-1 block text-xs font-bold text-[var(--app-text)]">출석 이름</label>
          <input id="attendanceTitle" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder="예: 웹 세미나 3주차" className={`${inputClass} w-full`} />
        </div>
        <div>
          <label htmlFor="attendanceMinutes" className="mb-1 block text-xs font-bold text-[var(--app-text)]">받는 시간</label>
          <select id="attendanceMinutes" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} className={inputClass}>
            {DURATIONS.map((value) => <option key={value} value={value}>{value}분</option>)}
          </select>
        </div>
        <button type="submit" disabled={openMutation.isPending} className="apple-action-primary min-h-10 px-5 text-sm disabled:cursor-not-allowed disabled:opacity-60">
          {openMutation.isPending ? '여는 중...' : '출석 열기'}
        </button>
      </form>
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-red-600 dark:text-red-300">{error}</p>}

      {openSessions.length > 0 && (
        <ul className={`mt-5 grid gap-3 ${openSessions.length > 1 ? 'md:grid-cols-2' : ''}`}>
          {openSessions.map((session) => (
            <LiveCard
              key={session.id}
              session={session}
              left={secondsLeft(session.remainingSeconds, receivedAt, now)}
              closing={closeMutation.isPending}
              onRoster={() => setRosterId(session.id)}
              onClose={() => closeMutation.mutate(session.id)}
            />
          ))}
        </ul>
      )}

      <h3 className="mt-6 text-sm font-bold text-[var(--app-text)]">지난 출석</h3>
      {pastSessions.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--app-muted)]">마감된 출석이 아직 없습니다.</p>
      ) : (
        <ul className="mt-2 divide-y divide-[var(--app-hairline)] rounded-xl border border-[var(--app-hairline)]" aria-label="지난 출석">
          {pastSessions.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
              <span className="min-w-0 flex-1 basis-full truncate font-bold text-[var(--app-text)] sm:basis-0">{session.title}</span>
              <span className="mr-auto text-xs font-semibold text-[var(--app-muted)] sm:mr-0">{formatAttendanceTime(session.openedAt)} · {session.openedByName}</span>
              <span className="text-xs font-bold text-[var(--app-accent-text)]">{session.attendeeCount}명</span>
              <button type="button" onClick={() => setRosterId(session.id)} className="text-xs font-semibold text-[var(--app-accent-text)] hover:underline">명단</button>
              <button type="button" onClick={() => handleDelete(session)} aria-label={`${session.title} 지우기`} className="text-red-500 hover:text-red-400">
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {rosterId !== null && <AttendeeList id={rosterId} onClose={() => setRosterId(null)} />}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-[var(--app-text)]">출석 현황</h3>
          <p className="mt-0.5 text-xs text-[var(--app-muted)]">누가 몇 번 나왔는지 한눈에 봅니다.</p>
        </div>
        <button type="button" onClick={() => setSummaryOpen((open) => !open)} aria-expanded={summaryOpen} className="apple-action-secondary min-h-9 px-3 text-xs">
          {summaryOpen ? '현황 닫기' : '현황 보기'}
        </button>
      </div>
      {summaryOpen && <SummaryPanel />}
    </div>
  )
}

/**
 * An open check as it is shown to the room: the code, the time left, the head count. "크게
 * 보기" fills the screen with it (for a projector) where the browser can do that.
 */
function LiveCard({ session, left, closing, onRoster, onClose }: {
  session: AttendanceSession
  left: number
  closing: boolean
  onRoster: () => void
  onClose: () => void
}) {
  const cardRef = useRef<HTMLLIElement>(null)
  const [big, setBig] = useState(false)
  const canGoBig = typeof document !== 'undefined' && document.fullscreenEnabled
  useEffect(() => {
    const sync = () => setBig(document.fullscreenElement === cardRef.current)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  const toggleBig = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {})
      return
    }
    cardRef.current?.requestFullscreen().catch(() => {
      showToast({ message: '이 브라우저에서는 크게 볼 수 없습니다.', tone: 'error' })
    })
  }
  return (
    <li ref={cardRef} className={`coms-attend-live ${big ? 'is-big' : ''}`}>
      <p className="coms-attend-live-title">{session.title}</p>
      <p className="coms-attend-code" aria-label={`출석 코드 ${session.code?.split('').join(' ')}`}>{session.code}</p>
      <p className="coms-attend-live-meta">
        남은 시간 <span className="font-mono text-[var(--app-text)]">{remainingLabel(left) || '곧 마감'}</span>
        <span className="mx-2">·</span>
        <Users size={12} className="mr-1 inline" aria-hidden="true" />
        {/* Re-keyed on change so the number pops when someone checks in. */}
        <span key={session.attendeeCount} className="coms-attend-count">{session.attendeeCount}명</span> 출석
      </p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {canGoBig && (
          <button type="button" onClick={toggleBig} className="apple-action-secondary inline-flex min-h-9 items-center gap-1.5 px-3 text-xs">
            {big ? <Minimize2 size={13} aria-hidden="true" /> : <Maximize2 size={13} aria-hidden="true" />}
            {big ? '작게 보기' : '크게 보기'}
          </button>
        )}
        {/* The list opens below the card, out of sight while the card fills the screen. */}
        {!big && <button type="button" onClick={onRoster} className="apple-action-secondary min-h-9 px-3 text-xs">명단 보기</button>}
        <button type="button" onClick={onClose} disabled={closing} className="apple-action-secondary min-h-9 px-3 text-xs">지금 마감</button>
      </div>
    </li>
  )
}

function AttendeeList({ id, onClose }: { id: number; onClose: () => void }) {
  const detailQuery = useQuery({ queryKey: ['attendance', 'session', id], queryFn: () => getAttendanceSession(id), refetchInterval: 5000 })
  const detail = detailQuery.data
  return (
    <section className="mt-5 rounded-xl border border-[var(--app-hairline)] bg-[var(--app-surface)] p-4" aria-label="출석한 사람">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-[var(--app-text)]">
          {detail ? `${detail.session.title} · ${detail.attendees.length}명` : '출석한 사람'}
        </h3>
        <button type="button" onClick={onClose} className="apple-action-secondary min-h-8 px-3 text-xs">닫기</button>
      </div>
      {detailQuery.isLoading && <p className="mt-3 text-sm text-[var(--app-muted)]">불러오는 중...</p>}
      {detailQuery.isError && <p role="alert" className="mt-3 text-sm font-semibold text-red-600 dark:text-red-300">{(detailQuery.error as Error)?.message || '명단을 불러오지 못했습니다.'}</p>}
      {detail && detail.attendees.length === 0 && <p className="mt-3 text-sm text-[var(--app-muted)]">아직 출석한 사람이 없습니다.</p>}
      {detail && detail.attendees.length > 0 && (
        <ol className="mt-3 flex flex-wrap gap-2">
          {detail.attendees.map((attendee, index) => (
            <li key={`${attendee.name}-${index}`} className="rounded-full border border-[var(--app-hairline)] px-3 py-1 text-xs font-semibold text-[var(--app-text)]" title={formatAttendanceTime(attendee.checkedAt)}>
              {attendee.name}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

type SummarySortKey = 'name' | 'count'

/**
 * Who came how often: a bar per member (against whoever came most) and a dot for each of the
 * latest checks. No rate is shown: a check may be for one study group only, so "missed" would
 * be wrong for everyone else.
 */
function SummaryPanel() {
  const summaryQuery = useQuery({ queryKey: SUMMARY_KEY, queryFn: getAttendanceSummary })
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: SummarySortKey; direction: SortDirection } | null>(null)
  const summary: AttendanceSummary | undefined = summaryQuery.data
  // Oldest to newest, left to right; the summary lists checks newest first.
  const recent = useMemo(() => (summary?.sessions ?? []).slice(0, RECENT_DOTS).reverse(), [summary])
  const rows = useMemo(() => {
    // Two members can share a name, so a row is told apart by its place in the answer.
    const all = (summary?.members ?? []).map((member, index) => ({ ...member, key: index, came: new Set(member.sessionIds) }))
    const matching = all.filter((member) => matchesQuery(search, [member.name]))
    if (!sort) return matching
    return sortedBy(matching, (a, b) => (sort.key === 'name' ? compareText(a.name, b.name, sort.direction) : compareNumber(a.count, b.count, sort.direction)))
  }, [summary, search, sort])
  const most = Math.max(1, ...(summary?.members ?? []).map((member) => member.count))
  const sortBy = (key: SummarySortKey) => setSort((current) => nextColumnSort(current, key))

  const download = () => {
    if (!summary || rows.length === 0) return
    // What the table shows, in its order.
    const blob = new Blob([attendanceSummaryToCsv({ sessions: summary.sessions, members: rows })], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `coms-attendance-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  if (summaryQuery.isLoading) return <p className="mt-3 text-sm text-[var(--app-muted)]">불러오는 중...</p>
  if (summaryQuery.isError) {
    return <ErrorState message={(summaryQuery.error as Error)?.message || '출석 현황을 불러오지 못했습니다.'} onRetry={() => summaryQuery.refetch()} />
  }
  if (!summary || summary.members.length === 0) {
    return <p className="mt-3 text-sm text-[var(--app-muted)]">아직 출석한 사람이 없습니다.</p>
  }
  return (
    <section className="mt-3" aria-label="출석 현황">
      <div className="flex flex-wrap items-center gap-2">
        <ListSearch value={search} onChange={setSearch} placeholder="이름으로 찾기" label="출석 현황에서 이름으로 찾기" />
        <ListCount shown={rows.length} total={summary.members.length} />
        <button type="button" onClick={download} disabled={rows.length === 0} className="apple-action-secondary inline-flex min-h-10 items-center gap-1.5 px-4 text-xs disabled:cursor-not-allowed disabled:opacity-50">
          <Download size={13} aria-hidden="true" />
          CSV 내보내기
        </button>
      </div>
      <div className="mt-3 max-h-[28rem] overflow-auto rounded-xl border border-[var(--app-hairline)]">
        <table className="w-full min-w-[18rem] text-left text-sm">
          <thead className="sticky top-0 z-[1] bg-[var(--app-surface)] text-xs font-semibold text-[var(--app-muted)]">
            <tr>
              <SortableTh label="이름" className="px-2.5 py-3 sm:px-4" active={sort?.key === 'name'} direction={sort?.direction ?? 'asc'} onSort={() => sortBy('name')} />
              {/* Takes the width the other two leave. */}
              <SortableTh label="출석" className="w-full px-2.5 py-3 sm:px-4" active={sort?.key === 'count'} direction={sort?.direction ?? 'asc'} onSort={() => sortBy('count')} />
              <th className="whitespace-nowrap px-2.5 py-3 sm:px-4">최근 {recent.length}회</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--app-hairline)]">
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-sm text-[var(--app-muted)]">찾는 이름이 없습니다.</td>
              </tr>
            )}
            {rows.map((member) => (
              <tr key={member.key}>
                <td className="whitespace-nowrap px-2.5 py-2.5 font-bold text-[var(--app-text)] sm:px-4">{member.name}</td>
                <td className="px-2.5 py-2.5 sm:px-4">
                  <span className="flex items-center gap-2">
                    <span className="coms-attend-bar" aria-hidden="true"><span style={{ width: `${(member.count / most) * 100}%` }} /></span>
                    <span className="shrink-0 font-semibold tabular-nums text-[var(--app-text)]">{member.count}회</span>
                  </span>
                </td>
                <td className="px-2.5 py-2.5 sm:px-4">
                  <span className="coms-attend-dots" role="img" aria-label={`최근 ${recent.length}회 중 ${recent.filter((session) => member.came.has(session.id)).length}회 출석`}>
                    {recent.map((session) => (
                      <i key={session.id} className={member.came.has(session.id) ? 'is-on' : ''} title={`${formatAttendanceDay(session.openedAt)} ${session.title}`} />
                    ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** The current time, refreshed every second while `active`, for the countdown. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return undefined
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [active])
  return now
}
