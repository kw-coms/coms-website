import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createNetServer } from 'node:net';
import { request } from 'node:http';
import { mkdtemp, stat, rm, writeFile, symlink, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
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
    await listenCompiler(server, { socketPath: socket, socketDir: dir });
    try {
      await assert.rejects(listenCompiler(createCompileServer(), { socketPath: socket, socketDir: dir }), /already exists/);
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
    await assert.rejects(listenCompiler(createCompileServer(), { socketPath: socket, socketDir: dir }), /already exists/);
    assert.equal((await stat(socket)).isFile(), true);
    await unlink(socket);
    await symlink(join(dir, 'missing-target'), socket);
    await assert.rejects(listenCompiler(createCompileServer(), { socketPath: socket, socketDir: dir }), /already exists/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('reclaims a socket left by SIGKILL but refuses a live listener', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'coms-stale-socket-test-'));
  const socket = join(dir, 'compile.sock');
  const childScript = `const server=require('node:net').createServer(); server.once('error', error=>{process.stdout.write(JSON.stringify({error:error.code})+'\\n');process.exitCode=1}); server.listen(${JSON.stringify(socket)},()=>process.stdout.write('ready\\n'))`;
  const child = spawn(process.execPath, ['-e', childScript], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const readiness = await new Promise((resolve, reject) => {
      let output = '', errors = '';
      child.stderr.on('data', chunk => errors += chunk);
      child.stdout.on('data', chunk => {
        output += chunk;
        if (!output.includes('\n')) return;
        child.off('exit', onExit);
        resolve(output.slice(0, output.indexOf('\n')));
      });
      function onExit(code) { reject(new Error(`socket child exited: ${code}; ${errors}`)); }
      child.once('error', reject);
      child.once('exit', onExit);
    });
    if (readiness !== 'ready') {
      const reported = JSON.parse(readiness);
      if (reported.error === 'EPERM') { t.skip('sandbox denies Unix socket listen'); return; }
      throw new Error(`socket child listen failed: ${reported.error}`);
    }
    await assert.rejects(listenCompiler(createCompileServer(), { socketPath: socket, socketDir: dir }), /already exists/);
    child.kill('SIGKILL');
    await new Promise(resolve => child.once('exit', resolve));
    assert.equal((await stat(socket)).isSocket(), true);
    const server = createCompileServer({ logger: () => {} });
    await listenCompiler(server, { socketPath: socket, socketDir: dir });
    await new Promise(resolve => server.close(resolve));
  } finally {
    child.kill('SIGKILL');
    await rm(dir, { recursive: true, force: true });
  }
});
