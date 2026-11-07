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

test('compiler gets only a fixed environment and resource-limited argv', async () => {
  process.env.COMPILER_TEST_SECRET = 'must-not-inherit';
  process.env.ARDUINO_BUILD_PROPERTIES = 'must-not-inherit';
  try {
    await runCli(['compile', 'sketch'], { cwd: '/tmp', spawnImpl: (file, args, options) => {
      assert.equal(file, '/usr/bin/prlimit');
      assert.deepEqual(args, ['--as=2147483648:2147483648', '--cpu=15:15', '--fsize=16777216:16777216', '--core=0:0', '--', '/usr/local/bin/arduino-cli', 'compile', 'sketch']);
      assert.deepEqual(options.env, {
        PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/tmp', LANG: 'C',
        ARDUINO_DIRECTORIES_DATA: '/opt/arduino/data',
        ARDUINO_DIRECTORIES_USER: '/opt/arduino/user',
        ARDUINO_DIRECTORIES_DOWNLOADS: '/tmp/downloads', ARDUINO_BUILD_CACHE_PATH: '/tmp/cache',
        ARDUINO_UPDATER_ENABLE_NOTIFICATION: 'false',
      });
      return nodeSpawn('process.exit(0)')(file, args, options);
    } });
  } finally {
    delete process.env.COMPILER_TEST_SECRET;
    delete process.env.ARDUINO_BUILD_PROPERTIES;
  }
});
