import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClubSocial } from '../club-social.mjs';
import { createClubStore } from '../club-store.mjs';

const bank = { 1001: { langs: ['python'] }, 1002: { langs: ['python'] }, 1003: { langs: ['python'] } };
const alice = 'm:alice', bob = 'm:bob', charlie = 'm:charlie';
const progress = new Map([[alice, [1001, 1002]], [bob, [1001]], [charlie, []]]);
const clone = data => structuredClone(data);

function fixture() {
  let data = { version: 1, sets: [], votes: [] };
  let chain = Promise.resolve();
  const store = {
    read: async () => clone(data),
    update(mutator) {
      const work = chain.then(() => {
        const draft = clone(data);
        const answer = mutator(draft);
        data = draft;
        return clone(answer);
      });
      chain = work.catch(() => {});
      return work;
    },
  };
  const judgeProgress = { get: async key => ({ solved: progress.get(key) ?? [] }) };
  return createClubSocial({ store, numberedProblems: bank, judgeProgress, now: () => 5000 });
}

test('sets are editable by their owner and visible to another member only while shared', async () => {
  const social = fixture();
  const created = (await social.handle(alice, { action: 'sets-save', title: '스터디 문제', problemNumbers: [1001, 1002, 1001], shared: false })).set;
  assert.equal(created.owned, true);
  assert.deepEqual(created.problemNumbers, [1001, 1002]);
  assert.equal((await social.handle(bob, { action: 'sets-list' })).sets.length, 0);
  await assert.rejects(social.handle(bob, { action: 'sets-open', id: created.id }), /찾을 수 없어요/);
  await assert.rejects(social.handle(bob, { action: 'sets-save', id: created.id, title: '내 문제', problemNumbers: [1003], shared: false }), /내 문제집만/);
  const shared = (await social.handle(alice, { action: 'sets-save', id: created.id, title: '함께 풀기', problemNumbers: [1001], shared: true })).set;
  assert.equal(shared.id, created.id);
  assert.deepEqual((await social.handle(bob, { action: 'sets-open', id: created.id })).set,
    { ...shared, owned: false });
  assert.equal((await social.handle(bob, { action: 'sets-list' })).sets.length, 0);
  await social.handle(alice, { action: 'sets-save', id: created.id, title: '비공개', problemNumbers: [1001], shared: false });
  await assert.rejects(social.handle(bob, { action: 'sets-open', id: created.id }), /찾을 수 없어요/);
  assert.deepEqual(await social.handle(alice, { action: 'sets-delete', id: created.id }), { deleted: true });
  await assert.rejects(social.handle(alice, { action: 'sets-open', id: created.id }), /찾을 수 없어요/);
});

test('set validation and capacity apply to concurrent saves', async () => {
  const social = fixture();
  await assert.rejects(social.handle(alice, { action: 'sets-save', title: 'bad', problemNumbers: [9999], shared: true }), /문제 번호/);
  await assert.rejects(social.handle(alice, { action: 'sets-save', title: '', problemNumbers: [], shared: true }), /제목/);
  await assert.rejects(social.handle(alice, { action: 'sets-save', title: 'bad', problemNumbers: [], shared: 'yes' }), /제목/);
  await assert.rejects(social.handle(alice, { action: 'sets-save', title: 'empty', problemNumbers: [], shared: false }), /문제 번호/);
  const writes = await Promise.allSettled(Array.from({ length: 21 }, (_, i) => social.handle(alice,
    { action: 'sets-save', title: `set ${i}`, problemNumbers: [1001], shared: false })));
  assert.equal(writes.filter(write => write.status === 'fulfilled').length, 20);
  assert.match(writes[20].reason.message, /20개/);
  assert.equal((await social.handle(alice, { action: 'sets-list' })).sets.length, 20);
});

test('only verified solvers vote and replacements do not increase the count', async () => {
  const social = fixture();
  assert.deepEqual(await social.handle(alice, { action: 'vote-get', problemNumber: 1001 }),
    { count: 0, median: null, ownVote: null, canVote: true });
  await assert.rejects(social.handle(charlie, { action: 'vote-put', problemNumber: 1001, tier: 9 }), /해결한 회원만/);
  await assert.rejects(social.handle(alice, { action: 'vote-put', problemNumber: 9999, tier: 9 }), /문제 번호/);
  await assert.rejects(social.handle(alice, { action: 'vote-put', problemNumber: 1001, tier: 32 }), /난이도/);
  assert.deepEqual(await social.handle(alice, { action: 'vote-put', problemNumber: 1001, tier: 12 }),
    { count: 1, median: 12, ownVote: 12, canVote: true });
  assert.deepEqual(await social.handle(bob, { action: 'vote-put', problemNumber: 1001, tier: 18 }),
    { count: 2, median: 15, ownVote: 18, canVote: true });
  assert.deepEqual(await social.handle(alice, { action: 'vote-put', problemNumber: 1001, tier: 20 }),
    { count: 2, median: 19, ownVote: 20, canVote: true });
  assert.deepEqual(await social.handle(charlie, { action: 'vote-get', problemNumber: 1001 }),
    { count: 2, median: 19, ownVote: null, canVote: false });
  assert.deepEqual(await social.handle(alice, { action: 'vote-get', problemNumber: 1002 }),
    { count: 0, median: null, ownVote: null, canVote: true });
});

test('shared sets and votes survive a fresh module instance with private file storage', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'coms-club-social-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = { directory, filename: 'club-social.json', initial: () => ({ version: 1, sets: [], votes: [] }) };
  const judgeProgress = { get: async key => ({ solved: progress.get(key) ?? [] }) };
  const first = createClubSocial({ store: createClubStore(config), numberedProblems: bank, judgeProgress });
  const id = (await first.handle(alice, { action: 'sets-save', title: '공유 세트', problemNumbers: [1001], shared: true })).set.id;
  await first.handle(alice, { action: 'vote-put', problemNumber: 1001, tier: 14 });

  const reopened = createClubSocial({ store: createClubStore(config), numberedProblems: bank, judgeProgress });
  assert.deepEqual((await reopened.handle(bob, { action: 'sets-open', id })).set.problemNumbers, [1001]);
  assert.deepEqual(await reopened.handle(bob, { action: 'vote-get', problemNumber: 1001 }),
    { count: 1, median: 14, ownVote: null, canVote: true });
  await assert.rejects(reopened.handle('ip:visitor', { action: 'sets-list' }), /로그인한 동아리원/);
});
