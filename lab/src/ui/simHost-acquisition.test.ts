import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SimulationEngine } from '../core/engine';
import type { PartInstance, Scene, Wire } from '../core/types';
import { sim } from './simHost';
import { liveWire, loadScene, redo, setProp, undo, updateWire } from './store';

const part = (id: string, kind: PartInstance['kind'], props: PartInstance['props']): PartInstance =>
  ({ id, kind, pos: [0, 0, 0], rotY: 0, props });

const wire = (id: string, fromPart: string, fromPin: string, toPart: string, toPin: string): Wire => ({
  id, from: { partId: fromPart, pinId: fromPin }, to: { partId: toPart, pinId: toPin }, color: 'blue',
});

const rc = (): Scene => ({ version: 2, code: '', parts: [
  part('s', 'power-supply', { volts: 5 }),
  part('r', 'resistor', { ohms: 10_000 }),
  part('c', 'capacitor-electrolytic', { capacitance: 100 }),
  part('scope', 'oscilloscope', { timeDiv: 100, trigger: 2.5 }),
], wires: [
  wire('supply', 's', 'OUT+', 'r', '1'),
  wire('load', 'r', '2', 'c', '+'),
  wire('return', 'c', '-', 's', 'OUT-'),
  wire('probe', 'scope', 'CH1', 'c', '+'),
  wire('probe-ground', 'scope', 'GND', 's', 'OUT-'),
] });

// Vitest has no Worker, so simHost uses LocalSimulator. Its engine is read here
// only to advance simulated time without relying on wall-clock timers.
const engine = () => Reflect.get(sim, 'engine') as SimulationEngine;
const voltage = () => engine().frame().parts.c!.capacitor!.volts;

describe('simHost visual edits followed by acquisition edits', () => {
  beforeEach(() => { sim.stop(); loadScene(rc()); });
  afterEach(() => vi.restoreAllMocks());

  it('keeps a charged RC after skipped wire styling and scope timeDiv/trigger edits', () => {
    const charged = engine().step(16_000_000);
    expect(charged.timeMs).toBe(1000);
    expect(charged.parts.c!.capacitor!.volts).toBeCloseTo(3.1606, 3);
    const setScene = vi.spyOn(sim, 'setScene');
    updateWire('load', { color: 'red', bends: [[20, 0, 20]] });
    expect(setScene).not.toHaveBeenCalled();

    expect(setProp('scope', 'timeDiv', 200)).toBeNull();
    expect(setScene).toHaveBeenCalledTimes(1);
    expect(voltage()).toBeCloseTo(charged.parts.c!.capacitor!.volts, 3);
    expect(engine().frame().scopes!.scope!.dtMs).toBeCloseTo(2000 / 511);

    updateWire('load', { color: 'blue', bends: [[30, 0, 25]] });
    expect(setScene).toHaveBeenCalledTimes(1);
    expect(setProp('scope', 'trigger', 4)).toBeNull();
    expect(setScene).toHaveBeenCalledTimes(2);
    expect(engine().frame().timeMs).toBe(1000);
    expect(voltage()).toBeCloseTo(charged.parts.c!.capacitor!.volts, 3);
    expect(engine().step(160_000).parts.c!.capacitor!.volts).toBeGreaterThan(charged.parts.c!.capacitor!.volts);
  }, 30_000);

  it('keeps the same charge through acquisition undo and redo', () => {
    const before = engine().step(16_000_000).parts.c!.capacitor!.volts;
    expect(setProp('scope', 'timeDiv', 200)).toBeNull();
    expect(voltage()).toBeCloseTo(before, 3);
    const setScene = vi.spyOn(sim, 'setScene');
    liveWire('load', { color: 'red', bends: [[20, 0, 20]] });
    expect(setScene).not.toHaveBeenCalled();
    undo(); // live visual drag has no history entry; undo reverts timeDiv directly
    expect(setScene).toHaveBeenCalledTimes(1);
    expect(engine().frame().scopes!.scope!.dtMs).toBeCloseTo(1000 / 511);
    expect(voltage()).toBeCloseTo(before, 3);
    redo();
    expect(engine().frame().scopes!.scope!.dtMs).toBeCloseTo(2000 / 511);
    expect(engine().frame().timeMs).toBe(1000);
    expect(voltage()).toBeCloseTo(before, 3);
  }, 30_000);

  it('rebuilds when a wire pin endpoint moves', () => {
    const before = engine().step(16_000_000).parts.c!.capacitor!.volts;
    expect(before).toBeGreaterThan(3);
    const setScene = vi.spyOn(sim, 'setScene');
    updateWire('load', { to: { partId: 'c', pinId: '-' } });
    expect(setScene).toHaveBeenCalledTimes(1);
    expect(engine().analysis.pinToNet['r:2']).toBe(engine().analysis.pinToNet['c:-']);
    expect(voltage()).toBeLessThan(.1);
  }, 30_000);
});
