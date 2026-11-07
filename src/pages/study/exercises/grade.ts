import { compareOutput, type DiffLine } from '../playground/compare'
import type { Diagnostic } from '../playground/runner'
import { runTests, type MultiRunOutput, type TestRun, type TestsResult } from './api'
import { USER_MARKER, type ExCase, type ExLang, type Exercise } from './types'

export type Verdict = 'correct' | 'wrong' | 'timeout' | 'runtime' | 'truncated' | 'skipped'
export const VERDICT_LABEL: Record<Verdict, string> = {
  correct: '정답', wrong: '오답', timeout: '시간 초과', runtime: '런타임 에러', truncated: '출력 초과', skipped: '미실행',
}
export interface MappedDiagnostic extends Diagnostic { source: 'student' | 'harness' }
export interface CaseVerdict {
  index: number
  input: string
  expected: string
  actual: string
  stderr: string
  verdict: Verdict
  label: string
  diff: DiffLine[]
  timeMs: number
}
export interface GradeReport {
  passed: number
  total: number
  solved: boolean
  cases: CaseVerdict[]
  diagnostics: MappedDiagnostic[]
  compileError: boolean
  stderr: string
  timeMs: number
}
export type GradeResult = { kind: 'graded'; grade: GradeReport } | Exclude<TestsResult, { kind: 'output' }>

export function buildProgram(exercise: Exercise, lang: ExLang, studentCode: string): string {
  if (exercise.mode === 'stdio') return studentCode
  const harness = exercise.harness?.[lang]
  const marker = USER_MARKER[lang]
  if (!harness || !harness.includes(marker)) throw new Error('채점 코드에 학생 코드 삽입 위치가 없어요.')
  return harness.replace(marker, () => studentCode)
}

export function mapDiagnostics(diagnostics: Diagnostic[], exercise: Exercise, lang: ExLang, studentCode: string): MappedDiagnostic[] {
  if (exercise.mode !== 'function') return diagnostics.map((d) => ({ ...d, source: 'student' }))
  const harness = exercise.harness?.[lang] ?? ''
  const marker = USER_MARKER[lang]
  const before = harness.split(marker)[0]
  const first = before.split('\n').length
  const last = first + studentCode.split('\n').length - 1
  return diagnostics.map((d) => d.line >= first && d.line <= last
    ? { ...d, line: d.line - first + 1, source: 'student' }
    : { ...d, source: 'harness' })
}

/** The line comparator preserves internal blank lines while accepting CRLF and a final newline. */
export function matchesOutput(actual: string, expected: string, mode: Exercise['compare'] = 'tokens'): boolean {
  if (mode === 'lines') {
    const normalize = (text: string) => text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map((line) => line.trim())
    return JSON.stringify(normalize(actual)) === JSON.stringify(normalize(expected))
  }
  const tokens = (text: string) => text.trim().split(/\s+/).filter(Boolean)
  const a = tokens(actual)
  const b = tokens(expected)
  if (a.length !== b.length) return false
  return a.every((token, index) => {
    if (typeof mode !== 'object') return token === b[index]
    const left = Number(token)
    const right = Number(b[index])
    if (token !== '' && b[index] !== '' && Number.isFinite(left) && Number.isFinite(right)) {
      return Math.abs(left - right) <= mode.float * Math.max(1, Math.abs(right))
    }
    return token === b[index]
  })
}

function boundedDiff(actual: string, expected: string): DiffLine[] {
  // The playground uses an LCS matrix; cap displayed lines before building it for very tall output.
  const limit = 200
  const display = (value: string) => value.split('\n').slice(0, limit).join('\n')
  const diff = compareOutput(display(actual), display(expected)).diff
  if (actual.split('\n').length > limit || expected.split('\n').length > limit) diff.push({ kind: 'same', text: '… 차이가 많아 일부만 표시했어요.' })
  return diff
}

export function gradeOutput(exercise: Exercise, lang: ExLang, studentCode: string, output: MultiRunOutput): GradeReport {
  const cases: ExCase[] = [...exercise.examples, ...exercise.tests]
  const compileError = output.stage === 'compile'
  const diagnostics = mapDiagnostics(output.diagnostics, exercise, lang, studentCode)
  const verdicts: CaseVerdict[] = compileError ? [] : cases.map((test, index) => {
    const run: TestRun | undefined = output.results[index]
    const verdict: Verdict = !run || run.skipped ? 'skipped'
      : run.timedOut ? 'timeout'
        : (run.exitCode !== 0 || run.signal) ? 'runtime'
          : run.truncated ? 'truncated'
            : matchesOutput(run.stdout, test.expected, exercise.compare) ? 'correct' : 'wrong'
    return {
      index, input: test.stdin, expected: test.expected, actual: run?.stdout ?? '', stderr: run?.stderr ?? '',
      verdict, label: VERDICT_LABEL[verdict], diff: verdict === 'wrong' ? boundedDiff(run?.stdout ?? '', test.expected) : [],
      timeMs: run?.timeMs ?? 0,
    }
  })
  const passed = verdicts.filter((row) => row.verdict === 'correct').length
  return { passed, total: cases.length, solved: !compileError && passed === cases.length, cases: verdicts, diagnostics, compileError, stderr: output.stderr, timeMs: output.timeMs }
}

export async function gradeExercise(exercise: Exercise, lang: ExLang, studentCode: string, signal?: AbortSignal): Promise<GradeResult> {
  let code: string
  try { code = buildProgram(exercise, lang, studentCode) }
  catch (error) { return { kind: 'rejected', messageKo: error instanceof Error ? error.message : '채점 코드를 만들 수 없어요.' } }
  const result = await runTests(lang, code, [...exercise.examples, ...exercise.tests].map((test) => test.stdin), signal)
  return result.kind === 'output' ? { kind: 'graded', grade: gradeOutput(exercise, lang, studentCode, result.output) } : result
}
