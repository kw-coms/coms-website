import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIp, createRateLimiter, createRunQueue } from '../limits.mjs';

test('IPv6 /64 canonicalization and IPv4 mapped addresses', () => {
  assert.equal(normalizeIp('2001:0DB8:0001:0002::abcd'), normalizeIp('2001:db8:1:2:ffff::'));
  assert.equal(normalizeIp('::ffff:127.0.0.1'), '127.0.0.1');
  assert.equal(normalizeIp('0:0:0:0:0:ffff:7f00:1'), '127.0.0.1');
  assert.equal(normalizeIp('garbage'), 'unknown');
});

test('rate limiter never evicts live keys; overflow shared', () => {
  let time = 0;
  const limiter = createRateLimiter({ limit: 2, maxKeys: 1, now: () => time, setIntervalImpl: () => ({ unref() {} }) });
  assert.equal(limiter.take('a'), true);
  assert.equal(limiter.take('b'), true);
  assert.equal(limiter.take('c'), true);
  assert.equal(limiter.take('d'), false);
  assert.equal(limiter.take('a'), true);
  assert.equal(limiter.take('a'), false);
  assert.equal(limiter.stats().clients, 1);
  time = 60_001;
  assert.equal(limiter.take('a'), true);
});

test('queue runs one job at a time, queues eight, then rejects', async () => {
  const queue = createRunQueue();
  const releases = [];
  const jobs = Array.from({ length: 9 }, (_, i) => queue.submit(() => new Promise(resolve => releases.push(() => resolve(i)))));
  assert.equal(queue.submit(() => 10), null);
  assert.deepEqual(queue.stats(), { active: 1, queued: 8 });
  for (let i = 0; i < 9; i++) {
    while (releases.length <= i) await new Promise(resolve => setImmediate(resolve));
    releases[i]();
    assert.equal(await jobs[i], i);
  }
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(queue.stats(), { active: 0, queued: 0 });
});


test('rejected job frees the single execution slot', async () => {
  const queue = createRunQueue();
  await assert.rejects(queue.submit(() => { throw new Error('job failed'); }), /job failed/);
  // Promise.finally scheduling completes before the next task starts.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await queue.submit(() => 42), 42);
});

test('deny list persists, expires, clamps tampered expiries, logs read failures and writes 0600 atomically', async () => {
  const { createDenyList, createInflight } = await import('../limits.mjs');
  const fs = await import('node:fs');
  const dir = fs.mkdtempSync((await import('node:os')).tmpdir() + '/deny-'), file = `${dir}/d.json`;
  let t = 1000; const logs = [];
  const make = () => createDenyList({ file, ttlMs: 500, now: () => t, fs, logger: e => logs.push(e) });
  assert.equal(make().has('m:a'), false); assert.deepEqual(logs, []); // ENOENT is silent
  fs.writeFileSync(file, '{not json'); assert.equal(make().has('m:a'), false); assert.equal(logs[0].event, 'denylist-read-failed');
  fs.writeFileSync(file, JSON.stringify({ 'm:far': 9e15, 'm:old': 5, 'm:ok': 1200 }));
  const loaded = make();
  assert.equal(loaded.has('m:old'), false); assert.equal(loaded.has('m:ok'), true);
  assert.equal(loaded.remainingSeconds('m:far'), 1); t = 1501; assert.equal(loaded.has('m:far'), false); // clamped to now+ttl
  t = 1000; make().add('m:a');
  assert.equal((fs.statSync(file).mode & 0o777), 0o600); assert.ok(!fs.existsSync(`${file}.tmp`));
  assert.equal(make().has('m:a'), true); t = 1600; assert.equal(make().has('m:a'), false);
  const flight = createInflight({ file: `${dir}/inflight.json`, fs });
  assert.equal(flight.recover(), null);
  flight.begin({ clientKey: 'm:x', jobId: 'j', startedAt: 1 });
  assert.equal(flight.recover().clientKey, 'm:x'); assert.equal(flight.recover(), null);
  flight.begin({ clientKey: 'm:y' }); flight.end(); assert.equal(flight.recover(), null);
});

test('queued request that cannot start within the wait cap resolves QUEUE_TIMEOUT and frees its slot', async () => {
  const { QUEUE_TIMEOUT } = await import('../limits.mjs');
  const timers = [];
  const queue = createRunQueue({ maxWaitMs: 25_000, setTimeoutImpl: fn => { timers.push(fn); return timers.length; }, clearTimeoutImpl() {} });
  let release; const first = queue.submit(() => new Promise(resolve => { release = resolve; }));
  const second = queue.submit(() => 'never');
  assert.deepEqual(queue.stats(), { active: 1, queued: 1 });
  timers[0]();
  assert.equal(await second, QUEUE_TIMEOUT); assert.deepEqual(queue.stats(), { active: 1, queued: 0 });
  release('done'); assert.equal(await first, 'done');
});
