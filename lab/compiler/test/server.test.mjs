import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompileServer, clientIp, rateKey, resolveSocketPath } from '../server.mjs';
import { createServer } from 'node:net';
import { createRateLimiter, createCompileQueue } from '../limits.mjs';


const canListen = await new Promise(resolve => {
  const probe = createServer();
  probe.once('error', error => resolve(error.code !== 'EPERM' ? Promise.reject(error) : false));
  probe.listen(0, '127.0.0.1', () => probe.close(() => resolve(true)));
});
const httpTest = (name, fn) => test(name, { skip: !canListen && 'sandbox denies localhost listen (EPERM)' }, fn);

async function withServer(options, callback) {
  const server = createCompileServer({ logger: () => {}, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await callback(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
const post = (url, sketch = 'void setup(){} void loop(){}', options = {}) => fetch(`${url}/lab/api/compile`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...options.headers },
  body: options.body ?? JSON.stringify({ sketch }),
});
httpTest('health endpoint responds with JSON without CORS', async () => {
  await withServer({}, async url => {
    const response = await fetch(`${url}/lab/api/health`);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  });
});
httpTest('rejects non-JSON media type', async () => {
  await withServer({}, async url => {
    const response = await post(url, 'x', { headers: { 'content-type': 'text/plain' } });
    assert.equal(response.status, 400); assert.equal((await response.json()).reason, 'rejected');
  });
});
httpTest('rejects quoted include before calling runner', async () => {
  let called = false;
  await withServer({ runner: async () => { called = true; } }, async url => {
    const response = await post(url, '#include "secret.h"');
    assert.equal(response.status, 400); assert.equal(called, false);
  });
});
httpTest('rejects body larger than 80 KiB', async () => {
  await withServer({}, async url => {
    const response = await post(url, '', { body: JSON.stringify({ sketch: 'x'.repeat(81000), padding: 'x'.repeat(2000) }) });
    assert.equal(response.status, 400); assert.equal((await response.json()).reason, 'rejected');
  });
});
test('the compiler makes no outbound requests (login is nginx auth_request)', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|AUTH_CHECK_URL|checkAuth|node:https?'.*request/);
});
test('LISTEN_SOCKET is confined to the socket directory', () => {
  assert.equal(resolveSocketPath('/run/coms-lab/compile.sock'), '/run/coms-lab/compile.sock');
  assert.equal(resolveSocketPath('compile.sock'), '/run/coms-lab/compile.sock');
  for (const bad of ['/etc/passwd', '/run/coms-lab/../x.sock', '/run/coms-lab/sub/a.sock', '/run/coms-labx/a.sock', '/tmp/a.sock', '/run/coms-lab/a.txt', '', '/run/coms-lab/.sock/..']) {
    assert.throws(() => resolveSocketPath(bad), /LISTEN_SOCKET must be/, bad);
  }
  assert.equal(resolveSocketPath('/var/x/a.sock', '/var/x'), '/var/x/a.sock');
});
httpTest('rate limits per real peer when proxy trust disabled', async () => {
  await withServer({ limiter: createRateLimiter({ limit: 1 }), trustProxy: false }, async url => {
    assert.equal((await post(url, '#include "bad"', { headers: { 'x-forwarded-for': '1.2.3.4' } })).status, 400);
    const response = await post(url, '#include "bad"', { headers: { 'x-forwarded-for': '9.8.7.6' } });
    assert.equal(response.status, 429); assert.equal((await response.json()).reason, 'rate-limited');
  });
});
test('uses right-most forwarded IP only when proxy trust enabled', () => {
  const request = { headers: { 'x-forwarded-for': '9.9.9.9, 5.6.7.8' }, socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(clientIp(request, true), '5.6.7.8');
  assert.equal(clientIp(request, false), '127.0.0.1');
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '1.1.1.1, junk' }, socket: { remoteAddress: '::ffff:10.0.0.1' } }, true), '10.0.0.1');
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '2001:db8:1:2::7' }, socket: { remoteAddress: '127.0.0.1' } }, true), clientIp({ headers: {}, socket: { remoteAddress: '2001:db8:1:2::8' } }));
});
test('rate key: with proxy trust only X-Lab-Client counts, and it is required', () => {
  const peer = { remoteAddress: '127.0.0.1' };
  const request = (client, xff) => ({ headers: { ...(client === undefined ? {} : { 'x-lab-client': client }), ...(xff ? { 'x-forwarded-for': xff } : {}) }, socket: peer });
  assert.equal(rateKey(request('2026123456'), true), 'member:2026123456');
  assert.notEqual(rateKey(request('2026123456'), true), rateKey(request('2026123457'), true));
  assert.equal(rateKey(request(undefined, '5.6.7.8'), true), null, 'no member header: not vouched for by nginx');
  assert.equal(rateKey(request('', '5.6.7.8'), true), null);
  assert.equal(rateKey(request('has space;'), true), null, 'bad characters');
  assert.equal(rateKey(request('a'.repeat(65)), true), null, 'too long');
  assert.equal(rateKey(request('2026123456', '5.6.7.8'), false), '127.0.0.1', 'ignored without TRUST_PROXY (development)');
});
httpTest('with proxy trust: per-member budget, and a request nginx did not vouch for is 401', async () => {
  await withServer({ limiter: createRateLimiter({ limit: 1 }), trustProxy: true }, async url => {
    const as = member => ({ headers: { 'x-lab-client': member, 'x-forwarded-for': '1.2.3.4' } });
    assert.equal((await post(url, '#include "bad"', as('2026000001'))).status, 400);
    assert.equal((await post(url, '#include "bad"', as('2026000002'))).status, 400, 'another member has its own budget');
    assert.equal((await post(url, '#include "bad"', as('2026000001'))).status, 429);
    const anonymous = await post(url, '#include "bad"', { headers: { 'x-forwarded-for': '1.2.3.4' } });
    assert.equal(anonymous.status, 401);
    assert.equal((await anonymous.json()).errors[0].message, '로그인한 동아리원만 컴파일할 수 있어요.');
  });
});
httpTest('returns busy when bounded compile queue is full', async () => {
  const queue = createCompileQueue({ concurrency: 1, maxQueued: 0 });
  let release, started;
  const running = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  await withServer({ queue, runner: async () => { started(); await running; return { code: 1, stderr: 'sketch.ino:1:1: error: bad', stdout: '' }; } }, async url => {
    const first = post(url); await entered;
    const second = await post(url);
    assert.equal(second.status, 429); assert.equal((await second.json()).reason, 'busy');
    release(); await first;
  });
});
httpTest('a request that waits too long for a slot gets 429 busy, well before the proxy would time out', async () => {
  const queue = createCompileQueue({ concurrency: 1, maxQueued: 1, maxWaitMs: 150 });
  let release, started;
  const running = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  await withServer({ queue, runner: async () => { started(); await running; return { code: 1, stderr: 'sketch.ino:1:1: error: bad', stdout: '' }; } }, async url => {
    const first = post(url); await entered;
    const begun = Date.now();
    const second = await post(url);
    assert.equal(second.status, 429); assert.equal((await second.json()).reason, 'busy');
    assert.ok(Date.now() - begun < 2000);
    release(); await first;
  });
});
