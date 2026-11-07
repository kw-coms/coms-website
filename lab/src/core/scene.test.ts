import { describe, expect, it } from 'vitest';
import { validateScene } from './scene';
import { encodeShare, decodeShare } from './share';
import type { Scene } from './types';

const scene = (code = ''): Scene => ({
  version: 1,
  code,
  parts: [{ id: 'pixels', kind: 'neopixel-strip', pos: [0, 0, 0], rotY: 0, props: { count: 8 } }],
  wires: [],
});

describe('import limits', () => {
  it('rejects fractional pixel counts and oversize UTF-8 sketches', () => {
    const fractional = scene();
    fractional.parts[0]!.props.count = 1.5;
    expect(() => validateScene(fractional)).toThrow('속성 count');
    expect(() => validateScene(scene('가'.repeat(22_000)))).toThrow('64 KB');
  });

  it('accepts the maximum part count and rejects one more', () => {
    const allowed = scene();
    allowed.parts = Array.from({ length: 300 }, (_, index) => ({
      ...allowed.parts[0]!, id: `pixel-${index}`,
    }));
    expect(validateScene(allowed)).toBe(allowed);
    allowed.parts.push({ ...allowed.parts[0]!, id: 'extra' });
    expect(() => validateScene(allowed)).toThrow('개수 제한');
  });

  it('accepts 600 wires and exactly 64 KiB of code, then rejects excess', () => {
    const maximum = scene('a'.repeat(64 * 1024));
    maximum.wires = Array.from({ length: 600 }, (_, index) => ({
      id: `wire-${index}`,
      from: { partId: 'pixels', pinId: 'DIN' },
      to: { partId: 'pixels', pinId: 'GND' },
      color: 'blue',
    }));
    expect(validateScene(maximum)).toBe(maximum);
    maximum.wires.push({ ...maximum.wires[0]!, id: 'wire-extra' });
    expect(() => validateScene(maximum)).toThrow('개수 제한');
    maximum.wires.pop();
    maximum.code += 'a';
    expect(() => validateScene(maximum)).toThrow('64 KB');
  });

  it('round-trips exactly 32 KiB decoded shares and rejects one byte more', async () => {
    const maximum = scene();
    const emptyBytes = new TextEncoder().encode(JSON.stringify(maximum)).length;
    maximum.code = 'a'.repeat(32 * 1024 - emptyBytes);
    expect(new TextEncoder().encode(JSON.stringify(maximum)).length).toBe(32 * 1024);
    expect(await decodeShare(await encodeShare(maximum))).toEqual(maximum);
    maximum.code += 'a';
    await expect(encodeShare(maximum)).rejects.toThrow('32 KB');
  });
});

describe('hostile ids (share links and imported JSON)', () => {
  const base = (id: string): unknown => ({
    version: 1, code: '', parts: [{ id, kind: 'led', pos: [0, 0, 0], rotY: 0, props: {} }], wires: [],
  });
  it.each(['__proto__', 'constructor', 'prototype', 'a.b', 'a b', '', 'x'.repeat(65), 'é', '__proto__\n'])('rejects part id %j', id => {
    expect(() => validateScene(base(id))).toThrow();
  });
  it('rejects a wire id that would reach Object.prototype', () => {
    const scene = base('led') as { wires: unknown[] };
    scene.wires = [{ id: '__proto__', from: { partId: 'led', pinId: 'anode' }, to: { partId: 'led', pinId: 'cathode' }, color: 'red', bends: [] }];
    expect(() => validateScene(scene)).toThrow();
  });
  it('a share link carrying such an id is refused and pollutes nothing', async () => {
    // Built by hand: encodeShare validates, so a hostile link can only come from somewhere else.
    const json = '{"version":1,"code":"","parts":[{"id":"__proto__","kind":"led","pos":[0,0,0],"rotY":0,"props":{}}],"wires":[]}';
    const compressed = new Blob([new TextEncoder().encode(json) as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const bytes = new Uint8Array(await new Response(compressed).arrayBuffer());
    const hash = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await expect(decodeShare(hash)).rejects.toThrow();
    await expect(encodeShare(JSON.parse(json) as Scene)).rejects.toThrow();
    expect(({} as Record<string, unknown>).anode).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('brightness');
  });
});
