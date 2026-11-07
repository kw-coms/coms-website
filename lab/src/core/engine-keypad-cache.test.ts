import { expect, it, vi } from 'vitest';
import { SimulationEngine } from './engine';
import { BehavioralDevices } from './behavioral';
import type { Scene } from './types';

const scene: Scene = {
  version: 2, code: '',
  parts: [
    { id: 'uno', kind: 'arduino-uno', pos: [0, 0, 0], rotY: 0, props: {} },
    { id: 'pad', kind: 'keypad-4x4', pos: [0, 0, 0], rotY: 0, props: {} },
  ],
  wires: [
    { id: 'row', from: { partId: 'uno', pinId: 'D2' }, to: { partId: 'pad', pinId: '1' }, color: 'blue' },
    { id: 'column', from: { partId: 'uno', pinId: 'D6' }, to: { partId: 'pad', pinId: '5' }, color: 'blue' },
  ],
};

it('reuses a settled keypad state while preserving column reads and invalidates it on key changes', () => {
  const engine = new SimulationEngine();
  engine.setScene(scene);
  engine.setInput({ partId: 'pad', key: 'key', value: 1 });
  engine.mcu.cpu.writeData(0x2b, 0x40); // D6 input pull-up; D2 output LOW.
  engine.mcu.cpu.writeData(0x2a, 0x04);
  expect(engine.frame().pins.D6?.level).toBe(0);
  const tick = vi.spyOn(BehavioralDevices.prototype, 'tick');
  engine.mcu.cpu.writeData(0x2b, 0x44); // Same row HIGH: key no longer pulls column LOW.
  expect(engine.frame().pins.D6?.level).toBe(1);
  tick.mockClear();
  engine.mcu.cpu.writeData(0x2b, 0x40); // Return to an exact state already solved.
  expect(engine.frame().pins.D6?.level).toBe(0);
  expect(tick).not.toHaveBeenCalled();
  engine.setInput({ partId: 'pad', key: 'key', value: 0 });
  expect(engine.frame().pins.D6?.level).toBe(1);
  expect(tick).toHaveBeenCalled();
  tick.mockClear();
  engine.reset();
  engine.mcu.cpu.writeData(0x2b, 0x40);
  engine.mcu.cpu.writeData(0x2a, 0x04);
  engine.frame();
  expect(tick).toHaveBeenCalled();
  engine.setScene({ ...structuredClone(scene), wires: [] });
  expect(engine.frame().pins.D6?.level).toBe(1);
  tick.mockRestore();
});
