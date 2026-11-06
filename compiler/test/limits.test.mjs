import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter, createCompileQueue } from '../limits.mjs';

test('allows ten attempts per IP each minute', () => {
  let now = 0; const limiter = createRateLimiter({ now: () => now });
  for (let i = 0; i < 10; i++) assert.equal(limiter.take('a'), true);
  assert.equal(limiter.take('a'), false);
  assert.equal(limiter.take('b'), true);
  now = 60000; assert.equal(limiter.take('a'), true);
});
test('bounds number of distinct IP records', () => {
  const limiter = createRateLimiter({ maxKeys: 1 });
  assert.equal(limiter.take('a'), true);
  assert.equal(limiter.take('b'), false);
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
