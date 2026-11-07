import type { CompileResult } from '../core/types';

export const UNREACHABLE_MSG =
  '컴파일 서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요. (회로 보기와 직접 조작은 그대로 사용할 수 있어요.)';

export class CompileUnreachable extends Error {
  constructor() {
    super(UNREACHABLE_MSG);
  }
}

export const LOGIN_URL = '/login?returnTo=%2Flab%2F';
const UNAUTHORIZED_MSG = '로그인한 동아리원만 컴파일할 수 있어요.';

// The site's access cookie lives only a short while; the refresh cookie (path /api/auth/refresh) is
// not sent to /lab/api/*. Ask the site for a new access cookie, the way its own API client does:
// a same-origin POST (the browser adds Origin, which the backend checks) with the cookies.
async function refreshSession(fetchImpl: typeof fetch, signal: AbortSignal): Promise<boolean> {
  try {
    const res = await fetchImpl('/api/auth/refresh', { method: 'POST', credentials: 'include', signal });
    return res.ok;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    return false;
  }
}

async function post(sketch: string, signal: AbortSignal, fetchImpl: typeof fetch, debug = false): Promise<Response> {
  try {
    return await fetchImpl('/lab/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(debug ? { sketch, debug: true } : { sketch }),
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new CompileUnreachable();
  }
}

/** `debug` asks the service for a -g build and returns line/global tables for the debugger. */
export async function compileSketch(sketch: string, signal: AbortSignal, fetchImpl: typeof fetch = fetch, debug = false): Promise<CompileResult> {
  let res = await post(sketch, signal, fetchImpl, debug);
  if (res.status === 401) {
    // Once: refresh the session and retry. Still 401 means signed out (or the refresh cookie is gone too).
    if (await refreshSession(fetchImpl, signal)) res = await post(sketch, signal, fetchImpl, debug);
    if (res.status === 401) {
      await res.body?.cancel();
      return { ok: false, reason: 'unauthorized', errors: [{ line: 0, severity: 'error', message: UNAUTHORIZED_MSG }] };
    }
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new CompileUnreachable();
  }
  const r = body as CompileResult;
  if (!r || typeof r !== 'object' || typeof (r as { ok?: unknown }).ok !== 'boolean') throw new CompileUnreachable();
  return r;
}
