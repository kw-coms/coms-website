import { MAX_CODE_BYTES, MAX_STDIN_BYTES, postRun, type Diagnostic, type RunLang, type RunResult } from '../playground/runner'

export interface TestRun {
  stdout: string
  stderr: string
  exitCode: number | null
  signal: string | null
  timedOut: boolean
  truncated: boolean
  timeMs: number
  skipped: boolean
}

export interface MultiRunOutput {
  ok: boolean
  stage: 'compile' | 'run'
  stderr: string
  diagnostics: Diagnostic[]
  timeMs: number
  results: TestRun[]
}

export type TestsResult = { kind: 'output'; output: MultiRunOutput } | Exclude<RunResult, { kind: 'output' }>
const bytes = (text: string) => new TextEncoder().encode(text).length
const asText = (value: unknown) => typeof value === 'string' ? value : ''

/** One HTTP request compiles once and runs every stdin in order. */
export async function runTests(lang: RunLang, code: string, tests: string[], signal?: AbortSignal): Promise<TestsResult> {
  if (bytes(code) > MAX_CODE_BYTES) return { kind: 'rejected', messageKo: '코드가 너무 길어요. 64KB 이하로 줄여 주세요.' }
  if (tests.length < 1 || tests.length > 10 || tests.some((input) => bytes(input) > MAX_STDIN_BYTES) || tests.reduce((sum, input) => sum + bytes(input), 0) > 32 * 1024) {
    return { kind: 'rejected', messageKo: '입력은 1~10개, 각 16KB와 전체 32KB 이하여야 해요.' }
  }
  const result = await postRun({ lang, code, tests }, signal)
  if (result.kind !== 'output') return result
  const data = result.data
  const diagnostics = Array.isArray(data.diagnostics)
    ? (data.diagnostics as Diagnostic[]).filter((d) => d && Number.isFinite(d.line) && typeof d.message === 'string')
    : []
  const runs = Array.isArray(data.results) ? data.results : []
  return { kind: 'output', output: {
    ok: data.ok !== false,
    stage: data.stage === 'compile' ? 'compile' : 'run',
    stderr: asText(data.stderr),
    diagnostics,
    timeMs: typeof data.timeMs === 'number' ? data.timeMs : 0,
    results: runs.map((run: Record<string, unknown>) => ({
      stdout: asText(run?.stdout), stderr: asText(run?.stderr),
      exitCode: typeof run?.exitCode === 'number' ? run.exitCode : null,
      signal: typeof run?.signal === 'string' ? run.signal : null,
      timedOut: run?.timedOut === true, truncated: run?.truncated === true,
      timeMs: typeof run?.timeMs === 'number' ? run.timeMs : 0,
      skipped: run?.skipped === true,
    })),
  } }
}
