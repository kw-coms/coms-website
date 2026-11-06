import type { CompileResult } from '../core/types';

export const UNREACHABLE_MSG =
  '컴파일 서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요. (회로 보기와 직접 조작은 그대로 사용할 수 있어요.)';

export class CompileUnreachable extends Error {
  constructor() {
    super(UNREACHABLE_MSG);
  }
}

export async function compileSketch(sketch: string, signal: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<CompileResult> {
  let res: Response;
  try {
    res = await fetchImpl('/lab/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sketch }),
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new CompileUnreachable();
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
