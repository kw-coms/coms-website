import { describe, expect, it } from 'vitest';
import { Instruments } from '../../core/instruments';
import type { Analysis, ScopeTrace } from '../../core/types';
import { EXAMPLES } from '../core';
import { addPart, getState, loadScene, scene, setProp } from '../store';
import { CH_COLORS, drawScope, scopeCursors, scopeSettings, scopeSpanMs } from './draw';

const analysisFor = (id: string): Analysis => ({ nets: [], insertions: {}, warnings: [], pinToNet: { [`${id}:CH1`]: 'a', [`${id}:GND`]: 'g' } });

/** x of every point drawn for CH1 (the yellow trace). */
function xsOf(trace: ScopeTrace, W: number): number[] {
  const xs: number[] = [];
  const state: Record<string, unknown> = {};
  const c = new Proxy(state, {
    get: (t, k: string) => k === 'moveTo' || k === 'lineTo' ? (x: number) => { if (t.strokeStyle === CH_COLORS[0]) xs.push(x); } : t[k] ?? (() => {}),
    set: (t, k: string, v) => { t[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  drawScope(c, W, 400, trace, scopeSettings({ timeDiv: 1, trigger: 2.5 }));
  return xs;
}

describe('scope time base and trigger are the part props the simulator acquires with', () => {
  it('the panel control writes timeDiv and trigger into the part, and acquisition follows', () => {
    loadScene(EXAMPLES[0]!.scene);
    const id = addPart('oscilloscope', [0, 0, 0]);
    expect(setProp(id, 'timeDiv', 100)).toBeNull();
    expect(setProp(id, 'trigger', 1.5)).toBeNull();
    const part = getState().hist.present.parts.find(p => p.id === id)!;
    expect(scopeSettings(part.props)).toMatchObject({ timePerDiv: 100, trigger: 1.5 });

    const instruments = new Instruments();
    const sc = scene(getState());
    const analysis = analysisFor(id);
    instruments.sample(sc, analysis, { a: 1, g: 0 }, 0);
    instruments.sample(sc, analysis, { a: 2, g: 0 }, 5); // rising through 1.5 V but not through 2.5 V
    const t = instruments.traces().scopes[id]!;
    expect(t.dtMs).toBeCloseTo((100 * 10) / 511);
    expect(scopeSpanMs(t) / 10).toBeCloseTo(100); // the label says what was acquired
    expect(t.triggered).toBe(true); // the 1.5 V trigger was used (the default 2.5 V would not fire)
  });

  it('a 10 ms buffer is not stretched across a screen labelled 1000 ms: x follows sample timestamps', () => {
    const dtMs = 10 / 511; // acquisition at 1 ms/div
    const trace: ScopeTrace = { t0Ms: 0, dtMs, channels: [Array.from({ length: 100 }, (_, i) => i % 2), []], triggered: false };
    const xs = xsOf(trace, 1000);
    expect(xs).toHaveLength(100);
    expect(xs.at(-1)).toBeCloseTo((99 / 511) * 1000, 3); // 99 intervals of a 511-interval screen, not the full width
    expect(xs.at(-1)).toBeLessThan(250);
  });

  it('cursor deltas come from real sample spacing, and are blank beyond the captured samples', () => {
    const full: ScopeTrace = { t0Ms: 0, dtMs: 100 * 10 / 511, channels: [Array.from({ length: 512 }, (_, i) => i / 100), []], triggered: true };
    const s = { ...scopeSettings({ timeDiv: 100, trigger: 0 }), c1: 0.2, c2: 0.7 };
    const c = scopeCursors(full, s);
    expect(c.dtMs).toBeCloseTo(0.5 * 1000, -1); // half of a 10-division, 100 ms/div screen
    expect(c.dv).not.toBeNull();
    const partial: ScopeTrace = { ...full, channels: [full.channels[0]!.slice(0, 100), []], triggered: false };
    expect(scopeCursors(partial, { ...s, c1: 0.05, c2: 0.9 }).dv).toBeNull();
    expect(scopeCursors(partial, { ...s, c1: 0.05, c2: 0.1 }).dv).not.toBeNull();
  });
});
