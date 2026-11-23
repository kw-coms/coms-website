import PageHeading from '../../../components/PageHeading'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Settings2 } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../../contexts/useAuth'
import MembersGate, { AuthCheckFailed } from '../../../components/MembersGate'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import NotFoundPage from '../../../components/NotFoundPage'
import { createEditor, type PgEditor } from '../playground/editor'
import type { EditorAppearance } from './editorAppearance'
import { chooseCodingLanguage, problemStarter, readCodingSettings } from './codingSettings'
import type { BlockLang } from '../playground/classify'
import { runRemote, type RunOutput } from '../playground/runner'
import { decodeShareHash, encodeShareHash } from '../playground/storage'
import { buildProgram, gradeExercise, mapDiagnostics, type GradeReport } from './grade'
import { MiniMarkdown } from './markdown'
import { exercisesFor, findExercise, findNumberedExercise } from './problems'
import { exercisePath } from './problemNumbers'
import { flushSaves, markOpened, markViewed, readProgress, recordAttempt, saveCode, scheduleSaveCode, useProgress } from './progress'
import { LANG_NAMES, type ExLang, type Exercise, type WebExercise } from './types'
import { numberedLanguages } from './judgeLanguages'
import WebWorkspace from './WebWorkspace'
import { JudgeTierBadge } from './JudgeTierBadge'
import ProblemHelp from './ProblemHelp'
import ClubVote from './ClubVote'
import ClubBattleBanner from './ClubBattleBanner'
import { shareJudgeResult, useJudgeProgress } from './judgeProgress'
import '../study.css'
import './exercises.css'
import './problem-workspace.css'

const LEVEL_NAME = ['입문', '기초', '응용', '심화', '도전']
const isWeb = (problem: Exercise | WebExercise): problem is WebExercise => 'checks' in problem

function CodePane({ lang, initial, appearance, editorRef, onChange, onRun, onSubmit }: {
  lang: ExLang; initial: string; editorRef: React.RefObject<PgEditor | null>
  appearance: EditorAppearance
  onChange(value: string): void; onRun(): void; onSubmit(): void
}) {
  const host = useRef<HTMLDivElement>(null)
  const firstDoc = useRef(initial)
  const firstAppearance = useRef(appearance)
  const handlers = useRef({ onChange, onRun, onSubmit })
  useEffect(() => { handlers.current = { onChange, onRun, onSubmit } }, [onChange, onRun, onSubmit])
  useEffect(() => {
    let disposed = false
    let editor: PgEditor | null = null
    if (host.current) void createEditor({
      parent: host.current, lang, doc: firstDoc.current, label: `${LANG_NAMES[lang]} 코드 편집기`, appearance: firstAppearance.current,
      onChange: (value) => handlers.current.onChange(value),
      onRun: () => handlers.current.onRun(), onSubmit: () => handlers.current.onSubmit(),
    }).then((instance) => {
      if (disposed) instance.destroy()
      else { editor = instance; editorRef.current = instance }
    })
    return () => { disposed = true; editor?.destroy(); if (editorRef.current === editor) editorRef.current = null }
  }, [lang, editorRef])
  useEffect(() => { editorRef.current?.setAppearance(appearance) }, [appearance, editorRef])
  return <div ref={host} className="ex-editor" />
}

function SolutionEditor({ lang, code }: { lang: BlockLang; code: string }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let disposed = false
    let editor: PgEditor | null = null
    if (host.current) void createEditor({
      parent: host.current, lang, doc: code, label: '참고 답안', readOnly: true,
      onChange: () => {}, onRun: () => {},
    }).then((instance) => { if (disposed) instance.destroy(); else editor = instance })
    return () => { disposed = true; editor?.destroy() }
  }, [lang, code])
  return <div ref={host} className="ex-editor ex-solution-editor" />
}

function OutputBox({ title, value }: { title: string; value: string }) {
  return <div className="ex-output-box"><strong>{title}</strong><pre>{value || '(없음)'}</pre></div>
}

function ProblemBackLink({ studyId, fromAlgorithms, battleLink }: { studyId: string; fromAlgorithms: boolean; battleLink?: string }) {
  return <nav className="ex-back">{battleLink ? <Link to={battleLink}>← 배틀로 돌아가기</Link> : fromAlgorithms
    ? <Link to="/study/algorithms">← 알고리즘 문제 목록</Link>
    : <Link to={`/study/${studyId}/practice`}>← 실습 문제 목록</Link>}
  </nav>
}

function ProblemBody({ studyId, problem, fromAlgorithms, number, battleCode }: { studyId: string; problem: Exercise | WebExercise; fromAlgorithms: boolean; number?: number; battleCode?: string }) {
  useDocumentTitle(problem.title)
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const battleLink = battleCode ? `/study/algorithms/battles?room=${battleCode}` : undefined
  const draftKey = battleCode ? `${problem.id}:battle:${battleCode}:${user.studentId}` : problem.id
  const [settings] = useState(() => readCodingSettings(user?.studentId))
  const progress = useProgress()
  const judgeProgress = useJudgeProgress(number !== undefined)
  const record = progress[problem.id]
  const web = isWeb(problem)
  const langs = web ? [] : [...numberedLanguages(problem)]
    .sort((a, b) => Number(b === studyId) - Number(a === studyId) ||
      Number(problem.langs.includes(b)) - Number(problem.langs.includes(a)))
  const [initialContext] = useState(() => {
    const share = battleCode ? null : decodeShareHash(location.hash)
    return { saved: readProgress()[draftKey]?.code ?? {}, share, sharedLang: share ? langs[share.index] : undefined }
  })
  const [lang, setLang] = useState<ExLang>(() => initialContext.sharedLang ?? chooseCodingLanguage(
    langs, number === undefined ? studyId : new URLSearchParams(location.search).get('lang'), settings.preferredLanguage, studyId,
  ))
  const sharedLang = initialContext.sharedLang
  const [shared, setShared] = useState(Boolean(sharedLang))
  const [codeByLang, setCodeByLang] = useState<Partial<Record<ExLang, string>>>(() => {
    if (web) return {}
    const next: Partial<Record<ExLang, string>> = {}
    for (const language of langs) next[language] = initialContext.saved[language] ?? problemStarter(problem, language, settings)
    if (sharedLang && initialContext.share) next[sharedLang] = initialContext.share.code
    return next
  })
  const [stdin, setStdin] = useState(web ? '' : problem.examples[0]?.stdin ?? '')
  const [shownHints, setShownHints] = useState(0)
  const [showSolution, setShowSolution] = useState(false)
  const [busy, setBusy] = useState(false)
  const [runningKind, setRunningKind] = useState<'run' | 'grade'>('run')
  const [countdown, setCountdown] = useState(0)
  const [message, setMessage] = useState('')
  const [needsLogin, setNeedsLogin] = useState(false)
  const [single, setSingle] = useState<RunOutput | null>(null)
  const [grade, setGrade] = useState<GradeReport | null>(null)
  const [solved, setSolved] = useState(Boolean(record?.solved))
  const editorRef = useRef<PgEditor | null>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const codeRef = useRef(codeByLang)
  const currentCode = codeByLang[lang] ?? ''
  const studyProblems = exercisesFor(studyId)
  const next = studyProblems[studyProblems.findIndex((item) => item.id === problem.id) + 1]

  useEffect(() => { markOpened(problem.id); return () => { flushSaves(); abortRef.current?.abort() } }, [problem.id])
  useEffect(() => {
    if (!countdown) return
    const timer = window.setInterval(() => setCountdown((remaining) => Math.max(0, remaining - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [countdown])
  useEffect(() => { if (grade) summaryRef.current?.focus() }, [grade])

  const updateCode = (value: string) => {
    codeRef.current = { ...codeRef.current, [lang]: value }
    setCodeByLang(codeRef.current)
    if (!shared || lang !== sharedLang) scheduleSaveCode(draftKey, lang, value)
  }
  const dropSharedHash = () => { if (location.hash.startsWith('#pg=')) history.replaceState(history.state, '', location.pathname + location.search) }
  const leaveShared = (keep: boolean) => {
    const value = keep ? codeRef.current[lang] ?? '' : initialContext.saved[lang] ?? (!web ? problemStarter(problem, lang, settings) : '')
    if (keep) saveCode(draftKey, lang, value)
    codeRef.current = { ...codeRef.current, [lang]: value }
    setCodeByLang(codeRef.current)
    editorRef.current?.setValue(value)
    setShared(false)
    dropSharedHash()
  }
  const finish = (kind: 'run' | 'grade', result: { kind: string; messageKo?: string; retryAfterSec?: number }) => {
    if (result.kind === 'login') { setNeedsLogin(true); setMessage('로그인한 동아리원만 실행할 수 있어요.'); return false }
    if (result.kind === 'busy') { setCountdown(result.retryAfterSec ?? 5); setMessage(result.messageKo ?? '지금 실행 요청이 많아요.'); return false }
    if (result.kind !== 'output' && result.kind !== 'graded') { setMessage(result.messageKo ?? `${kind === 'run' ? '실행' : '채점'}에 실패했어요.`); return false }
    setMessage(''); setNeedsLogin(false); return true
  }
  const run = useCallback(async () => {
    if (web || busy || countdown) return
    setRunningKind('run')
    setBusy(true); setSingle(null); setGrade(null); setMessage('')
    editorRef.current?.clearDiagnostics()
    const controller = new AbortController(); abortRef.current = controller
    try {
      const code = buildProgram(problem, lang, codeRef.current[lang] ?? '')
      const result = await runRemote(lang, code, stdin, controller.signal)
      if (!finish('run', result)) return
      if (result.kind === 'output') {
        setSingle(result.output)
        if (result.output.stage === 'compile') editorRef.current?.setDiagnostics(mapDiagnostics(result.output.diagnostics, problem, lang, codeRef.current[lang] ?? '').filter((diagnostic) => diagnostic.source === 'student'))
      }
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : '실행에 실패했어요.') }
    finally { setBusy(false); abortRef.current = null }
  }, [web, busy, countdown, problem, lang, stdin])
  const submit = useCallback(async () => {
    if (web || busy || countdown) return
    setRunningKind('grade')
    setBusy(true); setGrade(null); setSingle(null); setMessage('')
    editorRef.current?.clearDiagnostics()
    const controller = new AbortController(); abortRef.current = controller
    try {
      const result = await gradeExercise(problem, lang, codeRef.current[lang] ?? '', controller.signal, number, battleCode)
      if (!finish('grade', result)) return
      if (result.kind === 'graded') {
        setGrade(result.grade)
        editorRef.current?.setDiagnostics(result.grade.diagnostics.filter((diagnostic) => diagnostic.source === 'student'))
        recordAttempt(problem.id, lang, result.grade.solved)
        if (result.grade.solved) setSolved(true)
      }
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : '채점에 실패했어요.') }
    finally { setBusy(false); abortRef.current = null }
  }, [web, busy, countdown, problem, lang, number, battleCode])
  const revealSolution = () => {
    if (!solved && !record?.viewed && !window.confirm('스스로 풀어 보는 게 실력이 늘어요. 그래도 볼까요?')) return
    markViewed(problem.id)
    setShowSolution(true)
  }
  const reset = () => {
    if (web || busy || !window.confirm('코드를 처음 상태로 되돌릴까요?')) return
    const starter = problemStarter(problem, lang, settings)
    if (shared && lang === sharedLang) {
      codeRef.current = { ...codeRef.current, [lang]: starter }
      setCodeByLang(codeRef.current)
      editorRef.current?.setValue(starter)
      editorRef.current?.clearDiagnostics()
      setGrade(null); setSingle(null)
      return
    }
    codeRef.current = { ...codeRef.current, [lang]: starter }
    setCodeByLang(codeRef.current)
    editorRef.current?.setValue(starter)
    editorRef.current?.clearDiagnostics()
    saveCode(draftKey, lang, starter)
    setGrade(null); setSingle(null)
  }
  const share = () => {
    const index = langs.indexOf(lang)
    const hash = encodeShareHash(index, codeRef.current[lang] ?? '')
    if (!hash) { setMessage('공유할 코드가 너무 길어요.'); return }
    const url = `${window.location.origin}${location.pathname}${location.search}${hash}`
    if (!navigator.clipboard) { setMessage('링크를 복사하지 못했어요.'); return }
    void navigator.clipboard.writeText(url).then(() => { history.replaceState(history.state, '', hash); setMessage('공유 링크를 복사했어요.') }).catch(() => setMessage('링크를 복사하지 못했어요.'))
  }
  const shareAchievement = async () => {
    const verified = grade?.progress ?? judgeProgress
    if (number === undefined || !verified?.solved.includes(number)) return
    try {
      await shareJudgeResult({ number, title: problem.title, progress: verified })
      setMessage(navigator.share ? '공유 화면을 열었어요.' : '성취 내용을 복사했어요.')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setMessage('성취 내용을 공유하지 못했어요.')
    }
  }
  const login = () => navigate('/login', { state: { from: { pathname: location.pathname, search: location.search, hash: location.hash } } })

  return <main className="study-page ex-page judge-problem">
    <ProblemBackLink studyId={studyId} fromAlgorithms={fromAlgorithms} battleLink={battleLink} />
    {battleCode && <ClubBattleBanner code={battleCode} />}
    <header className="ex-head"><div><p className="ex-eyebrow">{number === undefined ? '실습 문제' : `문제 ${number}번`}</p><PageHeading>{problem.title}</PageHeading><div className="ex-meta"><JudgeTierBadge problem={problem} />{number === undefined && <span>{LEVEL_NAME[problem.level - 1]}</span>}{problem.topics.map((topic) => <span key={topic}>{topic}</span>)}</div></div></header>
    <nav className="judge-mobile-nav" aria-label="문제 화면 이동">
      <a href="#judge-statement">문제 설명</a><a href="#judge-workspace">코드 작성</a><a href="#judge-results">실행 결과</a>
      {number !== undefined && !battleCode && <a href="#judge-help">힌트·질문</a>}
    </nav>
    <div className="ex-columns">
      <section id="judge-statement" className="ex-panel ex-statement" aria-label="문제 설명">
        <MiniMarkdown text={problem.statement} />
        {!web && <>{problem.inputSpec && <section className="ex-spec"><h2>입력</h2><MiniMarkdown text={problem.inputSpec} /></section>}{problem.outputSpec && <section className="ex-spec"><h2>출력</h2><MiniMarkdown text={problem.outputSpec} /></section>}
          <section className="ex-examples"><h2>예제</h2>{problem.examples.map((example, index) => <div className="ex-example" key={index}><h3>예제 {index + 1}</h3><OutputBox title="입력" value={example.stdin} /><button type="button" onClick={() => void navigator.clipboard.writeText(example.stdin)}>입력 복사</button><OutputBox title="출력" value={example.expected} /><button type="button" onClick={() => void navigator.clipboard.writeText(example.expected)}>출력 복사</button>{example.explain && <p>{example.explain}</p>}</div>)}</section></>}
        {number !== undefined && !battleCode && <>
          <div className="judge-practice-tools">
            <Link className="judge-tools-link" to={`/study/algorithms/problem-sets?problem=${number}`}>문제집에 담기</Link>
            <ClubVote number={number} solved={(grade?.progress ?? judgeProgress)?.solved.includes(number) ?? solved} />
          </div>
          <ProblemHelp number={number} title={problem.title} hints={problem.hints} />
        </>}
        {number === undefined &&
          (problem.hints.length > 0 && <section className="ex-hints"><h2>힌트</h2>{problem.hints.slice(0, shownHints).map((hint, index) => <div key={index}><MiniMarkdown text={hint} /></div>)}{shownHints < problem.hints.length && <button type="button" onClick={() => setShownHints((count) => count + 1)}>힌트 하나 보기</button>}</section>)}
        {!battleCode && (web || problem.solution[lang]) && <section className="ex-solution"><button type="button" onClick={revealSolution}>답 보기</button>{showSolution && <div><h2>참고 답안</h2>{web ? <><h3>HTML</h3><SolutionEditor lang="html" code={problem.solution.html} /><h3>CSS</h3><SolutionEditor lang="css" code={problem.solution.css} /><h3>JavaScript</h3><SolutionEditor lang="js" code={problem.solution.js} /></> : <SolutionEditor lang={lang} code={problem.solution[lang] ?? ''} />}{problem.explain && <MiniMarkdown text={problem.explain} />}</div>}</section>}
      </section>
      <section id="judge-workspace" className="ex-panel ex-workspace" aria-label="코드 작성 및 채점">
        {web ? <WebWorkspace exercise={problem} onSolved={() => setSolved(true)} /> : <>
          {langs.length > 1 && <div className="ex-tabs" role="tablist" aria-label="프로그래밍 언어">{langs.map((language) => <button key={language} type="button" role="tab" aria-selected={lang === language} disabled={busy} onClick={() => { flushSaves(); setLang(language); setGrade(null); setSingle(null) }}>{LANG_NAMES[language]}</button>)}</div>}
          {shared && lang === sharedLang && <div className="ex-shared" role="region" aria-label="공유된 코드"><p>공유된 코드를 보고 있어요. 내 코드는 그대로 보관됩니다.</p><button type="button" onClick={() => leaveShared(false)}>내 코드로 돌아가기</button><button type="button" onClick={() => leaveShared(true)}>이 코드로 저장</button></div>}
          <div className="judge-editor-tools">
            <strong>{LANG_NAMES[lang]} 코드</strong>
            {number !== undefined && !battleCode && <a className="judge-tools-link" href="#judge-help">힌트·질문</a>}
            <Link className="judge-tools-link" to="/study/algorithms/settings" state={{ from: location.pathname + location.search + location.hash }}><Settings2 size={16} aria-hidden="true" />코딩 설정</Link>
          </div>
          <div className="ex-actions"><button type="button" onClick={() => void run()} disabled={busy || countdown > 0}>실행</button><button type="button" className="ex-primary" onClick={() => void submit()} disabled={busy || countdown > 0}>{battleCode ? '배틀 제출' : '제출'}</button><span className="ex-actions-gap" aria-hidden="true" /><button type="button" className="ex-quiet" onClick={reset} disabled={busy}>초기화</button>{!battleCode && <button type="button" className="ex-quiet" onClick={share}>내 풀이 공유</button>}</div>
          <CodePane key={lang} lang={lang} initial={currentCode} appearance={settings.appearance} editorRef={editorRef} onChange={updateCode} onRun={() => void run()} onSubmit={() => void submit()} />
          <label className="ex-stdin">직접 실행 입력 (stdin)<textarea value={stdin} onChange={(event) => setStdin(event.target.value)} rows={3} /></label>
          <p className="ex-shortcuts">⌘/Ctrl+Enter 실행 · ⌘/Ctrl+Shift+Enter 제출</p>
          <span id="judge-results" className="judge-result-anchor" aria-hidden="true" />
          {!busy && !message && !single && !grade && <p className="judge-result-empty">실행하거나 제출하면 결과가 여기에 표시됩니다.</p>}
          {busy && <p role="status">{runningKind === 'grade' ? '채점 중...' : '실행 중...'}</p>}
          {message && <div className="ex-busy" role={needsLogin ? 'alert' : 'status'}><p>{message}{countdown > 0 && ` ${countdown}초 후 다시 시도할 수 있어요.`}</p>{needsLogin && <button type="button" onClick={login}>로그인하러 가기</button>}</div>}
          {single && <div className="ex-results" role="status"><h2>{single.stage === 'compile' && !single.ok ? '컴파일 오류' : single.timedOut ? '시간 초과' : single.exitCode ? '실행 오류' : '실행 결과'}</h2><OutputBox title="출력" value={single.stdout} />{single.stderr && <OutputBox title="오류 출력" value={single.stderr} />}{mapDiagnostics(single.diagnostics, problem, lang, currentCode).map((diagnostic, index) => <button key={index} type="button" onClick={() => diagnostic.source === 'student' && editorRef.current?.goToLine(diagnostic.line, diagnostic.column)}>{diagnostic.source === 'harness' ? '채점 코드' : `${diagnostic.line}번째 줄`}: {diagnostic.message}</button>)}</div>}
          {grade && <div className="ex-results" aria-live="polite"><div ref={summaryRef} tabIndex={-1} data-ex-result-summary className={`ex-summary${grade.solved ? ' ex-success' : ''}`} role="status"><h2>{grade.compileError ? '컴파일 에러' : `${grade.passed}/${grade.total} 통과`}</h2>{grade.solved && <p>문제를 해결했어요!</p>}{grade.progress && <p>누적 {grade.progress.solved.length}문제 해결{grade.progress.streak > 0 && ` · ${grade.progress.streak}일 연속 풀이`}</p>}</div>{grade.compileError && <OutputBox title="컴파일 오류" value={grade.stderr} />}{grade.diagnostics.map((diagnostic, index) => <button key={index} type="button" onClick={() => diagnostic.source === 'student' && editorRef.current?.goToLine(diagnostic.line, diagnostic.column)}>{diagnostic.source === 'harness' ? '채점 코드' : `${diagnostic.line}번째 줄`}: {diagnostic.message}</button>)}{grade.privateCases
            ? <ol className="judge-verdict-list">{grade.cases.map((test) => <li key={test.index} data-result={test.verdict}>테스트 {test.index + 1}<strong>{test.label}</strong></li>)}</ol>
            : grade.cases.map((test) => <details className="ex-case" key={test.index} open={test.verdict !== 'correct'}><summary>테스트 {test.index + 1} · {test.label}</summary><div><OutputBox title="입력" value={test.input} /><OutputBox title="기대 출력" value={test.expected} /><OutputBox title="실제 출력" value={test.actual} />{test.stderr && <OutputBox title="오류 출력" value={test.stderr} />}{test.diff.length > 0 && <pre className="ex-diff">{test.diff.map((line) => `${line.kind === 'add' ? '+ ' : line.kind === 'del' ? '- ' : '  '}${line.text}`).join('\n')}</pre>}</div></details>)}
          </div>}
          {number !== undefined && (grade?.progress ?? judgeProgress)?.solved.includes(number) && <button type="button" className="judge-share" onClick={() => void shareAchievement()}>해결 성취 공유하기</button>}
        </>}
        {web && <span id="judge-results" className="judge-result-anchor" aria-hidden="true" />}
        {battleLink ? <Link className="ex-next" to={battleLink}>배틀 현황 보기</Link> : solved && (fromAlgorithms
          ? <Link className="ex-next" to="/study/algorithms">과제 확인 →</Link>
          : next && <Link className="ex-next" to={exercisePath(studyId, next.id)}>다음 문제 →</Link>)}
      </section>
    </div>
  </main>
}

export default function ProblemPage() {
  const { id, problemId, problemNumber } = useParams()
  const { search } = useLocation()
  const params = new URLSearchParams(search)
  const numbered = problemNumber === undefined ? undefined : findNumberedExercise(problemNumber)
  const battleCode = params.get('battle') ?? undefined
  const fromAlgorithms = Boolean(numbered) || params.get('from') === 'algorithms'
  const { user, loading, authError } = useAuth()
  const problem = numbered?.problem ?? findExercise(problemId ?? '')
  const studyId = numbered
    ? numberedLanguages(numbered.problem).find((lang) => lang === params.get('lang'))
      ?? (numberedLanguages(numbered.problem).includes('python') ? 'python' : numbered.problem.langs[0])
    : id
  if (!studyId || !problem || (battleCode !== undefined && (!numbered || !/^[A-F0-9]{12}$/.test(battleCode))) ||
      (!numbered && !exercisesFor(studyId).some((item) => item.id === problem.id))) return <NotFoundPage />
  if (loading) return <main className="study-page ex-page"><p className="study-loading" role="status">불러오는 중...</p></main>
  // ponytail: UI-only gate. Problem statements and starter code are still in the public JS bundle (problems/*).
  // Upgrade path: serve problems from an authenticated API.
  if (!user && authError) return <main className="study-page ex-page"><AuthCheckFailed /></main>
  if (!user) return <main className="study-page ex-page">
    <ProblemBackLink studyId={studyId} fromAlgorithms={fromAlgorithms} />
    <header className="ex-head"><div>{numbered && <p className="ex-eyebrow">문제 {numbered.number}번</p>}<PageHeading>{problem.title}</PageHeading></div></header>
    <MembersGate heading="h2" title="문제 풀이는 동아리원만 할 수 있어요">문제 설명과 코드 편집기는 로그인한 동아리원에게만 열려요.</MembersGate>
  </main>
  return <ProblemBody key={`${user.studentId}:${problem.id}:${studyId}:${battleCode ?? ''}`} studyId={studyId} problem={problem} fromAlgorithms={fromAlgorithms} number={numbered?.number} battleCode={battleCode} />
}
