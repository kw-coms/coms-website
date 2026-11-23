// Contract for the study practice problems. See docs/study-exercises-spec.md.
// The content lane fills problems/*.ts; the UI lane renders and grades them.

export const LANG_NAMES = { c: 'C', cpp: 'C++', java: 'Java', python: 'Python', javascript: 'JavaScript' } as const
export type ExLang = keyof typeof LANG_NAMES
export const JUDGE_LANGUAGES = Object.keys(LANG_NAMES) as ExLang[]
export type Level = 1 | 2 | 3 | 4 | 5 // 1 입문 · 2 기초 · 3 응용 · 4 심화 · 5 도전

export interface ExCase { stdin: string; expected: string; explain?: string }

export interface Exercise {
  id: string // kebab-case, unique across all problems (web too)
  title: string
  level: Level
  topics: string[]
  langs: ExLang[]
  /** Section id on that language's study page the problem belongs after. */
  chapter: Partial<Record<ExLang, string>>
  statement: string // mini-markdown
  inputSpec?: string
  outputSpec?: string
  /** Shown on the page and graded. */
  examples: ExCase[]
  /** Further graded cases; examples + tests ≤ 10. */
  tests: ExCase[]
  mode: 'stdio' | 'function'
  /** Function mode: a full program with `/*@USER@*\/` (C/Java) or `#@USER@` (Python) on its own line. */
  harness?: Partial<Record<ExLang, string>>
  starter: Partial<Record<ExLang, string>>
  solution: Partial<Record<ExLang, string>>
  explain: string
  hints: string[]
  compare?: 'tokens' | 'lines' | { float: number }
  sourceId?: number // DailyCoding source number, separate from the COM’s number.
  difficultyTier?: number // 0 unrated, 1–30 Bronze V through Ruby I, 31 Master.
}

export interface WebFiles { html: string; css: string; js: string }

export interface WebExercise {
  id: string
  title: string
  level: Level
  topics: string[]
  chapter: string
  statement: string
  starter: WebFiles
  solution: WebFiles
  explain: string
  hints: string[]
  /** Async function bodies run in the sandbox with `t`; return true, or throw / return a Korean message. */
  checks: { name: string; code: string }[]
}

export interface LabMissionLink { id: string; title: string; level: Level }

export const USER_MARKER: Record<ExLang, string> = {
  c: '/*@USER@*/', cpp: '/*@USER@*/', java: '/*@USER@*/', python: '#@USER@', javascript: '/*@USER@*/',
}
export const MAX_CASES = 10
