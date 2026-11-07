import { describe, expect, it } from 'vitest';
import { newTransientState, solveCircuit } from './solver';
import type { Analysis, PartInstance, Scene } from './types';
const part = (id: string, kind: PartInstance['kind'], props: PartInstance['props'] = {}): PartInstance => ({ id, kind, pos: [0, 0, 0], rotY: 0, props });
function circuit(parts: PartInstance[], connections: Record<string, string>) {
  const scene: Scene = { version: 2, parts, wires: [], code: '' };
  const nets = [...new Set(Object.values(connections))].map(id => ({ id, pins: Object.entries(connections).filter(([, n]) => n === id).map(([ref]) => { const [partId, pinId] = ref.split(':'); return { partId: partId!, pinId: pinId! }; }) }));
  const analysis: Analysis = { nets, pinToNet: connections, insertions: {}, warnings: [] };
  return { scene, analysis };
}
describe('v2 analog devices', () => {
  it('charges a 100 µF capacitor through 10 kΩ with a one-second time constant', () => {
    const { scene, analysis } = circuit([part('bat', 'power-supply', { volts: 5 }), part('r', 'resistor', { ohms: 10000 }), part('c', 'capacitor-electrolytic', { capacitance: 100 })], { 'bat:OUT+': 'v', 'bat:OUT-': 'g', 'r:1': 'v', 'r:2': 'x', 'c:+': 'x', 'c:-': 'g' });
    const state = newTransientState();
    let result;
    for (let i = 0; i < 100; i++) result = solveCircuit(scene, analysis, {}, {}, {}, { dtMs: 10, timeMs: (i + 1) * 10, state });
    expect(result!.netVolts.x).toBeGreaterThan(3.0);
    expect(result!.netVolts.x).toBeLessThan(3.3);
  });
  it('forward biases diode to roughly 0.6 V through 1 kΩ', () => {
    const { scene, analysis } = circuit([part('bat', 'power-supply', { volts: 5 }), part('r', 'resistor', { ohms: 1000 }), part('d', 'diode')], { 'bat:OUT+': 'v', 'bat:OUT-': 'g', 'r:1': 'v', 'r:2': 'a', 'd:A': 'a', 'd:K': 'g' });
    const result = solveCircuit(scene, analysis);
    expect(result.netVolts.a).toBeGreaterThan(.5);
    expect(result.netVolts.a).toBeLessThan(.8);
  });
});
describe('independent source references', () => {
  it('adds two 9 V batteries in series', () => {
    const { scene, analysis } = circuit([part('a', 'battery-9v'), part('b', 'battery-9v'), part('r', 'resistor', { ohms: 1000 })], {
      'a:-': 'g', 'a:+': 'mid', 'b:-': 'mid', 'b:+': 'top', 'r:1': 'top', 'r:2': 'g',
    });
    const result = solveCircuit(scene, analysis);
    expect(result.netVolts.top).toBeGreaterThan(17.9);
    expect(result.netVolts.top).toBeLessThan(18.1);
  });
  it('keeps separate source loops electrically independent', () => {
    const { scene, analysis } = circuit([part('a', 'battery-9v'), part('b', 'battery-9v'), part('r1', 'resistor', { ohms: 1000 }), part('r2', 'resistor', { ohms: 1000 })], {
      'a:-': 'g1', 'a:+': 'v1', 'r1:1': 'v1', 'r1:2': 'g1',
      'b:-': 'g2', 'b:+': 'v2', 'r2:1': 'v2', 'r2:2': 'g2',
    });
    const result = solveCircuit(scene, analysis);
    expect(result.netVolts.v1! - result.netVolts.g1!).toBeCloseTo(9, 1);
    expect(result.netVolts.v2! - result.netVolts.g2!).toBeCloseTo(9, 1);
  });
});
it('transfers a relay contact on the first DC solve', () => {
  const { scene, analysis } = circuit([part('source', 'power-supply', { volts: 5 }), part('relay', 'relay-spdt')], {
    'source:OUT+': 'v', 'source:OUT-': 'g', 'relay:COIL+': 'v', 'relay:COIL-': 'g',
    'relay:COM': 'v', 'relay:NO': 'out', 'relay:NC': 'nc',
  });
  const result = solveCircuit(scene, analysis);
  expect(result.netVolts.out).toBeGreaterThan(4.9);
  expect(result.parts.relay?.relay?.closed).toBe(true);
});
it('does not call normal internal-resistance voltage drop current limiting', () => {
  const { scene, analysis } = circuit([part('s', 'power-supply', { volts: 5, currentLimit: 1 }), part('r', 'resistor', { ohms: 6 })], {
    's:OUT+': 'v', 's:OUT-': 'g', 'r:1': 'v', 'r:2': 'g',
  });
  const result = solveCircuit(scene, analysis);
  expect(result.parts.s!.supply!.amps).toBeGreaterThan(.8);
  expect(result.parts.s!.supply!.limiting).toBe(false);
});
