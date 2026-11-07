import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompileResult, DebugInfo } from '../core/types';
import { wordsToHex } from '../core/mcu/hex';

const h = vi.hoisted(() => ({ resolve: null as null | ((r: unknown) => void), result: null as unknown }));
vi.mock('./compileClient', () => ({
  CompileUnreachable: class extends Error {},
  compileSketch: () => (h.result ? Promise.resolve(h.result) : new Promise((res) => { h.resolve = res; })),
}));

import { frameRef, pause, run, sim, stop, toggleBreakpoint } from './simHost';
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

// rjmp, nop, rjmp .-2 (an endless loop at word 2), nop, ret: line N is the Nth instruction
const hex = wordsToHex([0xd002, 0x0000, 0xcfff, 0x0000, 0x9508]);
const lines = [1, 2, 3, 4, 5].map((line, i) => ({ addr: i * 2, line }));
const debugInfo = (extra: object = {}): DebugInfo => ({ lines, globals: [], ...extra });
const compiled = (debug: DebugInfo | undefined = debugInfo()) => ({ ok: true, hex, warnings: [], debug }) satisfies CompileResult;
const time = () => frameRef.current?.timeMs ?? 0;

describe('simHost: the main Run action resumes a paused debug session', () => {
  beforeEach(() => { vi.useFakeTimers(); stop(); loadScene(EXAMPLES[0]!.scene); h.result = compiled(); });
  afterEach(() => { stop(); h.result = null; vi.useRealTimers(); });

  it('after a breakpoint pause: simulated time moves again and the breakpoint is stepped over', async () => {
    toggleBreakpoint(1);
    await run();
    vi.advanceTimersByTime(5);
    expect(sim.state).toBe('paused');
    expect(getState().debug).toMatchObject({ paused: true, line: 1, reason: 'breakpoint' });
    const frozenAt = time();
    vi.advanceTimersByTime(200);
    expect(time()).toBe(frozenAt);

    await run(); // the Run button, not the debugger's 계속
    vi.advanceTimersByTime(200);
    expect(sim.state).toBe('running');
    expect(getState().simState).toBe('running');
    expect(getState().debug?.paused).toBeFalsy();
    expect(time()).toBeGreaterThan(frozenAt);
  });

  it('after a manual pause in a debug session', async () => {
    toggleBreakpoint(1);
    await run();
    vi.advanceTimersByTime(5);
    await run();
    vi.advanceTimersByTime(50);
    expect(sim.state).toBe('running');
    pause();
    expect(sim.state).toBe('paused');
    const frozenAt = time();
    vi.advanceTimersByTime(200);
    expect(time()).toBe(frozenAt);

    await run();
    vi.advanceTimersByTime(200);
    expect(sim.state).toBe('running');
    expect(time()).toBeGreaterThan(frozenAt);
  });

  it('a manual pause without breakpoints still resumes', async () => {
    h.result = compiled(undefined);
    await run();
    vi.advanceTimersByTime(50);
    pause();
    const frozenAt = time();
    await run();
    vi.advanceTimersByTime(200);
    expect(time()).toBeGreaterThan(frozenAt);
  });
});

describe('simHost: the line table belongs to one sketch', () => {
  beforeEach(() => { vi.useFakeTimers(); stop(); loadScene(EXAMPLES[0]!.scene); h.result = compiled(); });
  afterEach(() => { stop(); h.result = null; vi.useRealTimers(); });

  it('breakpoints snap to the compiled sketch only until a new scene loads or the run stops', async () => {
    toggleBreakpoint(1);
    await run(); // line table: 1..5
    toggleBreakpoint(9);
    expect(getState().breakpoints).toEqual([1]); // no code at or after line 9 in this sketch: refused

    loadScene(EXAMPLES[1]!.scene);
    toggleBreakpoint(9);
    expect(getState().breakpoints).toEqual([9]); // the old table is gone: nothing to snap to yet

    toggleBreakpoint(1);
    await run();
    toggleBreakpoint(9);
    expect(getState().breakpoints).not.toContain(9);
    stop();
    toggleBreakpoint(9);
    expect(getState().breakpoints).toContain(9);
  });

  it('shows the truncated notice state for a debug build the compiler could not fully map, and clears it', async () => {
    toggleBreakpoint(1);
    h.result = compiled(debugInfo({ truncated: true }));
    await run();
    expect(getState().debugTruncated).toBe(true);
    stop();
    expect(getState().debugTruncated).toBe(false);

    h.result = compiled(debugInfo({ truncated: true }));
    await run();
    expect(getState().debugTruncated).toBe(true);
    loadScene(EXAMPLES[1]!.scene);
    expect(getState().debugTruncated).toBe(false);

    h.result = compiled(debugInfo()); // the field is missing: treated as false
    await run();
    expect(getState().debugTruncated).toBe(false);
  });
});
