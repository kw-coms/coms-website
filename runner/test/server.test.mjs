import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunnerServer, listenRunner, validateRequest, MAX_BODY_BYTES, clientIp, rateLimitPerMinute } from '../server.mjs';

const good = { lang: 'python', code: 'print(1)', stdin: 'hello' };
async function listenOrSkip(t, server) {
  try { await listenRunner(server, { port: 0, socketPath: '', host: '127.0.0.1' }); return true; }
  catch (error) { if (error.code !== 'EPERM') throw error; t.skip('socket listen is unavailable in this sandbox'); return false; }
}

const result = { ok: true, stage: 'run', stdout: '1\n', stderr: '', exitCode: 0, signal: null, timedOut: false, truncated: false, timeMs: 1, diagnostics: [] };

test('validation counts UTF-8 bytes and rejects invalid shapes', () => {
  assert.equal(validateRequest(good), null);
  for (const body of [null, [], { ...good, lang: 'js' }, { ...good, code: '한'.repeat(22_000) }, { ...good, stdin: '한'.repeat(6_000) }, { ...good, stdin: 1 }]) assert.ok(validateRequest(body));
  assert.equal(MAX_BODY_BYTES, 96 * 1024);
  assert.throws(() => rateLimitPerMinute('0'));
});

test('proxy header only trusted at rightmost valid hop', () => {
  const request = { headers: { 'x-forwarded-for': '1.2.3.4, 2001:db8::1' }, socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(clientIp(request), '127.0.0.1');
  assert.equal(clientIp(request, true), '2001:db8:0:0::/64');
  request.headers['x-forwarded-for'] = '1.2.3.4, bogus';
  assert.equal(clientIp(request, true), '127.0.0.1');
});

test('HTTP accepts valid run, rejects bad input and logs metadata only', async t => {
  const logs = [], received = [];
  const server = createRunnerServer({ executor: async body => { received.push(body); return result; }, logger: entry => logs.push(entry), limiter: { take: () => true, close() {} } });
  if (!await listenOrSkip(t, server)) return;
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.deepEqual(await (await fetch(`${base}/study/api/health`)).json(), { ok: true });
  let response = await fetch(`${base}/study/api/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(good) });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), result);
  assert.deepEqual(received, [good]);
  response = await fetch(`${base}/study/api/run`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
  assert.equal(response.status, 400);
  response = await fetch(`${base}/study/api/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
  assert.equal(response.status, 400);
  const oversized = JSON.stringify({ ...good, padding: 'x'.repeat(MAX_BODY_BYTES) });
  response = await fetch(`${base}/study/api/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: oversized });
  assert.equal(response.status, 400); // Content-Length preflight.
  const { Readable } = await import('node:stream');
  response = await fetch(`${base}/study/api/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: Readable.from([oversized.slice(0, 100), oversized.slice(100)]), duplex: 'half' });
  assert.equal(response.status, 400); // Chunked body crossing the cap.
  assert.equal(JSON.stringify(logs).includes(good.code), false);
  assert.equal(JSON.stringify(logs).includes(good.stdin), false);
});

test('HTTP 429 distinguishes rate limit and busy', async t => {
  const server = createRunnerServer({ executor: async () => result, logger() {}, limiter: { take: () => false, close() {} } });
  if (!await listenOrSkip(t, server)) return;
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/study/api/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(good) });
  assert.equal(response.status, 429); assert.equal((await response.json()).error, 'rate-limited');
  const busy = createRunnerServer({ logger() {}, limiter: { take: () => true, close() {} }, queue: { submit: () => null } });
  if (!await listenOrSkip(t, busy)) return;
  t.after(() => new Promise(resolve => busy.close(resolve)));
  const response2 = await fetch(`http://127.0.0.1:${busy.address().port}/study/api/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(good) });
  assert.equal(response2.status, 429); assert.equal((await response2.json()).error, 'busy');
});

test('HTTP queue holds eight waiting requests and rejects the next', async t => {
  const { createRunQueue } = await import('../limits.mjs');
  const queue = createRunQueue();
  const releases = [];
  const server = createRunnerServer({
    queue, logger() {}, limiter: { take: () => true, close() {} }, trustProxy: true,
    executor: () => new Promise(resolve => releases.push(() => resolve(result))),
  });
  if (!await listenOrSkip(t, server)) return;
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/study/api/run`;
  let n = 0;
  const submit = () => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-runner-client': `member${n++}` }, body: JSON.stringify(good) });
  const accepted = Array.from({ length: 9 }, submit);
  const deadline = Date.now() + 3000;
  while (queue.stats().queued !== 8 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(queue.stats(), { active: 1, queued: 8 });
  const busy = await submit();
  assert.equal(busy.status, 429);
  assert.equal((await busy.json()).error, 'busy');
  for (let i = 0; i < 9; i++) {
    while (releases.length <= i) await new Promise(resolve => setImmediate(resolve));
    releases[i]();
    assert.equal((await accepted[i]).status, 200);
  }
});


test('health endpoint reports executor cleanup failure', async t => {
  const server = createRunnerServer({ healthCheck: () => false, logger() {}, limiter: { take: () => true, close() {} } });
  if (!await listenOrSkip(t, server)) return;
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/study/api/health`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false });
});

test('Unix socket refuses active and non-socket paths, recovers stale inode', async t => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createServer: createNetServer } = await import('node:net');
  const { spawn } = await import('node:child_process');
  const dir = await mkdtemp(join(tmpdir(), 'study-socket-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'run.sock');
  const active = createNetServer();
  try { await new Promise((resolve, reject) => { active.once('error', reject); active.listen(path, resolve); }); }
  catch (error) { if (error.code !== 'EPERM') throw error; t.skip('Unix sockets unavailable in this sandbox'); return; }
  const runner = createRunnerServer({ logger() {}, limiter: { take: () => true, close() {} } });
  await assert.rejects(listenRunner(runner, { socketPath: path }), /already exists/);
  await new Promise(resolve => active.close(resolve));
  await rm(path, { force: true });
  await writeFile(path, 'not a socket');
  await assert.rejects(listenRunner(runner, { socketPath: path }), /already exists/);
  await rm(path, { force: true });
  const child = spawn(process.execPath, ['-e', "const n=require('node:net');n.createServer().listen(process.argv[1],()=>console.log('ready'))", path], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => { child.stdout.once('data', resolve); child.once('error', reject); });
  child.kill('SIGKILL');
  await new Promise(resolve => child.once('close', resolve));
  await listenRunner(runner, { socketPath: path });
  assert.equal(runner.address(), path);
  await new Promise(resolve => runner.close(resolve));
});

test('poisoned runner answers 503 unavailable and signals fatal via onFatal', async t => {
  let fatal = 0, healthy = true;
  const server = createRunnerServer({ healthCheck: () => healthy, onFatal: () => { fatal++; }, logger() {}, limiter: { take: () => true, close() {} },
    executor: async () => { healthy = false; throw new Error('Job files survived cleanup'); } });
  if (!await listenOrSkip(t, server)) return;
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/study/api/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lang: 'python', code: 'print(1)' }) });
  assert.equal(response.status, 503); assert.equal((await response.json()).error, 'unavailable'); assert.equal(fatal, 1);
});

test('denied client gets 429 before the queue; a poisoning request is passed to onFatal with its ip', async t => {
  let ran = 0, fatalIp;
  const denied = new Set();
  const server = createRunnerServer({ healthCheck: () => ran === 0, onFatal: ({ key }) => { fatalIp = key; denied.add(key); }, logger() {}, limiter: { take: () => true, close() {} },
    denyList: { has: key => denied.has(key), remainingSeconds: () => 321 }, executor: async () => { ran++; throw new Error('cleanup'); } });
  if (!await listenOrSkip(t, server)) return;
  t.after(() => new Promise(resolve => server.close(resolve)));
  const post = () => fetch(`http://127.0.0.1:${server.address().port}/study/api/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lang: 'python', code: 'print(1)' }) });
  assert.equal((await post()).status, 503); assert.equal(fatalIp, 'ip:127.0.0.1');
  const second = await post();
  assert.equal(second.status, 429); assert.equal(second.headers.get('retry-after'), '321'); assert.equal(ran, 1);
});

test('member key: header required behind the proxy, validated, prefixed; one in-flight request per member', async t => {
  const { clientKey } = await import('../server.mjs');
  const request = headers => ({ headers, socket: { remoteAddress: '10.0.0.5' } });
  assert.equal(clientKey(request({ 'x-runner-client': 'u_42-A' }), true), 'm:u_42-A');
  for (const bad of [undefined, '', 'a b', 'x'.repeat(65), 'a;b', '../x', 'é']) assert.equal(clientKey(request({ 'x-runner-client': bad }), true), null, String(bad));
  assert.equal(clientKey(request({}), false), 'ip:10.0.0.5');
  const releases = [], seen = [];
  const server = createRunnerServer({ trustProxy: true, logger: entry => seen.push(entry), limiter: { take: () => true, close() {} },
    executor: () => new Promise(resolve => releases.push(() => resolve(result))) });
  if (!await listenOrSkip(t, server)) return;
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/study/api/run`;
  const post = member => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(member ? { 'x-runner-client': member } : {}) }, body: JSON.stringify(good) });
  assert.equal((await post()).status, 401); assert.equal((await post('bad key')).status, 401);
  const first = post('alice');
  while (!releases.length) await new Promise(resolve => setImmediate(resolve));
  const again = await post('alice');
  assert.equal(again.status, 429); assert.equal((await again.json()).error, 'busy');
  releases[0](); assert.equal((await first).status, 200);
  assert.ok(seen.every(e => e.client === undefined || /^[0-9a-f]{8}$/.test(e.client)));
  assert.ok(!JSON.stringify(seen).includes('alice'));
});
