import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunnerServer } from '../server.mjs';
import { createClubBattles } from '../club-battles.mjs';
import { createClubSocial } from '../club-social.mjs';
import { createClubStore } from '../club-store.mjs';
import { createJudgeProgress } from '../judge-progress.mjs';

test('authenticated club requests connect to numbered grading, a battle result and verified votes', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'coms-club-server-'));
  const numberedProblems = { 1001: { langs: ['cpp'], cases: [{ stdin: '', expected: '42' }] } };
  const judgeProgress = createJudgeProgress({ directory: join(directory, 'progress') });
  const clubBattles = createClubBattles({ numberedProblems, store: createClubStore({
    directory, filename: 'battles.json', initial: () => ({ version: 1, rooms: [] }),
  }) });
  const clubSocial = createClubSocial({ numberedProblems, judgeProgress, store: createClubStore({
    directory, filename: 'social.json', initial: () => ({ version: 1, sets: [], votes: [] }),
  }) });
  const server = createRunnerServer({
    trustProxy: true, numberedProblems, judgeProgress, clubBattles, clubSocial, logger() {},
    executor: async ({ code }) => ({ stage: 'run', results: [{ stdout: code, exitCode: 0 }] }),
  });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/study/api`;
  const post = async (actor, route, body) => {
    const response = await fetch(url + route, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(actor ? { 'X-Runner-Client': actor } : {}) },
      body: JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  };

  assert.equal((await post(null, '/club', { action: 'battle-list' })).status, 401);
  assert.equal((await post('alpha', '/club', { action: 'vote-put', problemNumber: 1001, tier: 10 })).status, 403);
  const created = await post('alpha', '/club', { action: 'battle-create', problemNumber: 1001, durationMinutes: 10 });
  assert.equal(created.status, 200);
  const battleCode = created.data.battle.code;
  assert.equal((await post('beta', '/club', { action: 'battle-join', code: battleCode })).data.battle.status, 'active');
  const submit = (actor, code, room = battleCode) => post(actor, '/run', { lang: 'cpp', code, problemNumber: 1001, battleCode: room });
  assert.ok((await submit('gamma', '42')).status >= 400);
  assert.ok((await submit('alpha', '42', '000000000000')).status >= 400);
  assert.equal((await submit('alpha', '0')).data.judge.solved, false);
  assert.equal((await post('alpha', '/club', { action: 'battle-get', code: battleCode })).data.battle.yourAcceptedAt, null);
  const first = await submit('alpha', '42');
  assert.equal(first.data.judge.solved, true);
  assert.deepEqual(first.data.progress.solved, [1001]);
  assert.equal((await submit('beta', '42')).data.judge.solved, true);
  const results = await post('alpha', '/club', { action: 'battle-get', code: battleCode });
  assert.equal(results.data.battle.status, 'finished');
  assert.equal(results.data.battle.result, 'win');
  assert.ok(results.data.battle.yourAcceptedAt < results.data.battle.opponentAcceptedAt);
  assert.equal((await post('alpha', '/club', { action: 'vote-put', problemNumber: 1001, tier: 10 })).data.ownVote, 10);
  const set = await post('alpha', '/club', { action: 'sets-save', title: '친선 문제', problemNumbers: [1001], shared: true });
  assert.equal(set.status, 200);
  assert.deepEqual((await post('beta', '/club', { action: 'sets-list' })).data.sets, []);
  const shared = await post('beta', '/club', { action: 'sets-open', id: set.data.set.id });
  assert.deepEqual(shared.data.set.problemNumbers, [1001]);
  assert.equal(shared.data.set.owned, false);
});
