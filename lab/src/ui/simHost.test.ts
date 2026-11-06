import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompileResult } from '../core/types';

const h = vi.hoisted(() => ({ resolve: null as null | ((r: unknown) => void) }));
vi.mock('./compileClient', () => ({
  CompileUnreachable: class extends Error {},
  compileSketch: () => new Promise((res) => { h.resolve = res; }),
}));

import { run, sim } from './simHost';
import { getState, loadScene, setCode } from './store';
import { EXAMPLES } from './core';

describe('simHost.run stale compile guard', () => {
  beforeEach(() => loadScene(EXAMPLES[0]!.scene));
  it('does not start when the code changed during compile, goes idle and toasts', async () => {
    const loadHex = vi.spyOn(sim, 'loadHex');
    const start = vi.spyOn(sim, 'start');
    const p = run();
    expect(getState().compile.status).toBe('compiling');
    setCode(getState().code + '\n// typed while compiling');
    h.resolve!({ ok: true, hex: ':00000001FF', warnings: [] } satisfies CompileResult);
    await p;
    expect(loadHex).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(sim.state).toBe('idle');
    expect(getState().simState).toBe('idle');
    expect(getState().compile.status).toBe('idle');
    expect(getState().toast).toMatch(/다시 실행/);
  });
});
