import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter, createCompileQueue } from '../limits.mjs';

test('allows ten attempts per IP each minute', () => {
  let now = 0; const limiter = createRateLimiter({ now: () => now });
  for (let i = 0; i < 10; i++) assert.equal(limiter.take('a'), true);
  assert.equal(limiter.take('a'), false);
  assert.equal(limiter.take('b'), true);
  now = 60000; assert.equal(limiter.take('a'), true);
  limiter.close();
});
test('evicts the oldest client when full and sweeps expired clients on an unref timer', () => {
  let now = 0, tick, timer;
  const limiter = createRateLimiter({ limit: 1, maxKeys: 2, windowMs: 100,
    now: () => now,
    setIntervalImpl: callback => { tick = callback; timer = { unref() { this.unrefed = true; } }; return timer; },
  });
  assert.equal(timer.unrefed, true);
  assert.equal(limiter.take('a'), true);
  assert.equal(limiter.take('b'), true);
  assert.equal(limiter.take('a'), false); // a is now most recently used
  assert.equal(limiter.take('c'), true); // b is evicted
  assert.equal(limiter.take('b'), true); // evicted b is admitted again
  assert.deepEqual(limiter.stats(), { clients: 2 });
  now = 100; tick();
  assert.deepEqual(limiter.stats(), { clients: 0 });
  assert.equal(limiter.take('a'), true);
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
