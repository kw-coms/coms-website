import { describe, expect, it } from 'vitest';
import { BehavioralDevices } from './behavioral';
import type { Analysis, PartKind, Scene } from './types';
import { newTransientState, solveCircuit } from './solver';

function harness(kind: PartKind, levels: Record<string, number> = {}, input: Record<string, number | boolean> = {}) {
  const scene: Scene = { version: 2, code: '', parts: [{ id: 'chip', kind, pos: [0,0,0], rotY: 0, props: {} }], wires: [] };
  const analysis: Analysis = { nets: Object.keys(levels).map(pin => ({ id: pin, pins: [{ partId: 'chip', pinId: pin }] })),
    pinToNet: Object.fromEntries(Object.keys(levels).map(pin => [`chip:${pin}`, pin])), insertions: {}, warnings: [] };
  const device = new BehavioralDevices();
  const tick = (timeMs = 0) => device.tick(scene, analysis, levels, { chip: input }, timeMs);
  return { scene, levels, input, tick, device };
}

describe('v2 behavioral devices', () => {
  it.each([['logic-7400', 0], ['logic-7408', 1], ['logic-7432', 1], ['logic-7486', 0]] as const)(
    '%s computes the 1,2 → 3 truth table at high inputs', (kind, expected) => {
      const h = harness(kind, { '14': 5, '7': 0, '1': 5, '2': 5, '3': 0 });
      expect(h.tick().outputs.chip?.['3']).toBe(expected);
      h.levels['2'] = 0;
      expect(h.tick().outputs.chip?.['3']).toBe(kind === 'logic-7400' || kind === 'logic-7486' || kind === 'logic-7432' ? 1 : 0);
    });
  it('inverts all six 7404 input/output pairs', () => {
    const h = harness('logic-7404', { '14': 5, '7': 0, '1': 0, '3': 5, '5': 0, '9': 5, '11': 0, '13': 5 });
    expect(h.tick().outputs.chip).toMatchObject({ '2': 1, '4': 0, '6': 1, '8': 0, '10': 1, '12': 0 });
  });
  it('shifts on SRCLK and exposes data only after RCLK', () => {
    const h = harness('shift-register-595', { '16': 5, '8': 0, '10': 5, '13': 0, '11': 0, '12': 0, '14': 5 });
    h.tick(); h.levels['11'] = 5; expect(h.tick().outputs.chip?.['15']).toBe(0);
    h.levels['11'] = 0; h.tick(); h.levels['12'] = 5;
    expect(h.tick().outputs.chip?.['15']).toBe(1);
    h.levels['13'] = 5; expect(h.tick().drives['chip:15']).toBeUndefined();
  });
  it('drives L293D motor outputs in either direction', () => {
    const h = harness('l293d', { '16': 5, '8': 9, '4': 0, '1': 5, '2': 5, '7': 0 });
    expect(h.tick().drives['chip:3']?.volts).toBeGreaterThan(h.tick().drives['chip:6']?.volts ?? 0);
    h.levels['2'] = 0; h.levels['7'] = 5;
    expect(h.tick().drives['chip:6']?.volts).toBeGreaterThan(h.tick().drives['chip:3']?.volts ?? 0);
  });
  it('555 resets at two-thirds VCC and sets below one-third VCC', () => {
    const h = harness('timer-555', { '8': 5, '1': 0, '4': 5, '2': 0, '6': 0 });
    expect(h.tick().outputs.chip?.['3']).toBe(1);
    h.levels['2'] = 4; h.levels['6'] = 4;
    expect(h.tick().outputs.chip?.['3']).toBe(0);
    expect(h.tick().links).toContainEqual({ a: 'chip:7', b: 'chip:1', ohms: 10 });
  });
  it('connects a pressed keypad row and column', () => {
    const h = harness('keypad-4x4', {}, { key: 7 });
    expect(h.tick().links).toContainEqual({ a: 'chip:2', b: 'chip:7', ohms: .05 });
  });
  it('holds PIR output after motion clears', () => {
    const h = harness('pir', { VCC: 5, GND: 0 }, { motion: true });
    expect(h.tick(100).outputs.chip?.OUT).toBe(1);
    h.input.motion = false;
    expect(h.tick(2000).outputs.chip?.OUT).toBe(1);
    expect(h.tick(2700).outputs.chip?.OUT).toBe(0);
  });
  it('emits NEC leading mark, space and first data mark', () => {
    const h = harness('ir-receiver', { VCC: 5, GND: 0 }, { irCode: 0x20df });
    expect(h.tick(0).outputs.chip?.OUT).toBe(0);
    expect(h.tick(10).outputs.chip?.OUT).toBe(1);
    expect(h.tick(13.6).outputs.chip?.OUT).toBe(0);
    expect(h.device.nextEventMs(13.6)).toBeGreaterThan(13.6);
  });
  it('emits display-order NEC code as four LSB-first wire bytes', () => {
    const code = 0x00ff18e7;
    const h = harness('ir-receiver', { VCC: 5, GND: 0 }, { irCode: code });
    h.tick(0);
    let time = 13.5, decoded = 0;
    for (let bit = 0; bit < 32; bit++) {
      expect(h.tick(time).outputs.chip?.OUT).toBe(0);
      const markEnd = h.device.nextEventMs(time)!;
      expect(h.tick(markEnd).outputs.chip?.OUT).toBe(1);
      const spaceEnd = h.device.nextEventMs(markEnd)!;
      if (spaceEnd - markEnd > 1) decoded |= (1 << bit);
      time = spaceEnd;
    }
    expect(decoded >>> 0).toBe(0xe718ff00);
    expect(h.tick(time).outputs.chip?.OUT).toBe(0); // stop mark
    expect(h.tick(h.device.nextEventMs(time)!).outputs.chip?.OUT).toBe(1);
  });
  it('flips OUT at every edge when time is quantized to CPU cycles', () => {
    for (let startCycle = 1_600_000; startCycle < 1_600_040; startCycle++) {
      const h = harness('ir-receiver', { VCC: 5, GND: 0 }, { irCode: 0x00ff18e7 });
      let time = startCycle / 16000, expected = 0;
      expect(h.tick(time).outputs.chip?.OUT).toBe(0);
      for (let edge = 0, next = h.device.nextEventMs(time); next !== undefined; edge++, next = h.device.nextEventMs(time)) {
        time = Math.ceil(next * 16000) / 16000; // the engine stops on the first cycle at or after the edge
        expected ^= 1;
        expect(h.tick(time).outputs.chip?.OUT, `start ${startCycle} edge ${edge}`).toBe(expected);
      }
      expect(expected).toBe(1);
    }
  });
  it('retransmits the same NEC button after the input is released', () => {
    const h = harness('ir-receiver', { VCC: 5, GND: 0 }, { irCode: 0x00ff18e7 });
    expect(h.tick(0).outputs.chip?.OUT).toBe(0);
    h.input.irCode = 0;
    expect(h.tick(1).outputs.chip?.OUT).toBe(0); // current packet continues
    expect(h.tick(100).outputs.chip?.OUT).toBe(1);
    h.input.irCode = 0x00ff18e7;
    expect(h.tick(101).outputs.chip?.OUT).toBe(0);
    expect(h.device.nextEventMs(101)).toBeCloseTo(110, 5);
  });
  it('uses ground-relative CMOS thresholds', () => {
    const h = harness('logic-7408', { '14': 7, '7': 2, '1': 5.3, '2': 5.3 });
    expect(h.tick().outputs.chip?.['3']).toBe(1);
  });
  it('chains 595 QH prime into a second chip on the next clock edge', () => {
    const scene: Scene = { version: 2, code: '', wires: [], parts: ['first', 'second'].map(id =>
      ({ id, kind: 'shift-register-595', pos: [0,0,0], rotY: 0, props: {} })) };
    const refs = ['16','8','10','13','11','12','14','9','15'];
    const pinToNet = Object.fromEntries(scene.parts.flatMap(p => refs.map(pin => [`${p.id}:${pin}`, `${p.id}:${pin}`])));
    const analysis: Analysis = { pinToNet, nets: Object.entries(pinToNet).map(([ref, id]) => ({ id, pins: [{ partId: ref.split(':')[0]!, pinId: ref.split(':')[1]! }] })), insertions: {}, warnings: [] };
    const volts: Record<string, number> = {};
    for (const p of scene.parts) {
      for (const pin of refs) volts[`${p.id}:${pin}`] = ['16','10'].includes(pin) ? 5 : 0;
    }
    volts['first:14'] = 5;
    const device = new BehavioralDevices();
    let snapshot = device.tick(scene, analysis, volts, {}, 0);
    for (let n = 0; n < 9; n++) {
      for (const p of scene.parts) volts[`${p.id}:11`] = 5;
      snapshot = device.tick(scene, analysis, volts, {}, n + 1);
      volts['second:14'] = snapshot.outputs.first?.['9'] ? 5 : 0;
      for (const p of scene.parts) volts[`${p.id}:11`] = 0;
      device.tick(scene, analysis, volts, {}, n + 1.1);
    }
    expect(snapshot.outputs.second?.['15']).toBe(0); // output latch still untouched
    for (const p of scene.parts) volts[`${p.id}:12`] = 5;
    expect(device.tick(scene, analysis, volts, {}, 11).outputs.second?.['15']).toBe(1);
  });
  it('latches parallel LCD nibbles on falling E edges', () => {
    const h = harness('lcd1602-parallel', { VDD: 5, VSS: 0, RW: 0, RS: 0, E: 0, D4: 0, D5: 0, D6: 0, D7: 0 });
    const write = (nibble: number, rs: number) => {
      for (let bit = 4; bit < 8; bit++) h.levels[`D${bit}`] = nibble & (1 << bit) ? 5 : 0;
      h.levels.RS = rs ? 5 : 0;
      h.levels.E = 5; h.tick(); h.levels.E = 0; h.tick();
    };
    write(0x20, 0); // function set: 4-bit
    write(0x40, 1); write(0x10, 1); // 'A'
    expect(h.tick().visuals.chip?.lcd?.lines[0]?.[0]).toBe('A');
  });
  it('integrates multiplexed four-digit segment activity', () => {
    const h = harness('seven-segment-4digit', { D1: 0, D2: 5, D3: 5, D4: 5, a: 5, b: 0, c: 0, d: 0, e: 0, f: 0, g: 0, dp: 0 });
    h.tick(0);
    expect(h.tick(20).visuals.chip?.digits?.segments[0]?.[0]).toBe(true);
    expect(h.tick(20).visuals.chip?.digits?.segments[1]?.[0]).toBe(false);
  });
  it('uses segment-to-common voltage for common-anode digits', () => {
    const h = harness('seven-segment-4digit', { D1: 5, D2: 0, D3: 0, D4: 0, a: 0, b: 5, c: 5, d: 5, e: 5, f: 5, g: 5, dp: 5 });
    h.scene.parts[0]!.props.common = 'anode';
    h.tick(0);
    expect(h.tick(20).visuals.chip?.digits?.segments[0]?.[0]).toBe(true);
    h.levels.a = 3.5; // only 1.5 V across the LED
    h.tick(40); h.tick(60);
    expect(h.tick(80).visuals.chip?.digits?.segments[0]?.[0]).toBe(false);
  });
  it('writes a byte through the 8-bit parallel LCD bus', () => {
    const h = harness('lcd1602-parallel', { VDD: 5, VSS: 0, RS: 5, RW: 0, E: 0,
      D0: 5, D1: 0, D2: 0, D3: 0, D4: 0, D5: 0, D6: 5, D7: 0 });
    h.tick(); h.levels.E = 5; h.tick(); h.levels.E = 0;
    h.scene.parts[0]!.props.mode = '8-bit';
    expect(h.tick().visuals.chip?.lcd?.lines[0]?.[0]).toBe('A');
  });
  it('ignores LCD commands without VDD and resets memory on power loss', () => {
    const h = harness('lcd1602-parallel', { VDD: 0, VSS: 0, A: 5, K: 0, RS: 5, RW: 0, E: 0,
      D0: 5, D1: 0, D2: 0, D3: 0, D4: 0, D5: 0, D6: 5, D7: 0 });
    h.scene.parts[0]!.props.mode = '8-bit';
    h.tick(); h.levels.E = 5; h.tick(); h.levels.E = 0;
    expect(h.tick().visuals.chip?.lcd).toMatchObject({ lines: [' '.repeat(16), ' '.repeat(16)], backlight: false });
    h.levels.VDD = 5; h.tick(); h.levels.E = 5; h.tick(); h.levels.E = 0;
    expect(h.tick().visuals.chip?.lcd).toMatchObject({ lines: ['A' + ' '.repeat(15), ' '.repeat(16)], backlight: true });
    h.levels.VDD = 0;
    expect(h.tick().visuals.chip?.lcd?.lines[0]?.[0]).toBe(' ');
  });
});

it('555 astable uses the connected RC network within 5% of 1.44/((R1+2R2)C)', () => {
  const parts: Scene['parts'] = [
    { id: 'battery', kind: 'battery-9v', pos: [0,0,0], rotY: 0, props: {} },
    { id: 'timer', kind: 'timer-555', pos: [30,0,0], rotY: 0, props: {} },
    { id: 'r1', kind: 'resistor', pos: [60,0,0], rotY: 0, props: { ohms: 1000 } },
    { id: 'r2', kind: 'resistor', pos: [90,0,0], rotY: 0, props: { ohms: 10000 } },
    { id: 'cap', kind: 'capacitor-electrolytic', pos: [120,0,0], rotY: 0, props: { capacitance: 10 } },
  ];
  const groups = [
    ['battery:+', 'timer:8', 'timer:4', 'r1:1'],
    ['battery:-', 'timer:1', 'cap:-'],
    ['timer:7', 'r1:2', 'r2:1'],
    ['timer:2', 'timer:6', 'r2:2', 'cap:+'],
    ['timer:3'],
  ];
  const analysis: Analysis = { nets: groups.map((group, n) => ({ id: `n${n}`, pins: group.map(ref => {
    const [partId, pinId] = ref.split(':'); return { partId: partId!, pinId: pinId! };
  }) })), pinToNet: Object.fromEntries(groups.flatMap((group, n) => group.map(ref => [ref, `n${n}`]))), insertions: {}, warnings: [] };
  const scene: Scene = { version: 2, code: '', parts, wires: [] };
  const behavior = new BehavioralDevices(), transient = newTransientState();
  let volts: Record<string, number> = {}, previous = 0;
  const rises: number[] = [];
  for (let t = 0; t <= 900; t += .5) {
    const model = behavior.tick(scene, analysis, volts, {}, t);
    const result = solveCircuit(scene, analysis, {}, {}, model.drives,
      { timeMs: t, dtMs: .5, state: transient, links: model.links });
    volts = result.netVolts;
    const output = model.outputs.timer?.['3'] ?? 0;
    if (output === 1 && previous === 0) rises.push(t);
    previous = output;
  }
  const periods = rises.slice(2).map((rise, i) => rise - rises[i + 1]!);
  const measured = 1000 / (periods.reduce((a, b) => a + b, 0) / periods.length);
  const expected = 1.44 / ((1000 + 2 * 10000) * 10e-6);
  expect(measured).toBeGreaterThan(expected * .95);
  expect(measured).toBeLessThan(expected * 1.05);
});
