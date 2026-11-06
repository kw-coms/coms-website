import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createNetServer } from 'node:net';
import { request } from 'node:http';
import { mkdtemp, stat, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCompileServer, listenCompiler, rateLimitPerMinute } from '../server.mjs';

test('rate limit environment accepts only positive integers', () => {
  assert.equal(rateLimitPerMinute(undefined), 10);
  assert.equal(rateLimitPerMinute('120'), 120);
  for (const value of ['0', '-1', '1.5', 'NaN', 'Infinity', '9007199254740992']) assert.throws(() => rateLimitPerMinute(value));
});

test('socket listener serves health with mode 0660 and rejects regular-file replacement', async t => {
  const probe = createNetServer();
  const dir = await mkdtemp(join(tmpdir(), 'coms-socket-test-'));
  const socket = join(dir, 'compile.sock');
  try {
    try { await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(socket, resolve); }); }
    catch (error) { if (error.code === 'EPERM') { t.skip('sandbox denies Unix socket listen'); return; } throw error; }
    await new Promise(resolve => probe.close(resolve));
    const server = createCompileServer({ logger: () => {} });
    await listenCompiler(server, { socketPath: socket });
    try {
      await assert.rejects(listenCompiler(createCompileServer(), { socketPath: socket }), /already exists/);
      assert.equal((await stat(socket)).mode & 0o777, 0o660);
      const body = await new Promise((resolve, reject) => {
        const req = request({ socketPath: socket, path: '/lab/api/health' }, res => {
          let text = ''; res.on('data', chunk => text += chunk); res.on('end', () => resolve(text));
        });
        req.on('error', reject); req.end();
      });
      assert.deepEqual(JSON.parse(body), { ok: true });
    } finally { await new Promise(resolve => server.close(resolve)); }
    await writeFile(socket, 'keep');
    await assert.rejects(listenCompiler(createCompileServer(), { socketPath: socket }), /already exists/);
    assert.equal((await stat(socket)).isFile(), true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
