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
