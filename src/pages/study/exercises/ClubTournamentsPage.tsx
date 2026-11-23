import { useEffect, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CalendarClock, Check, Copy, Plus, Trash2, Trophy, Users } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import PageHeading from '../../../components/PageHeading'
import MembersGate, { AuthCheckFailed } from '../../../components/MembersGate'
import { useAuth } from '../../../contexts/useAuth'
import { useNumberedCatalog } from './useNumberedCatalog'
import { requestTournament, type TournamentDetail, type TournamentRound, type TournamentSavePayload, type TournamentSummary, type TournamentStatus, type TournamentScoring } from './tournamentApi'
import '../study.css'
import './club-tournaments.css'

const basePath = '/study/algorithms/tournaments'
const statusLabel: Record<TournamentStatus, string> = {
  draft: '준비 중', registration: '참가 신청 중', running: '진행 중', finished: '종료', cancelled: '취소',
}
const matchLabel = { waiting: '대진 대기', active: '풀이 중', settling: '채점 정리 중', finished: '경기 종료' }
const resultLabel = { solved: '정답 시각', score: '획득 점수', bye: '부전승', 'no-score': '미해결' }
const visibleProblems = (round: TournamentRound) => round.problems ??
  (round.problemNumber !== null ? [{ number: round.problemNumber, points: null }] : null)

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

type DraftProblem = { number: string; points: string }
type DraftRound = { durationMinutes: string; problems: DraftProblem[] }
type Draft = {
  title: string; rules: string; startsAt: string; registrationClosesAt: string
  capacity: number; breakMinutes: string; scoring: TournamentScoring; rounds: DraftRound[]
}
const roundsFor = (capacity: number) => Math.ceil(Math.log2(capacity))
const newRound = (durationMinutes = '20'): DraftRound => ({
  durationMinutes, problems: [{ number: '', points: '100' }],
})
const emptyDraft = (): Draft => ({
  title: '', rules: '', startsAt: seoulInput(Date.now() + 24 * 60 * 60 * 1000),
  registrationClosesAt: '', capacity: 8, breakMinutes: '5', scoring: 'full',
  rounds: Array.from({ length: 3 }, () => newRound()),
})
const draftFromEvent = (event: TournamentDetail): Draft => ({
  title: event.title, rules: event.rules, startsAt: seoulInput(event.startsAt),
  registrationClosesAt: event.registrationClosesAt && event.registrationClosesAt !== event.startsAt
    ? seoulInput(event.registrationClosesAt) : '',
  capacity: event.capacity, breakMinutes: String(event.breakMinutes), scoring: event.scoring ?? 'full',
  rounds: event.roundsConfig?.map(round => ({
    durationMinutes: String(round.durationMinutes),
    problems: round.problems.map(problem => ({ number: String(problem.number), points: String(problem.points) })),
  })) ?? (event.problemNumbers ?? []).map(number => ({
    durationMinutes: String(event.durationMinutes), problems: [{ number: String(number), points: '100' }],
  })),
})

function TournamentForm({ event, busy, onSave }: {
  event: TournamentDetail | null
  busy: boolean
  onSave(payload: TournamentSavePayload): void
}) {
  const catalog = useNumberedCatalog()
  const [draft, setDraft] = useState<Draft>(() => event ? draftFromEvent(event) : emptyDraft())
  const [queryError, setQueryError] = useState('')
  const roundCount = roundsFor(draft.capacity)
  const problemTitle = (number: string) => catalog.find(entry => String(entry.number) === number)?.problem.title
  const updateRound = (index: number, value: DraftRound) => setDraft(current => ({
    ...current, rounds: current.rounds.map((round, at) => at === index ? value : round),
  }))

  const submit = (now: number) => {
    const startsAt = Date.parse(draft.startsAt + ':00+09:00')
    const registrationClosesAt = draft.registrationClosesAt
      ? Date.parse(draft.registrationClosesAt + ':00+09:00') : startsAt
    const roundsConfig = draft.rounds.slice(0, roundCount).map(round => ({
      durationMinutes: Number(round.durationMinutes),
      problems: round.problems.map(problem => ({ number: Number(problem.number), points: Number(problem.points) })),
    }))
    const invalidRound = roundsConfig.some(round => !Number.isInteger(round.durationMinutes) ||
      round.durationMinutes < 1 || round.durationMinutes > 180 ||
      round.problems.length < 1 || round.problems.length > 12 ||
      new Set(round.problems.map(problem => problem.number)).size !== round.problems.length ||
      round.problems.some(problem => !Number.isSafeInteger(problem.number) ||
        !catalog.some(entry => entry.number === problem.number) ||
        !Number.isInteger(problem.points) || problem.points < 1 || problem.points > 1000))
    if (!draft.title.trim() || !draft.rules.trim() || !Number.isFinite(startsAt) || startsAt <= now ||
        !Number.isFinite(registrationClosesAt) || registrationClosesAt > startsAt ||
        registrationClosesAt <= now || !Number.isInteger(Number(draft.breakMinutes)) ||
        Number(draft.breakMinutes) < 0 || Number(draft.breakMinutes) > 30 ||
        roundsConfig.length !== roundCount || invalidRound) {
      setQueryError('대회 시간과 문제 구성을 확인해 주세요. 각 라운드에 1~12개의 등록된 문제와 배점이 필요합니다.')
      return
    }
    setQueryError('')
    onSave({
      title: draft.title.trim(), rules: draft.rules.trim(), startsAt, registrationClosesAt,
      capacity: draft.capacity, breakMinutes: Number(draft.breakMinutes), scoring: draft.scoring,
      roundsConfig, durationMinutes: roundsConfig[0].durationMinutes,
      problemNumbers: roundsConfig.map(round => round.problems[0].number),
    })
  }

  return <section className="club-tournament-panel club-tournament-form" aria-label={event ? '대회 설정 수정' : '대회 만들기'}>
    <h2>{event ? '대회 설정 수정' : '새 대회 만들기'}</h2>
    <p>참가 신청을 열기 전까지 경기 시간과 문제 구성을 수정할 수 있어요.</p>
    <div className="club-tournament-form-grid">
      <label className="wide">대회 이름<input value={draft.title} maxLength={80} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="예: COM’s 알고리즘 컵" /></label>
      <label>시작 시각 (한국 시간)<input type="datetime-local" value={draft.startsAt} onChange={e => setDraft({ ...draft, startsAt: e.target.value })} /></label>
      <label>참가 신청 마감 (한국 시간)<input type="datetime-local" value={draft.registrationClosesAt} onChange={e => setDraft({ ...draft, registrationClosesAt: e.target.value })} /><small>비워두면 대회 시작 시 마감됩니다.</small></label>
      <label>모집 정원<select value={draft.capacity} onChange={e => {
        const capacity = Number(e.target.value)
        const count = roundsFor(capacity)
        setDraft({ ...draft, capacity, rounds: Array.from({ length: count }, (_, index) => draft.rounds[index] ?? newRound()) })
      }}>{[2, 4, 8, 16, 32, 64].map(n => <option key={n} value={n}>{n}명</option>)}</select></label>
      <label>라운드 사이 휴식 (분)<input type="number" min={0} max={30} value={draft.breakMinutes} onChange={e => setDraft({ ...draft, breakMinutes: e.target.value })} /></label>
      <label>점수 방식<select value={draft.scoring} onChange={e => setDraft({ ...draft, scoring: e.target.value as TournamentScoring })}>
        <option value="full">정답 문제의 배점 합산</option><option value="partial">통과한 테스트 비율도 점수에 반영</option>
      </select></label>
      <label className="wide">대회 규칙<textarea rows={5} maxLength={2000} value={draft.rules} onChange={e => setDraft({ ...draft, rules: e.target.value })} placeholder="참가 조건과 대회 진행 방식을 알려주세요." /></label>
    </div>
    <div className="club-tournament-section-head">
      <h3>라운드별 문제</h3>
      <p>라운드마다 경기 시간과 문제·배점을 정하세요. 참가자가 적으면 마지막 라운드 구성을 사용합니다.</p>
      <Link to="/study/algorithms/authoring">새 문제 만들기 또는 문제 등록 요청</Link>
    </div>
    <div className="club-tournament-round-editor">
      {draft.rounds.slice(0, roundCount).map((round, roundIndex) => <section key={roundIndex} className="club-tournament-round-config" aria-label={roundIndex === roundCount - 1 ? '결승 설정' : String(roundIndex + 1) + '라운드 설정'}>
        <div className="club-tournament-round-config-head">
          <h4>{roundIndex === roundCount - 1 ? '결승' : String(roundIndex + 1) + '라운드'}</h4>
          <label>경기 시간 (분)<input type="number" min={1} max={180} value={round.durationMinutes} onChange={e => updateRound(roundIndex, { ...round, durationMinutes: e.target.value })} /></label>
        </div>
        <div className="club-tournament-problem-grid">
          {round.problems.map((problem, problemIndex) => <div key={problemIndex} className="club-tournament-problem-row">
            <label>{roundIndex === roundCount - 1 ? '결승' : String(roundIndex + 1) + '라운드'} 문제 {problemIndex + 1} 번호
              <input type="search" inputMode="numeric" list="club-tournament-problems" value={problem.number} onChange={e => {
                const next = [...round.problems]
                next[problemIndex] = { ...problem, number: e.target.value }
                updateRound(roundIndex, { ...round, problems: next })
              }} placeholder="번호로 검색" />
              {problemTitle(problem.number) && <small>{problemTitle(problem.number)}</small>}
            </label>
            <label>배점<input type="number" min={1} max={1000} value={problem.points} onChange={e => {
              const next = [...round.problems]
              next[problemIndex] = { ...problem, points: e.target.value }
              updateRound(roundIndex, { ...round, problems: next })
            }} /></label>
            <div className="club-tournament-problem-controls">
              <button type="button" aria-label={String(roundIndex + 1) + '라운드 문제 ' + String(problemIndex + 1) + ' 위로'} disabled={problemIndex === 0} onClick={() => {
                const next = [...round.problems]
                ;[next[problemIndex - 1], next[problemIndex]] = [next[problemIndex], next[problemIndex - 1]]
                updateRound(roundIndex, { ...round, problems: next })
              }}><ArrowUp size={16} aria-hidden="true" /></button>
              <button type="button" aria-label={String(roundIndex + 1) + '라운드 문제 ' + String(problemIndex + 1) + ' 아래로'} disabled={problemIndex === round.problems.length - 1} onClick={() => {
                const next = [...round.problems]
                ;[next[problemIndex], next[problemIndex + 1]] = [next[problemIndex + 1], next[problemIndex]]
                updateRound(roundIndex, { ...round, problems: next })
              }}><ArrowDown size={16} aria-hidden="true" /></button>
              <button type="button" aria-label={String(roundIndex + 1) + '라운드 문제 ' + String(problemIndex + 1) + ' 삭제'} disabled={round.problems.length === 1} onClick={() => updateRound(roundIndex, { ...round, problems: round.problems.filter((_, at) => at !== problemIndex) })}><Trash2 size={16} aria-hidden="true" /></button>
            </div>
          </div>)}
        </div>
        <button type="button" disabled={round.problems.length >= 12} onClick={() => updateRound(roundIndex, { ...round, problems: [...round.problems, { number: '', points: '100' }] })}><Plus size={16} aria-hidden="true" />문제 추가</button>
      </section>)}
      <datalist id="club-tournament-problems">{catalog.map(({ number, problem }) => <option key={number} value={number}>{problem.title}</option>)}</datalist>
    </div>
    {queryError && <p role="alert">{queryError}</p>}
    <button type="button" className="club-tournament-primary" disabled={busy} onClick={() => submit(Date.now())}><Check size={17} aria-hidden="true" />{event ? '설정 저장' : '초안 저장'}</button>
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

  const save = async (payload: TournamentSavePayload) => {
    setBusy(true)
    setError('')
    try {
      const { event } = await requestTournament<{ event: TournamentDetail }>({
        action: 'tournament-save', ...payload,
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
  const catalog = useNumberedCatalog()
  const [now, setNow] = useState(Date.now)
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
      setNow(Date.now())
      void requestTournament<{ event: TournamentDetail }>({ action: 'tournament-get', id })
        .then(result => { setEvent(result.event); setError('') })
        .catch(() => setError('대회 상태를 확인하지 못했어요. 다시 시도해 주세요.'))
    }, 10_000)
    return () => window.clearInterval(timer)
  }, [id, eventStatus])
  const registrationOpen = event?.status === 'registration' &&
    now < (event.registrationClosesAt ?? event.startsAt)

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
  const save = (payload: TournamentSavePayload) => void act('tournament-save', payload)
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
        <header className="club-tournaments-heading"><div><span className="club-tournament-status" data-status={event.status}>{statusLabel[event.status]}</span><PageHeading>{event.title}</PageHeading><p><CalendarClock size={17} aria-hidden="true" />{seoulTime(event.startsAt)} · 라운드별 경기 시간 · {event.breakMinutes}분 휴식</p></div><Trophy size={38} aria-hidden="true" /></header>
        <div className="club-tournament-summary">
          <span><Users size={17} aria-hidden="true" />{event.participantCount}/{event.capacity}명 참가</span>
          {event.registered && <strong>참가 신청 완료</strong>}
          {event.champion && <strong>우승 {event.champion}</strong>}
          {event.registrationClosesAt && event.status === 'registration' && <span>신청 마감 {seoulTime(event.registrationClosesAt)}</span>}
        </div>
        <div className="club-tournament-actions">
          {registrationOpen && !event.registered && <button type="button" className="club-tournament-primary" disabled={busy || event.participantCount >= event.capacity} onClick={() => void act('tournament-join')}>참가 신청</button>}
          {registrationOpen && event.registered && <button type="button" disabled={busy} onClick={() => void act('tournament-leave')}>신청 취소</button>}
          {event.status === 'registration' && !registrationOpen && <span>참가 신청이 마감됐습니다.</span>}
          {canManage && event.status === 'draft' && <><button type="button" onClick={() => setEditing(value => !value)} disabled={busy}>설정 수정</button><button type="button" className="club-tournament-primary" disabled={busy} onClick={() => void act('tournament-publish')}>참가 모집 시작</button></>}
          {canManage && (event.status === 'draft' || event.status === 'registration' || event.status === 'running') && <button type="button" disabled={busy} onClick={() => { if (window.confirm(`“${event.title}” 대회를 취소할까요?`)) void act('tournament-cancel') }}>대회 취소</button>}
          {event.status !== 'draft' && <button type="button" onClick={() => void copyLink()}><Copy size={16} aria-hidden="true" />링크 복사</button>}
        </div>
        {editing && canManage && event.status === 'draft' && <TournamentForm event={event} busy={busy} onSave={save} />}
        <section className="club-tournament-panel club-tournament-rules"><h2>대회 규칙</h2><p>{event.rules}</p><ul><li>대진 순서는 시작 시 무작위로 정해집니다.</li><li>{event.scoring === 'partial' ? '통과한 테스트 비율까지 배점에 반영합니다.' : '정답을 낸 문제의 배점을 합산합니다.'} 동점이면 점수를 획득한 서버 접수 시각으로 판정합니다.</li><li>제한 시간 안에 접수된 제출은 최대 60초 동안 채점 결과를 기다립니다.</li></ul></section>
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
            {visibleProblems(round)?.map(problem =>
              <p key={problem.number} className="club-tournament-round-problem">
                {problem.number}번 · {catalog.find(entry => entry.number === problem.number)?.problem.title ?? '알고리즘 문제'}{problem.points !== null && ' · ' + problem.points + '점'}
              </p>)}
            <div className="club-tournament-matches">{round.matches.map(match => <article key={match.id} className="club-tournament-match" data-status={match.status}>
              <div className="club-tournament-match-top"><span>경기 {match.number}</span><small>{matchLabel[match.status]}</small></div>
              <div className="club-tournament-players">{match.players.map((player, index) => <span key={index} data-winner={match.winnerSlot === index}>{player ?? '대기'}</span>)}</div>
              {match.result && <small className="club-tournament-result">{match.result === 'score' && !event.roundsConfig ? '통과한 테스트' : resultLabel[match.result]}</small>}
              {match.scores && <p className="club-tournament-scores">획득 점수 {match.scores[0]} : {match.scores[1]}</p>}
              {match.canSubmit && visibleProblems(round)?.map(problem =>
                <Link key={problem.number} to={'/study/algorithms/' + problem.number + '?tournament=' + event.id + '&match=' + match.id} className="club-tournament-primary">{problem.number}번 문제 풀기{problem.points !== null && ' · ' + problem.points + '점'} <ArrowRight size={15} aria-hidden="true" /></Link>)}
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
