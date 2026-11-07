import { describe, it, expect } from 'vitest';
import { analyze } from './analyze';
import { PARTS } from './parts';
import type { PartInstance, PinRef, Scene } from './types';
const part = (
    id: string, kind: PartInstance['kind'], x = 0, y = 0, z = 0,
    rotY: PartInstance['rotY'] = 0,
): PartInstance => ({ id, kind, pos: [x, y, z], rotY, props: {} });
const ref = (partId: string, pinId: string): PinRef => ({ partId, pinId });
const scene = (parts: PartInstance[], edges: [PinRef, PinRef][] = []): Scene => ({
    version: 1,
    parts,
    wires: edges.map(([from, to], index) => ({ id: `w${index}`, from, to, color: 'blue' })),
    code: '',
});
const net = (a: ReturnType<typeof analyze>, id: string, pin: string) => a.pinToNet[`${id}:${pin}`];
const uno = () => part('uno', 'arduino-uno', -100);
const board = () => part('board', 'breadboard-half');
const hole = (id: string) => PARTS['breadboard-half'].pins.find(p => p.id === id)!.pos;
describe('static topology', () => {
    it('breadboard strips join but center gap and adjacent columns do not', () => {
        const a = analyze(scene([board()]));
        expect(net(a, 'board', 'a1')).toBe(net(a, 'board', 'e1'));
        expect(net(a, 'board', 'e1')).not.toBe(net(a, 'board', 'f1'));
        expect(net(a, 'board', 'a1')).not.toBe(net(a, 'board', 'a2'));
        expect(net(a, 'board', 'tp1')).toBe(net(a, 'board', 'tp25'));
        expect(net(a, 'board', 'tp1')).not.toBe(net(a, 'board', 'tn1'));
    });
    it('inserts at 0.6 mm and above, rejects below and beyond tolerance', () => {
        const p = hole('a10');
        const first = PARTS.led.pins[0]!.pos;
        const place = (id: string, dx: number, y: number) => part(id, 'led', p[0] - first[0] + dx, y, p[2] - first[2]);
        const a = analyze(scene([board(), place('edge', .6, 0), place('far', .601, 0), place('below', 0, -.01)]));
        expect(a.insertions['edge:anode']).toEqual(ref('board', 'a10'));
        expect(a.insertions['far:anode']).toBeUndefined();
        expect(a.insertions['below:anode']).toBeUndefined();
    });
    it('rotation is applied before insertion matching', () => {
        const local = PARTS.resistor.pins[0]!.pos;
        const target = hole('b12');
        // A 90-degree Y rotation sends local X to negative world Z.
        const p = part('r', 'resistor', target[0] - local[2], 0, target[2] + local[0], 90);
        const a = analyze(scene([board(), p]));
        expect(a.insertions['r:1']).toEqual(ref('board', 'b12'));
    });
    it('wires and permanent pushbutton pairs join named UNO nets', () => {
        const a = analyze(scene([uno(), part('b', 'pushbutton', 80)], [[ref('uno', 'D2'), ref('b', '1')], [ref('b', '3'), ref('uno', 'GND.1')]]));
        expect(net(a, 'b', '1')).toBe(net(a, 'b', '2'));
        expect(net(a, 'b', '3')).toBe(net(a, 'b', '4'));
        expect(net(a, 'b', '1')).not.toBe(net(a, 'b', '3'));
        expect(a.nets.find(n => n.id === net(a, 'b', '2'))?.name).toBe('D2');
        expect(a.nets.find(n => n.id === net(a, 'b', '4'))?.name).toBe('GND');
    });
    it('detects a wire short and a closed slide-switch short, but a resistor blocks it', () => {
        const direct = analyze(scene([uno()], [[ref('uno', '5V'), ref('uno', 'GND.1')]]));
        expect(direct.warnings.some(w => w.level === 'error' && w.id.startsWith('hard-short'))).toBe(true);
        const sw = part('sw', 'slide-switch', 60);
        const edges: [PinRef, PinRef][] = [
            [ref('uno', '5V'), ref('sw', '2')],
            [ref('sw', '1'), ref('uno', 'GND.1')],
        ];
        expect(analyze(scene([uno(), sw], edges)).warnings.some(w => w.id.startsWith('hard-short'))).toBe(true);
        const r = part('r', 'resistor', 60);
        const resistive = analyze(scene([uno(), r], [
            [ref('uno', '5V'), ref('r', '1')],
            [ref('r', '2'), ref('uno', 'GND.1')],
        ]));
        expect(resistive.warnings.some(w => w.id.startsWith('hard-short'))).toBe(false);
    });
    it('flags LED without a resistor and unconnected pins; a resistor in the path clears warning', () => {
        const led = part('led', 'led', 40);
        const r = part('r', 'resistor', 70);
        const direct = analyze(scene([uno(), led], [[ref('uno', 'D13'), ref('led', 'anode')], [ref('led', 'cathode'), ref('uno', 'GND.1')]]));
        expect(direct.warnings.some(w => w.id === 'no-resistor:led:anode')).toBe(true);
        const protectedCircuit = analyze(scene([uno(), led, r], [
            [ref('uno', 'D13'), ref('r', '1')],
            [ref('r', '2'), ref('led', 'anode')],
            [ref('led', 'cathode'), ref('uno', 'GND.1')],
        ]));
        expect(protectedCircuit.warnings.some(w => w.id.startsWith('no-resistor'))).toBe(false);
        expect(analyze(scene([led])).warnings.filter(w => w.id.startsWith('unconnected'))).toHaveLength(2);
    });
    it('reports two part pins in the same hole', () => {
        const p = hole('a10');
        const lead = PARTS.led.pins[0]!.pos;
        const x = p[0] - lead[0];
        const z = p[2] - lead[2];
        const a = analyze(scene([board(), part('a', 'led', x, 0, z), part('b', 'led', x, 0, z)]));
        expect(a.warnings.some(w => w.level === 'error' && w.id.startsWith('same-hole'))).toBe(true);
    });
});
