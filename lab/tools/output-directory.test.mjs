import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { LAB_ROOT, outDir, saveScreenshot, writeOutputFile } from './browser.mjs';

describe('contained output files', () => {
  let inside;
  let outside;
  let previousEnv;
  beforeEach(() => {
    previousEnv = process.env.SHOTS_OUT;
    delete process.env.SHOTS_OUT;
    inside = join(LAB_ROOT, `output-test-${randomUUID()}`);
    mkdirSync(inside);
    outside = mkdtempSync(join(tmpdir(), 'lab-output-outside-'));
  });
  afterEach(() => {
    if (previousEnv === undefined) delete process.env.SHOTS_OUT;
    else process.env.SHOTS_OUT = previousEnv;
    rmSync(inside, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it('uses only the internal name and ignores SHOTS_OUT', () => {
    process.env.SHOTS_OUT = join(outside, 'environment');
    assert.equal(outDir(basename(inside)), inside);
    assert.equal(existsSync(join(outside, 'environment')), false);
  });

  it('rejects bad names instead of interpreting them as paths', () => {
    for (const name of ['..', '/abs', '', 'UPPER', '\0', 'nested/name', 'shots\n']) {
      assert.throws(() => outDir(name), /출력 디렉터리 이름/);
    }
  });

  for (const kind of ['outside', 'inside', 'dangling']) {
    it(`rejects ${kind} directory symlinks for fixed names and file parents`, async () => {
      const target = kind === 'outside' ? outside : kind === 'inside' ? join(inside, 'real') : join(outside, 'missing');
      if (kind === 'inside') mkdirSync(target);
      const name = `${basename(inside)}-link`;
      const link = join(LAB_ROOT, name);
      try {
        symlinkSync(target, link, 'dir');
        assert.throws(() => outDir(name), /심볼릭 링크/);
        await assert.rejects(writeOutputFile(join(link, 'screen.png'), 'replace'), /심볼릭 링크/);
        assert.equal(existsSync(join(target, 'screen.png')), false);
      } finally { rmSync(link, { force: true }); }
    });
  }

  it('keeps the fixed fixture writer contained in lab', async () => {
    const file = join(outside, 'screen.png');
    await assert.rejects(writeOutputFile(file, 'replace'), /lab/);
    assert.equal(existsSync(file), false);
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
