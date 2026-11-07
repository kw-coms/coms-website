import { describe, expect, it } from 'vitest';
import { solveCircuit, newTransientState } from './solver';
import type { Analysis, PartInstance, Scene } from './types';

const p = (id: string, kind: PartInstance['kind'], props: PartInstance['props'] = {}): PartInstance =>
  ({ id, kind, pos: [0, 0, 0], rotY: 0, props });
function run(parts: PartInstance[], refs: Record<string, string>, context = {}) {
  const scene: Scene = { version: 2, parts, wires: [], code: '' };
  const nets = [...new Set(Object.values(refs))].map(id => ({ id, pins: Object.entries(refs)
    .filter(([, net]) => net === id).map(([ref]) => { const [partId, pinId] = ref.split(':'); return { partId: partId!, pinId: pinId! }; }) }));
  const analysis: Analysis = { nets, pinToNet: refs, insertions: {}, warnings: [] };
  return solveCircuit(scene, analysis, {}, {}, {}, context);
}

describe('semiconductor and supply acceptance against circuit calculations', () => {
  it('a silicon diode drops roughly 0.6 V at several mA', () => {
    const result = run([p('bat', 'battery-9v'), p('r', 'resistor', { ohms: 1000 }), p('d', 'diode')], {
      'bat:+': 's', 'bat:-': 'g', 'r:1': 's', 'r:2': 'a', 'd:A': 'a', 'd:K': 'g',
    });
    expect(result.netVolts.a).toBeGreaterThan(0.5);
    expect(result.netVolts.a).toBeLessThan(0.8);
    expect(result.currents.d).toBeGreaterThan(0.005);
  });

  it('a reverse 5.1 V zener clamps a 9 V / 1 kΩ feed near its rated voltage', () => {
    const result = run([p('bat', 'battery-9v'), p('r', 'resistor', { ohms: 1000 }), p('z', 'zener', { vz: 5.1 })], {
      'bat:+': 's', 'bat:-': 'g', 'r:1': 's', 'r:2': 'out', 'z:K': 'out', 'z:A': 'g',
    });
    expect(result.netVolts.out).toBeGreaterThan(4.9);
    expect(result.netVolts.out).toBeLessThan(5.5);
    expect(result.currents.z).toBeGreaterThan(0.002);
  });

  it('an NPN with 1 kΩ base drive saturates a 100 Ω collector load', () => {
    const result = run([p('uno', 'arduino-uno'), p('rb', 'resistor', { ohms: 1000 }),
      p('rc', 'resistor', { ohms: 100 }), p('q', 'npn')], {
      'uno:5V': 'v', 'uno:GND.1': 'g', 'rb:1': 'v', 'rb:2': 'base',
      'rc:1': 'v', 'rc:2': 'collector', 'q:B': 'base', 'q:C': 'collector', 'q:E': 'g',
    });
    const collector = result.netVolts.collector!;
    const collectorCurrent = (result.netVolts.v! - collector) / 100;
    expect(collector).toBeGreaterThanOrEqual(0);
    expect(collector).toBeLessThan(0.3);
    expect(collectorCurrent).toBeGreaterThan(0.04);
    expect(collectorCurrent).toBeLessThanOrEqual(0.06);
    expect(result.currents.q).toBeCloseTo(collectorCurrent, 2);
  });

  it('a weakly driven NPN in forward-active mode amplifies base current about beta times', () => {
    const result = run([p('uno', 'arduino-uno'), p('rb', 'resistor', { ohms: 1_000_000 }),
      p('rc', 'resistor', { ohms: 1000 }), p('q', 'npn', { beta: 100 })], {
      'uno:5V': 'v', 'uno:GND.1': 'g', 'rb:1': 'v', 'rb:2': 'base',
      'rc:1': 'v', 'rc:2': 'collector', 'q:B': 'base', 'q:C': 'collector', 'q:E': 'g',
    });
    const baseCurrent = (result.netVolts.v! - result.netVolts.base!) / 1_000_000;
    const collectorCurrent = (result.netVolts.v! - result.netVolts.collector!) / 1000;
    expect(result.netVolts.collector).toBeGreaterThan(1);
    expect(collectorCurrent / baseCurrent).toBeGreaterThan(70);
    expect(collectorCurrent / baseCurrent).toBeLessThan(130);
  });

  it('a PNP high-side switch conducts with base pulled below emitter', () => {
    const result = run([p('uno', 'arduino-uno'), p('rb', 'resistor', { ohms: 1000 }),
      p('load', 'resistor', { ohms: 100 }), p('q', 'pnp')], {
      'uno:5V': 'v', 'uno:GND.1': 'g', 'q:E': 'v', 'q:B': 'base', 'q:C': 'out',
      'rb:1': 'base', 'rb:2': 'g', 'load:1': 'out', 'load:2': 'g',
    });
    expect(result.netVolts.out).toBeGreaterThan(4.5);
  });

  it('TIP120 Darlington requires about two base-emitter drops', () => {
    const result = run([p('uno', 'arduino-uno'), p('r', 'resistor', { ohms: 1000 }), p('q', 'tip120')], {
      'uno:5V': 'v', 'uno:GND.1': 'g', 'r:1': 'v', 'r:2': 'base',
      'q:B': 'base', 'q:E': 'g', 'q:C': 'v',
    });
    expect(result.netVolts.base).toBeGreaterThan(1.0);
    expect(result.netVolts.base).toBeLessThan(1.6);
  });

  it('logic-level NMOS behaves as a low-resistance switch when gate is at 5 V', () => {
    const result = run([p('uno', 'arduino-uno'), p('load', 'resistor', { ohms: 100 }), p('q', 'nmos')], {
      'uno:5V': 'v', 'uno:GND.1': 'g', 'load:1': 'v', 'load:2': 'drain',
      'q:G': 'v', 'q:D': 'drain', 'q:S': 'g',
    });
    expect(result.netVolts.drain).toBeLessThan(0.2);
    expect(result.currents.q).toBeGreaterThan(0.045);
    const loadCurrent = (result.netVolts.v! - result.netVolts.drain!) / 100;
    const apparentRon = result.netVolts.drain! / loadCurrent;
    expect(apparentRon).toBeGreaterThan(0.03);
    expect(apparentRon).toBeLessThan(0.2);
  });

  it('NMOS saturation current grows approximately with gate overdrive squared', () => {
    const build = (upper: number, lower: number) => run([
      p('source', 'power-supply', { volts: 9 }), p('upper', 'resistor', { ohms: upper }),
      p('lower', 'resistor', { ohms: lower }), p('drainLoad', 'resistor', { ohms: 10 }), p('q', 'nmos', { thresholdVolts: 2 }),
    ], {
      'source:OUT+': 'v', 'source:OUT-': 'g', 'upper:1': 'v', 'upper:2': 'gate',
      'lower:1': 'gate', 'lower:2': 'g', 'drainLoad:1': 'v', 'drainLoad:2': 'drain',
      'q:G': 'gate', 'q:D': 'drain', 'q:S': 'g',
    });
    // Vgs 2.05 and 2.10 V keep Vds much larger than Vgs−Vth; the
    // level-1 model then predicts a 4:1 current ratio (overdrive squared).
    const low = build(3390, 1000), high = build(3286, 1000);
    const lowCurrent = (low.netVolts.v! - low.netVolts.drain!) / 10;
    const highCurrent = (high.netVolts.v! - high.netVolts.drain!) / 10;
    expect(low.netVolts.drain).toBeGreaterThan(4);
    expect(high.netVolts.drain).toBeGreaterThan(4);
    expect(highCurrent / lowCurrent).toBeGreaterThan(3);
    expect(highCurrent / lowCurrent).toBeLessThan(5);
  });

  it('7805 regulates at 9 V input and falls below 5 V under dropout', () => {
    const parts = [p('source', 'power-supply', { volts: 9 }), p('reg', 'regulator-7805'), p('load', 'resistor', { ohms: 1000 })];
    const refs = { 'source:OUT+': 'in', 'source:OUT-': 'g', 'reg:IN': 'in', 'reg:GND': 'g',
      'reg:OUT': 'out', 'load:1': 'out', 'load:2': 'g' };
    const regulated = run(parts, refs);
    expect(regulated.netVolts.out).toBeGreaterThan(4.8);
    expect(regulated.netVolts.out).toBeLessThan(5.1);
    const dropout = run([p('source', 'power-supply', { volts: 6 }), ...parts.slice(1)], refs);
    expect(dropout.netVolts.out).toBeGreaterThan(3.7);
    expect(dropout.netVolts.out).toBeLessThan(4.2);
  });

  it('a 5 V supply with 0.1 A limit delivers CC into 10 Ω', () => {
    const result = run([p('source', 'power-supply', { volts: 5, currentLimit: .1 }), p('load', 'resistor', { ohms: 10 })], {
      'source:OUT+': 'out', 'source:OUT-': 'g', 'load:1': 'out', 'load:2': 'g',
    });
    expect(result.netVolts.out).toBeGreaterThan(.9);
    expect(result.netVolts.out).toBeLessThan(1.1);
    expect(result.parts.source?.supply?.limiting).toBe(true);
  });

  it('a 10 mH inductor initially opposes a 1 ms current rise', () => {
    const state = newTransientState();
    const parts = [p('source', 'power-supply', { volts: 5 }), p('coil', 'inductor', { millihenries: 10 }), p('r', 'resistor', { ohms: 10 })];
    const refs = {
      'source:OUT+': 'v', 'source:OUT-': 'g', 'coil:1': 'v', 'coil:2': 'mid',
      'r:1': 'mid', 'r:2': 'g',
    };
    const voltages = Array.from({ length: 5 }, () => run(parts, refs, { state, dtMs: 1 }).netVolts.mid!);
    expect(voltages[0]).toBeGreaterThan(2.4);
    expect(voltages[0]).toBeLessThan(2.6);
    for (let i = 1; i < voltages.length; i++) expect(voltages[i]).toBeGreaterThan(voltages[i - 1]!);
    expect(voltages.at(-1)).toBeLessThan(5.01);
    expect(voltages.at(-1)).toBeGreaterThan(4.5);
  });
});
