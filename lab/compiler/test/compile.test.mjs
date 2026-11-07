import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileSketch, hexSize } from '../compile.mjs';

const HEX = ':0100000001FE\n:00000001FF\n';
test('counts Intel HEX data bytes', () => assert.equal(hexSize(HEX), 1));
test('rejects invalid Intel HEX checksum', () => assert.throws(() => hexSize(':0100000001FF\n:00000001FF\n')));
test('returns HEX, warnings, and byte count using isolated sketch folder', async () => {
  const root = await mkdtemp(join(tmpdir(), 'compiler-test-'));
  try {
    const result = await compileSketch('void setup(){}\nvoid loop(){}', { tempRoot: root,
      runner: async (args, { cwd }) => {
        assert.equal(await readFile(join(cwd, 'sketch/sketch.ino'), 'utf8'), 'void setup(){}\nvoid loop(){}');
        assert.equal(args[args.indexOf('--fqbn') + 1], 'arduino:avr:uno');
        assert.equal(args[args.indexOf('--build-property') + 1], 'compiler.path=/opt/avr-limited/bin/');
        await mkdir(join(cwd, 'out'));
        await writeFile(join(cwd, 'out/sketch.ino.hex'), HEX);
        return { code: 0, stdout: '', stderr: 'sketch.ino:1:2: warning: unused variable' };
      } });
    assert.equal(result.ok, true); assert.equal(result.hex, HEX); assert.equal(result.sizeBytes, 1);
    assert.equal(result.warnings[0].line, 1);
    assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('returns source diagnostics and removes failed build folder', async () => {
  const root = await mkdtemp(join(tmpdir(), 'compiler-test-'));
  try {
    const result = await compileSketch('x', { tempRoot: root, runner: async () => ({ code: 1, stdout: '', stderr: 'sketch.ino:1:1: error: expected primary-expression' }) });
    assert.equal(result.reason, 'compile'); assert.equal(result.errors[0].line, 1);
    assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('returns timeout and removes temporary folder', async () => {
  const root = await mkdtemp(join(tmpdir(), 'compiler-test-'));
  try {
    const result = await compileSketch('x', { tempRoot: root, runner: async () => { throw Object.assign(new Error('timeout'), { code: 'timeout' }); } });
    assert.equal(result.reason, 'timeout'); assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('failed compile response never forwards foreign file diagnostics or source excerpts', async () => {
  const result = await compileSketch('void setup(){}\nvoid loop(){}', { runner: async (_args, { cwd }) => ({
    code: 1, stdout: 'error: FILE_CONTENT_SENTINEL', stderr: [
      '/etc/passwd:1:1: error: FILE_CONTENT_SENTINEL',
      '/somewhere/sketch.ino:1:1: error: FILE_CONTENT_SENTINEL',
      `${cwd}/sketch/sketch.ino:3:1: error: FILE_CONTENT_SENTINEL`,
      `${cwd}/sketch/sketch.ino:1:1: note: FILE_CONTENT_SENTINEL`,
      '  1 | FILE_CONTENT_SENTINEL',
    ].join('\n'),
  }) });
  assert.equal(result.reason, 'compile');
  assert.match(result.errors[0].message, /[가-힣]/);
  assert.doesNotMatch(JSON.stringify(result), /FILE_CONTENT_SENTINEL|passwd/);
});
test('failed compile preserves bounded user diagnostics and Korean hints', async () => {
  const result = await compileSketch('x', { runner: async (_args, { cwd }) => ({
    code: 1, stdout: '', stderr: `${cwd}/sketch/sketch.ino:1:1: error: expected ';' before '}' token ${'x'.repeat(1000)}`,
  }) });
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].line, 1);
  assert.ok(result.errors[0].message.length <= 800);
  assert.match(result.errors[0].hintKo, /세미콜론/);
});
