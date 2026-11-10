import PageHeading from '../components/PageHeading'
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Copy, Dices, ListOrdered, Minus, Plus, Sparkles, Users, UsersRound, type LucideIcon } from 'lucide-react'
import {
  MAX_DRAW_NAMES,
  clampTeamCount,
  cryptoRandom,
  orderToText,
  parseNames,
  pickSome,
  shuffled,
  splitIntoTeams,
  teamsToText,
} from '../utils/draw'
import { showToast } from '../components/common/Toast'
import { confirmDialog } from '../components/common/ConfirmDialog'
import ToolFlow from '../components/ToolFlow'
import { usePermissions } from '../contexts/usePermissions'
import { canManageContent } from '../utils/roleAccess'
import { getGathering, listGatherings } from '../services/gatheringApi'
import { getAttendanceSession, listAttendanceSessions } from '../services/attendanceApi'
import { companionServices } from '../data/homeContent'

/**
 * Draw ("뽑기"): type names, then split them into teams, put them in an order or pick some.
 * The names and the last result are kept in this browser only (localStorage), never sent.
 *
 * Teams here are a plain even split. TeamMate, one of the club's own apps, splits by roles and
 * rules and keeps rooms; the page points to it instead of growing into it.
 */

type Mode = 'teams' | 'order' | 'pick'
type Result =
  | { kind: 'teams'; teams: string[][] }
  | { kind: 'order'; order: string[] }
  | { kind: 'pick'; picked: string[] }

const MODES: { key: Mode; label: string; action: string; icon: LucideIcon }[] = [
  // The action is worded apart from the label: two buttons with one name are hard to tell apart by ear.
  { key: 'teams', label: '조 나누기', action: '섞어서 나누기', icon: Users },
  { key: 'order', label: '순서 정하기', action: '순서 섞기', icon: ListOrdered },
  { key: 'pick', label: '뽑기', action: '뽑기 시작', icon: Sparkles },
]
const SAMPLE = ['홍길동', '김철수', '이영희', '박민수', '최가람', '정하늘', '강바다', '윤이슬']
const TEAM_MATE = companionServices.find((service) => service.eyebrow === 'Team randomizer')
/** How long the names tumble before the result settles. */
const ROLL_MS = 900

const STORE_KEY = 'coms:draw:v1'

const isNames = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string')

/** The saved names and result; anything missing, unreadable or of another shape comes back empty. */
function loadSaved(): { text: string; result: Result | null } {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORE_KEY) || 'null')
    if (!saved || typeof saved !== 'object') return { text: '', result: null }
    const text = typeof saved.text === 'string' ? saved.text : ''
    const result = saved.result
    const valid = result && (
      (result.kind === 'teams' && Array.isArray(result.teams) && result.teams.every(isNames))
      || (result.kind === 'order' && isNames(result.order))
      || (result.kind === 'pick' && isNames(result.picked))
    )
    return { text, result: valid ? result : null }
  } catch {
    return { text: '', result: null }
  }
}

function saveSaved(text: string, result: Result | null) {
  try {
    if (!text && !result) window.localStorage.removeItem(STORE_KEY)
    else window.localStorage.setItem(STORE_KEY, JSON.stringify({ text, result }))
  } catch {
    // Storage may be blocked or full: the page works without it.
  }
}

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function Draw() {
  const navigate = useNavigate()
  const [saved] = useState(loadSaved)
  const [text, setText] = useState(saved.text)
  const [mode, setMode] = useState<Mode>('teams')
  const [teamCount, setTeamCount] = useState(2)
  const [pickCount, setPickCount] = useState(1)
  const [skipPicked, setSkipPicked] = useState(true)
  /** Places (in the list) of the names already picked, for "뽑힌 사람은 빼고". */
  const [alreadyPicked, setAlreadyPicked] = useState<number[]>([])
  const [result, setResult] = useState<Result | null>(saved.result)
  const [drawId, setDrawId] = useState(0)
  const [rolling, setRolling] = useState(false)
  const [flicker, setFlicker] = useState(0)
  const [importing, setImporting] = useState(false)

  const { names, duplicates, dropped } = useMemo(() => parseNames(text), [text])
  const teams = clampTeamCount(teamCount, names.length)
  const pool = skipPicked ? names.length - alreadyPicked.length : names.length
  const picks = Math.min(Math.max(1, pickCount), Math.max(1, pool))
  const enough = names.length >= 2
  const poolEmpty = mode === 'pick' && enough && pool === 0

  useEffect(() => saveSaved(text, result), [text, result])

  useEffect(() => {
    if (!rolling) return undefined
    const flickerId = window.setInterval(() => setFlicker((value) => value + 1), 70)
    const doneId = window.setTimeout(() => setRolling(false), ROLL_MS)
    return () => {
      window.clearInterval(flickerId)
      window.clearTimeout(doneId)
    }
  }, [rolling])

  const changeText = (value: string) => {
    setText(value)
    // The places no longer point at the same names.
    setAlreadyPicked([])
  }

  const run = () => {
    if (rolling || !enough) return
    if (poolEmpty) {
      setAlreadyPicked([])
      return
    }
    if (mode === 'teams') {
      setResult({ kind: 'teams', teams: splitIntoTeams(names, teams, cryptoRandom) })
    } else if (mode === 'order') {
      setResult({ kind: 'order', order: shuffled(names, cryptoRandom) })
    } else {
      const candidates = names.map((name, place) => ({ name, place })).filter((entry) => !skipPicked || !alreadyPicked.includes(entry.place))
      const chosen = pickSome(candidates, picks, cryptoRandom)
      setResult({ kind: 'pick', picked: chosen.map((entry) => entry.name) })
      if (skipPicked) setAlreadyPicked((previous) => [...previous, ...chosen.map((entry) => entry.place)])
    }
    setDrawId((value) => value + 1)
    if (!prefersReducedMotion()) setRolling(true)
  }

  const copy = async () => {
    if (!result) return
    const value = result.kind === 'teams' ? teamsToText(result.teams) : result.kind === 'order' ? orderToText(result.order) : result.picked.join(', ')
    try {
      await navigator.clipboard.writeText(value)
      showToast({ message: '결과를 복사했습니다.', tone: 'success' })
    } catch {
      showToast({ message: '복사하지 못했습니다. 결과를 직접 선택해 복사해 주세요.', tone: 'error' })
    }
  }

  // While the names tumble, each slot shows some name from the list instead of its own.
  const shown = (name: string, slot: number) => (rolling && names.length > 0 ? names[(flicker * 7 + slot * 13) % names.length] : name)
  const current = MODES.find((entry) => entry.key === mode) ?? MODES[0]

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-4">
      <div className="flex justify-center sm:justify-start">
        <button type="button" onClick={() => navigate('/')} className="apple-action-secondary px-4 py-2 text-sm">메인으로 돌아가기</button>
      </div>
      <section className="apple-board-shell">
        <div className="apple-board-hero px-5 py-6 sm:px-8 sm:py-8">
          <span className="coms-icon coms-board-icon" aria-hidden="true"><Dices size={22} strokeWidth={2} /></span>
          <PageHeading className="apple-display mt-2 text-4xl sm:text-5xl">뽑기</PageHeading>
          <p className="apple-copy mt-3 max-w-2xl text-base sm:text-lg">이름을 넣고 조를 나누거나, 발표 순서를 정하거나, 한 명을 뽑습니다.</p>
        </div>
        <ToolFlow current="draw" />

        <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="drawNames" className="text-base font-bold text-[var(--app-text)]">
                이름 <span className="text-[var(--app-accent-text)]">{names.length}명</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setImporting((open) => !open)} aria-expanded={importing} className="apple-action-secondary min-h-8 px-3 text-xs">가져오기</button>
                <button type="button" onClick={() => changeText(SAMPLE.join('\n'))} className="apple-action-secondary min-h-8 px-3 text-xs">예시 넣기</button>
                <button type="button" onClick={() => { changeText(''); setResult(null) }} disabled={text === ''} className="apple-action-secondary min-h-8 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-50">지우기</button>
              </div>
            </div>
            {importing && (
              <ImportPanel
                onPick={async (names) => {
                  if (text.trim() && !(await confirmDialog({ message: '지금 적힌 이름을 가져온 이름으로 바꿀까요?' }))) return
                  changeText(names.join('\n'))
                  setImporting(false)
                }}
              />
            )}
            <textarea
              id="drawNames"
              value={text}
              onChange={(event) => changeText(event.target.value)}
              rows={10}
              placeholder={'한 줄에 한 명씩, 또는 쉼표로 나눠 적어 주세요.\n홍길동\n김철수\n이영희'}
              className="coms-draw-names"
              aria-describedby="drawNamesHelp"
            />
            <p id="drawNamesHelp" className="mt-2 text-xs text-[var(--app-muted)]">
              이름과 마지막 결과는 이 브라우저에만 저장되고 서버로 보내지 않습니다. 지우기를 누르면 저장한 내용도 사라집니다.
            </p>
            {duplicates.length > 0 && (
              <p className="mt-1 text-xs font-semibold text-amber-600 dark:text-amber-300">같은 이름이 여러 번 있습니다: {duplicates.join(', ')}</p>
            )}
            {dropped > 0 && (
              <p className="mt-1 text-xs font-semibold text-amber-600 dark:text-amber-300">{MAX_DRAW_NAMES}명까지만 씁니다. 뒤의 {dropped}명은 빠졌습니다.</p>
            )}
          </div>

          <div className="min-w-0">
            <div className="coms-draw-modes" role="group" aria-label="뽑는 방식">
              {MODES.map((entry) => (
                <button key={entry.key} type="button" onClick={() => setMode(entry.key)} aria-pressed={mode === entry.key} className={`coms-draw-mode ${mode === entry.key ? 'is-on' : ''}`}>
                  <entry.icon size={15} aria-hidden="true" />
                  {entry.label}
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {mode === 'teams' && (
                <Stepper label="조 개수" unit="조" value={teams} min={2} max={Math.max(2, names.length)} onChange={setTeamCount} />
              )}
              {mode === 'pick' && (
                <>
                  <Stepper label="뽑을 인원" unit="명" value={picks} min={1} max={Math.max(1, pool)} onChange={setPickCount} />
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--app-text)]">
                    <input type="checkbox" checked={skipPicked} onChange={(event) => { setSkipPicked(event.target.checked); setAlreadyPicked([]) }} className="size-4 accent-[var(--app-accent)]" />
                    뽑힌 사람은 빼고
                  </label>
                </>
              )}
              <button type="button" onClick={run} disabled={!enough || rolling} className="apple-action-primary inline-flex min-h-11 items-center gap-2 px-6 text-sm disabled:cursor-not-allowed disabled:opacity-50">
                <Dices size={16} aria-hidden="true" />
                {poolEmpty ? '처음부터 다시' : rolling ? '섞는 중...' : current.action}
              </button>
            </div>
            <p className="mt-2 min-h-5 text-xs text-[var(--app-muted)]">
              {!enough
                ? '이름을 두 명 이상 넣어 주세요.'
                : mode === 'pick' && skipPicked
                  ? (pool === 0 ? '모두 뽑혔습니다.' : `남은 사람 ${pool}명`)
                  : mode === 'teams'
                    ? `${names.length}명을 ${teams}조로 나눕니다.`
                    : ''}
            </p>

            {mode === 'teams' && TEAM_MATE && (
              <p className="text-xs text-[var(--app-muted)]">
                역할이나 조건을 맞춰 나누려면{' '}
                <a href={TEAM_MATE.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--app-accent-text)] underline underline-offset-2">{TEAM_MATE.title}</a>
                를 쓰세요. 여기서는 인원만 고르게 나눕니다.
              </p>
            )}

            <div className="coms-draw-result" aria-live="polite" aria-busy={rolling}>
              {!result && <p className="coms-draw-empty">결과가 여기에 나옵니다.</p>}
              {result?.kind === 'teams' && (
                <ul key={drawId} className={`coms-draw-teams ${rolling ? 'is-rolling' : ''}`} aria-label="조 편성 결과">
                  {result.teams.map((team, teamIndex) => (
                    <li key={teamIndex} className="coms-draw-team" style={{ '--i': teamIndex } as React.CSSProperties}>
                      <p className="coms-draw-team-head">
                        <span>{teamIndex + 1}조</span>
                        <span className="text-xs font-semibold text-[var(--app-muted)]">{team.length}명</span>
                      </p>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {team.map((name, index) => (
                          <li key={index} className="coms-draw-chip">{shown(name, teamIndex * 31 + index)}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
              {result?.kind === 'order' && (
                <ol key={drawId} className={`coms-draw-order ${rolling ? 'is-rolling' : ''}`} aria-label="정해진 순서">
                  {result.order.map((name, index) => (
                    <li key={index} style={{ '--i': Math.min(index, 14) } as React.CSSProperties}>
                      <span className="coms-draw-number" aria-hidden="true">{index + 1}</span>
                      <span className="min-w-0 truncate">{shown(name, index)}</span>
                    </li>
                  ))}
                </ol>
              )}
              {result?.kind === 'pick' && (
                <ul key={drawId} className={`coms-draw-picked ${rolling ? 'is-rolling' : ''}`} aria-label="뽑힌 사람">
                  {result.picked.map((name, index) => (
                    <li key={index} style={{ '--i': index } as React.CSSProperties}>{shown(name, index)}</li>
                  ))}
                </ul>
              )}
            </div>
            {result && !rolling && (
              <div className="mt-3 flex justify-end">
                <button type="button" onClick={copy} className="apple-action-secondary inline-flex min-h-9 items-center gap-1.5 px-3 text-xs">
                  <Copy size={13} aria-hidden="true" />
                  결과 복사
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

/** A number changed with a minus and a plus, which a thumb hits more easily than a number box. */
function Stepper({ label, unit, value, min, max, onChange }: {
  label: string
  unit: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <div className="coms-draw-stepper" role="group" aria-label={label}>
      <span className="text-xs font-bold text-[var(--app-muted)]">{label}</span>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`${label} 줄이기`}>
        <Minus size={14} aria-hidden="true" />
      </button>
      <output aria-live="polite">{value}{unit}</output>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`${label} 늘리기`}>
        <Plus size={14} aria-hidden="true" />
      </button>
    </div>
  )
}

/**
 * Names taken from a gathering's sign-ups (any member may see who signed up) or, for those who
 * may run attendance, from who attended a check (the server shows that list to them only).
 */
function ImportPanel({ onPick }: { onPick: (names: string[]) => void }) {
  const { permissions } = usePermissions()
  const manager = canManageContent(permissions)
  const [busy, setBusy] = useState(false)
  const gatherings = useQuery({ queryKey: ['gatherings'], queryFn: listGatherings })
  const sessions = useQuery({ queryKey: ['attendance', 'sessions'], queryFn: listAttendanceSessions, enabled: manager })

  const take = async (load: () => Promise<string[]>) => {
    setBusy(true)
    try {
      const names = await load()
      if (names.length === 0) showToast({ message: '가져올 이름이 없습니다.', tone: 'error' })
      else await onPick(names)
    } catch (err) {
      showToast({ message: (err as Error).message || '이름을 가져오지 못했습니다.', tone: 'error' })
    } finally {
      setBusy(false)
    }
  }
  const row = 'apple-action-secondary flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left text-xs disabled:opacity-50'

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-[var(--app-hairline)] p-3" aria-label="이름 가져오기" role="group">
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[var(--app-text)]"><UsersRound size={13} aria-hidden="true" />모임 신청자</p>
        {gatherings.isLoading && <p className="text-xs text-[var(--app-muted)]">불러오는 중...</p>}
        {gatherings.isError && <p role="alert" className="text-xs font-semibold text-red-600 dark:text-red-300">모임 목록을 불러오지 못했습니다.</p>}
        {gatherings.isSuccess && (gatherings.data.length === 0
          ? <p className="text-xs text-[var(--app-muted)]">신청을 받은 모임이 없습니다.</p>
          : (
            <ul className="space-y-1.5">
              {gatherings.data.map((gathering) => (
                <li key={gathering.id}>
                  <button type="button" disabled={busy} className={row} onClick={() => take(async () => (await getGathering(gathering.id)).participants.map((person) => person.name))}>
                    <span className="min-w-0 truncate">{gathering.title}</span>
                    <span className="shrink-0 text-[var(--app-muted)]">{gathering.participantCount}명</span>
                  </button>
                </li>
              ))}
            </ul>
          ))}
      </div>
      {manager && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[var(--app-text)]"><Users size={13} aria-hidden="true" />출석한 사람</p>
          {sessions.isLoading && <p className="text-xs text-[var(--app-muted)]">불러오는 중...</p>}
          {sessions.isError && <p role="alert" className="text-xs font-semibold text-red-600 dark:text-red-300">출석 목록을 불러오지 못했습니다.</p>}
          {sessions.isSuccess && (sessions.data.length === 0
            ? <p className="text-xs text-[var(--app-muted)]">출석 기록이 없습니다.</p>
            : (
              <ul className="space-y-1.5">
                {sessions.data.map((session) => (
                  <li key={session.id}>
                    <button type="button" disabled={busy} className={row} onClick={() => take(async () => (await getAttendanceSession(session.id)).attendees.map((person) => person.name))}>
                      <span className="min-w-0 truncate">{session.title}</span>
                      <span className="shrink-0 text-[var(--app-muted)]">{session.attendeeCount}명</span>
                    </button>
                  </li>
                ))}
              </ul>
            ))}
        </div>
      )}
    </div>
  )
}
