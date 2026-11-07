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
//
// The Lab is a separate build and cannot import the site's single-flight client (src/services/apiClient.ts).
// Inside this page one refresh is shared by every caller; across tabs two refreshes can race, which is
// harmless: the backend answers a parallel refresh of the same token with 204 and no cookies (RACE_LOSER,
// AuthController) because the winner's Set-Cookie already landed in the shared cookie jar, and the retry
// below then rides on those cookies.
const REFRESH_TIMEOUT_MS = 15_000
let refreshInFlight: Promise<boolean> | null = null

// The shared refresh has only its own deadline - never a caller's signal - so one caller aborting cannot fail
// the others. Each caller then waits for it no longer than its own signal allows.
function startRefresh(fetchImpl: typeof fetch): Promise<boolean> {
  return (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
      const expired = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('refresh timed out')), { once: true }));
      expired.catch(() => {});
      try {
        const res = await Promise.race([fetchImpl('/api/auth/refresh', { method: 'POST', credentials: 'include', signal: controller.signal }), expired]);
        return res.ok;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
}

function refreshSession(fetchImpl: typeof fetch, signal: AbortSignal): Promise<boolean> {
  refreshInFlight ??= startRefresh(fetchImpl);
  const shared = refreshInFlight;
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException('aborted', 'AbortError'));
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    shared.then(
      (ok) => { signal.removeEventListener('abort', onAbort); resolve(ok); },
      (error) => { signal.removeEventListener('abort', onAbort); reject(error); },
    );
  });
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
