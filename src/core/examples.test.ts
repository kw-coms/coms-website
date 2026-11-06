import { describe, expect, it } from 'vitest';
import { EXAMPLES } from './examples';
import { validateScene } from './scene';
import { analyze } from './analyze';
import { decodeShare, encodeShare } from './share';

describe('example scenes', () => {
  it('contains all seventeen lessons with valid connected circuits', () => {
    expect(EXAMPLES).toHaveLength(17);
    for (const example of EXAMPLES) {
      expect(validateScene(example.scene)).toBe(example.scene);
      const analysis = analyze(example.scene);
      expect(analysis.warnings.filter(w => w.level === 'error'), example.title).toEqual([]);
      expect(example.scene.code.length).toBeGreaterThan(20);
      for (const part of example.scene.parts.filter(p => !['arduino-uno', 'breadboard-half'].includes(p.kind))) {
        expect(Object.keys(analysis.insertions).some(key => key.startsWith(`${part.id}:`)), `${example.title}: ${part.id} should occupy a hole`).toBe(true);
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
