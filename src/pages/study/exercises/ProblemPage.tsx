import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../../contexts/useAuth'
import MembersGate from '../../../components/MembersGate'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import NotFoundPage from '../../../components/NotFoundPage'
import { createEditor, type PgEditor } from '../playground/editor'
import type { BlockLang } from '../playground/classify'
import { runRemote, type RunOutput } from '../playground/runner'
import { decodeShareHash, encodeShareHash } from '../playground/storage'
import { buildProgram, gradeExercise, mapDiagnostics, type GradeReport } from './grade'
import { MiniMarkdown } from './markdown'
import { exercisesFor, findExercise } from './problems'
import { flushSaves, markOpened, markViewed, readProgress, recordAttempt, saveCode, scheduleSaveCode, useProgress } from './progress'
import { type ExLang, type Exercise, type WebExercise } from './types'
import WebWorkspace from './WebWorkspace'
import Dots from './Dots'
import '../study.css'
import './exercises.css'

const LANG_NAME: Record<ExLang, string> = { c: 'C', java: 'Java', python: 'Python' }
const LEVEL_NAME = ['입문', '기초', '응용', '심화', '도전']
const isWeb = (problem: Exercise | WebExercise): problem is WebExercise => 'checks' in problem

function CodePane({ lang, initial, editorRef, onChange, onRun, onSubmit }: {
  lang: ExLang; initial: string; editorRef: React.RefObject<PgEditor | null>
  onChange(value: string): void; onRun(): void; onSubmit(): void
}) {
  const host = useRef<HTMLDivElement>(null)
  const firstDoc = useRef(initial)
  const handlers = useRef({ onChange, onRun, onSubmit })
  useEffect(() => { handlers.current = { onChange, onRun, onSubmit } }, [onChange, onRun, onSubmit])
  useEffect(() => {
    let disposed = false
    let editor: PgEditor | null = null
    if (host.current) void createEditor({
      parent: host.current, lang, doc: firstDoc.current, label: `${LANG_NAME[lang]} 코드 편집기`,
      onChange: (value) => handlers.current.onChange(value),
      onRun: () => handlers.current.onRun(), onSubmit: () => handlers.current.onSubmit(),
    }).then((instance) => {
      if (disposed) instance.destroy()
      else { editor = instance; editorRef.current = instance }
    })
    return () => { disposed = true; editor?.destroy(); if (editorRef.current === editor) editorRef.current = null }
  }, [lang, editorRef])
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

function ProblemBody({ studyId, problem }: { studyId: string; problem: Exercise | WebExercise }) {
  useDocumentTitle(problem.title)
  const navigate = useNavigate()
  const location = useLocation()
  const progress = useProgress()
  const record = progress[problem.id]
  const web = isWeb(problem)
  const langs = web ? [] : [...problem.langs].sort((a, b) => Number(b === studyId) - Number(a === studyId))
  const [initialContext] = useState(() => {
    const share = decodeShareHash(location.hash)
    return { saved: readProgress()[problem.id]?.code ?? {}, share, sharedLang: share ? langs[share.index] : undefined }
  })
  const [lang, setLang] = useState<ExLang>(initialContext.sharedLang ?? langs[0] ?? 'c')
  const sharedLang = initialContext.sharedLang
  const [shared, setShared] = useState(Boolean(sharedLang))
  const [codeByLang, setCodeByLang] = useState<Partial<Record<ExLang, string>>>(() => {
    if (web) return {}
    const next: Partial<Record<ExLang, string>> = {}
    for (const language of problem.langs) next[language] = initialContext.saved[language] ?? problem.starter[language] ?? ''
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
  const next = exercisesFor(studyId)[exercisesFor(studyId).findIndex((item) => item.id === problem.id) + 1]

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
    if (!shared || lang !== sharedLang) scheduleSaveCode(problem.id, lang, value)
  }
  const dropSharedHash = () => { if (location.hash.startsWith('#pg=')) history.replaceState(history.state, '', location.pathname + location.search) }
  const leaveShared = (keep: boolean) => {
    const value = keep ? codeRef.current[lang] ?? '' : initialContext.saved[lang] ?? (!web ? problem.starter[lang] ?? '' : '')
    if (keep) saveCode(problem.id, lang, value)
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
      const result = await gradeExercise(problem, lang, codeRef.current[lang] ?? '', controller.signal)
      if (!finish('grade', result)) return
      if (result.kind === 'graded') {
        setGrade(result.grade)
        editorRef.current?.setDiagnostics(result.grade.diagnostics.filter((diagnostic) => diagnostic.source === 'student'))
        recordAttempt(problem.id, lang, result.grade.solved)
        if (result.grade.solved) setSolved(true)
      }
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : '채점에 실패했어요.') }
    finally { setBusy(false); abortRef.current = null }
  }, [web, busy, countdown, problem, lang])
  const revealSolution = () => {
    if (!solved && !record?.viewed && !window.confirm('스스로 풀어 보는 게 실력이 늘어요. 그래도 볼까요?')) return
    markViewed(problem.id)
    setShowSolution(true)
  }
  const reset = () => {
    if (web || busy || !window.confirm('코드를 처음 상태로 되돌릴까요?')) return
    const starter = problem.starter[lang] ?? ''
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
    saveCode(problem.id, lang, starter)
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
  const login = () => navigate('/login', { state: { from: { pathname: location.pathname, search: location.search, hash: location.hash } } })

  return <main className="study-page ex-page">
    <nav className="ex-back"><Link to={`/study/${studyId}/practice`}>← 실습 문제 목록</Link></nav>
    <header className="ex-head"><div><p className="ex-eyebrow">실습 문제 · {LEVEL_NAME[problem.level - 1]}</p><h1>{problem.title}</h1><div className="ex-meta"><Dots level={problem.level} />{problem.topics.map((topic) => <span key={topic}>{topic}</span>)}</div></div></header>
    <div className="ex-columns">
      <section className="ex-panel ex-statement" aria-label="문제 설명">
        <MiniMarkdown text={problem.statement} />
        {!web && <>{problem.inputSpec && <section className="ex-spec"><h2>입력</h2><MiniMarkdown text={problem.inputSpec} /></section>}{problem.outputSpec && <section className="ex-spec"><h2>출력</h2><MiniMarkdown text={problem.outputSpec} /></section>}
          <section className="ex-examples"><h2>예제</h2>{problem.examples.map((example, index) => <div className="ex-example" key={index}><h3>예제 {index + 1}</h3><OutputBox title="입력" value={example.stdin} /><button type="button" onClick={() => void navigator.clipboard.writeText(example.stdin)}>입력 복사</button><OutputBox title="출력" value={example.expected} /><button type="button" onClick={() => void navigator.clipboard.writeText(example.expected)}>출력 복사</button>{example.explain && <p>{example.explain}</p>}</div>)}</section></>}
        <section className="ex-hints"><h2>힌트</h2>{problem.hints.slice(0, shownHints).map((hint, index) => <div key={index}><MiniMarkdown text={hint} /></div>)}{shownHints < problem.hints.length && <button type="button" onClick={() => setShownHints((count) => count + 1)}>힌트 하나 보기</button>}</section>
        <section className="ex-solution"><button type="button" onClick={revealSolution}>답 보기</button>{showSolution && <div><h2>참고 답안</h2>{web ? <><h3>HTML</h3><SolutionEditor lang="html" code={problem.solution.html} /><h3>CSS</h3><SolutionEditor lang="css" code={problem.solution.css} /><h3>JavaScript</h3><SolutionEditor lang="js" code={problem.solution.js} /></> : <SolutionEditor lang={lang} code={problem.solution[lang] ?? ''} />}<MiniMarkdown text={problem.explain} /></div>}</section>
      </section>
      <section className="ex-panel ex-workspace" aria-label="코드 작성 및 채점">
        {web ? <WebWorkspace exercise={problem} onSolved={() => setSolved(true)} /> : <>
          {langs.length > 1 && <div className="ex-tabs" role="tablist" aria-label="프로그래밍 언어">{langs.map((language) => <button key={language} type="button" role="tab" aria-selected={lang === language} disabled={busy} onClick={() => { flushSaves(); setLang(language); setGrade(null); setSingle(null) }}>{LANG_NAME[language]}</button>)}</div>}
          {shared && lang === sharedLang && <div className="ex-shared" role="region" aria-label="공유된 코드"><p>공유된 코드를 보고 있어요. 내 코드는 그대로 보관됩니다.</p><button type="button" onClick={() => leaveShared(false)}>내 코드로 돌아가기</button><button type="button" onClick={() => leaveShared(true)}>이 코드로 저장</button></div>}
          <CodePane key={lang} lang={lang} initial={currentCode} editorRef={editorRef} onChange={updateCode} onRun={() => void run()} onSubmit={() => void submit()} />
          <label className="ex-stdin">직접 실행 입력 (stdin)<textarea value={stdin} onChange={(event) => setStdin(event.target.value)} rows={3} /></label>
          <div className="ex-actions"><button type="button" onClick={() => void run()} disabled={busy || countdown > 0}>실행</button><button type="button" className="ex-primary" onClick={() => void submit()} disabled={busy || countdown > 0}>제출</button><span className="ex-actions-gap" aria-hidden="true" /><button type="button" className="ex-quiet" onClick={reset} disabled={busy}>초기화</button><button type="button" className="ex-quiet" onClick={share}>내 풀이 공유</button></div>
          <p className="ex-shortcuts">⌘/Ctrl+Enter 실행 · ⌘/Ctrl+Shift+Enter 제출</p>
          {busy && <p role="status">{runningKind === 'grade' ? '채점 중...' : '실행 중...'}</p>}
          {message && <div className="ex-busy" role={needsLogin ? 'alert' : 'status'}><p>{message}{countdown > 0 && ` ${countdown}초 후 다시 시도할 수 있어요.`}</p>{needsLogin && <button type="button" onClick={login}>로그인하러 가기</button>}</div>}
          {single && <div className="ex-results" role="status"><h2>{single.stage === 'compile' && !single.ok ? '컴파일 오류' : single.timedOut ? '시간 초과' : single.exitCode ? '실행 오류' : '실행 결과'}</h2><OutputBox title="출력" value={single.stdout} />{single.stderr && <OutputBox title="오류 출력" value={single.stderr} />}{mapDiagnostics(single.diagnostics, problem, lang, currentCode).map((diagnostic, index) => <button key={index} type="button" onClick={() => diagnostic.source === 'student' && editorRef.current?.goToLine(diagnostic.line, diagnostic.column)}>{diagnostic.source === 'harness' ? '채점 코드' : `${diagnostic.line}번째 줄`}: {diagnostic.message}</button>)}</div>}
          {grade && <div className="ex-results" aria-live="polite"><div ref={summaryRef} tabIndex={-1} data-ex-result-summary className={`ex-summary${grade.solved ? ' ex-success' : ''}`} role="status"><h2>{grade.compileError ? '컴파일 에러' : `${grade.passed}/${grade.total} 통과`}</h2>{grade.solved && <p>문제를 해결했어요!</p>}</div>{grade.compileError && <OutputBox title="컴파일 오류" value={grade.stderr} />}{grade.diagnostics.map((diagnostic, index) => <button key={index} type="button" onClick={() => diagnostic.source === 'student' && editorRef.current?.goToLine(diagnostic.line, diagnostic.column)}>{diagnostic.source === 'harness' ? '채점 코드' : `${diagnostic.line}번째 줄`}: {diagnostic.message}</button>)}{grade.cases.map((test) => <details className="ex-case" key={test.index} open={test.verdict !== 'correct'}><summary>테스트 {test.index + 1} · {test.label}</summary><div><OutputBox title="입력" value={test.input} /><OutputBox title="기대 출력" value={test.expected} /><OutputBox title="실제 출력" value={test.actual} />{test.stderr && <OutputBox title="오류 출력" value={test.stderr} />}{test.diff.length > 0 && <pre className="ex-diff">{test.diff.map((line) => `${line.kind === 'add' ? '+ ' : line.kind === 'del' ? '- ' : '  '}${line.text}`).join('\n')}</pre>}</div></details>)}</div>}
        </>}
        {solved && next && <Link className="ex-next" to={`/study/${studyId}/practice/${next.id}`}>다음 문제 →</Link>}
      </section>
    </div>
  </main>
}

export default function ProblemPage() {
  const { id, problemId } = useParams()
  const { user, loading } = useAuth()
  const problem = findExercise(problemId ?? '')
  if (!id || !problem || !exercisesFor(id).some((item) => item.id === problem.id)) return <NotFoundPage />
  if (loading) return <main className="study-page ex-page"><p className="study-loading" role="status">불러오는 중...</p></main>
  // ponytail: UI-only gate. Problem statements and starter code are still in the public JS bundle (problems/*).
  // Upgrade path: serve problems from an authenticated API.
  if (!user) return <main className="study-page ex-page">
    <nav className="ex-back"><Link to={`/study/${id}/practice`}>← 실습 문제 목록</Link></nav>
    <header className="ex-head"><div><h1>{problem.title}</h1></div></header>
    <MembersGate title="문제 풀이는 동아리원만 할 수 있어요">문제 설명과 코드 편집기는 로그인한 동아리원에게만 열려요.</MembersGate>
  </main>
  return <ProblemBody key={problem.id} studyId={id} problem={problem} />
}
