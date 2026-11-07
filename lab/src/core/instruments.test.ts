import { describe, expect, it } from 'vitest';
import { Instruments } from './instruments';
import type { Analysis, Scene } from './types';
const scene: Scene = { version: 2, parts: [
  { id: 'scope', kind: 'oscilloscope', pos: [0, 0, 0], rotY: 0, props: { timeDiv: 1, trigger: 2 } },
  { id: 'logic', kind: 'logic-analyzer', pos: [100, 0, 0], rotY: 0, props: { timeDiv: 1 } },
], wires: [], code: '' };
const analysis: Analysis = { nets: [], insertions: {}, warnings: [], pinToNet: {
  'scope:CH1': 'a', 'scope:CH2': 'b', 'scope:GND': 'g', 'logic:GND': 'g',
  ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`logic:D${i}`, i % 2 ? 'b' : 'a'])),
} };
describe('bounded simulated-time instrument acquisition', () => {
  it('samples differential voltage and logic channels, with rising trigger', () => {
    const instruments = new Instruments();
    instruments.sample(scene, analysis, { a: 1, b: 5, g: 1 }, 0);
    instruments.sample(scene, analysis, { a: 4, b: 1, g: 1 }, .02);
    const traces = instruments.traces();
    const dt = 10 / 511;
    expect(traces.scopes.scope!.dtMs).toBe(dt);
    expect(traces.scopes.scope!.t0Ms).toBe(0);
    expect(traces.scopes.scope!.triggered).toBe(true);
    expect(traces.scopes.scope!.channels[0]![1]).toBeCloseTo(3 * dt / .02);
    expect(traces.scopes.scope!.channels[1]![1]).toBeCloseTo(4 * (1 - dt / .02));
    expect(traces.logic.logic!.channels).toEqual(Array.from({ length: 8 }, (_, i) => i % 2 ? [1, 0] : [0, 1]));
  });
  it('decimates and bounds memory without triggering on a falling edge', () => {
    const instruments = new Instruments();
    for (let n = 0; n < 20000; n++) instruments.sample(scene, analysis, { a: n < 10000 ? 4 : 0, b: 1, g: 0 }, n / 1000);
    const first = instruments.traces();
    expect(first.scopes.scope!.channels[0]!.length).toBeLessThanOrEqual(512);
    expect(first.scopes.scope!.triggered).toBe(false);
    first.scopes.scope!.channels[0]![0] = 999;
    expect(instruments.traces().scopes.scope!.channels[0]![0]).not.toBe(999);
    instruments.reset();
    expect(instruments.traces()).toEqual({ scopes: {}, logic: {} });
  });
  it('keeps a truthful uniform grid across irregular calls and duplicate frame reads', () => {
    const instruments = new Instruments();
    instruments.sample(scene, analysis, { a: 0, b: 0, g: 0 }, 0);
    instruments.sample(scene, analysis, { a: 1, b: 0, g: 0 }, .037);
    const trace = instruments.traces().scopes.scope!;
    expect(trace.channels[0]).toHaveLength(2);
    expect(trace.channels[0]![1]).toBeCloseTo((10 / 511) / .037);
    instruments.sample(scene, analysis, { a: 1, b: 0, g: 0 }, .037);
    expect(instruments.traces().scopes.scope).toEqual(trace);
  });
  it('retains a complete capture while automatically rearming for the next rising edge', () => {
    const instruments = new Instruments();
    const dt = 10 / 511;
    for (let n = 0; n < 120; n++) instruments.sample(scene, analysis, { a: 0, b: 0, g: 0 }, n * dt);
    for (let n = 120; n < 800; n++) instruments.sample(scene, analysis, { a: 5, b: 0, g: 0 }, n * dt);
    const trace = instruments.traces().scopes.scope!;
    expect(trace.triggered).toBe(true);
    expect(trace.channels[0]).toHaveLength(512);
    expect(trace.t0Ms).toBe(0);
    for (let n = 800; n < 1000; n++) instruments.sample(scene, analysis, { a: 0, b: 0, g: 0 }, n * dt);
    expect(instruments.traces().scopes.scope).toEqual(trace);
    for (let n = 1000; n < 1700; n++) instruments.sample(scene, analysis, { a: 3, b: 0, g: 0 }, n * dt);
    const second = instruments.traces().scopes.scope!;
    expect(second.triggered).toBe(true);
    expect(second.channels[0]).toHaveLength(512);
    expect(second.t0Ms).toBeGreaterThan(trace.t0Ms);
    expect(second.channels[0]![300]).toBeCloseTo(3);
  });
});
