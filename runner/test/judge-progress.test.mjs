import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJudgeProgress } from '../judge-progress.mjs';

const member = 'm:student_123';

async function withDirectory(t) {
  const root = await mkdtemp(join(tmpdir(), 'coms-judge-progress-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return join(root, 'progress');
}

test('first solutions persist by member without writing an identifier to disk', async t => {
  const directory = await withDirectory(t);
  let time = Date.parse('2026-11-23T14:59:59.999Z');
  const progress = createJudgeProgress({ directory, now: () => time });
  assert.deepEqual(await progress.get(member), { solved: [], solvedToday: 0, streak: 0 });
  assert.deepEqual(await progress.recordSolved(member, 1100), { solved: [1100], solvedToday: 1, streak: 1 });
  assert.deepEqual(await progress.recordSolved(member, 1100), { solved: [1100], solvedToday: 1, streak: 1 });
  assert.deepEqual(await progress.recordSolved('m:another', 1101), { solved: [1101], solvedToday: 1, streak: 1 });
  const files = await readdir(directory);
  assert.equal(files.length, 2);
  assert.ok(files.every(file => /^[a-f0-9]{64}\.json$/.test(file)));
  assert.ok(files.every(file => !file.includes('student') && !file.includes('another')));
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  for (const file of files) assert.equal((await stat(join(directory, file))).mode & 0o777, 0o600);
  const saved = JSON.parse(await readFile(join(directory, `${createHash('sha256').update(member).digest('hex')}.json`), 'utf8'));
  assert.deepEqual(saved.solved.map(({ number }) => number), [1100]);
  time = Date.parse('2026-11-23T15:00:00.000Z');
  assert.deepEqual(await createJudgeProgress({ directory, now: () => time }).get(member), { solved: [1100], solvedToday: 0, streak: 1 });
});

test('streak follows Korean calendar days and a second solve on the same day counts once', async t => {
  const directory = await withDirectory(t);
  let time = Date.parse('2026-12-31T14:59:59Z');
  const progress = createJudgeProgress({ directory, now: () => time });
  await progress.recordSolved(member, 1100);
  time = Date.parse('2026-12-31T15:00:00Z');
  assert.deepEqual(await progress.recordSolved(member, 1101), { solved: [1100, 1101], solvedToday: 1, streak: 2 });
  assert.deepEqual(await progress.recordSolved(member, 1102), { solved: [1100, 1101, 1102], solvedToday: 2, streak: 2 });
  time = Date.parse('2027-01-02T15:00:00Z');
  assert.deepEqual(await progress.get(member), { solved: [1100, 1101, 1102], solvedToday: 0, streak: 0 });
  assert.deepEqual(await progress.recordSolved(member, 1103), { solved: [1100, 1101, 1102, 1103], solvedToday: 1, streak: 1 });
});

test('concurrent writes for one member retain every number and reads wait for them', async t => {
  const directory = await withDirectory(t);
  const progress = createJudgeProgress({ directory, now: () => Date.parse('2026-11-23T10:00:00Z') });
  const writes = Array.from({ length: 40 }, (_, index) => progress.recordSolved(member, 2000 + index));
  const read = progress.get(member);
  await Promise.all(writes);
  const result = await read;
  assert.deepEqual(result.solved, Array.from({ length: 40 }, (_, index) => 2000 + index));
  assert.equal(result.solvedToday, 40);
  const secondInstance = createJudgeProgress({ directory, now: () => Date.parse('2026-11-23T10:00:00Z') });
  await Promise.all([progress.recordSolved(member, 2040), secondInstance.recordSolved(member, 2041)]);
  assert.deepEqual((await secondInstance.get(member)).solved.slice(-2), [2040, 2041]);
  assert.deepEqual(await createJudgeProgress({ directory }).get('m:unrelated'), { solved: [], solvedToday: 0, streak: 0 });
});

test('invalid input and damaged records fail without replacing existing data', async t => {
  const directory = await withDirectory(t);
  const progress = createJudgeProgress({ directory });
  await assert.rejects(progress.recordSolved('../bad', 1100), /authenticated member key/);
  await assert.rejects(progress.recordSolved(member, 0), /positive problem number/);
  await progress.recordSolved(member, 1100);
  const file = join(directory, `${createHash('sha256').update(member).digest('hex')}.json`);
  await writeFile(file, '{broken', 'utf8');
  await assert.rejects(progress.recordSolved(member, 1101), SyntaxError);
  assert.equal(await readFile(file, 'utf8'), '{broken');
  assert.deepEqual((await readdir(directory)).filter(name => name.endsWith('.tmp')), []);
});
