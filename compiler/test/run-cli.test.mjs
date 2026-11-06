import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { runCli } from '../compile.mjs';

const nodeSpawn = (script) => (_file, _args, options) => spawn(process.execPath, ['-e', script], options);

test('captures stdout and stderr from spawned compiler', async () => {
  const result = await runCli([], { spawnImpl: nodeSpawn("process.stdout.write('ok');process.stderr.write('warn')") });
  assert.deepEqual(result, { code: 0, stdout: 'ok', stderr: 'warn' });
});
test('returns nonzero compiler exit without throwing', async () => {
  const result = await runCli([], { spawnImpl: nodeSpawn('process.exit(7)') });
  assert.equal(result.code, 7);
});
test('kills detached compiler process group on timeout', async () => {
  await assert.rejects(runCli([], { timeoutMs: 100, spawnImpl: nodeSpawn('setInterval(() => {}, 1000)') }), { code: 'timeout' });
});
test('terminates compiler after excessive output', async () => {
  await assert.rejects(runCli([], { spawnImpl: nodeSpawn("process.stdout.write('x'.repeat(300000));setInterval(() => {},1000)") }), { code: 'output-limit' });
});
