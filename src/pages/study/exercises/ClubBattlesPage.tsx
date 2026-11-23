import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Clock3, Copy, Swords, Trophy } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import PageHeading from '../../../components/PageHeading'
import MembersGate, { AuthCheckFailed } from '../../../components/MembersGate'
import { useAuth } from '../../../contexts/useAuth'
import { requestJudgeClub, type BattleView } from './clubApi'
import { JudgeTierBadge } from './JudgeTierBadge'
import { numberedExercises } from './problems'
import '../study.css'
import './club-battles.css'

const roomCode = (value: string) => /^[A-F0-9]{12}$/.test(value)
const ongoing = (status: BattleView['status']) => status === 'waiting' || status === 'active' || status === 'settling'
const formatTime = (time: number) => new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(time)
const formatLeft = (milliseconds: number) => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000))
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}

function BattleRoom({ room, now, busy, onCancel, onCopy }: {
  room: BattleView
  now: number
  busy: boolean
  onCancel(): void
  onCopy(): void
}) {
  const match = numberedExercises.find(({ number }) => number === room.problemNumber)
  const title = match?.problem.title ?? `문제 ${room.problemNumber}번`
  const result = room.result && { win: '승리', loss: '패배', draw: '무승부', unsolved: '미해결' }[room.result]
  const status = {
    waiting: '친구를 기다리는 중', active: '대결 진행 중', settling: '결과 확인 중',
    finished: '대결 종료', expired: '초대 기간 종료', cancelled: '취소됨',
  }[room.status]

  return <section className="club-battle-room" aria-labelledby="club-battle-room-title">
    <div className="club-battle-room-heading">
      <div>
        <p className="club-battle-status" role="status">{status}</p>
        <h2 id="club-battle-room-title">{title}</h2>
        <p>{room.problemNumber}번 · {room.durationMinutes}분 대결</p>
      </div>
      {room.status === 'active' && room.endsAt && <div className="club-battle-timer" role="timer" aria-label="남은 대결 시간"><Clock3 size={17} aria-hidden="true" />{formatLeft(room.endsAt - now)}</div>}
      {result && <strong className="club-battle-outcome" data-result={room.result}>{result}</strong>}
    </div>
    <div className="club-battle-players">
      <div><span>나</span><strong>{room.yourAcceptedAt ? '정답 제출 완료' : room.status === 'active' ? '풀이 중' : '대기 중'}</strong></div>
      <div><span>친구</span><strong>{room.opponentAcceptedAt ? '정답 제출 완료' : room.opponentJoined ? '풀이 중' : '입장 전'}</strong></div>
    </div>
    {room.status === 'waiting' && <div className="club-battle-invite">
      <span>초대 코드 <strong>{room.code}</strong></span>
      <button type="button" onClick={onCopy}><Copy size={15} aria-hidden="true" />초대 링크 복사</button>
    </div>}
    <div className="club-battle-room-actions">
      {room.status === 'active' && <Link to={`/study/algorithms/${room.problemNumber}?battle=${room.code}`} className="club-battle-primary">문제 풀기 <ArrowRight size={16} aria-hidden="true" /></Link>}
      {room.status === 'waiting' && room.isHost && <button type="button" onClick={onCancel} disabled={busy}>대결 취소</button>}
    </div>
    {room.status === 'waiting' && <p className="club-battle-note">친구가 참가하면 제한 시간이 시작됩니다.</p>}
    {room.status === 'settling' && <p className="club-battle-note">제한 시간 전에 받은 제출을 채점하고 있습니다.</p>}
  </section>
}

function BattleContent() {
  const [search, setSearch] = useSearchParams()
  const requestedCode = (search.get('room') ?? '').trim().toUpperCase()
  const [code, setCode] = useState(requestedCode)
  const [problemQuery, setProblemQuery] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(15)
  const [room, setRoom] = useState<BattleView | null>(null)
  const [history, setHistory] = useState<BattleView[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [now, setNow] = useState(Date.now)

  const showRoom = useCallback((value: BattleView) => {
    setRoom(value)
    setCode(value.code)
    setSearch({ room: value.code }, { replace: true })
  }, [setSearch])

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        if (requestedCode) {
          if (!roomCode(requestedCode)) throw new Error('초대 코드는 영문·숫자 12자리예요.')
          const response = await requestJudgeClub<{ battle: BattleView }>({ action: 'battle-get', code: requestedCode }, controller.signal)
          if (!controller.signal.aborted) setRoom(response.battle)
        } else {
          const response = await requestJudgeClub<{ battles: BattleView[] }>({ action: 'battle-list' }, controller.signal)
          if (!controller.signal.aborted) {
            setHistory(response.battles)
            setRoom(response.battles.find((battle) => ongoing(battle.status)) ?? null)
          }
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '대결 정보를 불러오지 못했어요.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [requestedCode])

  const activeCode = room && ongoing(room.status) ? room.code : null
  useEffect(() => {
    if (!activeCode) return
    const timer = window.setInterval(() => {
      setNow(Date.now())
      void requestJudgeClub<{ battle: BattleView }>({ action: 'battle-get', code: activeCode })
        .then((response) => { setRoom(response.battle); setError(''); if (response.battle.status !== 'waiting') setNotice('') })
        .catch(() => setError('대결 상태를 확인하지 못했어요. 다시 시도해 주세요.'))
    }, 3000)
    return () => window.clearInterval(timer)
  }, [activeCode])

  const act = async (body: Record<string, unknown>) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await requestJudgeClub<{ battle: BattleView }>(body)
      showRoom(response.battle)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '대결 요청을 처리하지 못했어요.')
    } finally { setBusy(false) }
  }

  const create = () => {
    const number = Number(problemQuery.trim())
    if (!Number.isSafeInteger(number) || !numberedExercises.some(({ number: id }) => id === number)) {
      setError('목록에서 문제 번호를 골라 주세요.')
      return
    }
    void act({ action: 'battle-create', problemNumber: number, durationMinutes })
  }
  const join = () => {
    const requested = code.trim().toUpperCase()
    if (!roomCode(requested)) { setError('초대 코드는 영문·숫자 12자리예요.'); return }
    void act({ action: 'battle-join', code: requested })
  }
  const copy = async () => {
    if (!room) return
    try {
      await navigator.clipboard.writeText(new URL(`/study/algorithms/battles?room=${room.code}`, window.location.origin).href)
      setNotice('초대 링크를 복사했습니다.')
    } catch { setError('초대 링크를 복사하지 못했어요.') }
  }
  const matches = problemQuery.trim() ? numberedExercises.filter(({ number, problem }) =>
    String(number).startsWith(problemQuery.trim()) || problem.title.includes(problemQuery.trim())).slice(0, 12) : []
  const chosen = numberedExercises.find(({ number }) => String(number) === problemQuery.trim())

  return <main className="study-page club-battles">
    <div className="club-battles-inner">
      <nav className="judge-catalog-back" aria-label="배틀 메뉴">
        <Link to="/study/algorithms" className="club-battles-back"><ArrowLeft size={16} aria-hidden="true" />문제 목록</Link>
        <Link to="/study/algorithms/tournaments" className="club-battles-back"><Trophy size={16} aria-hidden="true" />알고리즘 대회</Link>
      </nav>
      <header className="club-battles-heading"><PageHeading>친구와 문제 대결</PageHeading><p>같은 문제를 시간 안에 풀고, 먼저 정답을 낸 사람이 이깁니다.</p></header>
      {error && <div className="club-battle-alert" role="alert"><p>{error}</p><button type="button" onClick={() => window.location.reload()}>다시 불러오기</button></div>}
      {notice && <p role="status" className="club-battle-notice">{notice}</p>}
      {loading ? <p role="status">대결 정보를 불러오는 중...</p> : room && ongoing(room.status)
        ? <BattleRoom room={room} now={now} busy={busy} onCancel={() => void act({ action: 'battle-cancel', code: room.code })} onCopy={() => void copy()} />
        : <div className="club-battles-entry">
          <section aria-labelledby="battle-create-title">
            <div className="club-battles-icon"><Swords size={24} aria-hidden="true" /></div>
            <h2 id="battle-create-title">대결 만들기</h2>
            <label>문제 번호 또는 제목
              <input type="search" list="club-battle-problems" value={problemQuery} onChange={(event) => setProblemQuery(event.target.value)} placeholder="예: 1100" />
            </label>
            <datalist id="club-battle-problems">{matches.map(({ number, problem }) => <option key={number} value={number}>{problem.title}</option>)}</datalist>
            {chosen && <p className="club-battles-selected"><span>{chosen.problem.title}</span><JudgeTierBadge problem={chosen.problem} /></p>}
            <label>제한 시간
              <select value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))}>{[10, 15, 20].map((minutes) => <option key={minutes} value={minutes}>{minutes}분</option>)}</select>
            </label>
            <button type="button" className="club-battle-primary" disabled={busy} onClick={create}>방 만들기 <ArrowRight size={16} aria-hidden="true" /></button>
          </section>
          <section aria-labelledby="battle-join-title">
            <div className="club-battles-icon"><Copy size={23} aria-hidden="true" /></div>
            <h2 id="battle-join-title">친구 방 참가</h2>
            <p>받은 초대 링크를 열거나 초대 코드를 입력하세요.</p>
            <label>초대 코드<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={12} autoCapitalize="characters" placeholder="12자리 코드" /></label>
            <button type="button" disabled={busy} onClick={join}>대결 참가 <ArrowRight size={16} aria-hidden="true" /></button>
          </section>
        </div>}
      {!loading && room && !ongoing(room.status) && <BattleRoom room={room} now={now} busy={busy} onCancel={() => void act({ action: 'battle-cancel', code: room.code })} onCopy={() => void copy()} />}
      {history.filter((battle) => !ongoing(battle.status)).length > 0 && <section className="club-battles-history" aria-labelledby="battle-history-title">
        <h2 id="battle-history-title">최근 대결</h2>
        <ul>{history.filter((battle) => !ongoing(battle.status)).map((battle) => <li key={battle.code}>
          <button type="button" onClick={() => showRoom(battle)}><span>{numberedExercises.find(({ number }) => number === battle.problemNumber)?.problem.title ?? `문제 ${battle.problemNumber}번`}</span><small>{formatTime(battle.createdAt)}</small><strong>{({ win: '승리', loss: '패배', draw: '무승부', unsolved: '미해결' } as const)[battle.result ?? 'unsolved']}</strong></button>
        </li>)}</ul>
      </section>}
    </div>
  </main>
}

export default function ClubBattlesPage() {
  const { user, loading, authError } = useAuth()
  if (loading) return <main className="study-page club-battles"><p role="status">로그인 상태를 확인하는 중...</p></main>
  if (authError) return <main className="study-page club-battles"><AuthCheckFailed /></main>
  if (!user) return <main className="study-page club-battles"><MembersGate title="친구와 문제 대결은 동아리원만 할 수 있어요" /></main>
  return <BattleContent />
}
