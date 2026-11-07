import { expect, it } from 'vitest';
import { PARTS, breadboardGroups } from './index';
import { analyze } from '../analyze';

it('limits acquisition-only controls to passive scope and analyzer settings', () => {
  expect(PARTS.oscilloscope.acquisitionOnlyProps).toEqual(['timeDiv', 'voltsDiv', 'trigger']);
  expect(PARTS['logic-analyzer'].acquisitionOnlyProps).toEqual(['timeDiv']);
  for (const part of Object.values(PARTS)) {
    for (const key of part.acquisitionOnlyProps) expect(part.props.some(prop => prop.key === key)).toBe(true);
    if (!['oscilloscope', 'logic-analyzer'].includes(part.kind)) expect(part.acquisitionOnlyProps).toEqual([]);
  }
});

it('maps the mini board to 170 holes in 34 separate strips', () => {
  expect(PARTS['breadboard-mini'].pins).toHaveLength(170);
  expect(breadboardGroups('breadboard-mini')).toHaveLength(34);
  expect(breadboardGroups('breadboard-mini')[0]).toEqual(['a1', 'b1', 'c1', 'd1', 'e1']);
});
it('keeps physical DIP numbering and the centre trench', () => {
  for (const kind of ['timer-555', 'l293d', 'shift-register-595', 'logic-7400', 'optocoupler-4n35'] as const) {
    const pins = PARTS[kind].pins;
    expect(pins[0]?.label).toContain('핀 1');
    expect(pins.map(p => p.id)).toEqual(pins.map((_, i) => String(i + 1)));
    expect(new Set(pins.map(p => p.pos[2]))).toEqual(new Set([-3.81, 3.81]));
  }
});
it('uses TO-92 E-B-C and 8-position keypad ribbon', () => {
  expect(PARTS.npn.pins.map(p => p.id)).toEqual(['E', 'B', 'C']);
  expect(PARTS.pnp.pins.map(p => p.id)).toEqual(['E', 'B', 'C']);
  expect(PARTS['keypad-4x4'].pins.map(p => p.id)).toEqual(['1','2','3','4','5','6','7','8']);
});
it('uses the exact DIP pin count and labels the functional pins', () => {
  expect(PARTS['timer-555'].pins).toHaveLength(8);
  expect(PARTS['timer-555'].pins[0]?.label).toContain('GND');
  expect(PARTS['timer-555'].pins[2]?.label).toContain('OUT');
  expect(PARTS['shift-register-595'].pins).toHaveLength(16);
  expect(PARTS['shift-register-595'].pins[10]?.label).toContain('SHCP');
  expect(PARTS.l293d.pins[7]?.label).toContain('VS');
});
it('fits every v2 DIP lead inside its physical outline', () => {
  for (const kind of ['timer-555','shift-register-595','l293d','logic-7400','logic-7408','logic-7432','logic-7486','logic-7404','optocoupler-4n35'] as const) {
    const { pins, size } = PARTS[kind];
    for (const p of pins) {
      expect(Math.abs(p.pos[0])).toBeLessThanOrEqual(size[0] / 2);
      expect(Math.abs(p.pos[2])).toBeLessThanOrEqual(size[2] / 2);
    }
  }
});
it('exposes all meter modes and common L293D grounds', () => {
  expect(PARTS.multimeter.props.find(p => p.key === 'mode')?.options?.map(o => o.value)).toEqual(['V','mA','Ω','continuity']);
  const driver = { id: 'driver', kind: 'l293d' as const, pos: [0,0,0] as [number,number,number], rotY: 0 as const, props: {} };
  const analysis = analyze({ version: 2, parts: [driver], wires: [], code: '' });
  for (const pin of ['5','12','13']) expect(analysis.pinToNet[`driver:${pin}`]).toBe(analysis.pinToNet['driver:4']);
});
