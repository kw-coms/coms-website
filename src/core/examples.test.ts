import { describe, expect, it } from 'vitest';
import { EXAMPLES } from './examples';
import { validateScene } from './scene';
import { analyze } from './analyze';
import { decodeShare, encodeShare } from './share';
import { PARTS } from './parts';
import fixtures from './__fixtures__/examples-hex.json';

describe('example scenes', () => {
  it('keeps every teaching sketch equivalent to the compiled fixture', () => {
    const normalized = (code: string) => code.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, '');
    for (const example of EXAMPLES) {
      const compiled = fixtures.examples[example.id as keyof typeof fixtures.examples];
      expect(normalized(example.scene.code), `${example.id}: 예제 코드가 바뀌었으니 fixture를 다시 컴파일해야 합니다`).toBe(normalized(compiled.code));
    }
  });
  it('contains all seventeen lessons with valid connected circuits', () => {
    expect(EXAMPLES).toHaveLength(17);
    for (const example of EXAMPLES) {
      expect(validateScene(example.scene)).toBe(example.scene);
      const analysis = analyze(example.scene);
      expect(analysis.warnings.filter(w => w.level === 'error'), example.title).toEqual([]);
      for (const resistor of example.scene.parts.filter(part => part.kind === 'resistor')) {
        expect(analysis.pinToNet[`${resistor.id}:1`], `${example.title}: ${resistor.id} is shorted`)
          .not.toBe(analysis.pinToNet[`${resistor.id}:2`]);
      }
      expect(example.scene.code.length).toBeGreaterThan(20);
      for (const part of example.scene.parts.filter(p => !['arduino-uno', 'breadboard-half', 'breadboard-full'].includes(p.kind))) {
        for (const pin of PARTS[part.kind].pins.filter(pin => part.kind !== 'l9110s' || !pin.id.startsWith('M'))) {
          expect(analysis.insertions[`${part.id}:${pin.id}`]?.partId, `${example.title}: ${part.id}:${pin.id} should occupy a hole`).toBe('board');
        }
      }
      const components = example.scene.parts.filter(p => !['arduino-uno', 'breadboard-half', 'breadboard-full'].includes(p.kind));
      for (let left = 0; left < components.length; left++) {
        for (let right = left + 1; right < components.length; right++) {
          const a = components[left]!;
          const b = components[right]!;
          const aSize = PARTS[a.kind].size;
          const bSize = PARTS[b.kind].size;
          const overlap = Math.abs(a.pos[0] - b.pos[0]) < (aSize[0] + bSize[0]) / 2
            && Math.abs(a.pos[2] - b.pos[2]) < (aSize[2] + bSize[2]) / 2;
          expect(overlap, `${example.title}: ${a.id} and ${b.id} overlap`).toBe(false);
        }
      }
    }
  });
  it('round trips a shared scene', async () => {
    const scene = EXAMPLES[1]!.scene;
    expect(await decodeShare(await encodeShare(scene))).toEqual(scene);
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
