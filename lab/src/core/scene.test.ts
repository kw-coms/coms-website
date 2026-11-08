import { describe, expect, it } from 'vitest';
import { acquisitionOnlyChanges, cloneJson, sameCircuit, stringifyJsonBounded, validateScene } from './scene';
import { SimulationEngine } from './engine';
import { encodeShare, decodeShare } from './share';
import type { Scene } from './types';
import { PARTS } from './parts';

const scene = (code = ''): Scene => ({
  version: 1,
  code,
  parts: [{ id: 'pixels', kind: 'neopixel-strip', pos: [0, 0, 0], rotY: 0, props: { count: 8 } }],
  wires: [],
});

describe('acquisition-only scene changes', () => {
  const measured = (): Scene => ({ version: 2, code: '', wires: [], parts: [
    { id: 'scope', kind: 'oscilloscope', pos: [0, 0, 0], rotY: 0, props: { timeDiv: 100, trigger: 2.5 } },
    { id: 'r', kind: 'resistor', pos: [100, 0, 0], rotY: 0, props: { ohms: 10000 } },
  ] });

  it('accepts added and removed acquisition settings without mutating either scene', () => {
    const before = measured(), after = measured();
    delete after.parts[0]!.props.trigger;
    after.parts[0]!.props.voltsDiv = 2;
    expect(acquisitionOnlyChanges(before, after)).toEqual(['scope']);
    expect(before).toEqual(measured());
    expect(after.parts[0]!.props).toEqual({ timeDiv: 100, voltsDiv: 2 });
  });

  it('ignores wire styling, non-electrical placement and document metadata in both callers', () => {
    const before = measured();
    before.wires.push({ id: 'w', color: 'blue', from: { partId: 'scope', pinId: 'CH1' }, to: { partId: 'r', pinId: '1' } });
    const after = structuredClone(before);
    after.wires[0]!.color = 'red';
    after.wires[0]!.bends = [[1, 2, 3]];
    after.parts[0]!.pos = [20, 0, 10];
    after.parts[0]!.rotY = 90;
    after.title = 'Visual edits';
    after.notes = [{ id: 'note', pos: [0, 0, 0], text: 'Label' }];
    expect(sameCircuit(before, after)).toBe(true);
    expect(acquisitionOnlyChanges(before, after)).toEqual([]);
    after.parts[0]!.props.timeDiv = 200;
    expect(sameCircuit(before, after)).toBe(false);
    expect(acquisitionOnlyChanges(before, after)).toEqual(['scope']);
  });

  it.each(['part', 'pin', 'id'])('treats a wire %s change as electrical', field => {
    const before = measured();
    before.wires.push({ id: 'w', color: 'blue', from: { partId: 'scope', pinId: 'CH1' }, to: { partId: 'r', pinId: '1' } });
    const after = structuredClone(before);
    if (field === 'part') after.wires[0]!.to = { partId: 'scope', pinId: 'GND' };
    if (field === 'pin') after.wires[0]!.to.pinId = '2';
    if (field === 'id') after.wires[0]!.id = 'new-wire';
    expect(sameCircuit(before, after)).toBe(false);
    expect(acquisitionOnlyChanges(before, after)).toBeUndefined();
  });

  it('preserves placement-derived connections when comparing movement and rotation', () => {
    const before = measured();
    const hole = PARTS['breadboard-half'].pins.find(pin => pin.id === 'b12')!.pos;
    const lead = PARTS.resistor.pins[0]!.pos;
    before.parts[1]!.pos = [hole[0] - lead[0], 0, hole[2] - lead[2]];
    before.parts.push({ id: 'board', kind: 'breadboard-half', pos: [0, 0, 0], rotY: 0, props: {} });
    const shifted = structuredClone(before);
    shifted.parts[1]!.pos[0] += .1;
    expect(sameCircuit(before, shifted)).toBe(true);
    shifted.parts[1]!.pos[0] += 100;
    expect(sameCircuit(before, shifted)).toBe(false);
    expect(acquisitionOnlyChanges(before, shifted)).toBeUndefined();
    const rotated = structuredClone(before);
    rotated.parts[1]!.rotY = 90;
    expect(sameCircuit(before, rotated)).toBe(false);
  });

  it.each(['resistance', 'kind', 'id', 'addition', 'removal', 'wire', 'unknown prop'])
  ('rejects an acquisition edit mixed with %s changes', change => {
    const before = measured(), after = measured();
    after.parts[0]!.props.timeDiv = 200;
    switch (change) {
      case 'resistance': after.parts[1]!.props.ohms = 20000; break;
      case 'kind': after.parts[0]!.kind = 'logic-analyzer'; break;
      case 'id': after.parts[0]!.id = 'other'; break;
      case 'addition': after.parts.push({ ...after.parts[1]!, id: 'extra' }); break;
      case 'removal': after.parts.pop(); break;
      case 'wire': after.wires.push({ id: 'w', color: 'blue', from: { partId: 'scope', pinId: 'CH1' }, to: { partId: 'r', pinId: '1' } }); break;
      case 'unknown prop': after.parts[0]!.props.unknown = 1; break;
    }
    expect(acquisitionOnlyChanges(before, after)).toBeUndefined();
  });
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
    expect(() => validateScene({ ...base(), blocks: { text: '한'.repeat(180_000) } })).toThrow('512 KB');
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    expect(() => validateScene({ ...base(), blocks: cycle })).toThrow('블록');
    let deep: unknown = null;
    for (let n = 0; n < 1001; n++) deep = [deep]; // 1,001 levels: one past MAX_BLOCKS_JSON_DEPTH
    expect(() => validateScene({ ...base(), blocks: deep })).toThrow('1,000단계');
    let ok: unknown = null;
    for (let n = 0; n < 999; n++) ok = [ok]; // still inside the limit: the depth check is what rejected the one above
    expect(() => validateScene({ ...base(), blocks: ok })).toThrow('블록 구조'); // fails later, on shape, not on depth
    expect(() => validateScene({ ...base(), blocks: { value: Number.POSITIVE_INFINITY } })).toThrow('블록');
    const hidden = [] as unknown[] & { extra?: unknown };
    hidden.extra = hidden;
    expect(() => validateScene({ ...base(), blocks: hidden })).toThrow('블록');
    const sparse: unknown[] = [];
    sparse.length = 1_000_000_000;
    expect(() => validateScene({ ...base(), blocks: sparse })).toThrow('블록');
    const copied = cloneJson(hidden);
    expect(copied.extra).toBe(copied); // bounded clone handles aliases/cycles
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
  it('keeps supported deep workspaces serializable and cloneable on a small stack', async () => {
    const workspace = chain(450, 'next'); // 902 JSON levels, within the 1,000-level contract
    const input = sceneWith(workspace) as Scene;
    const checked = validateScene(input);
    const json = stringifyJsonBounded(checked, Infinity, Infinity, true);
    expect(json).not.toBeNull();
    expect(stringifyJsonBounded(JSON.parse(json!), Infinity, Infinity, true)).toBe(json);
    expect(stringifyJsonBounded(JSON.parse(stringifyJsonBounded(checked, Infinity, Infinity, true, 2)!), Infinity, Infinity, true)).toBe(json);
    expect(stringifyJsonBounded({ a: [1, { b: 'x' }] }, Infinity, Infinity, true, 2))
      .toBe(JSON.stringify({ a: [1, { b: 'x' }] }, null, 2));
    const copy = cloneJson(checked);
    expect(stringifyJsonBounded(copy, Infinity, Infinity, true)).toBe(json);
    const engine = new SimulationEngine();
    expect(() => engine.setScene(checked)).not.toThrow();
    expect(stringifyJsonBounded(await decodeShare(await encodeShare(checked)), Infinity, Infinity, true)).toBe(json);
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
      expect(() => validateScene(sceneWith(chain(10_000, key)))).toThrow(/블록/);
      // JSON.parse builds the imported-file shape without stringifying a deep object in the test.
      const prefix = key === 'next' ? '{"type":"lab_serial_println","next":{"block":' : '{"type":"logic_negate","inputs":{"BOOL":{"block":';
      const suffix = key === 'next' ? '}}' : '}}}';
      const parsed = JSON.parse('{"blocks":{"blocks":[' + prefix.repeat(10_000) + '{"type":"lab_serial_println"}' + suffix.repeat(10_000) + ']}}');
      expect(() => validateScene(sceneWith(parsed))).toThrow(/블록/);
      expect(Date.now() - t0).toBeLessThan(2000);
    }
  });
  it('rejects too many blocks (wide) and too big payloads', () => {
    const wide = { blocks: { blocks: Array.from({ length: 5001 }, () => ({ type: 'lab_loop' })) } };
    expect(() => validateScene(sceneWith(wide))).toThrow(/블록/);
    expect(() => validateScene(sceneWith({ blocks: { blocks: [{ type: 'a', fields: { T: 'x'.repeat(300_000) } }] } }))).toThrow(/블록/);
  });
});
