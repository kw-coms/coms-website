import { describe, it, expect, vi } from 'vitest';
import { SimulationEngine } from './engine';
import { EXAMPLES } from './examples';
import type { Scene } from './types';
const find = (kind: string) => structuredClone(EXAMPLES.find(e => e.scene.parts.some(p => p.kind === kind))!.scene);
const board: Scene = { version: 1, parts: [{ id: 'u', kind: 'arduino-uno', pos: [0, 0, 0], rotY: 0, props: {} }], wires: [], code: '' };
describe('headless engine integration', () => {
    it('reports a floating wired INPUT only after the sketch reads that pin', () => {
        const scene = structuredClone(board);
        scene.parts.push({ id: 'b', kind: 'pushbutton', pos: [0, 0, 0], rotY: 0, props: {} });
        scene.wires.push({ id: 'w1', from: { partId: 'u', pinId: 'D2' }, to: { partId: 'b', pinId: '1' }, color: 'blue' });
        scene.wires.push({ id: 'w2', from: { partId: 'b', pinId: '3' }, to: { partId: 'u', pinId: 'GND.1' }, color: 'black' });
        const e = new SimulationEngine();
        e.setScene(scene);
        const floating = () => e.frame().warnings.filter(w => w.id.startsWith('floating:')).map(w => w.id);
        expect(floating()).toEqual([]);
        e.mcu.cpu.readData(0x29); // PIND, as digitalRead does
        expect(floating()).toEqual(['floating:D2']);
    });
    it('PWM LED brightness integrates on-current without turning input voltage into a duty average', () => {
        let now = 0;
        const e = new SimulationEngine(() => now);
        const scene = find('led');
        e.setScene(scene);
        const led = scene.parts.find(p => p.kind === 'led')!;
        const states = e.mcu.pins();
        states.D8 = { mode: 'output', level: 0, duty: .25, freq: 500 };
        vi.spyOn(e.mcu, 'pins').mockReturnValue(states);
        now = 40;
        const frame = e.frame();
        expect(frame.parts[led.id]!.led!.brightness).toBeGreaterThan(.1);
        const uno = scene.parts.find(p => p.kind === 'arduino-uno')!;
        expect(frame.netVolts[e.analysis.pinToNet[`${uno.id}:D8`]!]).toBeLessThan(.1);
    });
    it('propagates a digital output edge to a wired input immediately', () => {
        const scene = structuredClone(board);
        scene.wires.push({ id: 'w', from: { partId: 'u', pinId: 'D13' }, to: { partId: 'u', pinId: 'D2' }, color: 'blue' });
        const e = new SimulationEngine();
        e.setScene(scene);
        e.frame();
        e.mcu.cpu.writeData(0x24, 32);
        e.mcu.cpu.writeData(0x25, 32);
        expect(e.mcu.cpu.readData(0x29) & 4).toBe(4);
        e.mcu.cpu.writeData(0x25, 0);
        expect(e.mcu.cpu.readData(0x29) & 4).toBe(0);
    });
    it('samples a potentiometer through solver into ADC, throttling input changes', () => {
        let now = 0;
        const e = new SimulationEngine(() => now), s = find('potentiometer');
        const p = s.parts.find(p => p.kind === 'potentiometer')!;
        e.setScene(s);
        e.frame();
        expect(e.mcu.adc.channelValues[0]).toBeCloseTo(2.5, 1);
        e.setInput({ partId: p.id, key: 'position', value: 0.25 });
        e.frame();
        expect(e.mcu.adc.channelValues[0]).toBeCloseTo(2.5, 1);
        now = 20;
        e.frame();
        expect(e.mcu.adc.channelValues[0]).toBeCloseTo(1.25, 1);
    });
    it('does not acknowledge an unpowered LCD', () => {
        const e = new SimulationEngine();
        const scene = find('lcd1602-i2c');
        const lcd = scene.parts.find(p => p.kind === 'lcd1602-i2c')!;
        scene.wires = scene.wires.filter(w => !(w.from.partId === lcd.id && w.from.pinId === 'VCC') && !(w.to.partId === lcd.id && w.to.pinId === 'VCC'));
        e.setScene(scene);
        expect(e.frame().parts[lcd.id]!.lcd!.backlight).toBe(false);
        e.mcu.twi.eventHandler.connectToSlave(0x27, true);
        expect(e.mcu.cpu.data[0xb9]! & 0xf8).toBe(0x20);
    });
    it('scene removal cancels an already scheduled sonar pulse', () => {
        let now = 0;
        const e = new SimulationEngine(() => now), scene = find('hc-sr04');
        e.setScene(scene);
        e.frame();
        const sonar = scene.parts.find(p => p.kind === 'hc-sr04')!;
        const trig = scene.wires.find(w => (w.from.partId === sonar.id && w.from.pinId === 'TRIG') || (w.to.partId === sonar.id && w.to.pinId === 'TRIG'))!;
        const ref = trig.from.partId === sonar.id ? trig.to : trig.from;
        // Examples use D7 TRIG (PORTD7) or D9 (PORTB1); derive the pin port.
        const digital = Number(ref.pinId.slice(1)), port = digital < 8 ? 'D' : 'B', bit = digital < 8 ? digital : digital - 8;
        const ddr = port === 'D' ? 0x2a : 0x24, out = ddr + 1;
        e.mcu.cpu.writeData(ddr, 1 << bit);
        e.mcu.cpu.writeData(out, 1 << bit);
        e.mcu.step(160);
        e.mcu.cpu.writeData(out, 0);
        e.setScene(board);
        now = 20;
        e.step(10000);
        expect(e.frame().parts[sonar.id]).toBeUndefined();
        expect(Object.keys(e.mcu.pins()).some(p => e.mcu.isEchoActive(p))).toBe(false);
    });
});


describe('powered peripherals', () => {
    it('does not sound a buzzer without a return wire, even while the output is low', () => {
        const scene = find('buzzer');
        const buzzer = scene.parts.find(part => part.kind === 'buzzer')!;
        // The example returns the buzzer to GND with a short jumper from its breadboard column to the GND rail.
        scene.wires = scene.wires.filter(wire => !(wire.from.partId === 'board' && wire.to.partId === 'board' && wire.to.pinId.startsWith('tn')));
        const engine = new SimulationEngine();
        engine.setScene(scene);
        const pins = engine.mcu.pins();
        pins.D8 = { mode: 'output', level: 0, duty: 0.5, freq: 262 };
        vi.spyOn(engine.mcu, 'pins').mockReturnValue(pins);
        expect(engine.frame().parts[buzzer.id]!.buzzer!.on).toBe(false);
    });
});

describe('hostile input addressing', () => {
  const engine = () => {
    const sim = new SimulationEngine(() => 0);
    sim.setScene({ version: 1, code: '', wires: [], parts: [{ id: 'button', kind: 'pushbutton', pos: [0, 0, 0], rotY: 0, props: {} }] } as Scene);
    return sim;
  };
  it.each(['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty'])('setInput rejects part id %s without touching Object.prototype', id => {
    expect(() => engine().setInput({ partId: id, key: 'pressed', value: true })).toThrow();
    expect(({} as Record<string, unknown>).pressed).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('pressed');
  });
  it('setInput rejects input keys that are not defined for the part', () => {
    const sim = engine();
    for (const key of ['__proto__', 'constructor', 'toString']) {
      expect(() => sim.setInput({ partId: 'button', key: key as never, value: true })).toThrow();
    }
    expect(Object.prototype).not.toHaveProperty('pressed');
  });
  it('a real input still works', () => {
    const sim = engine();
    sim.setInput({ partId: 'button', key: 'pressed', value: true });
    expect(sim.inputs.button!.pressed).toBe(true);
  });
});
