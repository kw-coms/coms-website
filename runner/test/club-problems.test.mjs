import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClubProblems } from '../club-problems.mjs';
import { createClubStore } from '../club-store.mjs';

const draft = () => ({
  title: '구간 더하기', statement: '두 수의 합을 출력하세요.',
  inputSpec: '정수 두 개', outputSpec: '합', difficultyTier: 7,
  topics: ['수학'], examples: [{ stdin: '1 2', expected: '3' }],
  tests: Array.from({ length: 5 }, (_, index) => ({
    stdin: `${index + 3} ${index + 4}`, expected: String(index * 2 + 7),
  })),
  reference: { lang: 'python', code: 'a,b=map(int,input().split());print(a+b)' },
  compare: 'tokens',
});

function fixture(store, bank = {}) {
  return createClubProblems({ store, numberedProblems: bank, now: () => 2_000 });
}

function memoryStore() {
  let state = { version: 1, proposals: [], nextNumber: 90_000 };
  let pending = Promise.resolve();
  return {
    read: async () => structuredClone(state),
    update(mutator) {
      const result = pending.then(() => {
        const next = structuredClone(state);
        const response = mutator(next);
        state = next;
        return response;
      });
      pending = result.catch(() => {});
      return result;
    },
    snapshot: () => structuredClone(state),
  };
}

test('author drafts, submits, and the chair verifies before publishing a private case bank', async () => {
  const store = memoryStore(), bank = {};
  const problems = fixture(store, bank);
  const created = (await problems.handle('m:alice', { action: 'problem-save', draft: draft() })).proposal;
  assert.equal(created.revision, 0);
  assert.equal(created.status, 'draft');
  assert.equal(created.draft.tests.length, 5);
  assert.equal((await problems.handle('m:bob', { action: 'problem-list' })).proposals.length, 0);
  assert.equal((await problems.handle('m:chair', { action: 'problem-list' }, { canManage: true })).proposals.length, 0);
  await assert.rejects(problems.handle('m:bob', { action: 'problem-get', id: created.id }), /찾을 수 없어요/);
  await assert.rejects(problems.handle('m:chair', { action: 'problem-get', id: created.id }, { canManage: true }), /찾을 수 없어요/);
  await assert.rejects(problems.handle('m:alice', { action: 'problem-publish', id: created.id, revision: 0 }), /관리자만/);
  const pending = (await problems.handle('m:alice', { action: 'problem-submit', id: created.id, revision: 0 })).proposal;
  assert.equal(pending.status, 'pending');
  assert.equal(pending.revision, 1);
  assert.equal((await problems.handle('m:chair', { action: 'problem-list' }, { canManage: true })).proposals.length, 1);
  await assert.rejects(problems.handle('m:chair', { action: 'problem-publish', id: created.id, revision: 1 }, { canManage: true }), /검증/);
  const exact = await problems.verification('m:chair', created.id, { canManage: true });
  assert.equal(exact.problem.cases.length, 6);
  assert.equal(exact.lang, 'python');
  const verified = await problems.finishVerification('m:chair', created.id, exact.revision,
    { passed: 6, total: 6, solved: true }, { canManage: true });
  assert.equal(verified.verified, true);
  const published = (await problems.handle('m:chair',
    { action: 'problem-publish', id: created.id, revision: 1 }, { canManage: true })).proposal;
  assert.equal(published.number, 90_000);
  assert.equal(published.verified, true);
  assert.equal(bank[90_000].cases.length, 6);
  assert.deepEqual(bank[90_000].langs, ['c', 'cpp', 'java', 'python', 'javascript']);
  const catalog = (await problems.handle('m:bob', { action: 'problem-catalog' })).problems;
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].problem.id, 'club-problem-90000');
  assert.equal(catalog[0].problem.examples.length, 1);
  assert.deepEqual(catalog[0].problem.tests, []);
  assert.ok(!JSON.stringify(catalog).includes('3 4'));
  assert.ok(!JSON.stringify(catalog).includes('a,b=map'));
  assert.equal(store.snapshot().proposals[0].owner.length, 64);
});

test('verified author submission retains verification at the submitted revision', async () => {
  const bank = {};
  const service = fixture(memoryStore(), bank);
  const proposal = (await service.handle('m:alice', { action: 'problem-save', draft: draft() })).proposal;
  await service.finishVerification('m:alice', proposal.id, 0, { passed: 6, total: 6, solved: true });
  const submitted = (await service.handle('m:alice', { action: 'problem-submit', id: proposal.id, revision: 0 })).proposal;
  assert.equal(submitted.revision, 1);
  assert.equal(submitted.verified, true);
  const published = (await service.handle('m:chair',
    { action: 'problem-publish', id: proposal.id, revision: 1 }, { canManage: true })).proposal;
  assert.equal(published.number, 90_000);
  assert.equal(bank[90_000].cases.length, 6);
});

test('changes invalidate verification and stale revision cannot replace or publish', async () => {
  const service = fixture(memoryStore());
  const original = (await service.handle('m:alice', { action: 'problem-save', draft: draft() })).proposal;
  const revision = (await service.verification('m:alice', original.id)).revision;
  await service.finishVerification('m:alice', original.id, revision, { passed: 6, total: 6, solved: true });
  const edit = (await service.handle('m:alice', { action: 'problem-save', id: original.id,
    revision: 0, draft: { ...draft(), title: '새 제목' } })).proposal;
  assert.equal(edit.verified, false);
  await assert.rejects(service.finishVerification('m:alice', original.id, revision,
    { passed: 6, total: 6, solved: true }), /새로고침/);
  await assert.rejects(service.handle('m:alice', { action: 'problem-submit', id: original.id, revision: 0 }), /새로고침/);
  const pending = (await service.handle('m:alice', { action: 'problem-submit', id: original.id, revision: 1 })).proposal;
  assert.equal(pending.revision, 2);
  const returned = (await service.handle('m:chair', { action: 'problem-return', id: original.id,
    revision: pending.revision, note: '테스트를 확인해 주세요.' }, { canManage: true })).proposal;
  assert.equal(returned.status, 'changes');
  assert.equal(returned.note, '테스트를 확인해 주세요.');
  assert.equal((await service.handle('m:alice', { action: 'problem-get', id: original.id })).proposal.status, 'changes');
});

test('draft validation bounds private cases and disallows duplicate inputs', async () => {
  const service = fixture(memoryStore());
  const attempt = value => service.handle('m:alice', { action: 'problem-save', draft: value });
  await assert.rejects(attempt({ ...draft(), tests: [] }), /예제/);
  await assert.rejects(attempt({ ...draft(), tests: [...draft().tests, ...draft().tests] }), /예제/);
  await assert.rejects(attempt({ ...draft(), tests: [{ stdin: '1 2', expected: 'wrong' }, ...draft().tests.slice(1)] }), /중복/);
  await assert.rejects(attempt({ ...draft(), examples: [{ stdin: 'x'.repeat(16_385), expected: '' }] }), /크기/);
  await assert.rejects(attempt({ ...draft(), examples: [{ stdin: '1 2', expected: 'x'.repeat(8_193) }] }), /크기/);
  await assert.rejects(attempt({ ...draft(), reference: { lang: 'python', code: 'x'.repeat(65_537) } }), /제목/);
});

test('published problem and monotonically assigned number survive restart', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'club-problem-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = { directory, filename: 'problems.json', initial: () => ({ version: 1, proposals: [], nextNumber: 90_000 }) };
  let bank = {};
  const first = fixture(createClubStore(config), bank);
  const created = (await first.handle('m:chair', { action: 'problem-save', draft: draft() }, { canManage: true })).proposal;
  await first.finishVerification('m:chair', created.id, 0, { passed: 6, total: 6, solved: true }, { canManage: true });
  await first.handle('m:chair', { action: 'problem-publish', id: created.id, revision: 0 }, { canManage: true });
  bank = {};
  const second = fixture(createClubStore(config), bank);
  await second.hydrate();
  assert.equal(bank[90_000].cases.length, 6);
  const next = (await second.handle('m:chair', { action: 'problem-save', draft: { ...draft(), title: '두 번째 문제' } },
    { canManage: true })).proposal;
  await second.finishVerification('m:chair', next.id, 0, { passed: 6, total: 6, solved: true }, { canManage: true });
  const published = (await second.handle('m:chair',
    { action: 'problem-publish', id: next.id, revision: 0 }, { canManage: true })).proposal;
  assert.equal(published.number, 90_001);
  assert.equal(bank[90_001].cases.length, 6);
});

test('failed reference grading blocks publication and concurrent publish uses one number', async () => {
  const store = memoryStore(), bank = {};
  const service = fixture(store, bank);
  const created = (await service.handle('m:chair', { action: 'problem-save', draft: draft() }, { canManage: true })).proposal;
  await service.finishVerification('m:chair', created.id, 0, { passed: 5, total: 6, solved: false }, { canManage: true });
  await assert.rejects(service.handle('m:chair',
    { action: 'problem-publish', id: created.id, revision: 0 }, { canManage: true }), /검증/);
  await service.finishVerification('m:chair', created.id, 0, { passed: 6, total: 6, solved: true }, { canManage: true });
  const results = await Promise.allSettled(Array.from({ length: 2 }, () => service.handle('m:chair',
    { action: 'problem-publish', id: created.id, revision: 0 }, { canManage: true })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.equal(store.snapshot().nextNumber, 90_001);
  assert.deepEqual(Object.keys(bank), ['90000']);
});
