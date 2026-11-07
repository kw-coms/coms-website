import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter, createCompileQueue, normalizeIp, QUEUE_WAIT_EXPIRED } from '../limits.mjs';

test('allows ten attempts per IP each minute', () => {
  let now = 0; const limiter = createRateLimiter({ now: () => now });
  for (let i = 0; i < 10; i++) assert.equal(limiter.take('a'), true);
  assert.equal(limiter.take('a'), false);
  assert.equal(limiter.take('b'), true);
  now = 60000; assert.equal(limiter.take('a'), true);
  limiter.close();
});
test('full table never evicts live entries; new keys share one overflow bucket; sweep frees space', () => {
  let now = 0, tick;
  const limiter = createRateLimiter({ limit: 2, maxKeys: 2, windowMs: 100,
    now: () => now,
    setIntervalImpl: callback => { tick = callback; return { unref() {} }; },
  });
  assert.equal(limiter.take('a'), true);
  assert.equal(limiter.take('a'), true);
  assert.equal(limiter.take('b'), true);
  // table full: c, d, e share one overflow budget of 2
  assert.equal(limiter.take('c'), true);
  assert.equal(limiter.take('d'), true);
  assert.equal(limiter.take('e'), false);
  assert.equal(limiter.take('c'), false);
  // existing a keeps its exhausted counter, b its own remaining one
  assert.equal(limiter.take('a'), false);
  assert.equal(limiter.take('b'), true);
  assert.deepEqual(limiter.stats(), { clients: 2 });
  now = 100; tick();
  assert.deepEqual(limiter.stats(), { clients: 0 });
  assert.equal(limiter.take('e'), true);
  assert.equal(limiter.take('a'), true);
  limiter.close();
});
test('normalizeIp maps IPv4-mapped and aggregates IPv6 to /64', () => {
  assert.equal(normalizeIp('::ffff:1.2.3.4'), '1.2.3.4');
  assert.equal(normalizeIp('1.2.3.4'), '1.2.3.4');
  const a = normalizeIp('2001:db8:1:2::1'), b = normalizeIp('2001:0DB8:1:2:ffff:ffff:ffff:ffff');
  assert.equal(a, b);
  assert.notEqual(a, normalizeIp('2001:db8:1:3::1'));
  assert.equal(normalizeIp('::1'), normalizeIp('0:0:0:0::5'));
  assert.equal(normalizeIp('fe80::1%en0'), normalizeIp('fe80::2'));
});
test('same-/64 IPv6 clients share one budget', () => {
  const limiter = createRateLimiter({ limit: 2, now: () => 0 });
  assert.equal(limiter.take(normalizeIp('2001:db8:1:2::1')), true);
  assert.equal(limiter.take(normalizeIp('2001:db8:1:2::2')), true);
  assert.equal(limiter.take(normalizeIp('2001:db8:1:2:aaaa::3')), false);
  assert.equal(limiter.take(normalizeIp('2001:db8:1:9::1')), true);
  limiter.close();
});
test('requires a positive client capacity', () => {
  for (const maxKeys of [0, -1, 1.5]) assert.throws(() => createRateLimiter({ maxKeys }), RangeError);
});
test('admits two active and six queued jobs then rejects ninth', async () => {
  const queue = createCompileQueue(), releases = [];
  const jobs = Array.from({ length: 8 }, () => queue.submit(() => new Promise(resolve => releases.push(resolve))));
  assert.deepEqual(queue.stats(), { active: 2, queued: 6 });
  assert.equal(queue.submit(() => 'ninth'), null);
  await Promise.resolve(); assert.equal(releases.length, 2);
  for (let i = 0; i < 8; i++) {
    releases[i](i);
    await jobs[i];
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.deepEqual(queue.stats(), { active: 0, queued: 0 });
});
test('starts next job when active job rejects', async () => {
  const queue = createCompileQueue({ concurrency: 1 });
  const first = queue.submit(() => Promise.reject(new Error('failed')));
  const second = queue.submit(() => 42);
  await assert.rejects(first);
  assert.equal(await second, 42);
});
test('a queued job that cannot start within maxWaitMs is dropped and the slot is not lost', async () => {
  let fire;
  const queue = createCompileQueue({ concurrency: 1, maxQueued: 2, maxWaitMs: 1000, setTimeoutImpl: fn => { fire = fn; return { unref() {} }; } });
  let release;
  const running = queue.submit(() => new Promise(resolve => { release = resolve; }));
  const waiting = queue.submit(() => 'never runs');
  assert.deepEqual(queue.stats(), { active: 1, queued: 1 });
  fire();
  assert.equal(await waiting, QUEUE_WAIT_EXPIRED);
  assert.deepEqual(queue.stats(), { active: 1, queued: 0 });
  release('done');
  assert.equal(await running, 'done');
  assert.equal(await queue.submit(() => 'next'), 'next');
});
test('a queued job that starts in time clears its wait timer', async () => {
  const cleared = [];
  const queue = createCompileQueue({ concurrency: 1, maxWaitMs: 1000, setTimeoutImpl: () => { const timer = { unref() {} }; cleared.push(timer); return timer; } });
  const first = queue.submit(() => 1);
  const second = queue.submit(() => 2);
  assert.equal(await first, 1); assert.equal(await second, 2);
  assert.equal(cleared.length, 1);
});
