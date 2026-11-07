// Decides, per code block of a study page, whether "직접 해보기" can run it and how.
// Deterministic rules + explicit HTML overrides (data-run="false", data-template="c-main", data-lang="..").
// tests/studyPlayground.test.mjs prints the decision of every block of every page for human review.

export type PageLang = 'web' | 'c' | 'java' | 'python' | 'arduino'
/** What the block is: a runner language, or 'shell' (commands/transcripts), or 'text' (pseudo code, annotated). */
export type BlockLang = 'c' | 'java' | 'python' | 'html' | 'js' | 'css' | 'arduino' | 'shell' | 'repl' | 'text'
export type TemplateName = 'c-main' | 'java-main'

export interface BlockDecision {
  lang: BlockLang
  run: boolean
  template: TemplateName | null
  /** The page explains the code with ← / ↑ notes; the runnable code is the block without them. */
  strip: boolean
  /** Short machine-readable reason, shown in the review table. */
  reason: string
  /** The program reads standard input (scanf / Scanner / input()). */
  stdin: boolean
}

export interface BlockAttrs {
  run?: string | null
  template?: string | null
  lang?: string | null
}

const LANG_LABEL: Record<BlockLang, string> = {
  c: 'C', java: 'Java', python: 'Python', html: 'HTML', js: 'JavaScript', css: 'CSS', arduino: 'Arduino', shell: '명령어', repl: '파이썬 대화창', text: '',
}
export const langLabel = (lang: BlockLang) => LANG_LABEL[lang]

/** Source with comments and string/char literals blanked out (keeps length and newlines), for pattern checks. */
export function stripLiterals(code: string, lang: BlockLang): string {
  const hash = lang === 'python'
  let out = ''
  let i = 0
  while (i < code.length) {
    const ch = code[i]
    const two = code.slice(i, i + 2)
    let end = -1
    if (!hash && two === '//') { end = code.indexOf('\n', i); if (end < 0) end = code.length }
    else if (hash && ch === '#') { end = code.indexOf('\n', i); if (end < 0) end = code.length }
    else if (!hash && two === '/*') { end = code.indexOf('*/', i + 2); end = end < 0 ? code.length : end + 2 }
    else if (hash && (code.startsWith('"""', i) || code.startsWith("'''", i))) { const q = code.slice(i, i + 3); end = code.indexOf(q, i + 3); end = end < 0 ? code.length : end + 3 }
    else if (ch === '"' || ch === "'" || (ch === '`' && (lang === 'js' || lang === 'html'))) {
      let j = i + 1
      while (j < code.length && code[j] !== ch && code[j] !== '\n') { if (code[j] === '\\') j++; j++ }
      end = Math.min(j + 1, code.length)
    }
    if (end < 0) { out += ch; i++; continue }
    out += code.slice(i, end).replace(/[^\n]/g, ' ')
    i = end
  }
  return out
}

const ANNOTATION = /[←↑]/

/** Removes the "← explanation" tails and "↑ ..." caption lines the study pages put next to code. */
export function stripAnnotations(code: string): string {
  const out: string[] = []
  for (const line of code.split('\n')) {
    if (!ANNOTATION.test(line)) { out.push(line); continue }
    const kept = line.replace(/\s*←.*$/, '')
    if (!kept.trim() || /^\s*↑/.test(line)) continue
    out.push(kept)
  }
  return out.join('\n')
}
const PLACEHOLDER_LINE = /^\s*(\.\.\.|…|\/\/\s*\.\.\.|#\s*\.\.\.|\/\*\s*\.\.\.\s*\*\/)\s*$/m
const HANGUL = /[가-힣]/
const SHELL_START = /^\s*(\$ |>>> |gcc |g\+\+ |clang |javac? |python3? |pip3? |py |cd |ls |mkdir |sudo |brew |apt |npm |node |git |\.\/|# )/

function dedent(code: string) {
  const lines = code.replace(/\s+$/, '').split('\n')
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^ */)![0].length)
  const min = indents.length ? Math.min(...indents) : 0
  return lines.map((l) => l.slice(min)).join('\n')
}

const indentLines = (code: string, pad: string) => code.split('\n').map((l) => (l.trim() ? pad + l : l)).join('\n')

const C_HEADERS = ['stdio.h', 'stdlib.h', 'string.h', 'math.h', 'stdbool.h']
export const TEMPLATES: Record<TemplateName, (code: string) => string> = {
  'c-main': (code) =>
    C_HEADERS.map((h) => `#include <${h}>`).join('\n') + '\n\nint main(void) {\n' + indentLines(dedent(code), '    ') + '\n    return 0;\n}\n',
  'java-main': (code) => {
    const lines = dedent(code).split('\n')
    const imports = lines.filter((l) => /^import\s/.test(l))
    const body = lines.filter((l) => !/^import\s/.test(l)).join('\n')
    const head = imports.length ? imports.join('\n') : 'import java.util.*;'
    return `${head}\n\npublic class Main {\n    public static void main(String[] args) {\n${indentLines(body, '        ')}\n    }\n}\n`
  },
}

export function applyTemplate(name: TemplateName | null, code: string): string {
  return name ? TEMPLATES[name](code) : code.replace(/\s+$/, '') + '\n'
}

const NEEDS_STDIN: Record<string, RegExp> = {
  c: /\b(scanf|fscanf\s*\(\s*stdin|fgets\s*\([^)]*stdin|getchar|gets)\s*\(/,
  java: /\b(Scanner|BufferedReader|System\s*\.\s*in)\b/,
  python: /\binput\s*\(|sys\s*\.\s*stdin/,
}
export const needsStdin = (lang: BlockLang, code: string) => !!NEEDS_STDIN[lang]?.test(stripLiterals(code, lang))

function pageDefault(page: PageLang): BlockLang | null {
  return page === 'web' ? null : page
}

/** Language of a web block by sniffing; pseudo code / annotated blocks come back as 'text'. */
function sniffWeb(code: string): BlockLang {
  const t = code.trim()
  if (/^<(!doctype|html|\w|!--)/i.test(t)) return 'html'
  if (/^[^{}\n]+\{[\s\S]*:[\s\S]*;?\s*\}\s*$/.test(t) && !/\b(function|const|let|var|if|for)\b/.test(t)) return 'css'
  if (/\b(const|let|var|function|console\.|document\.|addEventListener|alert\()/.test(t) || /^\s*(if|for|while)\s*\(/.test(t)) return 'js'
  return 'text'
}

function decide(lang: BlockLang, run: boolean, reason: string, template: TemplateName | null = null, code = '', strip = false): BlockDecision {
  return { lang, run, template, strip, reason: strip ? `${reason}+annotations-stripped` : reason, stdin: run && needsStdin(lang, code) }
}

export function classifyBlock(page: PageLang, code: string, attrs: BlockAttrs = {}): BlockDecision {
  const forced = attrs.lang as BlockLang | null | undefined
  const annotated = ANNOTATION.test(code)
  const body = (annotated ? stripAnnotations(code) : code).replace(/\s+$/, '')
  let lang: BlockLang = forced || pageDefault(page) || sniffWeb(body)
  const template = (attrs.template as TemplateName | null | undefined) || null
  const override = attrs.run === 'false' ? false : attrs.run === 'true' ? true : null
  const forceRun = override === true
  const yes = (reason: string, tpl: TemplateName | null = null) => decide(lang, true, reason, tpl, body, annotated)
  const no = (reason: string) => decide(lang, false, reason)

  // Shell commands and REPL/terminal transcripts: not source code of the page language.
  if (!forced && lang !== 'html' && lang !== 'js' && lang !== 'css' && lang !== 'text') {
    const first = body.split('\n').find((l) => l.trim()) || ''
    const hasCode = /[;{}]/.test(stripLiterals(body, lang)) || /^\s*(def|class|import|from|for|while|if|print)\b/m.test(body)
    if (/^\s*>>> /.test(first)) lang = 'repl'
    else if (SHELL_START.test(first) && (!hasCode || /^\s*(\$ |gcc |javac? |python3? |pip3? )/.test(first))) lang = 'shell'
  }

  if (override === false) return no('override:data-run=false')
  if (lang === 'shell' || lang === 'repl') return no(lang === 'repl' ? 'repl-transcript' : 'shell-commands')
  if (lang === 'text') return no('pseudo-code')
  if (!forceRun) {
    if (PLACEHOLDER_LINE.test(body)) return no('placeholder-ellipsis')
    if (lang !== 'html' && HANGUL.test(stripLiterals(body, lang))) return no('korean-placeholder-outside-strings')
  }

  switch (lang) {
    case 'c':
      if (/\bmain\s*\(/.test(body)) return yes('complete-program')
      if (template === 'c-main') return yes('override:template=c-main', 'c-main')
      return forceRun ? yes('override:data-run=true') : no('no-main (add data-template="c-main" if the statements stand alone)')
    case 'java':
      if (/\bstatic\s+void\s+main\s*\(/.test(body)) return yes('complete-program')
      if (template === 'java-main') return yes('override:template=java-main', 'java-main')
      return forceRun ? yes('override:data-run=true') : no('no-main (add data-template="java-main" if the statements stand alone)')
    case 'python':
      return yes('script')
    case 'html':
      return yes(/<!doctype|<html/i.test(body) ? 'full-document' : 'html-fragment')
    case 'js':
      return /\bdocument\b|\bwindow\b/.test(body) && !forceRun ? no('needs-dom (use the demo box above)') : yes('script')
    case 'css':
      return no('css-needs-html')
    case 'arduino':
      return /\bvoid\s+setup\s*\(/.test(body) && /\bvoid\s+loop\s*\(/.test(body) ? yes('sketch-opens-in-lab') : no('not-a-complete-sketch')
    default:
      return no('unsupported')
  }
}

/** The text the editor starts with (and "원래대로" returns to): the block without notes, wrapped in its template. */
export function initialCode(decision: BlockDecision, rawCode: string): string {
  return applyTemplate(decision.template, decision.strip ? stripAnnotations(rawCode) : rawCode)
}
