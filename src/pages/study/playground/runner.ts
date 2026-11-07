// Calls POST /study/api/run (docs/study-runner-api.md) and turns every outcome into one result type.

export type RunLang = 'c' | 'java' | 'python'

export interface Diagnostic { line: number; column?: number; severity: 'error' | 'warning' | 'note' | string; message: string; hintKo?: string }
export interface RunOutput {
  ok: boolean
  stage: 'compile' | 'run'
  stdout: string
  stderr: string
  exitCode: number | null
  signal: string | null
  timedOut: boolean
  truncated: boolean
  timeMs: number
  diagnostics: Diagnostic[]
}

export type RunResult =
  | { kind: 'output'; output: RunOutput }
  | { kind: 'login' }
  | { kind: 'busy'; messageKo: string; retryAfterSec: number }
  | { kind: 'rejected'; messageKo: string }
  | { kind: 'network'; messageKo: string }

export const RUN_URL = '/study/api/run'
export const MAX_CODE_BYTES = 64 * 1024
export const MAX_STDIN_BYTES = 16 * 1024
const CLIENT_TIMEOUT_MS = 45_000

const bytes = (text: string) => new TextEncoder().encode(text).length

function asOutput(data: Record<string, unknown>): RunOutput {
  const diagnostics = Array.isArray(data.diagnostics)
    ? (data.diagnostics as Diagnostic[]).filter((d) => d && Number.isFinite(d.line) && typeof d.message === 'string')
    : []
  return {
    ok: data.ok !== false,
    stage: data.stage === 'compile' ? 'compile' : 'run',
    stdout: typeof data.stdout === 'string' ? data.stdout : '',
    stderr: typeof data.stderr === 'string' ? data.stderr : '',
    exitCode: typeof data.exitCode === 'number' ? data.exitCode : null,
    signal: typeof data.signal === 'string' ? data.signal : null,
    timedOut: data.timedOut === true,
    truncated: data.truncated === true,
    timeMs: typeof data.timeMs === 'number' ? data.timeMs : 0,
    diagnostics,
  }
}

export function retryAfterSeconds(header: string | null, body: unknown, fallback: number): number {
  const fromBody = body && typeof body === 'object' ? Number((body as { retryAfterSec?: unknown }).retryAfterSec) : NaN
  const value = Number(header) || fromBody || fallback
  return Math.min(Math.max(Math.ceil(value), 1), 60)
}

export async function runRemote(lang: RunLang, code: string, stdin: string, signal?: AbortSignal): Promise<RunResult> {
  if (bytes(code) > MAX_CODE_BYTES) return { kind: 'rejected', messageKo: '코드가 너무 길어요. 64KB 이하로 줄여 주세요.' }
  if (bytes(stdin) > MAX_STDIN_BYTES) return { kind: 'rejected', messageKo: '입력이 너무 길어요. 16KB 이하로 줄여 주세요.' }
  const timeout = AbortSignal.timeout(CLIENT_TIMEOUT_MS)
  try {
    const res = await fetch(RUN_URL, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang, code, stdin }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
    if (res.status === 401 || res.status === 403) return { kind: 'login' }
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (res.status === 429) {
      const rate = data?.error === 'rate-limited'
      return {
        kind: 'busy',
        messageKo: typeof data?.messageKo === 'string' ? data.messageKo : rate ? '너무 자주 실행했어요. 잠시 뒤에 다시 시도해 주세요.' : '지금 실행 요청이 많아요. 잠시 뒤에 다시 시도해 주세요.',
        retryAfterSec: retryAfterSeconds(res.headers.get('Retry-After'), data, rate ? 10 : 5),
      }
    }
    if (res.status === 400) return { kind: 'rejected', messageKo: typeof data?.messageKo === 'string' ? data.messageKo : '실행할 수 없는 코드예요.' }
    if (!res.ok || !data) return { kind: 'network', messageKo: '실행 서버가 응답하지 않아요. 잠시 뒤에 다시 시도해 주세요.' }
    return { kind: 'output', output: asOutput(data) }
  } catch (e) {
    if (signal?.aborted) throw e
    const timedOut = timeout.aborted
    return { kind: 'network', messageKo: timedOut ? '실행 서버 응답이 너무 늦어요. 잠시 뒤에 다시 시도해 주세요.' : '네트워크에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.' }
  }
}
