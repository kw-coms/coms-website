// CodeMirror 6 editor of the playground. This whole module (and CodeMirror with it) is a lazy chunk:
// index.ts imports it only when someone presses "직접 해보기".

import { Compartment, EditorState, Prec, type Extension } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, placeholder } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentMore, indentLess } from '@codemirror/commands'
import { bracketMatching, indentOnInput, indentUnit, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { lintGutter, setDiagnostics, type Diagnostic as CmDiagnostic } from '@codemirror/lint'
import { tags as t } from '@lezer/highlight'
import type { BlockLang } from './classify'
import type { Diagnostic } from './runner'
import { defaultEditorAppearance, type EditorAppearance } from '../exercises/editorAppearance'

const INDENT: Record<string, number> = { c: 4, cpp: 4, java: 4, python: 4, javascript: 2, arduino: 2, html: 2, js: 2, css: 2 }

async function languageSupport(lang: BlockLang): Promise<Extension> {
  switch (lang) {
    case 'c': case 'cpp': case 'arduino': return (await import('@codemirror/lang-cpp')).cpp()
    case 'java': return (await import('@codemirror/lang-java')).java()
    case 'python': return (await import('@codemirror/lang-python')).python()
    case 'html': return (await import('@codemirror/lang-html')).html()
    case 'css': return (await import('@codemirror/lang-css')).css()
    case 'js': case 'javascript': return (await import('@codemirror/lang-javascript')).javascript()
    default: return []
  }
}

// Same palette as the static `pre.code` blocks (study.css), so editing does not change how the code looks.
const palette = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.modifier, t.operatorKeyword, t.moduleKeyword], color: '#ff9e64' },
  { tag: [t.string, t.special(t.string), t.regexp], color: '#9ece6a' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: '#7f8aa3', fontStyle: 'italic' },
  { tag: [t.number, t.bool, t.null, t.atom], color: '#e0af68' },
  { tag: [t.propertyName, t.attributeName, t.labelName], color: '#7dcfff' },
  { tag: [t.typeName, t.className, t.namespace], color: '#7aa2f7' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#bb9af7' },
  { tag: [t.tagName, t.angleBracket], color: '#f7768e' },
  { tag: [t.processingInstruction, t.meta], color: '#7dcfff' },
  { tag: t.invalid, color: '#f7768e' },
])

const paperPalette = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.modifier, t.operatorKeyword, t.moduleKeyword], color: '#92440e' },
  { tag: [t.string, t.special(t.string), t.regexp], color: '#236843' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: '#56637c', fontStyle: 'italic' },
  { tag: [t.number, t.bool, t.null, t.atom], color: '#87541e' },
  { tag: [t.propertyName, t.attributeName, t.labelName], color: '#155e84' },
  { tag: [t.typeName, t.className, t.namespace], color: '#244c9a' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#693b99' },
  { tag: [t.tagName, t.angleBracket], color: '#a42a56' },
  { tag: t.invalid, color: '#b42318' },
])

const contrastPalette = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.modifier, t.operatorKeyword, t.moduleKeyword], color: '#ffcb8a' },
  { tag: [t.string, t.special(t.string), t.regexp], color: '#bcf3af' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: '#d2d5de', fontStyle: 'italic' },
  { tag: [t.number, t.bool, t.null, t.atom], color: '#f4dc83' },
  { tag: [t.propertyName, t.attributeName, t.labelName], color: '#a5e2ff' },
  { tag: [t.typeName, t.className, t.namespace], color: '#abc5ff' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#e0b6ff' },
  { tag: [t.tagName, t.angleBracket], color: '#ffb9c6' },
  { tag: t.invalid, color: '#ff8a8a' },
])

const theme = EditorView.theme({
  '&': { maxHeight: 'var(--pg-editor-max, 70vh)' },
  '&.cm-focused': { outline: '2px solid var(--accent, #0071e3)', outlineOffset: '-2px' },
  '.cm-scroller': { fontFamily: 'var(--study-mono)', lineHeight: '1.6', overflow: 'auto' },
  '.cm-content': { padding: '8px 0' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none', paddingLeft: '4px' },
  '.cm-matchingBracket': { backgroundColor: 'rgba(125,207,255,.25)', outline: '1px solid rgba(125,207,255,.6)' },
  '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy #ff6b6b', textUnderlineOffset: '3px' },
  '.cm-lintRange-warning': { backgroundImage: 'none', textDecoration: 'underline wavy #e0af68', textUnderlineOffset: '3px' },
  '.cm-tooltip': { border: '1px solid #3a4157', borderRadius: '8px' },
  '.cm-tooltip-lint': { maxWidth: 'min(420px, 80vw)' },
  '.cm-diagnostic': { whiteSpace: 'pre-wrap', fontFamily: 'var(--apple-font-family, inherit)', fontSize: '13px' },
}, { dark: true })

function appearanceExtensions(appearance: EditorAppearance): Extension {
  const light = appearance.palette === 'paper'
  const contrast = appearance.palette === 'contrast'
  const colors = light
    ? { foreground: '#202b3e', background: '#f8fafc', gutter: '#59687e', line: '#e8edf4', selection: '#b8d8ff', tooltip: '#ffffff' }
    : contrast
      ? { foreground: '#f8fafc', background: '#05070c', gutter: '#c8ccd5', line: '#202736', selection: '#345d99', tooltip: '#111827' }
      : { foreground: '#e7e9ef', background: '#1e2230', gutter: '#98a4be', line: '#292e40', selection: '#31547d', tooltip: '#252b3b' }
  return [
    syntaxHighlighting(light ? paperPalette : contrast ? contrastPalette : palette),
    EditorView.theme({
      '&': { color: colors.foreground, backgroundColor: colors.background, fontSize: `${appearance.fontSize}px`, maxHeight: 'var(--pg-editor-max, 70vh)' },
      '.cm-content': { caretColor: colors.foreground },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: colors.foreground },
      '.cm-gutters': { color: colors.gutter },
      '.cm-activeLine': { backgroundColor: colors.line },
      '.cm-activeLineGutter': { color: colors.foreground },
      '.cm-selectionBackground': { backgroundColor: colors.selection },
      '.cm-tooltip': { color: colors.foreground, backgroundColor: colors.tooltip },
    }, { dark: !light }),
  ]
}

export interface PgEditor {
  getValue(): string
  setValue(value: string): void
  setDiagnostics(list: Diagnostic[]): void
  clearDiagnostics(): void
  goToLine(line: number, column?: number): void
  focus(): void
  setAppearance(appearance: EditorAppearance): void
  destroy(): void
}

export interface EditorOptions {
  parent: HTMLElement
  lang: BlockLang
  doc: string
  label: string
  onChange(value: string): void
  onRun(): void
  onSubmit?(): void
  readOnly?: boolean
  appearance?: EditorAppearance
}

export async function createEditor(opts: EditorOptions): Promise<PgEditor> {
  const language = await languageSupport(opts.lang)
  const indent = ' '.repeat(INDENT[opts.lang] ?? 2)
  const appearance = new Compartment()
  const wrapping = new Compartment()
  const initialAppearance = opts.appearance ?? defaultEditorAppearance
  // Esc releases the Tab key (so keyboard users can leave the editor); the next Tab then moves focus.
  let tabFree = false
  const tabKeys = Prec.highest(keymap.of([
    { key: 'Escape', run: () => { tabFree = true; return true } },
    { key: 'Tab', run: (v) => (tabFree ? false : indentMore(v)) },
    { key: 'Shift-Tab', run: (v) => (tabFree ? false : indentLess(v)) },
    { key: 'Mod-Shift-Enter', run: () => { opts.onSubmit?.(); return !!opts.onSubmit } },
    { key: 'Mod-Enter', run: () => { opts.onRun(); return true } },
  ]))
  const view = new EditorView({
    parent: opts.parent,
    state: EditorState.create({
      doc: opts.doc,
      extensions: [
        tabKeys,
        EditorState.readOnly.of(!!opts.readOnly),
        lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(), drawSelection(), history(), bracketMatching(), closeBrackets(), indentOnInput(),
        lintGutter(),
        EditorState.tabSize.of(indent.length), indentUnit.of(indent),
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap]),
        theme,
        appearance.of(appearanceExtensions(initialAppearance)),
        wrapping.of(initialAppearance.wrap ? EditorView.lineWrapping : []),
        language,
        placeholder('여기에 코드를 쓰세요'),
        // tabindex: the scroller is tabindex=-1 and axe doesn't count contenteditable as focusable (scrollable-region-focusable).
        EditorView.contentAttributes.of({ 'aria-label': opts.label, 'aria-multiline': 'true', spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off', tabindex: '0' }),
        EditorView.domEventHandlers({ keydown: (e) => { if (e.key !== 'Tab' && e.key !== 'Shift' && e.key !== 'Escape') tabFree = false; return false } }),
        EditorView.updateListener.of((u) => { if (u.docChanged) opts.onChange(u.state.doc.toString()) }),
      ],
    }),
  })

  const toCm = (d: Diagnostic): CmDiagnostic => {
    const doc = view.state.doc
    const line = doc.line(Math.min(Math.max(Math.trunc(d.line) || 1, 1), doc.lines))
    const from = Math.min(line.from + Math.max((d.column || 1) - 1, 0), line.to)
    // Underline the word at the column (or the rest of the line when there is none).
    const rest = doc.sliceString(from, line.to)
    const word = /^[\w$]+|^\S/.exec(rest)
    const to = Math.max(from + (word ? word[0].length : 0), Math.min(from + 1, line.to))
    // Compilers report "expected ';'" just past the end of the line (gcc: column = length + 1), which would be
    // an empty range with nothing to underline: point at the last character of the line instead.
    const end = to === from ? Math.min(line.to, from + 1) : to
    const start = end === from && from > line.from ? from - 1 : from
    return {
      from: start, to: end,
      severity: d.severity === 'error' ? 'error' : d.severity === 'warning' ? 'warning' : 'info',
      message: d.hintKo ? `${d.message}\n힌트: ${d.hintKo}` : d.message,
    }
  }

  return {
    getValue: () => view.state.doc.toString(),
    setValue: (value) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } }),
    setDiagnostics: (list) => view.dispatch(setDiagnostics(view.state, list.map(toCm))),
    clearDiagnostics: () => view.dispatch(setDiagnostics(view.state, [])),
    goToLine(line, column = 1) {
      const doc = view.state.doc
      const l = doc.line(Math.min(Math.max(Math.trunc(line) || 1, 1), doc.lines))
      const pos = Math.min(l.from + Math.max(column - 1, 0), l.to)
      view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) })
      view.focus()
    },
    focus: () => view.focus(),
    setAppearance(next) {
      view.dispatch({ effects: [
        appearance.reconfigure(appearanceExtensions(next)),
        wrapping.reconfigure(next.wrap ? EditorView.lineWrapping : []),
      ] })
    },
    destroy: () => view.destroy(),
  }
}
