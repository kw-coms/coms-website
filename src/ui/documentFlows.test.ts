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
const example = (m: Mods, id: string) => m.core.EXAMPLES.find((e) => e.id === id)!.scene;

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
