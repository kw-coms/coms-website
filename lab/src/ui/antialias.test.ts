import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANTIALIAS_KEY, glOptions, loadAntialias } from './quality';

const mem = new Map<string, string>();
const memStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
beforeEach(() => { mem.clear(); vi.stubGlobal('localStorage', memStorage); vi.resetModules(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('antialias setting', () => {
  it('defaults to on and maps to the GL context option', () => {
    expect(loadAntialias()).toBe(true);
    expect(glOptions(true).antialias).toBe(true);
    expect(glOptions(false).antialias).toBe(false);
  });
  it('persists and survives a reload (fresh store module)', async () => {
    const a = await import('./store');
    expect(a.getState().antialias).toBe(true);
    a.setAntialias(false);
    expect(a.getState().antialias).toBe(false);
    expect(localStorage.getItem(ANTIALIAS_KEY)).toBe('0');
    vi.resetModules();
    const b = await import('./store');
    expect(b.getState().antialias).toBe(false);
    b.setAntialias(true);
    vi.resetModules();
    expect((await import('./store')).getState().antialias).toBe(true);
  });
  it('turning it off clears the performance notice', async () => {
    const s = await import('./store');
    s.set({ qualityNotice: 'slow' });
    s.setAntialias(false);
    expect(s.getState().qualityNotice).toBeNull();
  });
  it('acting on the notice stops it coming back after a reload', async () => {
    const s = await import('./store');
    s.set({ qualityNotice: 'slow' });
    s.setAntialias(false);
    expect(mem.get('coms-lab:perf-notice')).toBe('1');
  });
  it('does not throw when storage is unavailable', async () => {
    const boom = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
    vi.stubGlobal('localStorage', boom);
    expect(loadAntialias()).toBe(true);
    vi.resetModules();
    const s = await import('./store');
    expect(() => s.setAntialias(false)).not.toThrow();
    expect(s.getState().antialias).toBe(false);
  });
});
