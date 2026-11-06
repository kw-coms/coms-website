import { describe, it, expect, vi } from 'vitest';
import { SimulationEngine } from './engine';
import { EXAMPLES } from './examples';
import type { Scene } from './types';
const find = (kind: string) => structuredClone(EXAMPLES.find(e => e.scene.parts.some(p => p.kind === kind))!.scene);
const board: Scene = { version: 1, parts: [{ id: 'u', kind: 'arduino-uno', pos: [0, 0, 0], rotY: 0, props: {} }], wires: [], code: '' };
describe('headless engine integration', () => {
    it('PWM LED brightness integrates on-current without turning input voltage into a duty average', () => {
        let now = 0;
        const e = new SimulationEngine(() => now);
        const scene = find('led');
        e.setScene(scene);
        const led = scene.parts.find(p => p.kind === 'led')!;
        const states = e.mcu.pins();
        states.D13 = { mode: 'output', level: 0, duty: .25, freq: 500 };
        vi.spyOn(e.mcu, 'pins').mockReturnValue(states);
        now = 40;
        const frame = e.frame();
        expect(frame.parts[led.id]!.led!.brightness).toBeGreaterThan(.1);
        const uno = scene.parts.find(p => p.kind === 'arduino-uno')!;
        expect(frame.netVolts[e.analysis.pinToNet[`${uno.id}:D13`]!]).toBeLessThan(.1);
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
        scene.wires = scene.wires.filter(wire =>
            !(wire.from.partId === buzzer.id && wire.from.pinId === '-')
            && !(wire.to.partId === buzzer.id && wire.to.pinId === '-'),
        );
        const engine = new SimulationEngine();
        engine.setScene(scene);
        const pins = engine.mcu.pins();
        pins.D8 = { mode: 'output', level: 0, duty: 0.5, freq: 262 };
        vi.spyOn(engine.mcu, 'pins').mockReturnValue(pins);
        expect(engine.frame().parts[buzzer.id]!.buzzer!.on).toBe(false);
    });
});
