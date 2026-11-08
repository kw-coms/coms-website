import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Scene } from '../core/types';

// The store reads localStorage at import time, so each test loads fresh modules over stubbed browser globals.
type Mods = { store: typeof import('./store'); actions: typeof import('./actions'); core: typeof import('./core'); share: typeof import('./shareHash') };
let mem: Map<string, string>;
let confirmFn: ReturnType<typeof vi.fn>;
let replaceState: ReturnType<typeof vi.fn>;
const loc = { hash: '', pathname: '/lab/', search: '', origin: 'http://x' };

async function boot(): Promise<Mods> {
  vi.resetModules();
  const [store, actions, core, share] = await Promise.all([import('./store'), import('./actions'), import('./core'), import('./shareHash')]);
  return { store, actions, core, share };
}
/** The example as the app holds it after import: validateScene upgrades v1 scenes to v2. */
/** Blockly (the editor's chunk) is what canonicalizes block scenes; load it like an import or share link does. */
const withBlockly = async () => (await import('./blocks/canon')).ensureCanon();
const example = (m: Mods, id: string) => m.core.validateScene(m.core.EXAMPLES.find((e) => e.id === id)!.scene);

beforeEach(() => {
  mem = new Map();
  confirmFn = vi.fn(() => true);
  replaceState = vi.fn((_s: unknown, _t: string, url: string) => { loc.hash = ''; void url; });
  loc.hash = '';
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
  vi.stubGlobal('confirm', confirmFn);
  vi.stubGlobal('location', loc);
  vi.stubGlobal('history', { replaceState });
});
afterEach(() => vi.unstubAllGlobals());

describe('mission progress storage', () => {
  it('keeps the fixed storage schema in sync with public mission IDs', async () => {
    const m = await boot();
    const { MISSIONS } = await import('../missions/catalog');
    expect([...m.store.STORED_MISSION_IDS].sort()).toEqual(MISSIONS.map(mission => mission.id).sort());
  });

  it('persists only known mission IDs, completion status and timestamp', async () => {
    const m = await boot();
    const progress = { done: true, at: 1234,
      checks: [{ id: '6', label: 'sample answer 1234', ok: true, message: 'secret result' }],
      checker: [{ kind: 'expectSerial', includes: 'secret result' }],
      referenceScene: { code: 'sample answer 1234' },
    };
    m.store.saveMissionProgress('keypad-password', progress);
    expect(JSON.parse(mem.get(m.store.MISSIONS_KEY)!)).toEqual({
      'keypad-password': { done: true, at: 1234 },
    });
    expect(() => m.store.saveMissionProgress('unknown', { done: true })).toThrow('존재하지 않는 미션');
  });

  it('drops legacy checker details and unknown IDs on load', async () => {
    mem.set('coms-lab:missions', JSON.stringify({
      'keypad-password': { done: true, at: 1234, checks: [{ label: 'sample answer 1234' }], referenceScene: { code: 'secret result' } },
      unknown: { done: true, at: 1234, secret: 'secret result' },
      'led-blink': { done: 'true', at: 1234 },
    }));
    const m = await boot();
    expect(m.store.getState().missionProgress).toEqual({ 'keypad-password': { done: true, at: 1234 } });
    m.store.saveMissionProgress('keypad-password', m.store.getState().missionProgress['keypad-password']!);
    expect(JSON.parse(mem.get(m.store.MISSIONS_KEY)!)).toEqual({ 'keypad-password': { done: true, at: 1234 } });
  });
});

describe('loadFromLocationHash', () => {
  it('removes #s= from the URL before decoding and loads the shared scene', async () => {
    const m = await boot();
    const shared = example(m, 'button-led');
    const token = await m.core.encodeShare(shared);
    loc.hash = m.share.shareHash(token);
    m.store.markClean();
    await m.actions.loadFromLocationHash();
    expect(replaceState).toHaveBeenCalledWith(null, '', '/lab/');
    expect(loc.hash).toBe('');
    expect(m.store.scene().parts).toEqual(shared.parts);
    expect(confirmFn).not.toHaveBeenCalled();
  });
  it('removes the hash even when the token is corrupt, and leaves the document alone', async () => {
    const m = await boot();
    loc.hash = '#s=!!notatoken';
    const before = m.store.getState().hist.present;
    await m.actions.loadFromLocationHash();
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(loc.hash).toBe('');
    expect(m.store.getState().hist.present).toBe(before);
    expect(m.store.getState().toast).toBeTruthy();
  });
  it('does nothing when there is no share hash', async () => {
    const m = await boot();
    loc.hash = '#other';
    await m.actions.loadFromLocationHash();
    expect(replaceState).not.toHaveBeenCalled();
  });
  it('stops the simulator before replacing the document', async () => {
    const m = await boot();
    const sh = await import('./simHost');
    const stopSpy = vi.spyOn(sh.sim, 'stop');
    loc.hash = m.share.shareHash(await m.core.encodeShare(example(m, 'button-led')));
    await m.actions.loadFromLocationHash();
    expect(stopSpy).toHaveBeenCalled();
  });
  it('asks confirmReplace when dirty and keeps the document when declined', async () => {
    const m = await boot();
    m.store.loadScene(example(m, 'external-blink'));
    m.store.setCode(m.store.getState().code + '\n// mine');
    const mine = m.store.scene();
    loc.hash = m.share.shareHash(await m.core.encodeShare(example(m, 'button-led')));
    confirmFn.mockReturnValue(false);
    await m.actions.loadFromLocationHash();
    expect(confirmFn).toHaveBeenCalledTimes(1);
    expect(m.store.scene()).toEqual(mine);
    expect(loc.hash).toBe('');
  });
  it('replaces the dirty document when the user confirms', async () => {
    const m = await boot();
    m.store.loadScene(example(m, 'external-blink'));
    m.store.setCode(m.store.getState().code + '\n// mine');
    loc.hash = m.share.shareHash(await m.core.encodeShare(example(m, 'button-led')));
    await m.actions.loadFromLocationHash();
    expect(confirmFn).toHaveBeenCalledTimes(1);
    expect(m.store.scene().parts).toEqual(example(m, 'button-led').parts);
  });
});

describe('confirmReplace gating', () => {
  it('loadExample does not ask when the document is clean', async () => {
    const m = await boot();
    m.store.loadScene(example(m, 'external-blink'));
    m.actions.loadExample('button-led');
    expect(confirmFn).not.toHaveBeenCalled();
    expect(m.store.scene().parts).toEqual(example(m, 'button-led').parts);
  });
  it('loadExample keeps a dirty document when declined', async () => {
    const m = await boot();
    m.store.loadScene(example(m, 'external-blink'));
    m.store.setCode(m.store.getState().code + '\n// edit');
    const mine = m.store.scene();
    confirmFn.mockReturnValue(false);
    m.actions.loadExample('button-led');
    expect(confirmFn).toHaveBeenCalledTimes(1);
    expect(m.store.scene()).toEqual(mine);
  });
  it('loadExample replaces a code-only-dirty document when confirmed', async () => {
    const m = await boot();
    m.store.loadScene(example(m, 'external-blink'));
    m.store.setCode(m.store.getState().code + '\n// edit');
    m.actions.loadExample('button-led');
    expect(confirmFn).toHaveBeenCalledTimes(1);
    expect(m.store.scene()).toEqual(example(m, 'button-led'));
  });
  it('a restored autosave counts as unsaved work', async () => {
    const m0 = await boot();
    mem.set(m0.store.SAVE_KEY, JSON.stringify(example(m0, 'external-blink')));
    const m = await boot();
    expect(m.store.isDirty()).toBe(true);
    confirmFn.mockReturnValue(false);
    m.actions.loadExample('button-led');
    expect(confirmFn).toHaveBeenCalledTimes(1);
    expect(m.store.scene()).toEqual(example(m, 'external-blink'));
  });
  const file = (s: Scene) => new File([JSON.stringify(s)], 'c.json', { type: 'application/json' });
  it('importJson keeps a dirty document when declined', async () => {
    const m = await boot();
    m.store.loadScene(example(m, 'external-blink'));
    m.store.setCode(m.store.getState().code + '\n// edit');
    const mine = m.store.scene();
    confirmFn.mockReturnValue(false);
    await m.actions.importJson(file(example(m, 'button-led')));
    expect(confirmFn).toHaveBeenCalledTimes(1);
    expect(m.store.scene()).toEqual(mine);
  });
  it('importJson replaces a dirty document when confirmed', async () => {
    const m = await boot();
    m.store.loadScene(example(m, 'external-blink'));
    m.store.setCode(m.store.getState().code + '\n// edit');
    await m.actions.importJson(file(example(m, 'button-led')));
    expect(m.store.scene()).toEqual(example(m, 'button-led'));
  });
  it('importJson on a restored autosave asks before replacing', async () => {
    const m0 = await boot();
    mem.set(m0.store.SAVE_KEY, JSON.stringify(example(m0, 'external-blink')));
    const m = await boot();
    confirmFn.mockReturnValue(false);
    await m.actions.importJson(file(example(m, 'button-led')));
    expect(confirmFn).toHaveBeenCalledTimes(1);
    expect(m.store.scene()).toEqual(example(m, 'external-blink'));
  });
});

describe('caps', () => {
  it('refuses the 601st wire', async () => {
    const m = await boot();
    m.store.loadScene(example(m, 'builtin-blink'));
    const a = { partId: 'uno', pinId: 'D2' }, b = { partId: 'uno', pinId: 'D3' };
    for (let i = 0; i < 605; i++) m.store.addWire(a, b);
    expect(m.store.wires().length).toBe(600);
    expect(m.store.getState().toast).toBeTruthy();
  });
  it('refuses the 21st bend of a wire and keeps the 20 it has', async () => {
    const m = await boot();
    m.store.loadScene(example(m, 'external-blink'));
    const id = m.store.wires()[0]!.id;
    const bends = (n: number) => Array.from({ length: n }, (_, i) => [i, 0, 0] as [number, number, number]);
    m.store.liveWire(id, { bends: bends(20) });
    expect(m.store.wires()[0]!.bends).toHaveLength(20);
    m.store.liveWire(id, { bends: bends(21) });
    expect(m.store.wires()[0]!.bends).toHaveLength(20);
    expect(m.store.getState().toast).toMatch(/20/);
  });
});

describe('startDoc with a corrupt autosave', () => {
  it('keeps a raw backup, loads the default example and raises the notice', async () => {
    const m0 = await boot();
    mem.set(m0.store.SAVE_KEY, '{"version":1,"parts":"broken');
    const m = await boot();
    expect(mem.get(m.store.BACKUP_KEY)).toBe('{"version":1,"parts":"broken');
    expect(m.store.getState().restoreNotice).toBe(true);
    const ex = m.core.EXAMPLES[0]!.scene;
    expect(m.store.scene().parts).toEqual(ex.parts);
    expect(m.store.getState().code).toBe(ex.code);
  });
  it('shows no notice and writes no backup for a valid autosave', async () => {
    const m0 = await boot();
    mem.set(m0.store.SAVE_KEY, JSON.stringify(example(m0, 'external-blink')));
    const m = await boot();
    expect(m.store.getState().restoreNotice).toBe(false);
    expect(mem.has(m.store.BACKUP_KEY)).toBe(false);
  });
});

describe('rotateSelection of a breadboard', () => {
  it('turns inserted parts about the board origin and keeps them inserted', async () => {
    const m = await boot();
    const s = example(m, 'external-blink');
    m.store.loadScene(s);
    const board = s.parts.find((p) => p.kind.startsWith('breadboard'))!;
    const kidIds = [...new Set(Object.entries(m.store.getState().analysis.insertions).filter(([, r]) => r.partId === board.id).map(([k]) => k.split(':')[0]!))];
    expect(kidIds.length).toBeGreaterThan(0);
    const before = new Map(m.store.parts().map((p) => [p.id, p]));
    const insertedBefore = Object.keys(m.store.getState().analysis.insertions).sort();
    m.store.selectPart(board.id);
    m.store.rotateSelection();
    for (const id of kidIds) {
      const k = before.get(id)!, now = m.store.getPart(id)!;
      const dx = k.pos[0] - board.pos[0], dz = k.pos[2] - board.pos[2];
      expect(now.pos[0]).toBeCloseTo(board.pos[0] + dz);
      expect(now.pos[2]).toBeCloseTo(board.pos[2] - dx);
      expect(now.rotY).toBe((k.rotY + 90) % 360);
    }
    expect(m.store.getPart(board.id)!.rotY).toBe((board.rotY + 90) % 360);
    expect(Object.keys(m.store.getState().analysis.insertions).sort()).toEqual(insertedBefore);
  });
});

describe('block-mode scenes never run hidden code, and mission scenes open on their mission', () => {
  const HIDDEN = 'void setup() { pinMode(13, OUTPUT); }\nvoid loop() { digitalWrite(13, HIGH); /* HIDDEN */ }\n';
  const blockScene = async (m: Mods, codeMode: 'blocks' | 'blocks+text' | 'text', code = HIDDEN) => {
    await withBlockly();
    const { STARTER_BLOCKS } = await import('./blocks/starters');
    return { ...example(m, 'external-blink'), codeMode, blocks: STARTER_BLOCKS['external-blink'], code } as Scene;
  };
  const generated = async (m: Mods, s: Scene) => {
    const { generate } = await import('./blocks/generate');
    const { sceneContext } = await import('./blocks/context');
    return generate(s.blocks, sceneContext(s.parts, m.core.analyze(s)).opts).code;
  };

  it.each(['blocks', 'blocks+text'] as const)('loadScene (%s) regenerates the code from the blocks', async (mode) => {
    const m = await boot();
    const s = await blockScene(m, mode);
    m.store.loadScene(s);
    expect(m.store.getState().code).toBe(await generated(m, s));
    expect(m.store.getState().code).not.toContain('HIDDEN');
    expect(m.store.isDirty()).toBe(false);
  });
  it('a block mode without blocks starts from the default program, not from the hidden code', async () => {
    const m = await boot();
    await withBlockly();
    m.store.loadScene({ ...example(m, 'external-blink'), codeMode: 'blocks', blocks: undefined, code: HIDDEN } as Scene);
    expect(m.store.getState().code).not.toContain('HIDDEN');
    expect(m.store.getState().hist.present.blocks).toBeTruthy();
  });
  it('text mode keeps its own code', async () => {
    const m = await boot();
    m.store.loadScene(await blockScene(m, 'text'));
    expect(m.store.getState().code).toBe(HIDDEN);
  });
  it('importJson of such a file loads the blocks code', async () => {
    const m = await boot();
    const s = await blockScene(m, 'blocks');
    await m.actions.importJson(new File([JSON.stringify(s)], 'c.json', { type: 'application/json' }));
    expect(m.store.getState().code).toBe(await generated(m, s));
  });
  it('a share link of such a scene loads the blocks code', async () => {
    const m = await boot();
    const s = await blockScene(m, 'blocks');
    loc.hash = m.share.shareHash(await m.core.encodeShare(s));
    await m.actions.loadFromLocationHash();
    expect(m.store.getState().code).toBe(await generated(m, s));
  });
  it('the autosave restore at startup also regenerates', async () => {
    const m0 = await boot();
    const s = await blockScene(m0, 'blocks');
    mem.set(m0.store.SAVE_KEY, JSON.stringify({ canonVersion: m0.store.CANON_VERSION, scene: s }));
    const m = await boot();
    expect(m.store.getState().code).toBe(await generated(m, s));
  });

  it('a share link carrying a mission restores missionId and opens the mission panel', async () => {
    const m = await boot();
    const { MISSIONS } = await import('../missions');
    const mission = MISSIONS[1]!;
    expect(m.store.getState().missionId).toBeNull();
    loc.hash = m.share.shareHash(await m.core.encodeShare(structuredClone(mission.starterScene)));
    await m.actions.loadFromLocationHash();
    expect(m.store.getState().missionId).toBe(mission.id);
    expect(m.store.getState().sideTab).toBe('missions');
    expect(m.store.getState().sideOpen).toBe(true);
  });
  it('importJson restores the mission, and loading any other scene leaves it', async () => {
    const m = await boot();
    const { MISSIONS } = await import('../missions');
    const mission = MISSIONS[0]!;
    await m.actions.importJson(new File([JSON.stringify(mission.starterScene)], 'm.json', { type: 'application/json' }));
    expect(m.store.getState().missionId).toBe(mission.id);
    m.actions.loadExample('button-led');
    expect(m.store.getState().missionId).toBeNull();
  });
  it('#mission=<id> opens that mission, clears the hash, and asks first when work is unsaved', async () => {
    const m = await boot();
    const { MISSIONS } = await import('../missions');
    loc.hash = `#mission=${MISSIONS[1]!.id}`;
    await m.actions.loadFromLocationHash();
    expect(replaceState).toHaveBeenCalledWith(null, '', '/lab/');
    expect(m.store.getState()).toMatchObject({ missionId: MISSIONS[1]!.id, sideTab: 'missions' });
    expect(confirmFn).not.toHaveBeenCalled();
    m.store.setCode(m.store.getState().code + '\n// edit');
    confirmFn.mockReturnValue(false);
    loc.hash = `#mission=${MISSIONS[2]!.id}`;
    await m.actions.loadFromLocationHash();
    expect(confirmFn).toHaveBeenCalledTimes(1);
    expect(m.store.getState().missionId).toBe(MISSIONS[1]!.id);
  });
  it('#mission=<unknown> only shows a Korean notice', async () => {
    const m = await boot();
    const before = m.store.getState().hist.present;
    loc.hash = '#mission=no-such-mission';
    await m.actions.loadFromLocationHash();
    expect(m.store.getState().toast).toBe('그 미션을 찾을 수 없어요.');
    expect(m.store.getState().hist.present).toBe(before);
    expect(loc.hash).toBe('');
  });
  it('the autosave restore keeps the mission', async () => {
    const m0 = await boot();
    const { MISSIONS } = await import('../missions');
    mem.set(m0.store.SAVE_KEY, JSON.stringify(MISSIONS[0]!.starterScene));
    expect((await boot()).store.getState().missionId).toBe(MISSIONS[0]!.id);
  });
});

describe('canonical blocks in the document', () => {
  const loopOf = (...stack: unknown[]) => {
    const blocks = stack as { next?: unknown }[];
    for (let i = blocks.length - 2; i >= 0; i--) blocks[i]!.next = { block: blocks[i + 1] };
    return { type: 'lab_loop', inputs: { DO: { block: blocks[0] } } };
  };
  const state = (variables: { id: string; name: string }[], ...stack: unknown[]) =>
    ({ blocks: { languageVersion: 0, blocks: [loopOf(...stack)] }, variables });
  const set = (id: string, v: number) => ({ type: 'variables_set', fields: { VAR: { id } }, inputs: { VALUE: { block: { type: 'math_number', fields: { NUM: v } } } } });
  const scene = async (m: Mods, blocks: unknown, codeMode: 'blocks' | 'text' = 'blocks') => {
    await withBlockly();
    return { ...example(m, 'external-blink'), codeMode, blocks, code: 'void setup() {}\nvoid loop() { /* HIDDEN */ }\n' } as Scene;
  };

  it('renaming a variable to 점수? in the editor is accepted and runs the new name', async () => {
    const m = await boot();
    await m.actions.importJson(new File([JSON.stringify(await scene(m, state([{ id: 'a', name: 'score' }], set('a', 1))))], 'c.json'));
    expect(m.store.getState().code).toContain('v_score = 1;');
    m.store.set({ toast: null });
    m.store.setBlocks(state([{ id: 'a', name: '점수?' }], set('a', 1))); // what BlocksEditor reports after a rename
    expect(m.store.getState().toast).toBeNull();
    expect(m.store.getState().code).toContain('v_1 = 1;');
    expect(m.store.getState().code).toContain('// 변수 "점수？"');
    expect(m.store.getState().code).not.toContain('v_score');
    expect(JSON.stringify(m.store.getState().hist.present.blocks)).toContain('점수?');
  });

  it('a scene whose raw JSON and Blockly reading disagree runs the Blockly reading', async () => {
    const m = await boot();
    const raw = { blocks: { languageVersion: 0, blocks: [loopOf({ type: 'variables_set', fields: { VAR: 'foo' }, inputs: { VALUE: { block: { type: 'math_number', fields: { NUM: 1 } } } } })] } };
    m.store.loadScene(await scene(m, raw));
    const stored = JSON.stringify(m.store.getState().hist.present.blocks);
    expect(stored).toContain('"variables"');
    expect(m.store.getState().code).not.toMatch(/\bfoo\b/);
    expect(m.store.getState().code).not.toContain('HIDDEN');
  });

  it('refuses, with a Korean reason and without touching the document, what Blockly cannot read', async () => {
    const m = await boot();
    const before = m.store.getState().hist.present;
    const bad = { blocks: { languageVersion: 0, blocks: [{ type: 'lab_loop', inputs: { NOPE: { block: { type: 'lab_millis' } } } }] } };
    await withBlockly();
    expect(() => m.store.loadScene({ ...example(m, 'external-blink'), codeMode: 'blocks', blocks: bad } as Scene)).toThrow(/[가-힣]/);
    expect(m.store.getState().hist.present).toBe(before);
  });

  it('a text-mode scene that carries blocks is canonicalized too (switching to blocks later must not run another reading)', async () => {
    const m = await boot();
    const raw = state([], { type: 'lab_digital_write' });
    m.store.loadScene(await scene(m, raw, 'text'));
    expect(JSON.stringify(m.store.getState().hist.present.blocks)).toContain('"PIN":"2"');
    expect(m.store.getState().code).toContain('HIDDEN'); // text mode keeps its own code
  });

  it('fails closed before Blockly is loaded', async () => {
    const m = await boot();
    const s = { ...example(m, 'external-blink'), codeMode: 'blocks', blocks: state([], set('a', 1)), code: 'x' } as Scene;
    expect(() => m.store.loadScene(s)).toThrow(/불러오지 못했어요/);
  });

  it('code generated from the blocks may not pass the 64 KB code limit', async () => {
    const m = await boot();
    const big = Array.from({ length: 24 }, () => ({ type: 'lab_serial_print', inputs: { VALUE: { block: { type: 'text', fields: { TEXT: '"'.repeat(2000) } } } } }));
    const raw = { blocks: { languageVersion: 0, blocks: [loopOf(...big)] } };
    await withBlockly();
    expect(() => m.store.loadScene({ ...example(m, 'external-blink'), codeMode: 'blocks', blocks: raw } as Scene)).toThrow(/64 KB/);
    m.store.setBlocks(raw);
    expect(m.store.getState().toast).toMatch(/64 KB/);
  });

  it('a huge TEXT is refused at import', async () => {
    const m = await boot();
    const raw = state([], { type: 'lab_serial_print', inputs: { VALUE: { block: { type: 'text', fields: { TEXT: 'x'.repeat(2001) } } } } });
    expect(() => m.core.validateScene({ ...example(m, 'external-blink'), codeMode: 'blocks', blocks: raw })).toThrow(/블록 필드/);
  });
});


describe('trust boundaries: Blockly only for what we did not write', () => {
  const chunkFails = () => vi.doMock('./blocks/blocklyRuntime', () => { throw new Error('chunk failed'); });
  afterEach(() => { vi.doUnmock('./blocks/blocklyRuntime'); });
  const blocks = { blocks: { languageVersion: 0, blocks: [{ type: 'lab_loop', inputs: { DO: { block: { type: 'lab_digital_write', fields: { PIN: '8', STATE: 'HIGH' } } } } }] } };
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it('an autosave with the marker restores without loading Blockly, even if the chunk cannot load', async () => {
    await wait(800); // earlier tests' stores share this localStorage stub: let their pending autosaves land first
    const m0 = await boot();
    const saved = JSON.stringify({ canonVersion: m0.store.CANON_VERSION, scene: { ...example(m0, 'external-blink'), codeMode: 'blocks', blocks, code: 'x' } });
    mem.set(m0.store.SAVE_KEY, saved);
    chunkFails();
    const m = await boot();
    expect(m.store.getState().restoreNotice).toBe(false);
    expect(m.store.getState().hist.present.codeMode).toBe('blocks');
    expect(m.store.getState().code).toContain('digitalWrite(8, HIGH);');
  });

  it('autosaves of block scenes carry the marker, text scenes stay plain', async () => {
    await wait(800); // earlier tests' stores share this localStorage stub
    const m = await boot();
    await withBlockly();
    m.store.loadScene({ ...example(m, 'external-blink'), codeMode: 'blocks', blocks, code: 'x' } as Scene);
    m.store.setCode(m.store.getState().code + '\n');
    await wait(800);
    expect(JSON.parse(mem.get(m.store.SAVE_KEY)!).canonVersion).toBe(m.store.CANON_VERSION);
    const t = await boot();
    t.store.loadScene(example(t, 'external-blink'));
    t.store.setCode('void setup() {}\nvoid loop() {}\n');
    await wait(800);
    expect(JSON.parse(mem.get(t.store.SAVE_KEY)!).canonVersion).toBeUndefined();
  });

  const until = async (ok: () => boolean) => { for (let i = 0; i < 200 && !ok(); i++) await wait(50); };
  const unmarked = async () => {
    const m0 = await boot();
    await withBlockly();
    const raw = JSON.stringify({ ...example(m0, 'external-blink'), codeMode: 'blocks', blocks, code: 'x' });
    mem.set(m0.store.SAVE_KEY, raw);
    return { raw, m0 };
  };

  it('an unmarked block autosave (saved by an earlier build) migrates like an import and gets the marker', async () => {
    await wait(800); // earlier tests' stores share this localStorage stub: let their pending autosaves land first
    const { raw } = await unmarked();
    const m = await boot();
    await until(() => m.store.getState().hist.present.codeMode === 'blocks');
    expect(m.store.getState().restoreNotice).toBe(false);
    expect(m.store.getState().code).toContain('digitalWrite(8, HIGH);');
    await wait(800);
    const saved = JSON.parse(mem.get(m.store.SAVE_KEY)!);
    expect(saved.canonVersion).toBe(m.store.CANON_VERSION);
    expect(mem.has(m.store.BACKUP_KEY)).toBe(false);
    void raw;
  }, 60000);

  it('when Blockly cannot load, the raw data is kept in the backup, the notice shows and the default stays', async () => {
    await wait(800);
    const { raw } = await unmarked();
    chunkFails();
    const m = await boot();
    await until(() => m.store.getState().restoreNotice);
    expect(m.store.getState().restoreNotice).toBe(true);
    expect(mem.get(m.store.BACKUP_KEY)).toBe(raw);
    expect(m.store.getState().hist.present.codeMode).not.toBe('blocks');
  }, 60000);

  it('a newer backup never silently replaces an older, different one', async () => {
    await wait(800);
    const { raw } = await unmarked();
    mem.set('coms-lab:scene:v1:backup', 'OLDER');
    chunkFails();
    const m = await boot();
    await until(() => m.store.getState().restoreNotice);
    expect(mem.get(m.store.BACKUP_KEY)).toBe(raw);
    expect(mem.get(m.store.BACKUP_PREV_KEY)).toBe('OLDER');
  }, 60000);

  it('the backup / autosave wrapper imports: unwrapped, still canonicalized, large files allowed', async () => {
    const m = await boot();
    await withBlockly();
    const scene = { ...example(m, 'external-blink'), codeMode: 'blocks', blocks, code: 'x' };
    const pretty = JSON.stringify({ canonVersion: m.store.CANON_VERSION, scene }, null, 2);
    await m.actions.importJson(new File([pretty], 'circuit-lab-backup.json'));
    expect(m.store.getState().hist.present.codeMode).toBe('blocks');
    expect(m.store.getState().code).toContain('digitalWrite(8, HIGH);');
    const pad = { ...scene, title: 'x'.repeat(150), notes: undefined };
    const big = JSON.stringify({ ...pad, blocks: { blocks: { languageVersion: 0, blocks: Array.from({ length: 2500 }, (_, i) => ({ type: 'math_number', id: `b${i}`, x: 0, y: i, fields: { NUM: 1 } })) } } }, null, 2);
    expect(big.length).toBeGreaterThan(400_000);
    m.store.set({ toast: null });
    await m.actions.importJson(new File([big], 'big.json'));
    expect(m.store.getState().toast).not.toMatch(/너무 커요/);
  }, 60000);

  it('a refused scene does not stop the running simulation', async () => {
    const stop = vi.fn();
    vi.doMock('./simHost', async (orig) => ({ ...(await orig<object>()), stop }));
    const m = await boot();
    await withBlockly();
    const bad = { blocks: { languageVersion: 0, blocks: [{ type: 'lab_loop', inputs: { NOPE: { block: { type: 'lab_millis' } } } }] } };
    await m.actions.importJson(new File([JSON.stringify({ ...example(m, 'external-blink'), codeMode: 'blocks', blocks: bad, code: 'x' })], 'c.json'));
    expect(stop).not.toHaveBeenCalled();
    await m.actions.importJson(new File([JSON.stringify({ ...example(m, 'external-blink'), codeMode: 'blocks', blocks, code: 'x' })], 'c.json'));
    expect(stop).toHaveBeenCalled();
    vi.doUnmock('./simHost');
  }, 60000);

  it('a 300 KB Blockly save from the live editor is accepted without calling Blockly', async () => {
    const m = await boot();
    chunkFails(); // nothing can canonicalize: acceptance proves no round trip happened
    const big = { blocks: { languageVersion: 0, blocks: Array.from({ length: 4500 }, (_, i) => ({ type: 'math_number', id: `b${i}`, x: 0, y: i, fields: { NUM: 1 } })) } };
    expect(JSON.stringify(big).length).toBeGreaterThan(300 * 1024);
    m.store.set({ toast: null });
    m.store.setBlocks(big);
    expect(m.store.getState().toast).toBeNull();
    expect(m.store.getState().hist.present.blocks).toBe(big);
  });

  it('an import with blocks that cannot load Blockly says so in Korean and changes nothing', async () => {
    const m = await boot();
    chunkFails();
    const before = m.store.getState().hist.present;
    const s = { ...example(m, 'external-blink'), codeMode: 'blocks', blocks, code: 'x' };
    await m.actions.importJson(new File([JSON.stringify(s)], 'c.json'));
    expect(m.store.getState().toast).toMatch(/블록 편집기를 불러오지 못했어요/);
    expect(m.store.getState().hist.present).toBe(before);
  }, 60000);

  it('the chunk load is retried once, and bounded', async () => {
    const { loadCanon } = await import('./blocks/canon');
    let calls = 0;
    expect(await loadCanon(1000, async () => { if (calls++ === 0) throw new Error('first try fails'); })).toBe(true);
    expect(calls).toBe(2);
    calls = 0;
    expect(await loadCanon(1000, async () => { calls++; throw new Error('always'); })).toBe(false);
    expect(calls).toBe(2);
    const started = Date.now();
    expect(await loadCanon(40, () => new Promise<void>(() => {}))).toBe(false); // a stalled chunk gives up
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
