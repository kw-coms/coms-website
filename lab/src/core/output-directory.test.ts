import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import { LAB_ROOT, outDir } from '../../tools/browser.mjs';

describe('contained screenshot output', () => {
  let inside: string;
  let outside: string;
  beforeEach(() => {
    vi.stubEnv('SHOTS_OUT', undefined);
    inside = mkdtempSync(join(LAB_ROOT, '.output-path-test-'));
    outside = mkdtempSync(join(tmpdir(), 'lab-output-outside-'));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(inside, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it('resolves defaults and overrides relative to lab, independent of cwd', () => {
    const requested = join(basename(inside), 'nested', 'screens');
    expect(outDir(requested)).toBe(resolve(LAB_ROOT, requested));
    expect(existsSync(join(inside, 'nested', 'screens'))).toBe(true);
    vi.stubEnv('SHOTS_OUT', join(inside, 'environment'));
    expect(outDir('unused')).toBe(join(inside, 'environment'));
    expect(outDir('unused', join(inside, 'argument'))).toBe(join(inside, 'argument'));
  });

  it('rejects absolute escapes, parent traversal, and sibling-prefix paths before writing', () => {
    for (const path of [join(outside, 'screens'), relative(LAB_ROOT, outside), '../escape', `${resolve(LAB_ROOT)}-sibling/screens`]) {
      vi.stubEnv('SHOTS_OUT', path);
      expect(() => outDir('unused')).toThrow(/SHOTS_OUT.*lab.*심볼릭 링크/);
    }
    expect(existsSync(join(outside, 'screens'))).toBe(false);
  });

  it.each(['outside', 'inside', 'dangling'])('rejects %s symlinks at the leaf and in parent directories', kind => {
    const target = kind === 'outside' ? outside : kind === 'inside' ? join(inside, 'real') : join(outside, 'missing');
    if (kind === 'inside') mkdirSync(target);
    const link = join(inside, 'link');
    symlinkSync(target, link, 'dir');
    expect(() => outDir('unused', link)).toThrow(/심볼릭 링크/);
    expect(() => outDir('unused', join(link, 'screens'))).toThrow(/심볼릭 링크/);
    expect(existsSync(join(target, 'screens'))).toBe(false);
  });

  it('rejects files, empty strings, and null bytes', () => {
    const file = join(inside, 'file');
    writeFileSync(file, 'existing content');
    for (const value of [file, '', '\0']) expect(() => outDir('unused', value)).toThrow(/SHOTS_OUT/);
  });
});
