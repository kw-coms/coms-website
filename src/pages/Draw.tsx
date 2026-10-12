import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, Dices, ListOrdered, Minus, Plus, Sparkles, Users, type LucideIcon } from 'lucide-react'
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

/**
 * Draw ("뽑기"): type names, then split them into teams, put them in an order or pick some.
 * Everything happens in the page: the names are not sent or stored anywhere.
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
/** How long the names tumble before the result settles. */
const ROLL_MS = 900

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function Draw() {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [mode, setMode] = useState<Mode>('teams')
  const [teamCount, setTeamCount] = useState(2)
  const [pickCount, setPickCount] = useState(1)
  const [skipPicked, setSkipPicked] = useState(true)
  /** Places (in the list) of the names already picked, for "뽑힌 사람은 빼고". */
  const [alreadyPicked, setAlreadyPicked] = useState<number[]>([])
  const [result, setResult] = useState<Result | null>(null)
  const [drawId, setDrawId] = useState(0)
  const [rolling, setRolling] = useState(false)
  const [flicker, setFlicker] = useState(0)

  const { names, duplicates, dropped } = useMemo(() => parseNames(text), [text])
  const teams = clampTeamCount(teamCount, names.length)
  const pool = skipPicked ? names.length - alreadyPicked.length : names.length
  const picks = Math.min(Math.max(1, pickCount), Math.max(1, pool))
  const enough = names.length >= 2
  const poolEmpty = mode === 'pick' && enough && pool === 0

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
          <p className="apple-eyebrow">Draw</p>
          <h1 className="apple-display mt-2 text-4xl sm:text-5xl">뽑기</h1>
          <p className="apple-copy mt-3 max-w-2xl text-base sm:text-lg">이름을 넣고 조를 나누거나, 발표 순서를 정하거나, 한 명을 뽑습니다.</p>
        </div>

        <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="drawNames" className="text-base font-bold text-[var(--app-text)]">
                이름 <span className="text-[var(--app-accent-text)]">{names.length}명</span>
              </label>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => changeText(SAMPLE.join('\n'))} className="apple-action-secondary min-h-8 px-3 text-xs">예시 넣기</button>
                <button type="button" onClick={() => { changeText(''); setResult(null) }} disabled={text === ''} className="apple-action-secondary min-h-8 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-50">지우기</button>
              </div>
            </div>
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
              이름은 이 화면 안에서만 쓰이고 어디에도 저장되거나 전송되지 않습니다.
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
