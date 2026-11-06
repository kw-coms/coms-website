// Behaviour of a /study page (ported from the standalone web-study.html), generic over the study:
// editable HTML/CSS/JS demos (only where the markup has .demo boxes), a copy button on code blocks, "done" checkboxes saved in localStorage, TOC scroll-spy.
//
// Demo code runs inside <iframe sandbox="allow-scripts allow-modals" src="/study-sandbox.html">.
// The site CSP forbids inline scripts and srcdoc/blob frames inherit it, so the sandbox page
// (public/study-sandbox.html, served with its own CSP, see nginx.frontend.conf) receives the
// document by postMessage and document.write()s it. The frame has an opaque origin: it can
// never touch this page's cookies or storage.

const LABELS: Record<string, string> = { html: 'HTML', css: 'CSS', js: 'JS' }
const SANDBOX_URL = '/study-sandbox.html'

type Code = Record<string, string>

function buildDoc(code: Code, id: number) {
  const hook =
    '<script>(function(){var ID=' + id + ';' +
    "function f(a){if(a===undefined)return'undefined';if(typeof a==='string')return a;if(typeof a==='function')return String(a);" +
    "if(a&&a.nodeType)return'<'+a.nodeName.toLowerCase()+'>';try{return JSON.stringify(a);}catch(e){return String(a);}}" +
    "function s(t,args){try{parent.postMessage({__demo:ID,type:t,msg:Array.prototype.map.call(args,f).join(' ')},'*');}catch(e){}}" +
    "['log','info','warn','error'].forEach(function(t){var o=console[t];console[t]=function(){s(t,arguments);if(o)o.apply(console,arguments);};});" +
    "window.addEventListener('error',function(e){s('error',['오류: '+e.message+(e.lineno?' ('+e.lineno+'번째 줄 근처)':'')]);});" +
    '})();</script>'
  const base = "<style>body{font-family:system-ui,-apple-system,'Noto Sans KR',sans-serif;margin:12px;color:#222;line-height:1.5}</style>"
  return '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">' + hook + base +
    '<style>' + (code.css || '') + '</style></head><body>' + (code.html || '') +
    (code.js ? '<script>' + code.js.replace(/<\/script/gi, '<\\/script') + '\n</script>' : '') +
    '</body></html>'
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string | null, text?: string) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}

/** Wires up the study page inside `root`; returns a cleanup that undoes everything (StrictMode runs effects twice). */
export function initStudyPage(root: HTMLElement, progressKey: string): () => void {
  const ac = new AbortController()
  const { signal } = ac
  const created: HTMLElement[] = []
  const timers = new Set<number>()
  const demos: Array<{ id: number; box: HTMLElement; frame: HTMLIFrameElement; console: HTMLElement | null; run: () => void; started: boolean }> = []
  let runCounter = 0

  root.querySelectorAll<HTMLElement>('.demo').forEach((box, idx) => {
    const code: Code = {}
    const original: Code = {}
    const langs: string[] = []
    let hasJs = false
    box.querySelectorAll<HTMLTextAreaElement>('textarea[data-lang]').forEach((t) => {
      const lang = t.getAttribute('data-lang') || ''
      langs.push(lang)
      code[lang] = t.value
      original[lang] = t.value
      if (lang === 'js') hasJs = true
    })
    let current = ''

    const add = <T extends HTMLElement>(node: T) => { box.appendChild(node); created.push(node); return node }

    const head = add(el('div', 'demo-head'))
    const tabs = el('div', 'tabs')
    const tabBtns: Record<string, HTMLButtonElement> = {}
    langs.forEach((lang) => {
      const b = el('button', null, LABELS[lang])
      b.type = 'button'
      b.setAttribute('data-lang', lang)
      b.addEventListener('click', () => switchTab(lang), { signal })
      tabs.appendChild(b)
      tabBtns[lang] = b
    })
    const tools = el('div', 'tools')
    const btnRun = el('button', 'run', '▶ 실행')
    const btnReset = el('button', null, '↺ 되돌리기')
    const btnCopy = el('button', null, '복사')
    ;[btnRun, btnReset, btnCopy].forEach((b) => { b.type = 'button'; tools.appendChild(b) })
    head.appendChild(tabs)
    head.appendChild(tools)

    const editor = add(el('textarea', 'editor'))
    editor.spellcheck = false
    editor.setAttribute('autocapitalize', 'off')
    editor.setAttribute('autocomplete', 'off')
    editor.setAttribute('aria-label', '예제 코드 편집')

    const label = add(el('div', 'preview-label'))
    label.appendChild(el('span', null, '결과'))
    const frame = add(document.createElement('iframe'))
    frame.setAttribute('sandbox', 'allow-scripts allow-modals')
    frame.setAttribute('title', '예제 결과')
    frame.style.height = (box.getAttribute('data-height') || '200') + 'px'

    let consoleBox: HTMLElement | null = null
    if (hasJs) {
      add(el('div', 'preview-label', '콘솔 (console.log 출력)'))
      consoleBox = add(el('div', 'console'))
    }
    const hint = box.getAttribute('data-hint')
    if (hint) add(el('div', 'demo-hint', hint))

    function fitEditor() {
      const lines = editor.value.split('\n').length
      editor.style.height = Math.min(Math.max(lines, 4), 26) * 22.4 + 30 + 'px'
    }
    function switchTab(lang: string) {
      if (current) code[current] = editor.value
      current = lang
      editor.value = code[lang]
      Object.keys(tabBtns).forEach((k) => tabBtns[k].classList.toggle('on', k === lang))
      fitEditor()
    }
    // One fresh sandbox page per run; it takes exactly one message, so the frame is reloaded each time.
    let pendingDoc: string | null = null
    frame.addEventListener('load', () => {
      if (pendingDoc === null) return
      const doc = pendingDoc
      pendingDoc = null
      frame.contentWindow?.postMessage({ doc }, '*') // opaque origin: '*' is the only possible target
    }, { signal })
    function run() {
      if (current) code[current] = editor.value
      if (consoleBox) {
        consoleBox.textContent = ''
        consoleBox.appendChild(el('div', 'empty', '(출력 없음)'))
      }
      pendingDoc = buildDoc(code, idx)
      frame.src = `${SANDBOX_URL}?r=${++runCounter}`
    }

    let timer = 0
    editor.addEventListener('input', () => {
      fitEditor()
      window.clearTimeout(timer)
      timer = window.setTimeout(run, 600)
      timers.add(timer)
    }, { signal })
    editor.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault()
        const s = editor.selectionStart
        const en = editor.selectionEnd
        editor.value = editor.value.slice(0, s) + '  ' + editor.value.slice(en)
        editor.selectionStart = editor.selectionEnd = s + 2
        editor.dispatchEvent(new Event('input'))
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run() }
    }, { signal })
    btnRun.addEventListener('click', run, { signal })
    btnReset.addEventListener('click', () => {
      Object.keys(original).forEach((k) => { code[k] = original[k] })
      editor.value = code[current]
      fitEditor()
      run()
    }, { signal })
    btnCopy.addEventListener('click', () => {
      const done = () => {
        btnCopy.textContent = '복사됨!'
        timers.add(window.setTimeout(() => { btnCopy.textContent = '복사' }, 1200))
      }
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(editor.value).then(done, () => { editor.select(); document.execCommand('copy'); done() })
      } else { editor.select(); document.execCommand('copy'); done() }
    }, { signal })

    switchTab(langs[0])
    demos.push({ id: idx, box, frame, console: consoleBox, run, started: false })
  })

  // Copy button on every code block (demo editors have their own).
  root.querySelectorAll<HTMLElement>('pre.code').forEach((pre) => {
    const btn = el('button', 'code-copy', '복사')
    btn.type = 'button'
    btn.setAttribute('aria-label', '코드 복사')
    btn.addEventListener('click', () => {
      const text = pre.cloneNode(true) as HTMLElement
      text.querySelector('.code-copy')?.remove()
      const done = () => { btn.textContent = '복사됨!'; timers.add(window.setTimeout(() => { btn.textContent = '복사' }, 1200)) }
      navigator.clipboard?.writeText(text.textContent || '').then(done, () => { /* clipboard blocked: leave the label */ })
    }, { signal })
    pre.appendChild(btn)
    created.push(btn)
  })

  // Run a demo when it scrolls near the viewport (keeps page load light).
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return
      const d = demos[Number(en.target.getAttribute('data-idx'))]
      if (d && !d.started) { d.started = true; d.run() }
      io.unobserve(en.target)
    })
  }, { rootMargin: '300px' })
  demos.forEach((d) => { d.box.setAttribute('data-idx', String(d.id)); io.observe(d.box) })

  // console.log relay from the sandboxed frames
  window.addEventListener('message', (e: MessageEvent) => {
    const data = e.data
    if (!data || typeof data.__demo !== 'number') return
    const d = demos[data.__demo]
    if (!d || !d.console || e.source !== d.frame.contentWindow) return
    d.console.querySelector('.empty')?.remove()
    const type = data.type === 'warn' ? 'warn' : data.type === 'error' ? 'error' : ''
    d.console.appendChild(el('div', `line ${type}`.trim(), String(data.msg)))
    d.console.scrollTop = d.console.scrollHeight
  }, { signal })

  // Circuit drawings (Tinkercad-style 3D scenes + simulation): a separate chunk, fetched only when the fragment has one.
  let disposed = false
  let unmountCircuits: (() => void) | null = null
  if (root.querySelector('figure.circuit[data-circuit]')) {
    import('./circuits').then(
      (m) => { if (!disposed) unmountCircuits = m.mountCircuits(root) },
      () => { /* chunk failed to load: the static caption and aria-label of each figure remain */ },
    )
  }

  // Progress checkboxes
  let saved: Record<string, boolean> = {}
  try { saved = JSON.parse(localStorage.getItem(progressKey) || '{}') || {} } catch { saved = {} }
  const checks = root.querySelectorAll<HTMLInputElement>('input[data-done]')
  const bar = root.querySelector<HTMLElement>('#progress-bar')
  const barLabel = root.querySelector<HTMLElement>('#progress-label')
  function updateProgress() {
    let n = 0
    checks.forEach((c) => {
      root.querySelector(`nav.toc a[href="#${c.getAttribute('data-done')}"]`)?.classList.toggle('done', c.checked)
      if (c.checked) n++
    })
    if (bar) bar.style.width = `${checks.length ? (n / checks.length) * 100 : 0}%`
    if (barLabel) barLabel.textContent = `진도 ${n} / ${checks.length}`
  }
  checks.forEach((c) => {
    const part = c.getAttribute('data-done') || ''
    c.checked = !!saved[part]
    c.addEventListener('change', () => {
      saved[part] = c.checked
      try { localStorage.setItem(progressKey, JSON.stringify(saved)) } catch { /* private mode: progress just is not kept */ }
      updateProgress()
    }, { signal })
  })
  updateProgress()

  // TOC: smooth in-page scroll (without a router navigation) + current-section highlight
  const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('nav.toc a'))
  const targets = links.map((a) => root.querySelector<HTMLElement>(a.getAttribute('href') || '')).filter((t): t is HTMLElement => !!t)
  links.forEach((a) => a.addEventListener('click', (e) => {
    const t = root.querySelector<HTMLElement>(a.getAttribute('href') || '')
    if (!t) return
    e.preventDefault()
    t.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, { signal }))
  const navHeight = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--apple-nav-height')) || 44
  function onScroll() {
    const line = navHeight() + 80 // just below the fixed top bar
    let cur: HTMLElement | null = null
    targets.forEach((t) => { if (t.getBoundingClientRect().top <= line) cur = t })
    const id = (cur as HTMLElement | null)?.id
    links.forEach((a) => a.classList.toggle('active', !!id && a.getAttribute('href') === `#${id}`))
  }
  window.addEventListener('scroll', onScroll, { passive: true, signal })
  onScroll()

  return () => {
    disposed = true
    unmountCircuits?.()
    ac.abort()
    io.disconnect()
    timers.forEach((t) => window.clearTimeout(t))
    created.forEach((n) => n.remove())
    root.querySelectorAll('[data-idx]').forEach((n) => n.removeAttribute('data-idx'))
    links.forEach((a) => a.classList.remove('active', 'done'))
  }
}
