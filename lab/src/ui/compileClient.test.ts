import { describe, expect, it, vi } from 'vitest';
import { CompileUnreachable, LOGIN_URL, compileSketch } from './compileClient';

const sig = new AbortController().signal;
describe('compileSketch', () => {
  it('returns parsed results', async () => {
    const f = (async () => new Response(JSON.stringify({ ok: true, hex: ':00000001FF', warnings: [] }))) as typeof fetch;
    expect(await compileSketch('x', sig, f)).toMatchObject({ ok: true });
  });
  it('maps network failure and html errors to unreachable', async () => {
    await expect(compileSketch('x', sig, (async () => { throw new TypeError('fail'); }) as typeof fetch)).rejects.toBeInstanceOf(CompileUnreachable);
    await expect(compileSketch('x', sig, (async () => new Response('<html>502</html>', { status: 502 })) as typeof fetch)).rejects.toBeInstanceOf(CompileUnreachable);
  });

  describe('expired session', () => {
    const unauthorized = () => new Response(JSON.stringify({ ok: false, errors: [] }), { status: 401 });
    const okBody = () => new Response(JSON.stringify({ ok: true, hex: ':00000001FF', warnings: [] }));
    const script = (steps: Array<(url: string, init?: RequestInit) => Response>) => {
      const calls: Array<{ url: string; init?: RequestInit }> = [];
      const fetchImpl = (async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        const step = steps[calls.length - 1];
        if (!step) throw new Error('unexpected extra request ' + url);
        return step(url, init);
      }) as unknown as typeof fetch;
      return { fetchImpl, calls };
    };

    it('refreshes the session once and retries the compile', async () => {
      const { fetchImpl, calls } = script([unauthorized, () => new Response(null, { status: 204 }), okBody]);
      expect(await compileSketch('x', sig, fetchImpl)).toMatchObject({ ok: true });
      expect(calls.map((c) => c.url)).toEqual(['/lab/api/compile', '/api/auth/refresh', '/lab/api/compile']);
      expect(calls[1]?.init).toMatchObject({ method: 'POST', credentials: 'include' });
    });

    it('asks to sign in when the refresh is refused, without retrying', async () => {
      const { fetchImpl, calls } = script([unauthorized, () => new Response(null, { status: 401 })]);
      const r = await compileSketch('x', sig, fetchImpl);
      expect(r).toMatchObject({ ok: false, reason: 'unauthorized' });
      expect(!r.ok && r.errors[0]?.message).toContain('로그인한 동아리원만');
      expect(calls).toHaveLength(2);
    });

    it('does not loop when the retry is unauthorized again', async () => {
      const { fetchImpl, calls } = script([unauthorized, () => new Response(null, { status: 204 }), unauthorized]);
      expect(await compileSketch('x', sig, fetchImpl)).toMatchObject({ ok: false, reason: 'unauthorized' });
      expect(calls).toHaveLength(3);
    });

    it('treats an unreachable refresh endpoint as signed out', async () => {
      let n = 0;
      const fetchImpl = (async () => { if (n++ === 0) return unauthorized(); throw new TypeError('offline'); }) as unknown as typeof fetch;
      expect(await compileSketch('x', sig, fetchImpl)).toMatchObject({ ok: false, reason: 'unauthorized' });
    });

    it('sends people to the site login and back to /lab/', () => {
      expect(LOGIN_URL).toBe('/login?returnTo=%2Flab%2F');
    });
  });

  describe('shared session refresh', () => {
    it('one caller aborting does not fail the other: B still gets the refreshed session', async () => {
      let releaseRefresh!: () => void;
      let refreshes = 0;
      const compiles: string[] = [];
      const fetchImpl = (async (url: string, init?: RequestInit) => {
        if (url === '/api/auth/refresh') {
          refreshes++;
          await new Promise<void>((resolve) => { releaseRefresh = resolve; });
          return new Response(null, { status: 204 });
        }
        compiles.push(String(init?.body));
        return compiles.length <= 2 ? new Response('{}', { status: 401 }) : new Response(JSON.stringify({ ok: true, hex: ':00000001FF', warnings: [] }));
      }) as unknown as typeof fetch;
      const a = new AbortController();
      const pa = compileSketch('a', a.signal, fetchImpl);
      const pb = compileSketch('b', new AbortController().signal, fetchImpl);
      await new Promise((resolve) => setTimeout(resolve, 10));
      a.abort();
      await expect(pa).rejects.toMatchObject({ name: 'AbortError' });
      releaseRefresh();
      expect(await pb).toMatchObject({ ok: true });
      expect(refreshes).toBe(1);
    });

    it('a refresh that never answers times out on its own and the next compile can refresh again', async () => {
      vi.useFakeTimers();
      try {
        let refreshes = 0;
        const fetchImpl = (async (url: string) => {
          if (url === '/api/auth/refresh') { refreshes++; return new Promise<Response>(() => {}); }
          return new Response('{}', { status: 401 });
        }) as unknown as typeof fetch;
        const first = compileSketch('x', new AbortController().signal, fetchImpl);
        await vi.advanceTimersByTimeAsync(15_001);
        expect(await first).toMatchObject({ ok: false, reason: 'unauthorized' });
        const second = compileSketch('x', new AbortController().signal, fetchImpl);
        await vi.advanceTimersByTimeAsync(15_001);
        expect(await second).toMatchObject({ ok: false, reason: 'unauthorized' });
        expect(refreshes).toBe(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
