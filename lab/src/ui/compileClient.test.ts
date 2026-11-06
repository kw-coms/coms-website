import { describe, expect, it } from 'vitest';
import { CompileUnreachable, compileSketch } from './compileClient';

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
});
