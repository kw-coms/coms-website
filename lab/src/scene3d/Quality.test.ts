import { beforeEach, describe, expect, it, vi } from 'vitest';

// Drive QualityRig as a plain function: hooks are replaced by recorders, the frame callback is captured.
const h = vi.hoisted(() => ({
  frame: null as null | (() => void),
  effects: [] as (() => void | (() => void))[],
  listeners: {} as Record<string, () => void>,
}));
vi.mock('react', async (orig) => ({
  ...(await orig<typeof import('react')>()),
  useRef: (v: unknown) => ({ current: v }),
  useEffect: (fn: () => void | (() => void)) => void h.effects.push(fn),
}));
vi.mock('@react-three/fiber', () => ({
  useFrame: (cb: () => void) => void (h.frame = cb),
  useThree: (sel: (s: unknown) => unknown) => sel({
    scene: { traverse: () => {} }, invalidate: () => {}, setDpr: () => {},
    controls: { addEventListener: (t: string, f: () => void) => { h.listeners[t] = f; }, removeEventListener: () => {} },
  }),
}));
vi.mock('../ui/store', async (orig) => {
  const m = await orig<typeof import('../ui/store')>();
  return { ...m, useStore: (sel: (s: ReturnType<typeof m.getState>) => unknown) => sel(m.getState()) };
});

import { QualityRig } from './Quality';
import { getState, loadScene, set } from '../ui/store';
import { EXAMPLES } from '../core';

let t = 0;
const warm = () => { t += 7000; }; // past the warm-up window
const frames = (gaps: number[]) => { for (const g of gaps) { t += g; h.frame!(); } };

beforeEach(() => {
  h.effects = []; h.listeners = {}; t = 1000;
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => cb());
  vi.spyOn(performance, 'now').mockImplementation(() => t);
  set({ simState: 'idle', quality: 'high', qualityMode: 'auto' });
  QualityRig();
  h.effects.forEach((e) => e());
});

describe('quality governor gating', () => {
  const slow = Array<number>(121).fill(70);
  it('ignores slow frames while neither orbiting nor simulating', () => {
    frames(slow);
    expect(getState().quality).toBe('high');
  });
  it('steps down on slow back-to-back frames while the simulation runs', () => {
    warm();
    set({ simState: 'running' });
    frames(slow);
    expect(getState().quality).toBe('medium');
  });
  it('ignores slow frames during the warm-up after load', () => {
    set({ simState: 'running' });
    frames(Array<number>(60).fill(70)); // ~4.2 s of slow frames right after mount
    expect(getState().quality).toBe('high');
  });
  it('steps down on slow back-to-back frames while orbiting', () => {
    warm();
    h.listeners.start!();
    frames(slow);
    expect(getState().quality).toBe('medium');
  });
  it('stops sampling once the orbit ends', () => {
    h.listeners.start!();
    h.listeners.end!();
    frames(slow);
    expect(getState().quality).toBe('high');
  });
  it('steps down on a sustained 150 ms frame time while running (a GPU under 10 fps)', () => {
    warm();
    set({ simState: 'running' });
    frames(Array<number>(100).fill(150));
    expect(getState().quality).toBe('medium');
  });
  it('never steps down on idle-like gaps (over 250 ms) while running', () => {
    warm();
    set({ simState: 'running' });
    frames(Array.from({ length: 300 }, (_, i) => 300 + (i * 37) % 400));
    expect(getState().quality).toBe('high');
  });
  it('restarts the warm-up on a scene replacement but not on a plain edit', () => {
    warm();
    set({ simState: 'running' });
    set({ hist: { ...getState().hist, present: { ...getState().hist.present } } }); // an edit
    frames(slow);
    expect(getState().quality).toBe('medium');
    set({ quality: 'high' });
    h.effects = []; QualityRig(); h.effects.forEach((e) => e()); // fresh rig, as after a quality change
    warm();
    loadScene(EXAMPLES[0]!.scene);
    frames(Array<number>(100).fill(70)); // within 6 s of the load
    expect(getState().quality).toBe('high');
  });
});
