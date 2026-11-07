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
test('in-memory handler behind nginx (TRUST_PROXY) refuses a request nginx did not vouch for', async () => {
  const server = serverWith({ trustProxy: true });
  const result = await invoke(server, { body: sketchBody, headers: { cookie: 'token=abc', 'x-forwarded-for': '1.2.3.4' } });
  assert.equal(result.status, 401);
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

const { rejectedSketches } = await import('./fixtures/rejected-sketches.mjs');
for (const [name, sketch] of rejectedSketches) test(`HTTP rejects bypass without compiler output: ${name}`, async () => {
  let called = false;
  const server = serverWith({ runner: async () => {
    called = true;
    return { code: 1, stderr: '/etc/passwd:1: error: root:FILE_CONTENT_SENTINEL', stdout: '' };
  } });
  const result = await invoke(server, { body: JSON.stringify({ sketch }) });
  assert.equal(result.status, 400);
  assert.equal(result.body.reason, 'rejected');
  assert.equal(called, false);
  assert.match(result.body.errors[0].message, /[가-힣]/);
  assert.doesNotMatch(JSON.stringify(result.body), /passwd|root:|FILE_CONTENT_SENTINEL|\/etc\//);
});

test('RATE_LIMIT_PER_MIN configures the handler per member', async () => {
  const previous = process.env.RATE_LIMIT_PER_MIN;
  process.env.RATE_LIMIT_PER_MIN = '2';
  try {
    const server = serverWith({ trustProxy: true });
    const options = { body: '{broken', headers: { 'x-lab-client': '2026000001' } };
    assert.equal((await invoke(server, options)).status, 400);
    assert.equal((await invoke(server, options)).status, 400);
    assert.equal((await invoke(server, options)).status, 429);
    assert.equal((await invoke(server, { ...options, headers: { 'x-lab-client': '2026000002' } })).status, 400);
  } finally {
    if (previous === undefined) delete process.env.RATE_LIMIT_PER_MIN;
    else process.env.RATE_LIMIT_PER_MIN = previous;
  }
});

test('debug request must be a boolean before compiler invocation', async () => {
  let called = false;
  const server = serverWith({ runner: async () => { called = true; throw new Error('not reached'); } });
  for (const debug of ['true', 1, {}, null]) {
    const result = await invoke(server, { body: JSON.stringify({ sketch: 'void setup(){}', debug }) });
    assert.equal(result.status, 400); assert.equal(result.body.reason, 'rejected');
  }
  assert.equal(called, false);
});
test('HTTP debug true reaches extraction and returns DebugInfo, never ELF', async () => {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  let extracted = false;
  const server = serverWith({ runner: async (_args, { cwd }) => {
    await mkdir(join(cwd, 'out')); await mkdir(join(cwd, 'build'));
    await writeFile(join(cwd, 'out/sketch.ino.hex'), ':0100000001FE\n:00000001FF\n');
    await writeFile(join(cwd, 'build/sketch.ino.elf'), 'ELF_SENTINEL');
    return { code: 0, stdout: '', stderr: '' };
  }, debugRunner: async () => { extracted = true; return { code: 0, stdout: '', stderr: '' }; } });
  const result = await invoke(server, { body: JSON.stringify({ sketch: 'void setup(){}', debug: true }) });
  assert.equal(result.status, 200); assert.equal(extracted, true);
  assert.deepEqual(result.body.debug, { lines: [], globals: [] });
  assert.doesNotMatch(JSON.stringify(result.body), /ELF_SENTINEL|\.elf/);
});
