import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, CalendarClock, Check, Copy, Plus, Trophy, Users } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import PageHeading from '../../../components/PageHeading'
import MembersGate, { AuthCheckFailed } from '../../../components/MembersGate'
import { useAuth } from '../../../contexts/useAuth'
import { numberedExercises } from './problems'
import { requestTournament, type TournamentDetail, type TournamentSummary, type TournamentStatus } from './tournamentApi'
import '../study.css'
import './club-tournaments.css'

const basePath = '/study/algorithms/tournaments'
const statusLabel: Record<TournamentStatus, string> = {
  draft: '준비 중', registration: '참가 신청 중', running: '진행 중', finished: '종료', cancelled: '취소',
}
const matchLabel = { waiting: '대진 대기', active: '풀이 중', settling: '채점 정리 중', finished: '경기 종료' }
const resultLabel = { solved: '정답 시각', score: '통과한 테스트', bye: '부전승', 'no-score': '미해결' }

const seoulParts = (time: number) => Object.fromEntries(
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(time).map(({ type, value }) => [type, value]),
)
const seoulInput = (time: number) => {
  const parts = seoulParts(time)
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}
const seoulTime = (time: number) => new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short',
}).format(time)

type Draft = {
  title: string
  rules: string
  startsAt: string
  capacity: 4 | 8 | 16 | 32
  durationMinutes: number
  breakMinutes: number
  problems: string[]
}
const emptyDraft = (): Draft => ({
  title: '', rules: '', startsAt: seoulInput(Date.now() + 24 * 60 * 60 * 1000),
  capacity: 8, durationMinutes: 20, breakMinutes: 5, problems: ['', '', ''],
})
const draftFromEvent = (event: TournamentDetail): Draft => ({
  title: event.title, rules: event.rules, startsAt: seoulInput(event.startsAt),
  capacity: event.capacity, durationMinutes: event.durationMinutes, breakMinutes: event.breakMinutes,
  problems: event.problemNumbers?.map(String) ?? [],
})
const roundsFor = (capacity: Draft['capacity']) => Math.log2(capacity)

function TournamentForm({ event, busy, onSave }: {
  event: TournamentDetail | null
  busy: boolean
  onSave(draft: Draft): void
}) {
  const [draft, setDraft] = useState<Draft>(() => event ? draftFromEvent(event) : emptyDraft())
  const [queryError, setQueryError] = useState('')
  const roundCount = roundsFor(draft.capacity)

  const submit = () => {
    const numbers = draft.problems.slice(0, roundCount).map(Number)
    if (!draft.title.trim() || !draft.rules.trim() || !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(draft.startsAt) ||
      numbers.length !== roundCount || numbers.some(number => !Number.isSafeInteger(number) ||
        !numberedExercises.some(entry => entry.number === number)) || new Set(numbers).size !== numbers.length) {
      setQueryError('제목·규칙·시작 시각과 라운드별 서로 다른 문제 번호를 확인해 주세요.')
      return
    }
    setQueryError('')
    onSave(draft)
  }

  return <section className="club-tournament-panel club-tournament-form" aria-label={event ? '대회 설정 수정' : '대회 만들기'}>
    <h2>{event ? '대회 설정 수정' : '새 대회 만들기'}</h2>
    <p>참가 신청을 열기 전까지 설정을 수정할 수 있어요.</p>
    <div className="club-tournament-form-grid">
      <label className="wide">대회 이름<input value={draft.title} maxLength={80} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="예: COM’s 알고리즘 컵" /></label>
      <label>시작 시각 (한국 시간)<input type="datetime-local" value={draft.startsAt} onChange={e => setDraft({ ...draft, startsAt: e.target.value })} /></label>
      <label>모집 정원<select value={draft.capacity} onChange={e => {
        const capacity = Number(e.target.value) as Draft['capacity']
        const count = roundsFor(capacity)
        setDraft({ ...draft, capacity, problems: Array.from({ length: count }, (_, index) => draft.problems[index] ?? '') })
      }}>{[4, 8, 16, 32].map(n => <option key={n} value={n}>{n}명</option>)}</select></label>
      <label>라운드 제한 시간 (분)<input type="number" min={5} max={60} value={draft.durationMinutes} onChange={e => setDraft({ ...draft, durationMinutes: Number(e.target.value) })} /></label>
      <label>라운드 사이 휴식 (분)<input type="number" min={0} max={30} value={draft.breakMinutes} onChange={e => setDraft({ ...draft, breakMinutes: Number(e.target.value) })} /></label>
      <label className="wide">대회 규칙<textarea rows={5} maxLength={2000} value={draft.rules} onChange={e => setDraft({ ...draft, rules: e.target.value })} placeholder="참가 조건과 대회 진행 방식을 알려주세요." /></label>
    </div>
    <h3>라운드별 문제</h3>
    <p>라운드마다 한 문제를 지정합니다. 참가자가 정원보다 적으면 마지막 라운드의 문제가 결승에 배정됩니다.</p>
    <div className="club-tournament-problem-grid">
      {Array.from({ length: roundCount }, (_, index) => <label key={index}>{index === roundCount - 1 ? '결승' : `${index + 1}라운드`} 문제 번호
        <input type="search" inputMode="numeric" list="club-tournament-problems" value={draft.problems[index] ?? ''} onChange={e => setDraft({ ...draft, problems: draft.problems.map((value, at) => at === index ? e.target.value : value) })} placeholder="문제 번호 검색" />
        {numberedExercises.find(entry => String(entry.number) === draft.problems[index]) && <small>{numberedExercises.find(entry => String(entry.number) === draft.problems[index])?.problem.title}</small>}
      </label>)}
      <datalist id="club-tournament-problems">{numberedExercises.map(({ number, problem }) => <option key={number} value={number}>{problem.title}</option>)}</datalist>
    </div>
    {queryError && <p role="alert">{queryError}</p>}
    <button type="button" className="club-tournament-primary" disabled={busy} onClick={submit}><Check size={17} aria-hidden="true" />{event ? '설정 저장' : '초안 저장'}</button>
  </section>
}

function TournamentList({ canManage }: { canManage: boolean }) {
  const [events, setEvents] = useState<TournamentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | 'registration' | 'running' | 'finished'>('all')
  const [query, setQuery] = useState('')
  const [newEvent, setNewEvent] = useState(false)
  const [createdId, setCreatedId] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    void requestTournament<{ events: TournamentSummary[] }>({ action: 'tournament-list' }, controller.signal)
      .then(result => { if (!controller.signal.aborted) setEvents(result.events) })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '대회를 불러오지 못했어요.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  const save = async (draft: Draft) => {
    setBusy(true)
    setError('')
    try {
      const { event } = await requestTournament<{ event: TournamentDetail }>({
        action: 'tournament-save', title: draft.title.trim(), rules: draft.rules.trim(),
        startsAt: Date.parse(`${draft.startsAt}:00+09:00`), capacity: draft.capacity,
        durationMinutes: draft.durationMinutes, breakMinutes: draft.breakMinutes,
        problemNumbers: draft.problems.slice(0, roundsFor(draft.capacity)).map(Number),
      })
      setCreatedId(event.id)
      setNewEvent(false)
      setEvents(before => [event, ...before])
    } catch (cause) { setError(cause instanceof Error ? cause.message : '대회를 저장하지 못했어요.') }
    finally { setBusy(false) }
  }
  const filtered = events.filter(event =>
    (filter === 'all' || (filter === 'finished' ? event.status === 'finished' || event.status === 'cancelled' : event.status === filter)) &&
    event.title.toLocaleLowerCase('ko-KR').includes(query.trim().toLocaleLowerCase('ko-KR')),
  ).sort((left, right) => {
    const leftClosed = left.status === 'finished' || left.status === 'cancelled'
    const rightClosed = right.status === 'finished' || right.status === 'cancelled'
    return Number(leftClosed) - Number(rightClosed) || (leftClosed ? right.startsAt - left.startsAt : left.startsAt - right.startsAt)
  })

  return <main className="study-page club-tournaments">
    <div className="club-tournaments-inner">
      <Link to="/study/algorithms" className="club-tournament-back"><ArrowLeft size={17} aria-hidden="true" />알고리즘 문제</Link>
      <header className="club-tournaments-heading"><div><PageHeading>알고리즘 대회</PageHeading><p>회원들과 같은 문제를 풀고 다음 라운드로 올라가세요.</p></div><Trophy size={38} aria-hidden="true" /></header>
      {canManage && <div className="club-tournament-toolbar"><button type="button" className="club-tournament-primary" onClick={() => { setNewEvent(!newEvent); setError('') }}><Plus size={17} aria-hidden="true" />대회 만들기</button></div>}
      {newEvent && canManage && <TournamentForm event={null} busy={busy} onSave={save} />}
      {createdId && <p role="status" className="club-tournament-notice">초안을 저장했습니다. <Link to={`${basePath}/${createdId}`}>대회 설정 열기</Link></p>}
      {error && <p role="alert" className="club-tournament-error">{error}</p>}
      <label className="club-tournament-search">대회 검색<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="대회 이름" /></label>
      <nav className="club-tournament-filters" aria-label="대회 상태 필터">{([['all', '전체'], ['registration', '참가 신청 중'], ['running', '진행 중'], ['finished', '종료']] as const).map(([value, label]) => <button type="button" key={value} aria-current={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</nav>
      {loading && <p role="status">대회를 불러오는 중...</p>}
      {!loading && filtered.length === 0 && <div className="club-tournament-empty"><CalendarClock size={30} aria-hidden="true" /><p>{filter === 'all' && !query ? '예정된 알고리즘 대회가 없어요.' : '조건에 맞는 대회가 없어요.'}</p></div>}
      <div className="club-tournament-cards">{filtered.map(event => <Link key={event.id} to={`${basePath}/${event.id}`} className="club-tournament-card">
        <span className="club-tournament-status" data-status={event.status}>{statusLabel[event.status]}</span>
        <h2>{event.title}</h2>
        <p><CalendarClock size={16} aria-hidden="true" />{seoulTime(event.startsAt)}</p>
        <p><Users size={16} aria-hidden="true" />{event.participantCount}/{event.capacity}명{event.registered && ' · 참가 신청 완료'}</p>
        {event.champion && <strong>우승 {event.champion}</strong>}
        <span className="club-tournament-card-arrow">대회 보기 <ArrowRight size={17} aria-hidden="true" /></span>
      </Link>)}</div>
    </div>
  </main>
}

function TournamentDetailPage({ id, canManage }: { id: string; canManage: boolean }) {
  const [event, setEvent] = useState<TournamentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    void requestTournament<{ event: TournamentDetail }>({ action: 'tournament-get', id }, controller.signal)
      .then(result => { if (!controller.signal.aborted) setEvent(result.event) })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '대회를 불러오지 못했어요.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [id])
  const eventStatus = event?.status
  useEffect(() => {
    if (eventStatus !== 'registration' && eventStatus !== 'running') return
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void requestTournament<{ event: TournamentDetail }>({ action: 'tournament-get', id })
        .then(result => { setEvent(result.event); setError('') })
        .catch(() => setError('대회 상태를 확인하지 못했어요. 다시 시도해 주세요.'))
    }, 10_000)
    return () => window.clearInterval(timer)
  }, [id, eventStatus])

  const act = async (action: string, fields: Record<string, unknown> = {}) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await requestTournament<{ event: TournamentDetail }>({ action, id, ...fields })
      setEvent(result.event)
      setEditing(false)
      setNotice(action === 'tournament-save' ? '설정을 저장했습니다.' : action === 'tournament-publish' ? '참가 신청을 열었습니다.' : action === 'tournament-join' ? '참가 신청을 완료했습니다.' : action === 'tournament-leave' ? '참가 신청을 취소했습니다.' : '대회를 취소했습니다.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : '요청을 처리하지 못했어요.') }
    finally { setBusy(false) }
  }
  const save = (draft: Draft) => void act('tournament-save', {
    title: draft.title.trim(), rules: draft.rules.trim(), startsAt: Date.parse(`${draft.startsAt}:00+09:00`),
    capacity: draft.capacity, durationMinutes: draft.durationMinutes, breakMinutes: draft.breakMinutes,
    problemNumbers: draft.problems.slice(0, roundsFor(draft.capacity)).map(Number),
  })
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(new URL(`${basePath}/${id}`, window.location.origin).href); setNotice('대회 링크를 복사했습니다.') }
    catch { setError('대회 링크를 복사하지 못했어요.') }
  }

  return <main className="study-page club-tournaments">
    <div className="club-tournaments-inner">
      <Link to={basePath} className="club-tournament-back"><ArrowLeft size={17} aria-hidden="true" />대회 목록</Link>
      {loading && <p role="status">대회를 불러오는 중...</p>}
      {error && <p role="alert" className="club-tournament-error">{error}</p>}
      {notice && <p role="status" className="club-tournament-notice">{notice}</p>}
      {event && <>
        <header className="club-tournaments-heading"><div><span className="club-tournament-status" data-status={event.status}>{statusLabel[event.status]}</span><PageHeading>{event.title}</PageHeading><p><CalendarClock size={17} aria-hidden="true" />{seoulTime(event.startsAt)} · {event.durationMinutes}분 경기 · {event.breakMinutes}분 휴식</p></div><Trophy size={38} aria-hidden="true" /></header>
        <div className="club-tournament-summary">
          <span><Users size={17} aria-hidden="true" />{event.participantCount}/{event.capacity}명 참가</span>
          {event.registered && <strong>참가 신청 완료</strong>}
          {event.champion && <strong>우승 {event.champion}</strong>}
        </div>
        <div className="club-tournament-actions">
          {event.status === 'registration' && !event.registered && <button type="button" className="club-tournament-primary" disabled={busy || event.participantCount >= event.capacity} onClick={() => void act('tournament-join')}>참가 신청</button>}
          {event.status === 'registration' && event.registered && <button type="button" disabled={busy} onClick={() => void act('tournament-leave')}>신청 취소</button>}
          {canManage && event.status === 'draft' && <><button type="button" onClick={() => setEditing(value => !value)} disabled={busy}>설정 수정</button><button type="button" className="club-tournament-primary" disabled={busy} onClick={() => void act('tournament-publish')}>참가 모집 시작</button></>}
          {canManage && (event.status === 'draft' || event.status === 'registration' || event.status === 'running') && <button type="button" disabled={busy} onClick={() => { if (window.confirm(`“${event.title}” 대회를 취소할까요?`)) void act('tournament-cancel') }}>대회 취소</button>}
          {event.status !== 'draft' && <button type="button" onClick={() => void copyLink()}><Copy size={16} aria-hidden="true" />링크 복사</button>}
        </div>
        {editing && canManage && event.status === 'draft' && <TournamentForm event={event} busy={busy} onSave={save} />}
        <section className="club-tournament-panel club-tournament-rules"><h2>대회 규칙</h2><p>{event.rules}</p><ul><li>대진 순서는 시작 시 무작위로 정해집니다.</li><li>정답을 서버에 먼저 제출한 회원이 승리합니다.</li><li>정답이 없으면 통과한 테스트 수와 서버 접수 순서로 승부를 정합니다.</li><li>제한 시간 안에 접수된 제출은 최대 60초 동안 채점 결과를 기다립니다.</li></ul></section>
        {event.status === 'registration' && <section className="club-tournament-panel"><h2>참가자 {event.participantCount}명</h2><div className="club-tournament-participants">{event.participants.map((name, index) => <span key={`${index}-${name}`}>{name}</span>)}</div><p>대회 시작 전까지 참가 신청을 받을 수 있어요.</p></section>}
        {event.rounds.length > 0 && <section className="club-tournament-bracket" aria-label="대진표">
          <div className="club-tournament-section-head">
            <h2>대진표</h2>
            <p>경기 시작 시 해당 라운드의 문제가 공개됩니다.</p>
          </div>
          <div className="club-tournament-rounds">{event.rounds.map(round => <section key={round.number} className="club-tournament-round">
            <header>
              <span>{round.matches.length === 1 ? '결승' : `${round.number}라운드`}</span>
              <small>{seoulTime(round.startsAt)} ~ {seoulTime(round.endsAt)}</small>
            </header>
            {round.problemNumber !== null && <p className="club-tournament-round-problem">
              {round.problemNumber}번 · {numberedExercises.find(entry => entry.number === round.problemNumber)?.problem.title ?? '알고리즘 문제'}
            </p>}
            <div className="club-tournament-matches">{round.matches.map(match => <article key={match.id} className="club-tournament-match" data-status={match.status}>
              <div className="club-tournament-match-top"><span>경기 {match.number}</span><small>{matchLabel[match.status]}</small></div>
              <div className="club-tournament-players">{match.players.map((player, index) => <span key={index} data-winner={match.winnerSlot === index}>{player ?? '대기'}</span>)}</div>
              {match.result && <small className="club-tournament-result">{resultLabel[match.result]}</small>}
              {match.canSubmit && round.problemNumber !== null && <Link to={`/study/algorithms/${round.problemNumber}?tournament=${event.id}&match=${match.id}`} className="club-tournament-primary">문제 풀기 <ArrowRight size={15} aria-hidden="true" /></Link>}
            </article>)}</div>
          </section>)}</div>
        </section>}
      </>}
    </div>
  </main>
}

export default function ClubTournamentsPage() {
  const { id } = useParams()
  const { user, loading, authError } = useAuth()
  if (loading) return <main className="study-page club-tournaments"><p role="status">로그인 상태를 확인하는 중...</p></main>
  if (authError) return <main className="study-page club-tournaments"><AuthCheckFailed /></main>
  if (!user) return <main className="study-page club-tournaments"><MembersGate title="알고리즘 대회는 동아리원만 참가할 수 있어요" /></main>
  if (id && !/^[0-9a-f]{24}$/.test(id)) return <main className="study-page club-tournaments"><p role="alert">대회 주소를 확인해 주세요.</p></main>
  return id ? <TournamentDetailPage id={id} canManage={user.role === 'ADMIN'} /> : <TournamentList canManage={user.role === 'ADMIN'} />
}
