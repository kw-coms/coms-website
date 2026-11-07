import { describe, expect, it } from 'vitest';
import { SimulationEngine } from './engine';
import type { PartKind, Scene, Wire } from './types';

function circuit(kind: PartKind, wires: [string, string][]): SimulationEngine {
  const parts: Scene['parts'] = [
    { id: 'u', kind: 'arduino-uno', pos: [0, 0, 0], rotY: 0, props: {} },
    { id: 'device', kind, pos: [100, 0, 0], rotY: 0, props: {} },
  ];
  const scene: Scene = { version: 2, parts, code: '', wires: wires.map(([a, b], i): Wire => ({
    id: `w${i}`, from: { partId: a.split(':')[0]!, pinId: a.split(':')[1]! },
    to: { partId: b.split(':')[0]!, pinId: b.split(':')[1]! }, color: 'blue',
  })) };
  const engine = new SimulationEngine();
  engine.setScene(scene);
  engine.frame();
  return engine;
}

describe('v2 MCU/peripheral integration', () => {
  it('delivers 595 data through real PORTD edges and the separate latch clock', () => {
    const e = circuit('shift-register-595', [
      ['u:5V','device:16'], ['u:GND.1','device:8'], ['u:5V','device:10'],
      ['u:GND.1','device:13'], ['u:D2','device:14'], ['u:D3','device:11'], ['u:D4','device:12'],
    ]);
    e.mcu.cpu.writeData(0x2a, 0x1c); // D2 SER, D3 SRCLK, D4 RCLK outputs
    e.mcu.cpu.writeData(0x2b, 0x04); // data high
    e.mcu.cpu.writeData(0x2b, 0x0c); // shift rising
    e.mcu.cpu.writeData(0x2b, 0x04);
    expect(e.frame().parts.device?.ic?.outputs['15']).toBe(0);
    e.mcu.cpu.writeData(0x2b, 0x14); // latch rising
    expect(e.frame().parts.device?.ic?.outputs['15']).toBe(1);
  });
  it('re-solves keypad scan when DDR changes with no output edge', () => {
    const e = circuit('keypad-4x4', [
      ['u:D2','device:1'], ['u:D6','device:5'],
    ]);
    e.setInput({ partId: 'device', key: 'key', value: 1 });
    e.mcu.cpu.writeData(0x2b, 0x40); // D6 input pull-up; D2 remains low
    e.frame();
    expect(e.mcu.cpu.readData(0x29) & 0x40).toBe(0x40);
    e.mcu.cpu.writeData(0x2a, 0x04); // D2 becomes output LOW, PORT stays unchanged
    expect(e.mcu.cpu.readData(0x29) & 0x40).toBe(0);
  });
  it('advances NEC marks at scheduled edges without a fixed 10us solve loop', () => {
    const e = circuit('ir-receiver', [
      ['u:5V','device:VCC'], ['u:GND.1','device:GND'], ['u:D2','device:OUT'],
    ]);
    e.setInput({ partId: 'device', key: 'irCode', value: 0x20df });
    expect(e.frame().parts.device?.ic?.outputs.OUT).toBe(0);
    e.step(Math.round(8.99 * 16000));
    expect(e.frame().parts.device?.ic?.outputs.OUT).toBe(0);
    e.step(Math.round(.02 * 16000));
    expect(e.frame().parts.device?.ic?.outputs.OUT).toBe(1);
    e.step(Math.round(4.5 * 16000));
    expect(e.frame().parts.device?.ic?.outputs.OUT).toBe(0);
  });
});
