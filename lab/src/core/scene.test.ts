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
    expect(validateScene(allowed)).toEqual({ ...allowed, version: 2, codeMode: 'text' });
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
    expect(validateScene(maximum)).toEqual({ ...maximum, version: 2, codeMode: 'text' });
    maximum.wires.push({ ...maximum.wires[0]!, id: 'wire-extra' });
    expect(() => validateScene(maximum)).toThrow('개수 제한');
    maximum.wires.pop();
    maximum.code += 'a';
    expect(() => validateScene(maximum)).toThrow('64 KB');
  });

  it('round-trips exactly 32 KiB decoded shares and rejects one byte more', async () => {
    const maximum = scene();
    maximum.version = 2;
    const emptyBytes = new TextEncoder().encode(JSON.stringify(maximum)).length;
    maximum.code = 'a'.repeat(32 * 1024 - emptyBytes);
    expect(new TextEncoder().encode(JSON.stringify(maximum)).length).toBe(32 * 1024);
    expect(await decodeShare(await encodeShare(maximum))).toEqual(maximum);
    maximum.code += 'a';
    await expect(encodeShare(maximum)).rejects.toThrow('32 KB');
  });
});

describe('v2 scene metadata', () => {
  const base = (): Scene => ({ version: 2, code: '', parts: [], wires: [] });
  it('upgrades v1 and preserves valid v2 notes, blocks, code mode and mission', async () => {
    expect(validateScene({ ...base(), version: 1 })).toEqual({ ...base(), codeMode: 'text' });
    const old = JSON.stringify({ ...base(), version: 1 });
    const compressed = new Blob([new TextEncoder().encode(old) as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const bytes = new Uint8Array(await new Response(compressed).arrayBuffer());
    const hash = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(await decodeShare(hash)).toEqual({ ...base(), codeMode: 'text' });
    const v2: Scene = { ...base(), codeMode: 'blocks+text', blocks: { blocks: { languageVersion: 0, blocks: [] } },
      notes: [{ id: 'note-1', pos: [1, 2, 3], text: '회로 메모', color: 'pink' }], mission: 'study-1' };
    expect(await decodeShare(await encodeShare(v2))).toEqual(v2);
  });
  it('rejects oversized, cyclic, deep, and non-JSON blocks', () => {
    expect(() => validateScene({ ...base(), blocks: { text: '한'.repeat(88_000) } })).toThrow('256 KB');
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    expect(() => validateScene({ ...base(), blocks: cycle })).toThrow('블록');
    let deep: unknown = null;
    for (let n = 0; n < 65; n++) deep = [deep];
    expect(() => validateScene({ ...base(), blocks: deep })).toThrow('블록');
    expect(() => validateScene({ ...base(), blocks: { value: Number.POSITIVE_INFINITY } })).toThrow('블록');
  });
  it('rejects hostile notes, modes and mission ids', () => {
    expect(() => validateScene({ ...base(), notes: Array.from({ length: 101 }, (_, n) => ({ id: `n${n}`, pos: [0, 0, 0], text: '' })) })).toThrow('100개');
    expect(() => validateScene({ ...base(), notes: [{ id: '__proto__', pos: [0, 0, 0], text: '' }] })).toThrow('메모');
    expect(() => validateScene({ ...base(), notes: [{ id: 'n', pos: [0, 0, 0], text: 'x'.repeat(501) }] })).toThrow('메모');
    expect(() => validateScene({ ...base(), codeMode: 'javascript' })).toThrow('코드 모드');
    expect(() => validateScene({ ...base(), mission: '../admin' })).toThrow('미션');
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

describe('validateScene: blocks shape', () => {
  const sceneWith = (blocks: unknown) => ({ version: 2, parts: [], wires: [], code: '', blocks });
  const ok = (type: string) => ({ blocks: { blocks: [{ type }] } });
  const chain = (n: number, key: 'next' | 'inputs'): unknown => {
    let b: unknown = { type: 'lab_serial_println' };
    for (let i = 0; i < n; i++) b = key === 'next' ? { type: 'lab_serial_println', next: { block: b } } : { type: 'logic_negate', inputs: { BOOL: { block: b } } };
    return { blocks: { blocks: [b] } };
  };
  it('accepts a normal workspace', () => {
    expect(() => validateScene(sceneWith(ok('lab_loop')))).not.toThrow();
    expect(() => validateScene(sceneWith(chain(100, 'next')))).not.toThrow();
  });
  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'bad type!', ''])('rejects block type %j', (type) => {
    expect(() => validateScene(JSON.parse(JSON.stringify(sceneWith(ok(type)))))).toThrow(/블록/);
  });
  it('rejects non-string types and malformed shapes', () => {
    for (const bad of [{ blocks: { blocks: [{ type: 5 }] } }, { blocks: { blocks: [{ type: null }] } }, { blocks: { blocks: [{}] } },
      { blocks: { blocks: [7] } }, { blocks: { blocks: {} } }, { blocks: 'x' }, 'x', [],
      { blocks: { blocks: [{ type: 'a', inputs: 'x' }] } }, { blocks: { blocks: [{ type: 'a', inputs: { DO: 3 } }] } },
      { blocks: { blocks: [{ type: 'a', next: [] }] } }, { variables: 'x' }, { variables: [{ id: 5 }] }]) {
      expect(() => validateScene(sceneWith(bad)), JSON.stringify(bad)).toThrow(/블록/);
    }
  });
  it('rejects 10k-deep nesting quickly, both through next and through inputs', () => {
    for (const key of ['next', 'inputs'] as const) {
      const t0 = Date.now();
      expect(() => validateScene(JSON.parse(JSON.stringify(sceneWith(chain(10_000, key)))))).toThrow(/블록/);
      expect(Date.now() - t0).toBeLessThan(2000);
    }
  });
  it('rejects too many blocks (wide) and too big payloads', () => {
    const wide = { blocks: { blocks: Array.from({ length: 5001 }, () => ({ type: 'lab_loop' })) } };
    expect(() => validateScene(sceneWith(wide))).toThrow(/블록/);
    expect(() => validateScene(sceneWith({ blocks: { blocks: [{ type: 'a', fields: { T: 'x'.repeat(300_000) } }] } }))).toThrow(/블록/);
  });
});
