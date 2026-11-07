import { describe, expect, it } from 'vitest';
import { EXAMPLES } from './examples';
import { validateScene } from './scene';
import { analyze } from './analyze';
import { decodeShare, encodeShare } from './share';
import { PARTS } from './parts';
import { pinWorldPos } from './geometry';
import type { PartInstance, PinRef } from './types';
import fixtures from './__fixtures__/examples-hex.json';

const BOARDS = ['arduino-uno', 'breadboard-half', 'breadboard-full'];
// Parts with a header or cable that people do not push into a breadboard.
const MODULES = ['lcd1602-i2c', 'hc-sr04', 'servo', 'dc-motor', 'multimeter', 'joystick', 'neopixel-strip', 'l9110s'];
const MAX_WIRE_MM = 140;

// Real XZ extent [x0, x1, z0, z1] of parts whose body is not centred on the pins (the `size` box is
// only an approximation). HC-SR04's draggable obstacle block is not a part and is left out.
const BODY: Record<string, [number, number, number, number]> = {
  'lcd1602-i2c': [-40, 40, -2, 5], 'hc-sr04': [-22.5, 22.5, -2, 12], servo: [-16.3, 16.3, -26.1, 1.4],
  'dc-motor': [-14, 18.1, -24.5, 1], joystick: [-17, 17, -26, 0], dht11: [-6, 6, -3, 3],
};
function footprint(part: PartInstance): [number, number, number, number] {
  const size = PARTS[part.kind].size;
  const count = Number(part.props.count) || 8;
  const [x0, x1, z0, z1] = part.kind === 'neopixel-strip' ? [-5, count * 10 - 5, -16, 0]
    : BODY[part.kind] ?? [-size[0] / 2, size[0] / 2, -size[2] / 2, size[2] / 2];
  const corners = [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].map(([x, z]) => {
    const radians = part.rotY * Math.PI / 180;
    return [part.pos[0] + x! * Math.cos(radians) + z! * Math.sin(radians), part.pos[2] - x! * Math.sin(radians) + z! * Math.cos(radians)] as const;
  });
  const xs = corners.map(c => c[0]);
  const zs = corners.map(c => c[1]);
  return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
}

describe('example scenes', () => {
  it('keeps every teaching sketch equivalent to the compiled fixture', () => {
    const normalized = (code: string) => code.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, '');
    for (const example of EXAMPLES.slice(0, 17)) {
      const compiled = fixtures.examples[example.id as keyof typeof fixtures.examples];
      expect(normalized(example.scene.code), `${example.id}: 예제 코드가 바뀌었으니 fixture를 다시 컴파일해야 합니다`).toBe(normalized(compiled.code));
    }
  });
  it('contains all seventeen lessons with valid connected circuits', () => {
    expect(EXAMPLES).toHaveLength(30);
    for (const example of EXAMPLES.slice(0, 17)) {
      expect(validateScene(example.scene)).toMatchObject({ parts: example.scene.parts, wires: example.scene.wires });
      const analysis = analyze(example.scene);
      expect(analysis.warnings.filter(w => w.level === 'error'), example.title).toEqual([]);
      for (const resistor of example.scene.parts.filter(part => part.kind === 'resistor')) {
        expect(analysis.pinToNet[`${resistor.id}:1`], `${example.title}: ${resistor.id} is shorted`)
          .not.toBe(analysis.pinToNet[`${resistor.id}:2`]);
      }
      expect(example.scene.code.length).toBeGreaterThan(20);
    }
  });
  it('plugs small parts into the breadboard and stands modules beside it', () => {
    for (const example of EXAMPLES.slice(0, 17)) {
      const analysis = analyze(example.scene);
      for (const part of example.scene.parts.filter(p => !BOARDS.includes(p.kind))) {
        const pins = PARTS[part.kind].pins.filter(pin => part.kind !== 'l9110s' || !pin.id.startsWith('M'));
        const inserted = pins.filter(pin => analysis.insertions[`${part.id}:${pin.id}`]);
        if (MODULES.includes(part.kind)) {
          expect(inserted, `${example.title}: ${part.id} is a module and should stand beside the board`).toEqual([]);
        } else {
          expect(inserted.length, `${example.title}: ${part.id} should sit in the breadboard`).toBe(pins.length);
          for (const pin of inserted) expect(analysis.insertions[`${part.id}:${pin.id}`]?.partId).toBe('board');
        }
      }
    }
  });
  it('keeps every part apart; only parts plugged into the breadboard may overlap it', () => {
    for (const example of EXAMPLES.slice(0, 17)) {
      const analysis = analyze(example.scene);
      const parts = example.scene.parts;
      for (let left = 0; left < parts.length; left++) {
        for (let right = left + 1; right < parts.length; right++) {
          const a = parts[left]!;
          const b = parts[right]!;
          const plugged = (board: PartInstance, other: PartInstance) => BOARDS.includes(board.kind)
            && PARTS[other.kind].pins.some(pin => analysis.insertions[`${other.id}:${pin.id}`]?.partId === board.id);
          if (plugged(a, b) || plugged(b, a)) continue;
          const [a0, a1, a2, a3] = footprint(a);
          const [b0, b1, b2, b3] = footprint(b);
          const overlap = a0 < b1 && b0 < a1 && a2 < b3 && b2 < a3;
          expect(overlap, `${example.title}: ${a.id} and ${b.id} overlap`).toBe(false);
        }
      }
    }
  });
  it('colour codes wires (5V red, GND black, signals anything else) and keeps them short', () => {
    for (const example of EXAMPLES.slice(0, 17)) {
      const analysis = analyze(example.scene);
      const point = (ref: PinRef) => pinWorldPos(example.scene.parts.find(p => p.id === ref.partId)!, ref.pinId);
      for (const wire of example.scene.wires) {
        const name = analysis.nets.find(net => net.id === analysis.pinToNet[`${wire.from.partId}:${wire.from.pinId}`])?.name;
        const expected = name === '5V' ? 'red' : name === 'GND' ? 'black' : undefined;
        if (expected) expect(wire.color, `${example.title}: ${wire.id} (${name})`).toBe(expected);
        else expect(['red', 'black'], `${example.title}: ${wire.id} is a signal wire`).not.toContain(wire.color);
        const path = [point(wire.from), ...(wire.bends ?? []), point(wire.to)];
        const length = path.slice(1).reduce((sum, to, index) => sum + Math.hypot(to[0] - path[index]![0], to[2] - path[index]![2]), 0);
        expect(length, `${example.title}: ${wire.id} is too long`).toBeLessThan(MAX_WIRE_MM);
      }
    }
  });
  it('round trips a shared scene', async () => {
    const scene = EXAMPLES[1]!.scene;
    expect(await decodeShare(await encodeShare(scene))).toEqual(validateScene(scene));
  });
  it('rejects invalid pin references, duplicate parts and oversize code', () => {
    const original = EXAMPLES[1]!.scene;
    expect(() => validateScene({ ...original, wires: [{ ...original.wires[0], to: { partId: 'led', pinId: 'bogus' } }] })).toThrow();
    expect(() => validateScene({ ...original, parts: [...original.parts, original.parts[0]] })).toThrow();
    expect(() => validateScene({ ...original, code: '가'.repeat(22000) })).toThrow();
    expect(() => validateScene({ ...original, parts: [{ ...original.parts[0], kind: '__proto__' }] })).toThrow();
    expect(() => validateScene({ ...original, parts: [{ ...original.parts[0], id: '__proto__' }] })).toThrow();
    expect(() => validateScene({ ...original, extra: true })).toThrow();
    expect(() => validateScene({ ...original, wires: [{ ...original.wires[0], id: 'constructor' }] })).toThrow();
  });
  it('rejects a compressed payload that expands beyond 32 KB', async () => {
    const stream = new Blob([new Uint8Array(32769)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
    const bomb = btoa(String.fromCharCode(...compressed)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await expect(decodeShare(bomb)).rejects.toThrow(/32\s?KB/);
  });
});

describe('seven segment wiring', () => {
  it('keeps each current-limiting resistor between its pin and segment', () => {
    const example = EXAMPLES.find(e => e.id === 'seven-count')!;
    const analysis = analyze(example.scene);
    for (const [index, segment] of [...'abcdefg'].entries()) {
      const upstream = analysis.pinToNet[`r${segment}:1`];
      const downstream = analysis.pinToNet[`r${segment}:2`];
      expect(upstream, segment).toBe(analysis.pinToNet[`uno:D${index + 2}`]);
      expect(downstream, segment).toBe(analysis.pinToNet[`digit:${segment}`]);
      expect(upstream, `${segment} resistor shorted`).not.toBe(downstream);
      expect(downstream, `${segment} segment shorted to ground`).not.toBe(analysis.pinToNet['uno:GND.1']);
    }
  });
});


describe('v2 starter circuits', () => {
  it('validates all thirteen scenes and resolves every wire endpoint', () => {
    for (const example of EXAMPLES.slice(17)) {
      let validated; try { validated = validateScene(example.scene); } catch (error) { throw new Error(`${example.id}: ${error}`); }
      expect(validated.version, example.id).toBe(2);
      const analysis = analyze(example.scene);
      for (const wire of example.scene.wires) {
        expect(analysis.pinToNet[`${wire.from.partId}:${wire.from.pinId}`], `${example.id}:${wire.id} from`).toBeDefined();
        expect(analysis.pinToNet[`${wire.to.partId}:${wire.to.pinId}`], `${example.id}:${wire.id} to`).toBeDefined();
      }
      expect(example.scene.code.length).toBeGreaterThan(100);
    }
  });
  it('keeps the standalone parts from overlapping each other or the UNO', () => {
    for (const example of EXAMPLES.slice(17)) {
      for (const [i, a] of example.scene.parts.entries()) for (const b of example.scene.parts.slice(i + 1)) {
        const [a0, a1, a2, a3] = footprint(a), [b0, b1, b2, b3] = footprint(b);
        expect(a0 < b1 && b0 < a1 && a2 < b3 && b2 < a3, `${example.id}: ${a.id}/${b.id}`).toBe(false);
      }
    }
  });
});
