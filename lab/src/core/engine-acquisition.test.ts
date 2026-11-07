import { describe, expect, it } from 'vitest';
import { SimulationEngine } from './engine';
import { V2_EXAMPLES } from './examples-v2';
import type { PartInstance, Scene, Wire } from './types';

const part = (id: string, kind: PartInstance['kind'], props: PartInstance['props'] = {}): PartInstance =>
  ({ id, kind, pos: [0, 0, 0], rotY: 0, props });

function circuit(parts: PartInstance[], links: [string, string][]): Scene {
  const pin = (ref: string) => {
    const [partId, pinId] = ref.split(':');
    return { partId: partId!, pinId: pinId! };
  };
  return { version: 2, parts, code: '', wires: links.map(([from, to], index): Wire => ({
    id: `w${index}`, from: pin(from), to: pin(to), color: 'blue',
  })) };
}

function editProp(scene: Scene, id: string, key: string, value: number): Scene {
  const next = structuredClone(scene);
  next.parts.find(part => part.id === id)!.props[key] = value;
  return next;
}

function engineFor(scene: Scene): SimulationEngine {
  const engine = new SimulationEngine();
  engine.setScene(scene);
  return engine;
}

const rc = () => circuit([
  part('s', 'power-supply', { volts: 5 }),
  part('r', 'resistor', { ohms: 10_000 }),
  part('c', 'capacitor-electrolytic', { capacitance: 100 }),
  part('scope', 'oscilloscope', { timeDiv: 100, trigger: 2.5 }),
  part('logic', 'logic-analyzer', { timeDiv: 100 }),
], [
  ['s:OUT+', 'r:1'], ['r:2', 'c:+'], ['c:-', 's:OUT-'],
  ['scope:CH1', 'c:+'], ['scope:GND', 's:OUT-'],
  ['logic:D0', 'c:+'], ['logic:GND', 's:OUT-'],
]);

describe('instrument acquisition edits preserve the running circuit', () => {
  it('keeps a charged RC and simulated time through scope timeDiv and trigger edits', () => {
    let scene = rc();
    const engine = engineFor(scene);
    const charged = engine.step(16_000_000);
    const voltage = charged.parts.c!.capacitor!.volts;
    expect(charged.timeMs).toBe(1000);
    expect(voltage).toBeCloseTo(3.1606, 3);
    expect(charged.scopes!.scope!.dtMs).toBeCloseTo(1000 / 511);
    const logicBefore = charged.logic!.logic!;

    scene = editProp(scene, 'scope', 'timeDiv', 200);
    engine.setScene(scene);
    const resized = engine.frame();
    expect(resized.timeMs).toBe(1000);
    expect(resized.parts.c!.capacitor!.volts).toBeCloseTo(voltage, 3);
    expect(resized.scopes!.scope!.dtMs).toBeCloseTo(2000 / 511);
    expect(resized.logic!.logic).toEqual(logicBefore);

    scene = editProp(scene, 'scope', 'trigger', 4);
    engine.setScene(scene);
    const retuned = engine.frame();
    expect(retuned.timeMs).toBe(1000);
    expect(retuned.parts.c!.capacitor!.volts).toBeCloseTo(voltage, 3);
    expect(retuned.scopes!.scope!.channels[0]).toHaveLength(1);
    expect(retuned.scopes!.scope!.triggered).toBe(false);
    expect(engine.step(160_000).parts.c!.capacitor!.volts).toBeGreaterThan(voltage);
  }, 30_000);

  it('keeps MCU cycles and RAM while retuning a connected instrument', () => {
    const scene = circuit([
      part('uno', 'arduino-uno'),
      part('scope', 'oscilloscope', { timeDiv: 1 }),
    ], [['scope:CH1', 'uno:5V'], ['scope:GND', 'uno:GND.1']]);
    const engine = engineFor(scene);
    engine.step(16_000);
    engine.mcu.cpu.data[0x100] = 0x5a;
    const cycles = engine.mcu.cpu.cycles;
    engine.setScene(editProp(scene, 'scope', 'timeDiv', 2));
    expect(engine.mcu.cpu.cycles).toBe(cycles);
    expect(engine.mcu.cpu.data[0x100]).toBe(0x5a);
    expect(engine.frame().scopes!.scope!.dtMs).toBeCloseTo(20 / 511);
  });

  it('keeps inductor current through an analyzer capture change', () => {
    let scene = circuit([
      part('s', 'power-supply', { volts: 5 }),
      part('coil', 'inductor', { millihenries: 1000, seriesOhms: .01 }),
      part('load', 'resistor', { ohms: 10 }),
      part('logic', 'logic-analyzer', { timeDiv: 10 }),
    ], [
      ['s:OUT+', 'coil:1'], ['coil:2', 'load:1'], ['load:2', 's:OUT-'],
      ['logic:D0', 'load:1'], ['logic:GND', 's:OUT-'],
    ]);
    const engine = engineFor(scene);
    const current = engine.step(20 * 16_000).netVolts[engine.analysis.pinToNet['load:1']!]! / 10;
    expect(current).toBeGreaterThan(.05);
    expect(current).toBeLessThan(.15);

    scene = editProp(scene, 'logic', 'timeDiv', 20);
    engine.setScene(scene);
    const after = engine.frame();
    expect(after.timeMs).toBe(20);
    expect(after.netVolts[engine.analysis.pinToNet['load:1']!]! / 10).toBeCloseTo(current, 3);
    expect(after.logic!.logic!.dtMs).toBeCloseTo(200 / 511);
    const next = engine.step(5 * 16_000);
    expect(next.netVolts[engine.analysis.pinToNet['load:1']!]! / 10).toBeGreaterThan(current);
  }, 30_000);

  it('retains a running 555 state while editing a scope', () => {
    const scene = structuredClone(V2_EXAMPLES.find(example => example.id === 'timer-555-blink')!.scene);
    scene.parts.push(part('scope', 'oscilloscope', { timeDiv: 100, trigger: 4 }));
    scene.wires.push(
      { id: 'scope-out', from: { partId: 'scope', pinId: 'CH1' }, to: { partId: 'ic', pinId: '3' }, color: 'blue' },
      { id: 'scope-ground', from: { partId: 'scope', pinId: 'GND' }, to: { partId: 'battery', pinId: '-' }, color: 'black' },
    );
    const engine = engineFor(scene);
    const control = engineFor(scene);
    const before = engine.step(16_000_000);
    control.step(16_000_000);
    expect(before.parts.c!.capacitor!.volts).toBeGreaterThan(0);
    engine.setScene(editProp(scene, 'scope', 'trigger', 6));
    const after = engine.frame();
    expect(after.timeMs).toBe(before.timeMs);
    expect(after.parts.c!.capacitor!.volts).toBeCloseTo(before.parts.c!.capacitor!.volts, 3);
    expect(after.parts.ic!.ic!.outputs['3']).toBe(before.parts.ic!.ic!.outputs['3']);
    for (let n = 0; n < 10; n++) {
      const actual = engine.step(200 * 16_000);
      const expected = control.step(200 * 16_000);
      expect(actual.parts.c!.capacitor!.volts).toBeCloseTo(expected.parts.c!.capacitor!.volts, 3);
      expect(actual.parts.ic!.ic!.outputs['3']).toBe(expected.parts.ic!.ic!.outputs['3']);
    }
  }, 30_000);

  it('still applies electrical edits to a function generator and resistor', () => {
    let scene = circuit([
      part('gen', 'function-generator', { waveform: 'sine', frequencyHz: 1, amplitudeVolts: 2.5, offsetVolts: 2.5 }),
      part('load', 'resistor', { ohms: 1000 }),
    ], [['gen:OUT', 'load:1'], ['load:2', 'gen:GND']]);
    const engine = engineFor(scene);
    const output = () => {
      const frame = engine.frame();
      return frame.netVolts[engine.analysis.pinToNet['gen:OUT']!]!
        - frame.netVolts[engine.analysis.pinToNet['gen:GND']!]!;
    };
    engine.step(250 * 16_000);
    const initial = output();
    expect(initial).toBeGreaterThan(4);
    scene = editProp(scene, 'gen', 'frequencyHz', 2);
    engine.setScene(scene);
    const afterFrequency = output();
    expect(afterFrequency).toBeLessThan(initial - 1);
    scene = editProp(scene, 'load', 'ohms', .1);
    engine.setScene(scene);
    expect(engine.frame().timeMs).toBe(250);
    expect(output()).toBeLessThan(afterFrequency / 2);
  }, 30_000);
});
