import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunnerServer } from '../server.mjs';
import { createClubBattles } from '../club-battles.mjs';
import { createClubSocial } from '../club-social.mjs';
import { createClubTournaments } from '../club-tournaments.mjs';
import { createClubProblems } from '../club-problems.mjs';
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

test('president opens a tournament and only the assigned members can submit to its match', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'coms-tournament-server-'));
  const numberedProblems = {
    1001: { langs: ['cpp'], cases: [{ stdin: '', expected: '21' }] },
    1002: { langs: ['cpp'], cases: [{ stdin: '', expected: '42' }] },
  };
  const startsAt = Date.now() - 500;
  let time = startsAt - 1_000;
  const tournaments = createClubTournaments({ numberedProblems, now: () => time, store: createClubStore({
    directory, filename: 'tournaments.json', initial: () => ({ version: 1, events: [] }),
  }) });
  const server = createRunnerServer({ trustProxy: true, numberedProblems, clubTournaments: tournaments, logger() {},
    executor: async ({ code }) => ({ stage: 'run', results: [{ stdout: code, exitCode: 0 }] }) });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/study/api`;
  const post = async (actor, body, path = '/club', role = 'USER') => {
    const response = await fetch(url + path, { method: 'POST', body: JSON.stringify(body), headers: {
      'Content-Type': 'application/json', 'X-Runner-Client': actor, 'X-Runner-Role': role,
      'X-Runner-Name': Buffer.from(actor === 'alpha' ? '테스트 참가자' : actor).toString('base64url'),
    } });
    return { status: response.status, data: await response.json() };
  };
  const config = { action: 'tournament-save', title: '코딩 대회', rules: '시간 안에 제출합니다.', startsAt,
    capacity: 4, durationMinutes: 5, breakMinutes: 0, problemNumbers: [1001, 1002] };
  assert.equal((await post('alpha', { ...config, canManage: true })).status, 403);
  const draft = await post('chair', config, '/club', 'ADMIN');
  assert.equal(draft.status, 200);
  const { id } = draft.data.event;
  assert.equal((await post('alpha', { action: 'tournament-get', id })).status, 404);
  assert.equal((await post('chair', { action: 'tournament-publish', id }, '/club', 'ADMIN')).status, 200);
  await post('alpha', { action: 'tournament-join', id, displayName: '회장' });
  await post('beta', { action: 'tournament-join', id });
  time = Date.now() + 5_000;
  const running = (await post('alpha', { action: 'tournament-get', id })).data.event;
  assert.deepEqual(running.participants, ['테스트 참가자', 'beta']);
  assert.equal(running.rounds[0].problemNumber, 1002);
  const submission = { lang: 'cpp', code: '42', problemNumber: 1002, tournamentId: id, matchId: running.rounds[0].matches[0].id };
  assert.equal((await post('alpha', { ...submission, problemNumber: 1001 }, '/run')).status, 400);
  assert.equal((await post('alpha', { ...submission, battleCode: '123456ABCDEF' }, '/run')).status, 400);
  assert.equal((await post('other', submission, '/run')).status, 403);
  assert.equal((await post('alpha', submission, '/run')).data.judge.solved, true);
  assert.equal((await post('beta', { ...submission, code: '0' }, '/run')).data.judge.solved, false);
  time = running.rounds[0].endsAt + 60_000;
  const result = (await post('beta', { action: 'tournament-get', id })).data.event;
  assert.equal(result.status, 'finished');
  assert.equal(result.champion, '테스트 참가자');
  assert.equal(result.rounds[0].matches[0].winner, '테스트 참가자');
});

test('reference verification uses stored cases and the sandbox queue before issuing a gradeable number', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'coms-authoring-server-'));
  const numberedProblems = {};
  const clubProblems = createClubProblems({ numberedProblems, store: createClubStore({
    directory, filename: 'problems.json', initial: () => ({ version: 1, proposals: [], nextNumber: 90_000 }),
  }) });
  let executions = 0;
  const server = createRunnerServer({
    trustProxy: true, numberedProblems, clubProblems, logger() {},
    executor: async ({ code, tests }) => {
      executions += 1;
      return { stage: 'run', results: tests.map(stdin => ({
        stdout: code === 'double' ? String(Number(stdin) * 2) : '0', exitCode: 0,
      })) };
    },
  });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/study/api`;
  const post = async (actor, body, path = '/club', role = 'USER') => {
    const response = await fetch(url + path, { method: 'POST', body: JSON.stringify(body), headers: {
      'Content-Type': 'application/json', 'X-Runner-Client': actor, 'X-Runner-Role': role,
    } });
    return { status: response.status, data: await response.json() };
  };
  const draft = {
    title: '수를 두 배로', statement: '정수의 두 배를 출력합니다.', inputSpec: '정수 한 개', outputSpec: '정수의 두 배',
    difficultyTier: 1, topics: ['구현'], compare: 'tokens',
    examples: [{ stdin: '1', expected: '2' }],
    tests: [2, -1, 0, 17, 99].map(value => ({ stdin: String(value), expected: String(value * 2) })),
    reference: { lang: 'python', code: 'double' },
  };
  const saved = await post('author', { action: 'problem-save', draft });
  assert.equal(saved.status, 200);
  const { id } = saved.data.proposal;
  assert.equal((await post('stranger', { action: 'problem-verify', authoringId: id }, '/run')).status, 404);
  assert.equal((await post('author', { action: 'problem-verify', authoringId: id, code: 'other' }, '/run')).status, 400);
  assert.equal(executions, 0);
  const verification = await post('author', { action: 'problem-verify', authoringId: id }, '/run');
  assert.equal(verification.status, 200);
  assert.equal(verification.data.judge.solved, true);
  assert.equal(verification.data.judge.total, 6);
  assert.equal(verification.data.proposal.verified, true);
  assert.equal(executions, 1);
  const queued = await post('author', { action: 'problem-submit', id, revision: verification.data.proposal.revision });
  assert.equal(queued.status, 200);
  assert.equal((await post('author', { action: 'problem-publish', id, revision: queued.data.proposal.revision })).status, 403);
  const published = await post('chair', { action: 'problem-publish', id, revision: queued.data.proposal.revision }, '/club', 'ADMIN');
  assert.equal(published.status, 200);
  const number = published.data.proposal.number;
  const catalog = await post('stranger', { action: 'problem-catalog' });
  assert.equal(catalog.data.problems[0].number, number);
  assert.deepEqual(catalog.data.problems[0].problem.tests, []);
  assert.deepEqual(catalog.data.problems[0].problem.solution, {});
  const graded = await post('stranger', { lang: 'python', code: 'double', problemNumber: number }, '/run');
  assert.equal(graded.data.judge.solved, true);
  assert.equal(graded.data.judge.total, 6);
  assert.equal(executions, 2);
});
