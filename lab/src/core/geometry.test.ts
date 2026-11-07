import { describe, it, expect } from 'vitest';
import { PARTS, breadboardGroups, partInternalConnections } from './parts';
import { pinWorldPos, resistorBands } from './geometry';
describe('핀 좌표와 부품 계약', () => {
    it('all pin IDs are unique, finite and UNO has every header', () => {
        for (const part of Object.values(PARTS)) {
            expect(new Set(part.pins.map(p => p.id)).size).toBe(part.pins.length);
            expect(part.pins.every(p => p.pos.every(Number.isFinite))).toBe(true);
        }
        const uno = PARTS['arduino-uno'];
        expect(uno.size[0]).toBe(68.58);
        expect(uno.size[2]).toBe(53.34);
        expect(uno.pins).toHaveLength(31);
        expect(uno.pins.every(p => p.pos[1] === 8.5)).toBe(true);
        expect(uno.pins.find(p => p.id === 'D7')!.pos[0] - uno.pins.find(p => p.id === 'D8')!.pos[0]).toBeCloseTo(4.064);
    });
    it('rotation follows right-handed Y convention', () => {
        const p = {
            id: 'r',
            kind: 'resistor' as const,
            pos: [10, 2, 20] as [number, number, number],
            rotY: 90 as const,
            props: {},
        };
        expect(pinWorldPos(p, '1')).toEqual([10, 2, 25.08]);
        expect(() => pinWorldPos(p, 'missing')).toThrow();
    });
    it('breadboard strips and uninterrupted grouped rails', () => {
        for (const kind of ['breadboard-half', 'breadboard-full'] as const) {
            const groups = breadboardGroups(kind);
            const n = kind === 'breadboard-half' ? 30 : 63;
            expect(groups).toHaveLength(n * 2 + 4);
            expect(groups[0]).toEqual(['a1', 'b1', 'c1', 'd1', 'e1']);
            expect(groups[1]).toEqual(['f1', 'g1', 'h1', 'i1', 'j1']);
            expect(groups.flat().length).toBe(PARTS[kind].pins.length);
            const pins = PARTS[kind].pins;
            expect(pins.find(p => p.id === 'f1')!.pos[2] - pins.find(p => p.id === 'e1')!.pos[2]).toBeCloseTo(7.62);
            expect(pins.find(p => p.id === 'tp6')!.pos[0] - pins.find(p => p.id === 'tp5')!.pos[0]).toBeCloseTo(5.08);
        }
    });
    it('fixed and switched internal links', () => {
        expect(partInternalConnections('pushbutton')).toEqual([['1', '2'], ['3', '4']]);
        expect(partInternalConnections('pushbutton', { pressed: true })).toEqual([['1', '2', '3', '4']]);
    });
    it('4 band Korean names including fractional multipliers', () => {
        expect(resistorBands(220).names).toEqual(['빨강', '빨강', '갈색', '금']);
        expect(resistorBands(4700).names).toEqual(['노랑', '보라', '빨강', '금']);
        expect(resistorBands(4.7).names).toEqual(['노랑', '보라', '금', '금']);
        expect(() => resistorBands(NaN)).toThrow();
    });
});
