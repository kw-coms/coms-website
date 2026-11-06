import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { createCompileServer } from '../server.mjs';
import { createRateLimiter, createCompileQueue } from '../limits.mjs';

function invoke(server, { method = 'POST', path = '/lab/api/compile', body = '{}', headers = {} } = {}) {
  const request = Readable.from([Buffer.from(body)]);
  request.method = method; request.url = path; request.headers = { 'content-type': 'application/json', ...headers };
  request.socket = { remoteAddress: '127.0.0.1' }; request.complete = true;
  const chunks = [], responseHeaders = new Map();
  const response = new Writable({ write(chunk, _enc, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
  response.setHeader = (name, value) => responseHeaders.set(name.toLowerCase(), value);
  response.writeHead = (status, headers) => {
    response.statusCode = status;
    for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
    return response;
  };
  const done = new Promise((resolve, reject) => {
    response.once('finish', () => resolve({ status: response.statusCode, headers: responseHeaders,
      body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
    response.once('error', reject);
  });
  server.listeners('request')[0](request, response);
  return done;
}
const sketchBody = JSON.stringify({ sketch: 'void setup(){} void loop(){}' });
const serverWith = options => createCompileServer({ logger: () => {}, ...options });

test('in-memory handler serves health without CORS', async () => {
  const result = await invoke(serverWith(), { method: 'GET', path: '/lab/api/health' });
  assert.equal(result.status, 200); assert.equal(result.headers.has('access-control-allow-origin'), false);
});
test('in-memory handler rejects invalid JSON', async () => {
  const result = await invoke(serverWith(), { body: '{broken' });
  assert.equal(result.status, 400); assert.equal(result.body.reason, 'rejected');
});
test('in-memory handler rejects non-string sketch', async () => {
  const result = await invoke(serverWith(), { body: JSON.stringify({ sketch: 4 }) });
  assert.equal(result.status, 400); assert.equal(result.body.reason, 'rejected');
});
test('in-memory handler rejects oversized request', async () => {
  const result = await invoke(serverWith(), { body: JSON.stringify({ sketch: 'x'.repeat(82000) }) });
  assert.equal(result.status, 400); assert.equal(result.body.reason, 'rejected');
});
test('in-memory handler requires authentication when configured', async () => {
  let forwarded;
  const server = serverWith({ authCheckUrl: 'https://example.test/me', fetchImpl: async (_url, options) => {
    forwarded = options.headers.Cookie;
    return { status: 401, body: { cancel: async () => {} } };
  } });
  const result = await invoke(server, { body: sketchBody, headers: { cookie: 'token=abc' } });
  assert.equal(result.status, 401); assert.equal(forwarded, 'token=abc');
});
test('in-memory handler enforces per-IP rate limit', async () => {
  const server = serverWith({ limiter: createRateLimiter({ limit: 1 }) });
  await invoke(server, { body: '{broken' });
  const result = await invoke(server, { body: '{broken' });
  assert.equal(result.status, 429); assert.equal(result.body.reason, 'rate-limited');
});
test('in-memory handler rejects full compile queue', async () => {
  const queue = createCompileQueue({ concurrency: 1, maxQueued: 0 });
  let release, entered;
  const wait = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const server = serverWith({ queue, runner: async () => { entered(); await wait; return { code: 1, stderr: 'sketch.ino:1:1: error: bad', stdout: '' }; } });
  const first = invoke(server, { body: sketchBody }); await started;
  const second = await invoke(server, { body: sketchBody });
  assert.equal(second.status, 429); assert.equal(second.body.reason, 'busy');
  release(); await first;
});
