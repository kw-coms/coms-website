import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import { LAB_ROOT, outDir, saveScreenshot, writeOutputFile } from './browser.mjs';

describe('contained output files', () => {
  let inside;
  let outside;
  let previousEnv;
  beforeEach(() => {
    previousEnv = process.env.SHOTS_OUT;
    delete process.env.SHOTS_OUT;
    inside = mkdtempSync(join(LAB_ROOT, '.output-path-test-'));
    outside = mkdtempSync(join(tmpdir(), 'lab-output-outside-'));
  });
  afterEach(() => {
    if (previousEnv === undefined) delete process.env.SHOTS_OUT;
    else process.env.SHOTS_OUT = previousEnv;
    rmSync(inside, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it('resolves defaults and overrides relative to lab', () => {
    const requested = join(basename(inside), 'nested', 'screens');
    assert.equal(outDir(requested), resolve(LAB_ROOT, requested));
    assert.equal(existsSync(join(inside, 'nested', 'screens')), true);
    process.env.SHOTS_OUT = join(inside, 'environment');
    assert.equal(outDir('unused'), join(inside, 'environment'));
    assert.equal(outDir('unused', join(inside, 'argument')), join(inside, 'argument'));
  });

  it('rejects absolute escapes, parent traversal, and sibling-prefix paths', () => {
    for (const path of [join(outside, 'screens'), relative(LAB_ROOT, outside), '../escape', `${resolve(LAB_ROOT)}-sibling/screens`]) {
      process.env.SHOTS_OUT = path;
      assert.throws(() => outDir('unused'), /SHOTS_OUT.*lab.*심볼릭 링크/);
    }
    assert.equal(existsSync(join(outside, 'screens')), false);
  });

  for (const kind of ['outside', 'inside', 'dangling']) {
    it(`rejects ${kind} directory symlinks at the leaf and in parents`, () => {
      const target = kind === 'outside' ? outside : kind === 'inside' ? join(inside, 'real') : join(outside, 'missing');
      if (kind === 'inside') mkdirSync(target);
      const link = join(inside, 'link');
      symlinkSync(target, link, 'dir');
      assert.throws(() => outDir('unused', link), /심볼릭 링크/);
      assert.throws(() => outDir('unused', join(link, 'screens')), /심볼릭 링크/);
      assert.equal(existsSync(join(target, 'screens')), false);
    });
  }

  it('rejects files, empty strings, and null bytes as directories', () => {
    const file = join(inside, 'file');
    writeFileSync(file, 'existing content');
    for (const value of [file, '', '\0']) assert.throws(() => outDir('unused', value), /SHOTS_OUT/);
  });

  it('writes screenshot buffers and ordinary output through the shared writer', async () => {
    const file = join(inside, 'screen.png');
    await saveScreenshot({ screenshot: async () => Buffer.from('png bytes') }, file);
    assert.equal(readFileSync(file, 'utf8'), 'png bytes');
    await writeOutputFile(file, 'updated');
    assert.equal(readFileSync(file, 'utf8'), 'updated');
  });

  it('refuses an existing symlink screenshot file and leaves its external target untouched', async () => {
    const target = join(outside, 'victim.png');
    writeFileSync(target, 'keep this');
    const link = join(inside, '01-light-1440.png');
    symlinkSync(target, link);
    await assert.rejects(saveScreenshot({ screenshot: async () => Buffer.from('replace') }, link), /출력 파일.*심볼릭 링크/);
    assert.equal(readFileSync(target, 'utf8'), 'keep this');
  });

  it('rejects an existing non-file leaf before opening it', async () => {
    await assert.rejects(writeOutputFile(inside, 'replace'), /일반 파일/);
  });
});
