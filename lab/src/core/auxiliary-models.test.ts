import { describe, expect, it } from 'vitest';
import { newTransientState, solveCircuit, type SolveContext } from './solver';
import type { Analysis, PartInstance, Scene } from './types';

const part = (id: string, kind: PartInstance['kind'], props: PartInstance['props'] = {}): PartInstance =>
  ({ id, kind, props, pos: [0, 0, 0], rotY: 0 });
function run(parts: PartInstance[], connections: Record<string, string>, inputs: Record<string, Record<string, number | boolean>> = {}, context: SolveContext = {}) {
  const scene: Scene = { version: 2, code: '', parts, wires: [] };
  const ids = [...new Set(Object.values(connections))];
  const analysis: Analysis = { pinToNet: connections, insertions: {}, warnings: [],
    nets: ids.map(id => ({ id, pins: Object.entries(connections).filter(([, net]) => net === id).map(([ref]) => {
      const index = ref.indexOf(':'); return { partId: ref.slice(0, index), pinId: ref.slice(index + 1) };
    }) })) };
  return solveCircuit(scene, analysis, {}, inputs, {}, context);
}

describe('auxiliary v2 electrical models', () => {
  it('TMP36 gives 0.75 V at 25 °C only while powered', () => {
    const sensor = part('t', 'tmp36');
    const pins = { 't:VCC': 'v', 't:GND': 'g', 't:OUT': 'o', 'b:+': 'v', 'b:-': 'g' };
    const powered = run([part('b', 'battery-9v'), sensor], pins, { t: { temperature: 25 } });
    expect(powered.netVolts.o).toBeCloseTo(.75, 2);
    const unpowered = run([sensor], { 't:VCC': 'v', 't:GND': 'g', 't:OUT': 'o' }, { t: { temperature: 25 } });
    expect(unpowered.netVolts.o).toBeLessThan(.1);
  });

  it('flex resistance rises and force resistance falls across input endpoints', () => {
    for (const [kind, key, low, high, increasing] of [
      ['flex-sensor', 'bend', 0, 1, true], ['force-sensor', 'force', 0, 100, false],
    ] as const) {
      const parts = [part('b', 'battery-9v'), part('s', kind)];
      const pins = { 'b:+': 'v', 'b:-': 'g', 's:1': 'v', 's:2': 'g' };
      const a = run(parts, pins, { s: { [key]: low } }).currents.s!;
      const b = run(parts, pins, { s: { [key]: high } }).currents.s!;
      expect(increasing ? a > b : b > a).toBe(true);
    }
  });

  it('moisture and gas analog outputs stay within powered rails and go off unpowered', () => {
    for (const [kind, key] of [['soil-moisture', 'moisture'], ['gas-sensor', 'gas']] as const) {
      const sensor = part('s', kind);
      const pins = { 's:VCC': 'v', 's:GND': 'g', 's:AO': 'a', 's:DO': 'd', 'b:+': 'v', 'b:-': 'g' };
      const powered = run([part('b', 'battery-aa-pack', { cells: 3 }), sensor], pins, { s: { [key]: 75 } });
      expect(powered.netVolts.a).toBeGreaterThan(2);
      expect(powered.netVolts.a).toBeLessThanOrEqual(4.5);
      expect(powered.netVolts.d).toBeGreaterThan(3);
      const off = run([sensor], { 's:VCC': 'v', 's:GND': 'g', 's:AO': 'a', 's:DO': 'd' }, { s: { [key]: 75 } });
      expect(off.netVolts.a).toBeLessThan(.1);
      expect(off.netVolts.d).toBeLessThan(.1);
    }
  });

  it('bulb filament current decreases as its temperature rises', () => {
    const state = newTransientState();
    const parts = [part('b', 'battery-9v'), part('lamp', 'light-bulb')];
    const pins = { 'b:+': 'v', 'b:-': 'g', 'lamp:1': 'v', 'lamp:2': 'g' };
    const cold = run(parts, pins, {}, { state, dtMs: 1 }).currents.lamp!;
    for (let n = 0; n < 20; n++) run(parts, pins, {}, { state, dtMs: 20 });
    const hot = run(parts, pins, {}, { state, dtMs: 20 }).currents.lamp!;
    expect(hot).toBeLessThan(cold);
  });

  it('vibration and geared motors respond to applied polarity', () => {
    const parts = [part('b', 'battery-9v'), part('v', 'vibration-motor'), part('m', 'gearmotor')];
    const forward = run(parts, { 'b:+': 'p', 'b:-': 'g', 'v:+': 'p', 'v:-': 'g', 'm:+': 'p', 'm:-': 'g' });
    expect(forward.parts.v?.vibration?.on).toBe(true);
    expect(forward.parts.m?.motor?.rpm).toBeGreaterThan(0);
    expect(forward.parts.m?.motor?.direction).toBe(1);
    const reverse = run(parts, { 'b:+': 'p', 'b:-': 'g', 'v:+': 'g', 'v:-': 'p', 'm:+': 'g', 'm:-': 'p' });
    expect(reverse.parts.m?.motor?.direction).toBe(-1);
  });

  it('relay transfers COM from NC to NO when the coil is energized', () => {
    const parts = [part('b', 'battery-9v'), part('r', 'relay-spdt'), part('load', 'resistor', { ohms: 1000 })];
    const pins = { 'b:+': 'p', 'b:-': 'g', 'r:COIL+': 'p', 'r:COIL-': 'g', 'r:COM': 'p', 'r:NO': 'no', 'r:NC': 'nc', 'load:1': 'no', 'load:2': 'g' };
    const energized = run(parts, pins);
    expect(energized.parts.r?.relay?.closed).toBe(true);
    expect(energized.netVolts.no).toBeGreaterThan(8);
    const off = run(parts, { ...pins, 'r:COIL+': 'g' });
    expect(off.parts.r?.relay?.closed).toBe(false);
    expect(off.netVolts.no).toBeLessThan(1);
  });

  it('opto collector current follows its input LED current and configured CTR', () => {
    const parts = [part('b', 'battery-9v'), part('r', 'resistor', { ohms: 1000 }), part('pull', 'resistor', { ohms: 100 }), part('o', 'optocoupler-4n35', { ctr: 100 })];
    const pins = { 'b:+': 'p', 'b:-': 'g', 'r:1': 'p', 'r:2': 'a', 'o:1': 'a', 'o:2': 'g',
      'pull:1': 'p', 'pull:2': 'c', 'o:5': 'c', 'o:4': 'g' };
    const driven = run(parts, pins);
    const on = driven.netVolts.c!;
    const off = run(parts, { ...pins, 'r:2': 'g' }).netVolts.c!;
    const ledAmps = driven.currents.r!;
    const collectorAmps = (driven.netVolts.p! - on) / 100;
    expect(ledAmps).toBeGreaterThan(.005);
    expect(collectorAmps / ledAmps).toBeGreaterThan(.9);
    expect(collectorAmps / ledAmps).toBeLessThan(1.1);
    expect(on).toBeLessThan(off - .5);
    expect(off).toBeGreaterThan(8);
  });

  it('measures unpowered resistance/continuity and warns when a source is wired to the probes', () => {
    const meter = part('m', 'multimeter', { mode: 'Ω' });
    const pins = { 'm:V': 'a', 'm:COM': 'g', 'r:1': 'a', 'r:2': 'g' };
    const unpowered = run([meter, part('r', 'resistor', { ohms: 220 })], pins);
    expect(Number.parseFloat(unpowered.parts.m!.meter!.reading)).toBeCloseTo(220, 0);
    expect(unpowered.warnings.some(w => w.id === 'meter-powered:m')).toBe(false);
    const continuity = run([part('m', 'multimeter', { mode: 'continuity' }), part('r', 'resistor', { ohms: 10 })], pins);
    expect(continuity.parts.m?.meter?.continuity).toBe(true);
    const openOhms = run([meter], { 'm:V': 'a', 'm:COM': 'g' });
    expect(openOhms.parts.m?.meter?.reading).toMatch(/OL|개방/);
    const openContinuity = run([part('m', 'multimeter', { mode: 'continuity' })], { 'm:V': 'a', 'm:COM': 'g' });
    expect(openContinuity.parts.m?.meter?.continuity).toBe(false);
    const powered = run([meter, part('r', 'resistor', { ohms: 220 }), part('b', 'battery-9v')],
      { ...pins, 'b:+': 'a', 'b:-': 'g' });
    expect(powered.warnings.some(w => w.id === 'meter-powered:m')).toBe(true);
    const indirect = run([meter, part('r', 'resistor', { ohms: 220 }), part('bridge', 'resistor', { ohms: 1000 }), part('b', 'battery-9v')],
      { ...pins, 'b:+': 's', 'b:-': 'g', 'bridge:1': 's', 'bridge:2': 'a' });
    expect(indirect.warnings.some(w => w.id === 'meter-powered:m')).toBe(true);
    expect(indirect.parts.m?.meter?.reading).not.toMatch(/^\d/);
  });
});
