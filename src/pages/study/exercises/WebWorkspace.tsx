import { useEffect, useRef, useState } from 'react'
import type { PgEditor } from '../playground/editor'
import { decodeShareHash, encodeShareHash } from '../playground/storage'
import type { WebExercise, WebFiles } from './types'
import { flushSaves, readProgress, recordAttempt, saveCode, scheduleSaveCode } from './progress'
import { applyFrameSize } from '../studyDemos'
import { gradeWebInFrame, loadWebPreview, type WebCheckResult } from './web'

type Tab = keyof WebFiles
const TABS: { key: Tab; label: string }[] = [
  { key: 'html', label: 'HTML' }, { key: 'css', label: 'CSS' }, { key: 'js', label: 'JavaScript' },
]

function sharedFiles(hash: string): WebFiles | null {
  const decoded = decodeShareHash(hash)
  if (!decoded || decoded.index !== 0) return null
  try {
    const value = JSON.parse(decoded.code)
    return ['html', 'css', 'js'].every((key) => typeof value[key] === 'string') ? value as WebFiles : null
  } catch { return null }
}

function storedFiles(exercise: WebExercise): WebFiles {
  const saved = readProgress()[exercise.id]?.code ?? {}
  return { html: saved.html ?? exercise.starter.html, css: saved.css ?? exercise.starter.css, js: saved.js ?? exercise.starter.js }
}

export default function WebWorkspace({ exercise, onSolved }: { exercise: WebExercise; onSolved?: () => void }) {
  const [shared, setShared] = useState(() => sharedFiles(location.hash) !== null)
  const [files, setFiles] = useState<WebFiles>(() => sharedFiles(location.hash) ?? storedFiles(exercise))
  const filesRef = useRef(files)
  filesRef.current = files
  const [tab, setTab] = useState<Tab>('html')
  const [results, setResults] = useState<WebCheckResult[] | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const gradeAbort = useRef<AbortController | null>(null)
  const [message, setMessage] = useState(shared ? '공유된 코드는 실행 버튼을 눌러야 미리보기가 돼요' : '')
  const frameRef = useRef<HTMLIFrameElement>(null)
  const editorHost = useRef<HTMLDivElement>(null)
  const editor = useRef<PgEditor | null>(null)
  const runId = useRef(0)

  useEffect(() => {
    let dead = false
    const host = editorHost.current
    if (!host) return
    import('../playground/editor').then(({ createEditor }) => {
      if (dead) return
      return createEditor({
        parent: host, lang: tab, doc: filesRef.current[tab], label: `${tab.toUpperCase()} 코드 편집기`,
        onChange: (value) => {
          const next = { ...filesRef.current, [tab]: value }
          filesRef.current = next
          setFiles(next)
          if (!shared) scheduleSaveCode(exercise.id, tab, value)
        },
        onRun: () => preview(),
        onSubmit: () => { void submit() },
      })
    }).then((instance) => {
      if (!instance) return
      if (dead) instance.destroy()
      else editor.current = instance
    }).catch(() => setMessage('편집기를 불러오지 못했어요. 새로고침해 주세요.'))
    return () => { dead = true; editor.current?.destroy(); editor.current = null; host.replaceChildren() }
    // Editor is recreated only when its language changes. onChange uses the latest files ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, exercise.id, shared])

  useEffect(() => {
    if (shared) return
    const timer = window.setTimeout(() => {
      if (!busyRef.current && frameRef.current) loadWebPreview(frameRef.current, filesRef.current)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [files, busy, shared])

  // The preview reports its content height (id -1, see buildDoc); keep the frame as tall as the content, up to FRAME_MAX.
  useEffect(() => {
    const onSize = (e: MessageEvent) => { if (frameRef.current) applyFrameSize(frameRef.current, e, -1) }
    window.addEventListener('message', onSize)
    return () => window.removeEventListener('message', onSize)
  }, [])

  useEffect(() => () => { runId.current++; gradeAbort.current?.abort(); flushSaves() }, [])

  function preview() {
    if (busyRef.current || !frameRef.current) return
    loadWebPreview(frameRef.current, filesRef.current)
    setMessage('미리보기를 새로 고쳤어요.')
  }

  async function submit() {
    const frame = frameRef.current
    if (busyRef.current || !frame) return
    const id = ++runId.current
    busyRef.current = true
    setBusy(true)
    setMessage('채점 중…')
    setResults(null)
    const controller = new AbortController()
    gradeAbort.current = controller
    try {
      const next = await gradeWebInFrame(frame, filesRef.current, exercise.checks, controller.signal)
      if (id !== runId.current) return
      const passed = next.length === exercise.checks.length && next.every((item) => item.passed)
      recordAttempt(exercise.id, 'web', passed)
      setResults(next)
      setMessage(`${next.filter((item) => item.passed).length}/${exercise.checks.length} 통과`)
      if (passed) onSolved?.()
      window.setTimeout(() => document.querySelector<HTMLElement>('.ex-web-results h3')?.focus(), 0)
    } catch (error) {
      if (id === runId.current) setMessage(error instanceof Error ? error.message : '채점에 실패했어요.')
    } finally {
      if (id === runId.current) { busyRef.current = false; setBusy(false); gradeAbort.current = null }
    }
  }

  function reset() {
    if (!window.confirm('작성한 코드를 초기화할까요?')) return
    const next = { ...exercise.starter }
    filesRef.current = next
    setFiles(next)
    editor.current?.setValue(next[tab])
    if (!shared) for (const key of ['html', 'css', 'js'] as const) saveCode(exercise.id, key, next[key])
    setResults(null)
    setMessage('시작 코드로 돌아왔어요.')
  }

  async function share() {
    const hash = encodeShareHash(0, JSON.stringify(filesRef.current))
    if (!hash) { setMessage('공유 링크를 만들기에는 코드가 너무 길어요.'); return }
    const url = `${location.origin}${location.pathname}${hash}`
    try { await navigator.clipboard.writeText(url); setMessage('공유 링크를 복사했어요.') }
    catch { setMessage('주소창의 링크를 복사해 주세요.') }
    history.replaceState(history.state, '', hash)
  }

  function leaveShared() {
    const own = storedFiles(exercise)
    filesRef.current = own
    setFiles(own)
    editor.current?.setValue(own[tab])
    setShared(false)
    history.replaceState(history.state, '', location.pathname + location.search)
  }

  return <div className="ex-web">
    {shared && <div className="ex-web-shared" role="status">공유된 코드를 보고 있어요 · 저장 안 됨 <button type="button" onClick={leaveShared}>내 코드로 돌아가기</button></div>}
    <div className="ex-web-tabs" role="tablist" aria-label="웹 코드 언어">
      {TABS.map(({ key, label }) => <button type="button" role="tab" key={key} aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>)}
    </div>
    <div className="ex-web-editor" ref={editorHost} role="tabpanel" aria-label={`${tab.toUpperCase()} 코드`} />
    <p className="ex-web-hint">Ctrl/⌘+Enter 미리보기 · Ctrl/⌘+Shift+Enter 제출 · Esc 다음 Tab으로 편집기 나가기</p>
    <div className="ex-web-actions">
      <button type="button" onClick={preview} disabled={busy}>실행</button>
      <button type="button" onClick={() => void submit()} disabled={busy}>제출</button>
      <button type="button" onClick={reset} disabled={busy}>초기화</button>
      <button type="button" onClick={() => void share()}>내 코드 공유</button>
    </div>
    <div role="status" aria-live="polite" className="ex-web-status">{message}</div>
    <h3>미리보기</h3>
    <iframe className="ex-web-preview" ref={frameRef} sandbox="allow-scripts allow-modals" title="웹 문제 미리보기" />
    {results && <section className="ex-web-results" aria-label="채점 결과">
      <h3 tabIndex={-1}>{message}</h3>
      <ol>{results.map((item, index) => <li key={`${item.name}-${index}`} className={item.passed ? 'is-pass' : 'is-fail'}>
        <strong>{item.passed ? '✓ 통과' : '✕ 실패'} · {item.name}</strong>
        {!item.passed && <p>{item.message}</p>}
      </li>)}</ol>
    </section>}
  </div>
}
