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

test('deny list persists across instances, expires and tolerates a corrupt file', async () => {
  const { createDenyList } = await import('../limits.mjs');
  const fs = await import('node:fs');
  const { mkdtempSync, writeFileSync } = fs;
  const dir = mkdtempSync((await import('node:os')).tmpdir() + '/deny-'), file = `${dir}/d.json`;
  let t = 1000;
  const make = () => createDenyList({ file, ttlMs: 500, now: () => t, fs });
  writeFileSync(file, '{not json'); assert.equal(make().has('1.2.3.4'), false);
  make().add('1.2.3.4');
  const again = make();
  assert.equal(again.has('1.2.3.4'), true); assert.equal(again.has('5.6.7.8'), false);
  t = 1600; assert.equal(make().has('1.2.3.4'), false);
});
