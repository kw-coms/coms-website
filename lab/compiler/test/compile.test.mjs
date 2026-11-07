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

const debugFixture = await readFile(new URL('./fixtures/debug/avr-gcc7-lto.txt', import.meta.url), 'utf8');
async function debugCompileRunner(args, { cwd }) {
  for (const property of ['compiler.c.extra_flags=-g', 'compiler.cpp.extra_flags=-g', 'compiler.c.elf.extra_flags=-g']) assert.ok(args.includes(property));
  assert.ok(!args.some(arg => /-O0|-fno-lto/.test(arg)));
  await mkdir(join(cwd, 'out')); await mkdir(join(cwd, 'build'));
  await writeFile(join(cwd, 'out/sketch.ino.hex'), HEX);
  await writeFile(join(cwd, 'build/sketch.ino.elf'), 'ELF_SENTINEL');
  return { code: 0, stdout: '', stderr: '' };
}
test('debug opt-in returns bounded sketch information and removes ELF with workdir', async () => {
  const root = await mkdtemp(join(tmpdir(), 'compiler-test-'));
  try {
    const result = await compileSketch('\n'.repeat(10), { debug: true, tempRoot: root, runner: debugCompileRunner,
      debugRunner: async (elf, { cwd, timeoutMs }) => {
        assert.equal(elf, join(cwd, 'build/sketch.ino.elf'));
        assert.ok(timeoutMs > 0 && timeoutMs <= 20_000);
        assert.equal(await readFile(elf, 'utf8'), 'ELF_SENTINEL');
        return { code: 0, stdout: debugFixture.replaceAll('/fixture/sketch', join(cwd, 'sketch')), stderr: '' };
      } });
    assert.equal(result.ok, true);
    assert.equal(result.debug.lines[0].line, 5);
    assert.equal(result.debug.globals[0].addr, 256);
    assert.doesNotMatch(JSON.stringify(result), /ELF_SENTINEL|fixture|circuit-lab|\.elf/);
    assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('normal compiles never invoke ELF extractor or return debug', async () => {
  const result = await compileSketch('void setup(){}', { runner: async (args, context) => {
    assert.ok(!args.some(arg => /(?:^|=)-g$/.test(arg)), 'normal compilation must not pass -g');
    return debugCompileRunnerWithoutFlags(args, context);
  },
    debugRunner: () => { throw new Error('must not run'); } });
  assert.equal(result.ok, true); assert.equal('debug' in result, false);
});
async function debugCompileRunnerWithoutFlags(_args, { cwd }) {
  await mkdir(join(cwd, 'out'));
  await writeFile(join(cwd, 'out/sketch.ino.hex'), HEX);
  return { code: 0, stdout: '', stderr: '' };
}
test('debug extraction error and output limit fail closed without leaking tool output', async () => {
  for (const debugRunner of [
    async () => ({ code: 1, stdout: '/secret.elf ELF_SENTINEL', stderr: '/secret' }),
    async () => ({ code: 0, stdout: 'x'.repeat(4 * 1024 * 1024 + 1), stderr: '' }),
  ]) {
    const result = await compileSketch('x', { debug: true, runner: debugCompileRunner, debugRunner });
    assert.equal(result.ok, false); assert.equal(result.reason, 'compile');
    assert.doesNotMatch(JSON.stringify(result), /secret|ELF_SENTINEL/);
  }
});
test('debug extraction shares compile deadline and maps timeout without paths', async () => {
  const result = await compileSketch('x', { debug: true, runner: debugCompileRunner,
    debugRunner: async () => { throw Object.assign(new Error('/secret.elf'), { code: 'timeout' }); } });
  assert.equal(result.reason, 'timeout'); assert.doesNotMatch(JSON.stringify(result), /secret/);
});
