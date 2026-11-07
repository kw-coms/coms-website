import { describe, expect, it } from 'vitest';
import { loadSharedScene, parseShareHash, shareHash } from './shareHash';
import type { Scene } from '../core/types';

const scene: Scene = { version: 1, parts: [], wires: [], code: '' };

describe('shareHash', () => {
  it('round-trips a token', () => {
    expect(parseShareHash(shareHash('abc_-'))).toBe('abc_-');
    expect(parseShareHash('#other')).toBeNull();
    expect(parseShareHash('#s=')).toBeNull();
    expect(parseShareHash('')).toBeNull();
  });
  it('loads via decoder, null without hash', async () => {
    expect(await loadSharedScene('#s=xyz', async (t) => ({ ...scene, title: t }))).toMatchObject({ title: 'xyz' });
    expect(await loadSharedScene('', async () => scene)).toBeNull();
  });
  it('propagates decoder errors', async () => {
    await expect(loadSharedScene('#s=bad', async () => { throw new Error('공유 장면을 읽을 수 없습니다.'); })).rejects.toThrow('공유');
  });
});
