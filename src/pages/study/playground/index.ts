// "직접 해보기" for the code blocks of a /study page: edit in place (CodeMirror, lazy), run (server for C/Java/Python,
// the sandbox iframe for HTML/JS, Circuit Lab for Arduino), compare with the expected output, keep edits per block.
//
// Every pre.code gets a stage wrapper + toolbar at init (the toolbar's space is reserved in CSS, so nothing moves).
// No editor exists until "직접 해보기" is pressed. The returned cleanup undoes everything (StrictMode runs effects twice).

import { dismissToast, showToast } from '../../../components/common/Toast'
import { buildDoc, buildRawDoc, SANDBOX_URL } from '../studyDemos'
import { classifyBlock, initialCode, langLabel, type BlockDecision, type PageLang } from './classify'
import { compareOutput } from './compare'
import { encodeLabShare, labLink, LAB_URL } from './labShare'
import type { PgEditor } from './editor'
import { runRemote, type Diagnostic, type RunLang, type RunResult } from './runner'
import { blockAnchor, blockKey, createStore, decodeShareHash, encodeShareHash, restoreBlock, saveBlock } from './storage'

export interface PlaygroundOptions {
  pageId: PageLang
  /** Called for "로그인" in the 401 message; `hash` brings the reader back to the same block. */
  onLogin(hash: string): void
}

interface Entry {
  at: number
  stdout: string
  stderr: string
  exitCode: number | null
  signal: string | null
  timeMs: number | null
  timedOut: boolean
  truncated: boolean
  compileFailed: boolean
  diagnostics: Diagnostic[]
  web: boolean
}

const HISTORY = 5
const REMOTE: ReadonlySet<string> = new Set(['c', 'java', 'python'])
let webRunSeq = 1000 // message ids of playground frames; the page's own .demo boxes use 0..n

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string | null, text?: string, attrs?: Record<string, string>) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k])
  return e
}
function btn(action: string, text: string, label?: string) {
  const b = h('button', 'pg-btn', text, { type: 'button', 'data-pg': action })
  if (label) b.setAttribute('aria-label', label)
  return b
}
const pad = (n: number) => String(n).padStart(2, '0')

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch {
    try {
      const t = h('textarea', null, text, { 'aria-hidden': 'true' })
      t.style.cssText = 'position:fixed;opacity:0;top:0;left:0'
      document.body.appendChild(t)
      t.select()
      const ok = document.execCommand('copy')
      t.remove()
      return ok
    } catch { return false }
  }
}

/** The page's expected output for a block: the pre.output right after it (shell blocks with the compile/run commands may sit in between). */
function expectedOutputAfter(pre: HTMLElement, page: PageLang): string | null {
  let next = pre.nextElementSibling
  while (next?.matches('pre.code')) {
    const d = classifyBlock(page, next.textContent ?? '', { lang: next.getAttribute('data-lang') })
    if (d.lang !== 'shell' && d.lang !== 'repl') return null
    next = next.nextElementSibling
  }
  return next?.matches('pre.output') ? next.textContent ?? null : null
}

class Block {
  readonly decision: BlockDecision
  readonly initial: string
  readonly key: string
  readonly anchor: string
  readonly expected: string | null
  readonly stage = h('div', 'pg-stage')
  readonly bar = h('div', 'pg-bar', undefined, { role: 'toolbar', 'aria-label': '코드 도구' })
  readonly badge = h('button', 'pg-badge', '수정한 코드', { type: 'button', 'data-pg': 'edit', title: '내가 고친 코드를 다시 열어요' })
  editor: PgEditor | null = null
  host: HTMLElement | null = null
  loading = false
  panel: HTMLElement | null = null
  history: Entry[] = []
  shown = 0
  abort: AbortController | null = null
  running = false
  full = false
  stdinBox: HTMLTextAreaElement | null = null
  frame: HTMLIFrameElement | null = null
  webId = 0
  webEntry: Entry | null = null
  pendingDoc: string | null = null
  frameSeq = 0
  saveTimer = 0
  countdown = 0
  busyTimer = 0
  current: string
  /** A shared link's code is open as a temporary view: nothing is saved until the reader chooses to. */
  shared = false
  savedBeforeShare: string | null = null
  /** What this tab last read from / wrote to storage for the block: a save finding something else there means another tab saved meanwhile. */
  baseline: string | null
  /** A user edit not yet saved. Set only by typing in a non-shared block; programmatic loads never set it. */
  dirty = false
  /** True while the page itself loads code into the editor (restore, back, reset): that is not typing and must not autosave. */
  programmatic = false
  els: Record<string, HTMLElement> = {}

  constructor(readonly index: number, readonly pre: HTMLElement, readonly raw: string, decision: BlockDecision, saved: string | null, page: PageLang) {
    this.decision = decision
    this.initial = decision.run ? initialCode(decision, raw) : raw
    this.key = blockKey(index, raw)
    this.anchor = blockAnchor(index)
    this.current = saved ?? this.initial
    this.baseline = saved
    this.expected = decision.run ? expectedOutputAfter(pre, page) : null
  }
  get lang() { return this.decision.lang }
  get isWeb() { return this.lang === 'html' || this.lang === 'js' }
  get isRemote() { return REMOTE.has(this.lang) }
  get isArduino() { return this.lang === 'arduino' }
  get edited() { return this.current !== this.initial }
  get code() { return this.editor ? this.editor.getValue() : this.initial }
}

/** Wires up the code blocks of `root`; returns a cleanup that undoes everything. */
export function initPlayground(root: HTMLElement, opts: PlaygroundOptions): () => void {
  const ac = new AbortController()
  const { signal } = ac
  const store = createStore(opts.pageId)
  const blocks: Block[] = []
  const byStage = new Map<Element, Block>()
  const inerted: Element[] = []
  let disposed = false

  root.querySelectorAll<HTMLElement>('pre.code').forEach((pre, index) => {
    const raw = pre.textContent ?? ''
    const attrs = { run: pre.getAttribute('data-run'), template: pre.getAttribute('data-template'), lang: pre.getAttribute('data-lang') }
    const decision = classifyBlock(opts.pageId, raw, attrs)
    const saved = decision.run ? store.get(blockKey(index, raw))?.code ?? null : null
    const b = new Block(index, pre, raw, decision, saved, opts.pageId)
    pre.parentNode!.insertBefore(b.stage, pre)
    b.stage.appendChild(pre)
    b.stage.prepend(b.bar)
    b.stage.id = b.anchor
    renderBar(b)
    blocks.push(b)
    byStage.set(b.stage, b)
  })
  store.prune(blocks.map((b) => b.key))

  // ---------- toolbar ----------
  function renderBar(b: Block) {
    b.bar.textContent = ''
    const left = h('div', 'pg-bar-left')
    const label = langLabel(b.lang)
    if (label) left.appendChild(h('span', 'pg-lang', label))
    if (b.shared) left.appendChild(h('span', 'pg-badge', '공유받은 코드 · 저장 안 됨'))
    else if (b.decision.run && b.edited) {
      if (b.editor) left.appendChild(h('span', 'pg-badge', '수정한 코드'))
      else left.appendChild(b.badge)
    }
    const right = h('div', 'pg-bar-right')
    if (b.decision.run) {
      right.appendChild(btn('edit', b.editor ? '편집 닫기' : '직접 해보기'))
      const edit = right.lastElementChild as HTMLElement
      edit.insertBefore(h('span', 'pg-ico', '✎ ', { 'aria-hidden': 'true' }), edit.firstChild)
      edit.setAttribute('aria-pressed', String(!!b.editor))
      if (b.isArduino) right.appendChild(btn('lab', 'Circuit Lab에서 열기'))
      else {
        const run = btn('run', '▶ 실행', '실행 (Ctrl+Enter)')
        run.title = 'Ctrl/Cmd + Enter'
        b.els.run = run
        right.appendChild(run)
      }
      if (!b.shared && store.get(b.key)?.backup !== undefined) {
        const restore = btn('restore', '↶ 이전 코드 복원')
        restore.title = '공유 코드로 저장하기 전의 내 코드를 되살려요'
        right.appendChild(restore)
      }
      if (b.editor) {
        right.appendChild(btn('reset', '↺ 원래대로'))
        right.appendChild(btn('share', '공유 링크'))
        const fs = btn('full', b.full ? '전체 화면 닫기' : '전체 화면')
        fs.setAttribute('aria-pressed', String(b.full))
        right.appendChild(fs)
      }
    }
    const copy = btn('copy', '복사', '코드 복사')
    copy.classList.add('code-copy')
    right.appendChild(copy)
    b.bar.append(left, right)
    b.stage.classList.toggle('is-runnable', b.decision.run)
    b.stage.classList.toggle('is-editing', !!b.editor || b.loading)
    b.stage.classList.toggle('is-edited', b.edited)
  }

  // ---------- editor ----------
  async function openEditor(b: Block, doc?: string): Promise<boolean> {
    if (b.editor) return true
    if (b.loading) return false
    b.loading = true
    if (doc !== undefined) b.current = doc
    const host = h('div', 'pg-editor', undefined, { 'data-pg-editor': '' })
    host.style.minHeight = `${b.pre.offsetHeight}px`
    host.appendChild(h('p', 'pg-editor-loading', '편집기를 불러오는 중…', { role: 'status' }))
    b.pre.hidden = true
    b.pre.after(host)
    b.host = host
    renderBar(b)
    try {
      const { createEditor } = await import('./editor')
      if (disposed) return false
      host.textContent = ''
      host.style.minHeight = ''
      b.editor = await createEditor({
        parent: host,
        lang: b.lang,
        doc: b.current,
        label: `${langLabel(b.lang) || '코드'} 코드 편집기`,
        onChange: (value) => onEdit(b, value),
        onRun: () => { void run(b) },
      })
      if (disposed) { b.editor.destroy(); b.editor = null; return false }
      host.appendChild(h('p', 'pg-editor-hint', 'Esc를 누른 뒤 Tab을 누르면 편집기 밖으로 나갈 수 있어요. 실행은 Ctrl/Cmd + Enter.'))
      b.loading = false
      renderBar(b)
      b.editor.focus()
      return true
    } catch {
      b.loading = false
      closeEditor(b)
      showToast({ message: '편집기를 불러오지 못했어요. 네트워크를 확인하고 다시 눌러 주세요.', tone: 'error' })
      return false
    }
  }

  function closeEditor(b: Block) {
    if (b.full) setFull(b, false)
    if (b.shared) { b.shared = false; window.clearTimeout(b.saveTimer); b.saveTimer = 0; b.current = ownDraft(b); b.baseline = store.get(b.key)?.code ?? null; b.dirty = false } // closing a shared view drops it
    else if (b.editor) b.current = b.editor.getValue()
    if (b.editor) { b.editor.destroy(); b.editor = null }
    b.host?.remove()
    b.host = null
    b.loading = false
    b.pre.hidden = false
    renderBar(b)
  }

  function onEdit(b: Block, value: string) {
    if (b.programmatic) return
    b.current = value
    b.editor?.clearDiagnostics()
    if (!b.shared) { // a shared link's code is a temporary view: typing in it never marks the draft dirty
      b.dirty = true
      window.clearTimeout(b.saveTimer)
      b.saveTimer = window.setTimeout(() => flush(b), 400)
    }
    const was = b.stage.classList.contains('is-edited')
    if (was !== b.edited) renderBar(b)
  }
  /** Writes a pending user edit, synchronously (debounce, pagehide, dispose, leaving for the login page). */
  function flush(b: Block) {
    window.clearTimeout(b.saveTimer)
    b.saveTimer = 0
    if (b.dirty && !b.shared) saveDraft(b, b.current)
  }
  // One notice per failure streak (full storage, private mode); it goes away after the next successful write.
  let failureToast = 0
  function reportSave(ok: boolean) {
    if (ok && failureToast) { dismissToast(failureToast); failureToast = 0 }
    if (!ok && !failureToast) failureToast = showToast({ message: '브라우저 저장 공간이 부족해서 코드를 저장하지 못했어요. 다른 탭이나 사이트 데이터를 정리해 주세요.', tone: 'error', duration: 0 })
  }
  /** saveBlock plus the notice; on failure the block stays dirty so the next debounce or exit flush retries. */
  function saveDraft(b: Block, code: string): boolean {
    const ok = saveBlock(store, b, code, b.initial)
    if (!ok) b.dirty = true
    reportSave(ok)
    return ok
  }
  /** Puts code into the editor on the page's own initiative: no autosave is scheduled and a pending one is dropped. */
  function loadCode(b: Block, value: string) {
    b.programmatic = true
    try { b.editor?.setValue(value) } finally { b.programmatic = false }
    b.current = value
    window.clearTimeout(b.saveTimer)
    b.saveTimer = 0
    b.editor?.clearDiagnostics()
  }

  // ---------- full screen ----------
  function setFull(b: Block, on: boolean) {
    if (b.full === on) return
    b.full = on
    b.stage.classList.toggle('pg-full', on)
    document.documentElement.classList.toggle('pg-lock', on)
    if (on) {
      b.stage.setAttribute('role', 'dialog')
      b.stage.setAttribute('aria-modal', 'true')
      b.stage.setAttribute('aria-label', '코드 편집 전체 화면')
      for (let node: Element = b.stage; node.parentElement; node = node.parentElement) {
        for (const sib of Array.from(node.parentElement.children)) {
          if (sib !== node && !sib.hasAttribute('inert') && sib.tagName !== 'SCRIPT') { sib.setAttribute('inert', ''); inerted.push(sib) }
        }
      }
    } else {
      b.stage.removeAttribute('role')
      b.stage.removeAttribute('aria-modal')
      b.stage.removeAttribute('aria-label')
      inerted.splice(0).forEach((n) => n.removeAttribute('inert'))
    }
    renderBar(b)
    ;(b.bar.querySelector('[data-pg="full"]') as HTMLElement | null)?.focus()
  }

  // ---------- output panel ----------
  function ensurePanel(b: Block): HTMLElement {
    if (b.panel) return b.panel
    const p = h('div', 'pg-out', undefined, { role: 'region', 'aria-label': '내 실행 결과' })
    const head = h('div', 'pg-out-head')
    head.appendChild(h('strong', null, '내 실행 결과'))
    const chips = h('span', 'pg-chips')
    const hist = h('select', 'pg-history', undefined, { 'aria-label': '이전 실행 결과 보기' }) as HTMLSelectElement
    hist.hidden = true
    head.append(chips, hist)
    if (b.isRemote) {
      const t = h('button', 'pg-btn pg-small', '입력(stdin)', { type: 'button', 'data-pg': 'stdin', 'aria-expanded': 'false' })
      head.appendChild(t)
      b.els.stdinToggle = t
    }
    head.appendChild(h('button', 'pg-btn pg-small', '결과 닫기', { type: 'button', 'data-pg': 'closeout' }))
    p.appendChild(head)
    if (b.isRemote) {
      const wrap = h('div', 'pg-stdin')
      const id = `${b.anchor}-stdin`
      wrap.appendChild(h('label', null, '프로그램에 넣어 줄 입력 (scanf · Scanner · input() 이 읽어요)', { for: id }))
      const ta = h('textarea', null, undefined, { id, rows: '3', spellcheck: 'false', placeholder: '한 줄에 하나씩 쓰고 Enter로 줄을 바꿔요' }) as HTMLTextAreaElement
      ta.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void run(b) } }, { signal })
      wrap.appendChild(ta)
      b.stdinBox = ta
      b.els.stdin = wrap
      wrap.hidden = !b.decision.stdin
      if (b.decision.stdin && b.els.stdinToggle) b.els.stdinToggle.setAttribute('aria-expanded', 'true')
      p.appendChild(wrap)
    }
    const status = h('div', 'pg-status', undefined, { role: 'status', 'aria-live': 'polite' })
    const diag = h('ul', 'pg-diags', undefined, { 'aria-label': '컴파일 오류 목록' })
    const out = h('pre', 'pg-stdout', undefined, { tabindex: '0', 'aria-label': '표준 출력' })
    const err = h('pre', 'pg-stderr', undefined, { tabindex: '0', 'aria-label': '오류 출력' })
    out.hidden = err.hidden = diag.hidden = true
    p.append(status, diag, out, err)
    if (b.isWeb) {
      const frame = h('iframe', 'pg-frame', undefined, { sandbox: 'allow-scripts allow-modals', title: '실행 결과 미리보기' })
      frame.hidden = true
      frame.addEventListener('load', () => {
        if (b.pendingDoc === null) return
        const doc = b.pendingDoc
        b.pendingDoc = null
        frame.contentWindow?.postMessage({ doc }, '*') // opaque origin: '*' is the only possible target
        window.setTimeout(() => { if (!disposed && b.running) finishWeb(b) }, 350)
      }, { signal })
      b.frame = frame
      p.appendChild(frame)
    }
    if (b.expected !== null) {
      const cmp = h('div', 'pg-compare')
      cmp.appendChild(btn('compare', '예상 출력과 비교'))
      cmp.appendChild(h('div', 'pg-compare-result', undefined, { role: 'status', 'aria-live': 'polite' }))
      p.appendChild(cmp)
    }
    Object.assign(b.els, { chips, hist, status, diag, out, err })
    hist.addEventListener('change', () => { b.shown = Number(hist.value); renderEntry(b) }, { signal })
    ;(b.editor ? b.host! : b.pre).after(p)
    // keep the panel under the editor when the editor is opened later
    b.panel = p
    return p
  }

  function status(b: Block, text: string, tone: 'info' | 'error' | 'ok' = 'info', role: 'status' | 'alert' = 'status') {
    const el = b.els.status
    el.textContent = text
    el.className = `pg-status is-${tone}`
    el.setAttribute('role', role)
    el.hidden = !text
  }

  function setBusy(b: Block, busy: boolean) {
    b.running = busy
    const r = b.els.run as HTMLButtonElement | undefined
    b.stage.classList.toggle('is-running', busy)
    if (r) { r.disabled = busy || b.countdown > 0; r.setAttribute('aria-busy', String(busy)); if (!b.countdown) r.textContent = busy ? '실행 중…' : '▶ 실행' }
  }

  function pushEntry(b: Block, e: Entry) {
    b.history.unshift(e)
    b.history.length = Math.min(b.history.length, HISTORY)
    b.shown = 0
    const hist = b.els.hist as HTMLSelectElement
    hist.textContent = ''
    b.history.forEach((en, i) => {
      const d = new Date(en.at)
      const code = en.compileFailed ? '컴파일 오류' : en.exitCode == null ? '' : `종료 코드 ${en.exitCode}`
      hist.appendChild(h('option', null, `${i === 0 ? '최근' : `${i + 1}번째 전`} · ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${code ? ` · ${code}` : ''}`, { value: String(i) }))
    })
    hist.hidden = b.history.length < 2
    hist.value = '0'
  }

  function chip(text: string, tone: string) { return h('span', `pg-chip is-${tone}`, text) }

  function renderEntry(b: Block) {
    const e = b.history[b.shown]
    if (!e) return
    const { chips, diag, out, err } = b.els
    chips.textContent = ''
    if (e.compileFailed) chips.appendChild(chip('컴파일 오류', 'bad'))
    else if (e.exitCode != null) chips.appendChild(chip(`종료 코드 ${e.exitCode}`, e.exitCode === 0 ? 'ok' : 'bad'))
    if (e.signal) chips.appendChild(chip(`신호 ${e.signal}`, 'bad'))
    if (e.timeMs != null) chips.appendChild(chip(`${e.timeMs}ms`, 'neutral'))
    if (e.timedOut) chips.appendChild(chip('시간 초과', 'bad'))
    if (e.truncated) chips.appendChild(chip('출력이 너무 길어 잘렸어요', 'warn'))
    diag.textContent = ''
    diag.hidden = e.diagnostics.length === 0
    for (const d of e.diagnostics) {
      const li = h('li')
      const label = `${d.line}번째 줄${d.column ? ` ${d.column}번째 칸` : ''}`
      const link = h('button', `pg-diag is-${d.severity}`, undefined, { type: 'button', 'data-pg': 'goto', 'data-line': String(d.line), 'data-col': String(d.column ?? 1) })
      link.append(h('span', 'pg-diag-pos', label), h('span', 'pg-diag-msg', d.message))
      li.appendChild(link)
      if (d.hintKo) li.appendChild(h('p', 'pg-diag-hint', `힌트: ${d.hintKo}`))
      diag.appendChild(li)
    }
    out.textContent = e.stdout
    err.textContent = e.stderr
    out.hidden = !e.stdout
    err.hidden = !e.stderr
    if (!e.stdout && !e.stderr && !e.diagnostics.length && !(e.web && b.lang === 'html')) status(b, e.web ? '콘솔에 출력된 내용이 없어요.' : '출력이 없어요.', 'info')
    else status(b, '', 'info')
    const cmp = b.panel?.querySelector<HTMLElement>('.pg-compare')
    if (cmp) cmp.hidden = e.compileFailed
    const res = b.panel?.querySelector('.pg-compare-result')
    if (res) { res.textContent = ''; res.className = 'pg-compare-result' }
  }

  function showMessage(b: Block, text: string, tone: 'info' | 'error' = 'error', role: 'status' | 'alert' = 'alert') {
    ensurePanel(b)
    b.els.chips.textContent = ''
    b.els.out.hidden = b.els.err.hidden = b.els.diag.hidden = true
    status(b, text, tone, role)
  }

  // ---------- running ----------
  async function run(b: Block) {
    if (b.running || b.countdown > 0 || !b.decision.run || b.isArduino) return
    if (b.isWeb) return runWeb(b)
    const code = b.code
    ensurePanel(b)
    b.abort?.abort()
    const ctl = (b.abort = new AbortController())
    setBusy(b, true)
    status(b, '실행 중이에요…', 'info')
    let result: RunResult
    try {
      result = await runRemote(b.lang as RunLang, code, b.stdinBox?.value ?? '', ctl.signal)
    } catch { return } // aborted by a newer run or by leaving the page
    if (disposed) return
    setBusy(b, false)
    switch (result.kind) {
      case 'login': {
        flush(b)
        ensurePanel(b)
        b.els.chips.textContent = ''
        b.els.out.hidden = b.els.err.hidden = b.els.diag.hidden = true
        const st = b.els.status
        st.className = 'pg-status is-error'
        st.setAttribute('role', 'alert')
        st.hidden = false
        st.textContent = '로그인한 동아리원만 실행할 수 있어요. '
        st.appendChild(h('a', null, '로그인하러 가기', { href: '/login', 'data-pg': 'login' }))
        st.appendChild(document.createTextNode(' (고친 코드는 그대로 남아 있어요)'))
        return
      }
      case 'busy': startCountdown(b, result.messageKo, result.retryAfterSec); return
      case 'rejected': case 'network': showMessage(b, result.messageKo); return
      case 'output': {
        const o = result.output
        pushEntry(b, {
          at: Date.now(), stdout: o.stdout, stderr: o.stderr, exitCode: o.exitCode, signal: o.signal, timeMs: o.timeMs,
          timedOut: o.timedOut, truncated: o.truncated, compileFailed: o.stage === 'compile' && !o.ok, diagnostics: o.diagnostics, web: false,
        })
        renderEntry(b)
        if (b.editor) b.editor.setDiagnostics(o.diagnostics.filter((d) => d.line >= 1))
        if (o.timedOut) status(b, '프로그램이 너무 오래 걸려서 멈췄어요. 끝나지 않는 반복(무한 루프)이 있는지 확인해 보세요.', 'error')
        else if (o.stage === 'compile' && !o.ok && !o.diagnostics.length && !o.stderr) status(b, '컴파일에 실패했어요.', 'error')
      }
    }
  }

  function startCountdown(b: Block, message: string, seconds: number) {
    b.countdown = seconds
    const tick = () => {
      const r = b.els.run as HTMLButtonElement | undefined
      if (b.countdown <= 0) {
        window.clearInterval(b.busyTimer)
        if (r) { r.disabled = false; r.textContent = '▶ 실행' }
        status(b, `${message} 이제 다시 실행할 수 있어요.`, 'info')
        return
      }
      if (r) { r.disabled = true; r.textContent = `다시 시도 (${b.countdown}초)` }
      showMessage(b, `${message} ${b.countdown}초 뒤에 다시 시도할 수 있어요.`, 'error', 'status')
      b.countdown--
    }
    window.clearInterval(b.busyTimer)
    tick()
    b.busyTimer = window.setInterval(tick, 1000)
  }

  function runWeb(b: Block) {
    ensurePanel(b)
    const frame = b.frame!
    b.webId = ++webRunSeq
    const entry: Entry = { at: Date.now(), stdout: '', stderr: '', exitCode: null, signal: null, timeMs: null, timedOut: false, truncated: false, compileFailed: false, diagnostics: [], web: true }
    b.webEntry = entry
    pushEntry(b, entry)
    renderEntry(b)
    setBusy(b, true)
    const code = b.code
    b.pendingDoc = b.lang === 'js' ? buildDoc({ js: code }, b.webId)
      : /<!doctype|<html/i.test(code) ? buildRawDoc(code, b.webId) : buildDoc({ html: code }, b.webId)
    frame.hidden = b.lang === 'js'
    frame.src = `${SANDBOX_URL}?r=${++b.frameSeq}`
    window.setTimeout(() => { if (!disposed && b.running && b.webEntry === entry) finishWeb(b) }, 4000)
  }

  function finishWeb(b: Block) {
    setBusy(b, false)
    if (b.webEntry && b.history[0] === b.webEntry) renderEntry(b)
  }

  function onMessage(e: MessageEvent) {
    const d = e.data as { __demo?: unknown; type?: string; msg?: unknown } | null
    if (!d || typeof d.__demo !== 'number' || d.__demo < 1000) return
    const b = blocks.find((x) => x.webId === d.__demo && x.frame?.contentWindow === e.source)
    if (!b || !b.webEntry) return
    const line = String(d.msg ?? '')
    if (d.type === 'error') b.webEntry.stderr += (b.webEntry.stderr ? '\n' : '') + line
    else b.webEntry.stdout += (b.webEntry.stdout ? '\n' : '') + (d.type === 'warn' ? `[경고] ${line}` : line)
    if (b.history[b.shown] === b.webEntry) renderEntry(b)
  }
  window.addEventListener('message', onMessage, { signal })

  // ---------- actions ----------
  async function labOpen(b: Block) {
    const code = b.code
    const token = await encodeLabShare(code)
    if (disposed) return
    if (token) { window.open(labLink(token), '_blank', 'noopener'); return }
    const ok = await copyText(code)
    showToast({ message: ok ? '코드를 복사했어요. Circuit Lab이 열리면 코드 창에 붙여 넣어 주세요.' : 'Circuit Lab을 열어요. 코드는 직접 복사해서 붙여 넣어 주세요.', tone: ok ? 'success' : 'default', duration: 5000 })
    window.open(LAB_URL, '_blank', 'noopener')
  }

  async function share(b: Block) {
    const hash = encodeShareHash(b.index, b.code)
    if (!hash) { showToast({ message: '코드가 길어서 링크로 만들 수 없어요. 복사 버튼을 써 주세요.', tone: 'error' }); return }
    const url = `${location.origin}${location.pathname}${hash}`
    history.replaceState(history.state, '', hash)
    const ok = await copyText(url)
    showToast({ message: ok ? '공유 링크를 복사했어요.' : '주소창의 링크를 복사해 주세요.', tone: ok ? 'success' : 'default' })
  }

  function compare(b: Block) {
    const e = b.history[b.shown]
    const res = b.panel?.querySelector<HTMLElement>('.pg-compare-result')
    if (!e || !res || b.expected === null) return
    const c = compareOutput(e.stdout, b.expected)
    res.textContent = ''
    res.className = `pg-compare-result is-${c.match ? 'ok' : 'bad'}`
    res.appendChild(h('strong', null, c.match ? '✅ 예상 출력과 같아요 (공백 차이는 무시했어요)' : '❌ 예상 출력과 달라요'))
    if (!c.match) {
      const pre = h('pre', 'pg-diff', undefined, { 'aria-label': '예상 출력과 실제 출력의 차이' })
      for (const l of c.diff) {
        const prefix = l.kind === 'same' ? '  ' : l.kind === 'del' ? '예상 ' : '실제 '
        pre.appendChild(h('span', `pg-diff-${l.kind}`, `${prefix}${l.text}\n`))
      }
      res.appendChild(pre)
    }
  }

  // ---------- shared link: a temporary view, never a silent overwrite ----------
  function showSharedBanner(b: Block) {
    const banner = h('div', 'pg-shared', undefined, { role: 'region', 'aria-label': '공유된 코드' })
    banner.appendChild(h('p', null, '공유된 코드를 보고 있어요. 내 코드는 그대로 있고, 저장하기 전에는 바뀌지 않아요.'))
    const actions = h('div', 'pg-shared-actions')
    actions.append(
      h('button', 'pg-btn', '내 코드로 돌아가기', { type: 'button', 'data-pg': 'shared-back' }),
      h('button', 'pg-btn', '이 코드로 저장', { type: 'button', 'data-pg': 'shared-save' }),
    )
    banner.appendChild(actions)
    b.host?.prepend(banner)
  }
  function dropShareHash() {
    if (/^#pg=/.test(location.hash)) history.replaceState(history.state, '', `${location.pathname}${location.search}`)
  }
  // The reader's own code now: re-read at leave time, since another tab may have saved a newer draft since the link was opened.
  function ownDraft(b: Block): string {
    return store.get(b.key)?.code ?? b.initial
  }
  function leaveShared(b: Block, save: boolean) {
    if (!b.shared) return
    const value = b.editor ? b.editor.getValue() : b.current
    b.shared = false
    window.clearTimeout(b.saveTimer)
    b.saveTimer = 0
    b.host?.querySelector('.pg-shared')?.remove()
    if (save) {
      // One step back: the draft this replaces stays available as "이전 코드 복원".
      b.current = value
      b.baseline = null // whatever draft is stored now is the one being replaced: saveBlock keeps it as the backup
      if (saveDraft(b, value)) showToast('이 코드로 저장했어요. 이전 코드는 "이전 코드 복원"으로 되살릴 수 있어요.')
    } else {
      const own = ownDraft(b)
      b.baseline = store.get(b.key)?.code ?? null
      b.dirty = false
      loadCode(b, own)
      showToast('내 코드로 돌아왔어요.')
    }
    b.savedBeforeShare = null
    dropShareHash()
    renderBar(b)
    b.editor?.focus()
  }
  function restoreBackup(b: Block) {
    const now = b.editor ? b.editor.getValue() : b.current // unsaved edits included
    const rec = store.get(b.key)
    if (rec?.backup === undefined) return
    const result = restoreBlock(store, b, now)
    if (result === 'declined') {
      // Another tab saved this block since this tab last looked: restoring now would bury its draft. The editor text
      // and its pending autosave stay as they are (that save then keeps the other draft as the backup).
      showToast('다른 탭에서 이 코드가 바뀌어서 되돌리기를 멈췄어요. 지금 코드는 그대로 있어요.')
      return
    }
    if (result === 'failed') { // nothing was written: the editor text stays
      reportSave(false)
      return
    }
    reportSave(true)
    window.clearTimeout(b.saveTimer)
    b.saveTimer = 0
    loadCode(b, rec.backup)
    renderBar(b)
    showToast('이전 코드를 되살렸어요.')
  }

  async function onClick(ev: MouseEvent) {
    const target = (ev.target as Element | null)?.closest<HTMLElement>('[data-pg]')
    if (!target || !root.contains(target)) return
    const stage = target.closest('.pg-stage')
    const b = stage ? byStage.get(stage) : undefined
    if (!b) return
    const action = target.getAttribute('data-pg')
    if (action === 'login') { ev.preventDefault(); opts.onLogin(`#${b.anchor}`); return }
    switch (action) {
      case 'edit':
        if (b.editor || b.loading) { flush(b); closeEditor(b); (b.bar.querySelector('[data-pg="edit"]') as HTMLElement | null)?.focus() }
        else await openEditor(b)
        break
      case 'run':
        await run(b)
        break
      case 'lab': await labOpen(b); break
      case 'reset':
        loadCode(b, b.initial)
        if (!b.shared) saveDraft(b, b.initial) // in a shared view only the view changes; the saved draft stays
        renderBar(b)
        b.editor?.focus()
        showToast('원래 코드로 되돌렸어요.')
        break
      case 'share': await share(b); break
      case 'shared-back': leaveShared(b, false); break
      case 'shared-save': leaveShared(b, true); break
      case 'restore': restoreBackup(b); break
      case 'full': setFull(b, !b.full); break
      case 'copy': {
        const ok = await copyText(b.editor ? b.editor.getValue() : b.decision.run ? b.initial : b.raw)
        target.textContent = ok ? '복사됨!' : '복사 실패'
        window.setTimeout(() => { if (!disposed) target.textContent = '복사' }, 1200)
        break
      }
      case 'stdin': {
        const box = b.els.stdin
        box.hidden = !box.hidden
        target.setAttribute('aria-expanded', String(!box.hidden))
        if (!box.hidden) b.stdinBox?.focus()
        break
      }
      case 'closeout':
        b.abort?.abort()
        window.clearInterval(b.busyTimer)
        b.countdown = 0
        setBusy(b, false)
        b.panel?.remove()
        b.panel = null
        b.history = []
        b.frame = null
        b.webId = 0
        b.els = { run: b.els.run }
        b.stdinBox = null
        break
      case 'compare': compare(b); break
      case 'goto': {
        const line = Number(target.getAttribute('data-line'))
        const col = Number(target.getAttribute('data-col')) || 1
        if (!b.editor) await openEditor(b)
        b.editor?.goToLine(line, col)
        break
      }
    }
  }
  root.addEventListener('click', (ev) => { void onClick(ev) }, { signal })

  // Esc closes the full-screen editor (the editor itself uses Esc to release the Tab key, so only when focus is outside it).
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    const b = blocks.find((x) => x.full)
    if (b && !(e.target as Element | null)?.closest?.('.cm-editor')) setFull(b, false)
  }, { signal })

  window.addEventListener('pagehide', () => blocks.forEach(flush), { signal })
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') blocks.forEach(flush) }, { signal })

  // ---------- deep links: a shared code (#pg=…) or a block anchor (#code-N, e.g. back from the login page) ----------
  const shared = decodeShareHash(location.hash)
  if (shared) {
    const b = blocks[shared.index]
    if (b?.decision.run) {
      b.stage.scrollIntoView({ block: 'center' })
      // Open it as a temporary view: the reader's saved draft of this block is not touched (nothing is persisted).
      b.savedBeforeShare = store.get(b.key)?.code ?? null
      b.shared = true
      void openEditor(b, shared.code).then((ok) => {
        if (disposed) return
        if (!ok) { b.shared = false; b.current = b.savedBeforeShare ?? b.initial; b.savedBeforeShare = null; return }
        showSharedBanner(b)
        renderBar(b)
        showToast('공유받은 코드를 열었어요. ▶ 실행으로 확인해 보세요.')
      })
    }
  } else if (/^#code-\d+$/.test(location.hash)) {
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'center' })
  }

  return () => {
    disposed = true
    ac.abort()
    blocks.forEach((b) => {
      flush(b)
      b.abort?.abort()
      window.clearInterval(b.busyTimer)
      b.editor?.destroy()
      b.pre.hidden = false
      b.stage.parentNode?.insertBefore(b.pre, b.stage)
      b.stage.remove()
    })
    if (failureToast) { dismissToast(failureToast); failureToast = 0 } // the toast host outlives this page
    inerted.splice(0).forEach((n) => n.removeAttribute('inert'))
    document.documentElement.classList.remove('pg-lock')
  }
}
