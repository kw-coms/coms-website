import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClubTournaments } from '../club-tournaments.mjs';
import { createClubStore } from '../club-store.mjs';

const start = Date.parse('2026-11-25T09:00:00Z');
const bank = { 1001: {}, 1002: {}, 1003: {}, 1004: {}, 1005: {} };
const president = 'm:president', members = ['m:a', 'm:b', 'm:c', 'm:d', 'm:e', 'm:f'];
const names = ['가람', '나래', '다온', '라온', '마루', '바다'];
const form = (capacity = 4) => ({ action: 'tournament-save', title: '가을 알고리즘 컵', rules: '채점 점수, 접수 시각 순으로 진출합니다.',
  startsAt: start + 30_000, capacity, durationMinutes: 5, breakMinutes: 0,
  problemNumbers: capacity === 4 ? [1001, 1002] : [1001, 1002, 1003] });

function fixture(initial = { version: 1, events: [] }, shuffle = players => players, problemBank = bank) {
  let time = start;
  let data = structuredClone(initial);
  let pending = Promise.resolve();
  const store = {
    read: async () => structuredClone(data),
    update(mutate) {
      const job = pending.then(() => {
        const next = structuredClone(data);
        const value = mutate(next);
        data = next;
        return value;
      });
      pending = job.catch(() => {});
      return job;
    },
  };
  return { tournaments: createClubTournaments({ store, numberedProblems: problemBank, now: () => time, shuffle }),
    at: () => time, until: value => { time = value; }, advance: delta => { time += delta; }, state: () => structuredClone(data) };
}
const asPresident = { canManage: true, displayName: '회장' };

async function published(f, capacity = 4) {
  const saved = await f.tournaments.handle(president, form(capacity), asPresident);
  const id = saved.event.id;
  await f.tournaments.handle(president, { action: 'tournament-publish', id }, asPresident);
  return id;
}

async function enter(f, id, count) {
  for (let i = 0; i < count; i++) {
    await f.tournaments.handle(members[i], { action: 'tournament-join', id }, { displayName: names[i] });
  }
}

test('only the president creates or publishes, and draft questions are private', async () => {
  const f = fixture();
  await assert.rejects(f.tournaments.handle(members[0], form()), /회장만/);
  await assert.rejects(f.tournaments.handle(president, { ...form(), problemNumbers: [1001, 9999] }, asPresident), /라운드 문제/);
  await assert.rejects(f.tournaments.handle(president, { ...form(), problemNumbers: [1001, 1001] }, asPresident), /라운드 문제/);
  const saved = await f.tournaments.handle(president, form(), asPresident);
  assert.match(saved.event.id, /^[a-f0-9]{24}$/);
  assert.deepEqual(saved.event.problemNumbers, [1001, 1002]);
  assert.equal((await f.tournaments.handle(members[0], { action: 'tournament-list' })).events.length, 0);
  await assert.rejects(f.tournaments.handle(members[0], { action: 'tournament-get', id: saved.event.id }), /찾을 수 없어요/);
  await assert.rejects(f.tournaments.handle(members[0], { action: 'tournament-publish', id: saved.event.id }), /찾을 수 없어요|회장만/);
  const released = await f.tournaments.handle(president, { action: 'tournament-publish', id: saved.event.id }, asPresident);
  assert.equal(released.event.status, 'registration');
  const memberView = (await f.tournaments.handle(members[0], { action: 'tournament-get', id: saved.event.id })).event;
  assert.equal(memberView.problemNumbers, null);
  assert.equal(memberView.rules, form().rules);
  assert.ok(!JSON.stringify(memberView).includes('president'));
  await assert.rejects(f.tournaments.handle(president, { ...form(), id: saved.event.id }, asPresident), /공개 전/);
});

test('registration is bounded, aliases stay private, and a late empty event closes', async () => {
  const f = fixture();
  const id = await published(f);
  for (let i = 0; i < 4; i++) await f.tournaments.handle(members[i], { action: 'tournament-join', id });
  await assert.rejects(f.tournaments.handle(members[4], { action: 'tournament-join', id }), /인원이 가득/);
  await assert.rejects(f.tournaments.handle(members[0], { action: 'tournament-join', id }), /이미 참가/);
  const event = (await f.tournaments.handle(president, { action: 'tournament-get', id }, asPresident)).event;
  assert.deepEqual(event.participants, ['참가자 1', '참가자 2', '참가자 3', '참가자 4']);
  assert.ok(!JSON.stringify(event).includes('m:a'));
  await f.tournaments.handle(members[3], { action: 'tournament-leave', id });
  assert.equal((await f.tournaments.handle(members[0], { action: 'tournament-get', id })).event.participantCount, 3);
  f.advance(30_000);
  await assert.rejects(f.tournaments.handle(members[3], { action: 'tournament-join', id }), /끝난/);
  const empty = fixture();
  const emptyId = await published(empty);
  empty.advance(30_000);
  assert.equal((await empty.tournaments.handle(president, { action: 'tournament-get', id: emptyId }, asPresident)).event.status, 'cancelled');
});

test('three entrants use one bye, only reveal the active problem, and score advances a player', async () => {
  const f = fixture();
  const id = await published(f, 8);
  await enter(f, id, 3);
  f.advance(30_000);
  const first = (await f.tournaments.handle(members[0], { action: 'tournament-get', id })).event;
  assert.equal(first.status, 'running');
  assert.equal(first.rounds.length, 1);
  assert.equal(first.rounds[0].problemNumber, 1002);
  assert.equal(first.rounds[0].matches[0].canSubmit, false);
  assert.equal(first.rounds[0].matches[1].canSubmit, false);
  const match = first.rounds[0].matches[1];
  assert.deepEqual(match.players, ['나래', '다온']);
  await assert.rejects(f.tournaments.assertSubmission(members[0], id, match.id, 1002, f.at()), /참가한 대진/);
  await assert.rejects(f.tournaments.assertSubmission(members[1], id, match.id, 1001, f.at()), /문제 번호/);
  await f.tournaments.assertSubmission(members[1], id, match.id, 1002, f.at());
  await f.tournaments.recordResult(members[1], id, match.id, 1002, f.at(), { passed: 2, solved: false });
  f.advance(5_000);
  await f.tournaments.recordResult(members[2], id, match.id, 1002, f.at(), { passed: 1, solved: false });
  f.until(first.rounds[0].endsAt + 60_000);
  const second = (await f.tournaments.handle(members[0], { action: 'tournament-get', id })).event;
  assert.equal(second.rounds[0].matches[1].winner, '나래');
  assert.equal(second.rounds[0].matches[1].result, 'score');
  assert.equal(second.rounds[1].problemNumber, 1003);
  assert.equal(second.rounds[1].matches[0].status, 'active');
  f.until(second.rounds[1].startsAt);
  const final = (await f.tournaments.handle(members[0], { action: 'tournament-get', id })).event;
  assert.equal(final.rounds[1].problemNumber, 1003);
  assert.deepEqual(final.rounds[1].matches[0].players, ['가람', '나래']);
});

test('submission receipt, queued grade grace and exact tie determine champion', async () => {
  const f = fixture();
  const id = await published(f);
  await enter(f, id, 2);
  f.advance(30_000);
  const event = (await f.tournaments.handle(members[0], { action: 'tournament-get', id })).event;
  const match = event.rounds[0].matches[0];
  assert.equal(event.rounds[0].problemNumber, 1002);
  const receipt = f.at();
  await f.tournaments.assertSubmission(members[0], id, match.id, 1002, receipt);
  f.advance(1_000);
  const later = f.at();
  await f.tournaments.recordResult(members[1], id, match.id, 1002, later, { passed: 1, solved: false });
  f.until(event.rounds[0].endsAt + 30_000);
  await f.tournaments.recordResult(members[0], id, match.id, 1002, receipt, { passed: 1, solved: false });
  f.until(event.rounds[0].endsAt + 60_000);
  const result = (await f.tournaments.handle(members[0], { action: 'tournament-get', id })).event;
  assert.equal(result.status, 'finished');
  assert.equal(result.champion, '가람');
  assert.equal(result.rounds[0].matches[0].result, 'score');
  assert.deepEqual(await f.tournaments.recordResult(members[1], id, match.id, 1002, later,
    { passed: 2, solved: false }), { recorded: false });
});

test('two players with the same name still identify the winning bracket slot', async () => {
  const f = fixture();
  const id = await published(f);
  for (let index = 0; index < 2; index++) {
    await f.tournaments.handle(members[index], { action: 'tournament-join', id }, { displayName: '가람' });
  }
  f.advance(30_000);
  const current = (await f.tournaments.handle(members[0], { action: 'tournament-get', id })).event;
  const match = current.rounds[0].matches[0];
  assert.deepEqual(match.players, ['가람', '가람']);
  assert.equal(match.winnerSlot, null);
  await f.tournaments.recordResult(members[1], id, match.id, 1002, f.at(), { passed: 1, solved: true });
  f.until(current.rounds[0].endsAt + 60_000);
  const finished = (await f.tournaments.handle(members[0], { action: 'tournament-get', id })).event.rounds[0].matches[0];
  assert.equal(finished.winner, '가람');
  assert.equal(finished.winnerSlot, 1);
});

test('six entrants receive byes in separate halves of the first bracket', async () => {
  const f = fixture();
  const id = await published(f, 8);
  await enter(f, id, 6);
  f.advance(30_000);
  const event = (await f.tournaments.handle(members[0], { action: 'tournament-get', id })).event;
  assert.deepEqual(event.rounds[0].matches.map(match => match.players[1] === null), [true, false, true, false]);
  assert.deepEqual(event.rounds[0].matches[0].players, ['가람', null]);
  assert.deepEqual(event.rounds[0].matches[2].players, ['라온', null]);
});

test('missing scores remove both players, while an accepted result beats partial scores', async () => {
  const f = fixture();
  const id = await published(f);
  await enter(f, id, 4);
  f.advance(30_000);
  const first = (await f.tournaments.handle(members[0], { action: 'tournament-get', id })).event;
  const [match, unsolved] = first.rounds[0].matches;
  await f.tournaments.recordResult(members[0], id, match.id, 1001, f.at(), { passed: 1, solved: false });
  f.advance(1_000);
  await f.tournaments.recordResult(members[1], id, match.id, 1001, f.at(), { passed: 2, solved: true });
  f.until(first.rounds[0].endsAt + 60_000);
  const after = (await f.tournaments.handle(members[1], { action: 'tournament-get', id })).event;
  assert.equal(after.rounds[0].matches[0].winner, '나래');
  assert.equal(after.rounds[0].matches[1].result, 'no-score');
  assert.deepEqual(after.rounds[1].matches[0].players, ['나래', null]);
  f.until(after.rounds[1].endsAt + 60_000);
  assert.equal((await f.tournaments.handle(members[1], { action: 'tournament-get', id })).event.champion, '나래');
  assert.ok(unsolved.id);
});

test('initial seeding uses the tournament shuffle and a second-slot finalist wins a bye', async () => {
  const f = fixture(undefined, players => [...players].reverse());
  const id = await published(f);
  await enter(f, id, 4);
  f.advance(30_000);
  const first = (await f.tournaments.handle(members[0], { action: 'tournament-get', id })).event;
  assert.deepEqual(first.rounds[0].matches[0].players, ['라온', '다온']);
  const second = first.rounds[0].matches[1];
  await f.tournaments.recordResult(members[1], id, second.id, 1001, f.at(), { passed: 1, solved: false });
  f.until(first.rounds[0].endsAt + 60_000);
  const final = (await f.tournaments.handle(members[1], { action: 'tournament-get', id })).event.rounds[1];
  assert.deepEqual(final.matches[0].players, [null, '나래']);
  f.until(final.endsAt + 60_000);
  const result = (await f.tournaments.handle(members[1], { action: 'tournament-get', id })).event;
  assert.equal(result.champion, '나래');
  assert.equal(result.rounds[1].matches[0].result, 'bye');
});

test('event, bracket and scores survive a new private file store instance', async t => {
  const root = await mkdtemp(join(tmpdir(), 'coms-tournaments-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let time = start;
  const make = () => createClubTournaments({ store: createClubStore({ directory: join(root, 'club'),
    filename: 'tournaments.json', initial: () => ({ version: 1, events: [] }) }), numberedProblems: bank, now: () => time, shuffle: players => players });
  let tournaments = make();
  const id = (await tournaments.handle(president, form(), asPresident)).event.id;
  await tournaments.handle(president, { action: 'tournament-publish', id }, asPresident);
  for (let i = 0; i < 2; i++) await tournaments.handle(members[i], { action: 'tournament-join', id }, { displayName: names[i] });
  time += 30_000;
  const matchId = (await tournaments.handle(members[0], { action: 'tournament-get', id })).event.rounds[0].matches[0].id;
  await tournaments.recordResult(members[0], id, matchId, 1002, time, { passed: 1, solved: false });
  tournaments = make();
  const resumed = (await tournaments.handle(members[0], { action: 'tournament-get', id })).event;
  assert.equal(resumed.rounds[0].matches[0].id, matchId);
  assert.ok(!JSON.stringify(resumed).includes('m:a'));
  time += 360_000;
  assert.equal((await tournaments.handle(members[0], { action: 'tournament-get', id })).event.champion, '가람');
});

test('a cancelled draft remains private and a new event replaces the oldest closed history at capacity', async () => {
  const f = fixture();
  const first = (await f.tournaments.handle(president, form(), asPresident)).event.id;
  await f.tournaments.handle(president, { action: 'tournament-cancel', id: first }, asPresident);
  assert.deepEqual((await f.tournaments.handle(members[0], { action: 'tournament-list' })).events, []);
  await assert.rejects(f.tournaments.handle(members[0], { action: 'tournament-get', id: first }), /찾을 수 없어요/);
  for (let i = 1; i < 50; i++) {
    const id = (await f.tournaments.handle(president, form(), asPresident)).event.id;
    await f.tournaments.handle(president, { action: 'tournament-cancel', id }, asPresident);
  }
  const next = (await f.tournaments.handle(president, form(), asPresident)).event.id;
  assert.equal(f.state().events.length, 50);
  assert.notEqual(next, first);
  await assert.rejects(f.tournaments.handle(president, { action: 'tournament-get', id: first }, asPresident), /찾을 수 없어요/);
});

test('custom rounds admit five weighted problems and keep them hidden until their round', async () => {
  const f = fixture();
  const config = { ...form(4), capacity: 2, scoring: 'full', registrationClosesAt: start + 15_000,
    roundsConfig: [{ durationMinutes: 7, problems: [1001, 1002, 1003, 1004, 1005]
      .map((number, index) => ({ number, points: (index + 1) * 10 })) }] };
  delete config.problemNumbers;
  const event = (await f.tournaments.handle(president, config, asPresident)).event;
  assert.equal(event.registrationClosesAt, start + 15_000);
  assert.deepEqual(event.roundsConfig, config.roundsConfig);
  assert.deepEqual(event.problemNumbers, [1001]);
  assert.equal(event.scoring, 'full');
  await f.tournaments.handle(president, { action: 'tournament-publish', id: event.id }, asPresident);
  await enter(f, event.id, 2);
  const memberView = (await f.tournaments.handle(members[0], { action: 'tournament-get', id: event.id })).event;
  assert.equal(memberView.roundsConfig, null);
  f.until(start + 15_000);
  await assert.rejects(f.tournaments.handle(members[2], { action: 'tournament-join', id: event.id }), /참가 신청이 끝난/);
  await assert.rejects(f.tournaments.handle(members[0], { action: 'tournament-leave', id: event.id }), /참가 취소 기간/);
  f.until(start + 30_000);
  const active = (await f.tournaments.handle(members[0], { action: 'tournament-get', id: event.id })).event;
  assert.equal(active.rounds[0].endsAt, start + 30_000 + 7 * 60_000);
  assert.deepEqual(active.rounds[0].problems, config.roundsConfig[0].problems);
  const match = active.rounds[0].matches[0];
  await f.tournaments.assertSubmission(members[0], event.id, match.id, 1005, f.at());
  await assert.rejects(f.tournaments.assertSubmission(members[0], event.id, match.id, 9999, f.at()), /문제 번호/);
  await f.tournaments.recordResult(members[0], event.id, match.id, 1001, f.at(), { passed: 5, total: 5, solved: true });
  await f.tournaments.recordResult(members[0], event.id, match.id, 1002, f.at(), { passed: 4, total: 5, solved: false });
  f.advance(1_000);
  await f.tournaments.recordResult(members[1], event.id, match.id, 1003, f.at(), { passed: 2, total: 5, solved: false });
  await f.tournaments.recordResult(members[1], event.id, match.id, 1004, f.at(), { passed: 5, total: 5, solved: true });
  assert.equal((await f.tournaments.handle(members[0], { action: 'tournament-get', id: event.id })).event.rounds[0].matches[0].scores, null);
  f.until(active.rounds[0].endsAt + 60_000);
  const finished = (await f.tournaments.handle(members[0], { action: 'tournament-get', id: event.id })).event;
  assert.equal(finished.champion, '나래');
  assert.deepEqual(finished.rounds[0].matches[0].scores, [10, 40]);
});

test('partial scoring compares weighted best results and earliest receipt at the attained total', async () => {
  const f = fixture();
  const config = { ...form(4), capacity: 2, scoring: 'partial', roundsConfig: [{ durationMinutes: 2,
    problems: [{ number: 1001, points: 100 }, { number: 1002, points: 15 }] }] };
  const id = (await f.tournaments.handle(president, config, asPresident)).event.id;
  await f.tournaments.handle(president, { action: 'tournament-publish', id }, asPresident);
  await enter(f, id, 2);
  f.advance(30_000);
  const active = (await f.tournaments.handle(members[0], { action: 'tournament-get', id })).event.rounds[0];
  const matchId = active.matches[0].id;
  await f.tournaments.recordResult(members[0], id, matchId, 1001, f.at(), { passed: 2, total: 3, solved: false });
  await f.tournaments.recordResult(members[0], id, matchId, 1002, f.at(), { passed: 1, total: 3, solved: false });
  f.advance(1_000);
  await f.tournaments.recordResult(members[1], id, matchId, 1001, f.at(), { passed: 2, total: 3, solved: false });
  await f.tournaments.recordResult(members[1], id, matchId, 1002, f.at(), { passed: 1, total: 3, solved: false });
  f.advance(1_000);
  await f.tournaments.recordResult(members[0], id, matchId, 1001, f.at(), { passed: 1, total: 3, solved: false });
  f.until(active.endsAt + 60_000);
  const event = (await f.tournaments.handle(members[0], { action: 'tournament-get', id })).event;
  assert.deepEqual(event.rounds[0].matches[0].scores, [71, 71]);
  assert.equal(event.champion, '가람');
});

test('custom round validation and changing the number bank protect new event setup', async () => {
  const dynamicBank = { ...bank };
  const f = fixture(undefined, players => players, dynamicBank);
  const config = { ...form(4), capacity: 3, roundsConfig: [
    { durationMinutes: 3, problems: [{ number: 1006, points: 20 }] },
    { durationMinutes: 5, problems: [{ number: 1002, points: 30 }] },
  ] };
  delete config.problemNumbers;
  await assert.rejects(f.tournaments.handle(president, config, asPresident), /라운드 문제/);
  dynamicBank[1006] = {};
  assert.equal((await f.tournaments.handle(president, config, asPresident)).event.status, 'draft');
  await assert.rejects(f.tournaments.handle(president, { ...config,
    roundsConfig: [{ durationMinutes: 0, problems: config.roundsConfig[0].problems }, config.roundsConfig[1]] }, asPresident), /라운드 문제/);
  await assert.rejects(f.tournaments.handle(president, { ...config,
    roundsConfig: [{ durationMinutes: 3, problems: [{ number: 1001, points: 1 }, { number: 1001, points: 2 }] }, config.roundsConfig[1]] }, asPresident), /라운드 문제/);
  await assert.rejects(f.tournaments.handle(president, { ...config,
    roundsConfig: [{ durationMinutes: 3, problems: [{ number: 1001, points: 1001 }] }, config.roundsConfig[1]] }, asPresident), /라운드 문제/);
});

test('underfilled bracket uses the last configured rounds and reveals each at its own start', async () => {
  const f = fixture();
  const config = { ...form(8), capacity: 8, scoring: 'full', breakMinutes: 2,
    roundsConfig: [
      { durationMinutes: 1, problems: [{ number: 1001, points: 5 }] },
      { durationMinutes: 2, problems: [{ number: 1002, points: 10 }, { number: 1003, points: 20 }] },
      { durationMinutes: 3, problems: [{ number: 1004, points: 30 }] },
    ] };
  const id = (await f.tournaments.handle(president, config, asPresident)).event.id;
  await f.tournaments.handle(president, { action: 'tournament-publish', id }, asPresident);
  await enter(f, id, 3);
  f.advance(30_000);
  const current = (await f.tournaments.handle(members[0], { action: 'tournament-get', id })).event;
  assert.deepEqual(current.rounds[0].problems, config.roundsConfig[1].problems);
  assert.equal(current.rounds[0].endsAt, f.at() + 2 * 60_000);
  const activeMatch = current.rounds[0].matches.find(match => match.players.every(Boolean));
  const participating = members.find((key, index) => names[index] === activeMatch.players[0]);
  await f.tournaments.assertSubmission(participating, id, activeMatch.id, 1003, f.at());
  await assert.rejects(f.tournaments.assertSubmission(participating, id, activeMatch.id, 1001, f.at()), /문제 번호/);
  await f.tournaments.recordResult(participating, id, activeMatch.id, 1003, f.at(),
    { passed: 2, total: 2, solved: true });
  f.until(current.rounds[0].endsAt + 60_000);
  const waiting = (await f.tournaments.handle(members[0], { action: 'tournament-get', id })).event;
  assert.equal(waiting.rounds[1].startsAt, current.rounds[0].endsAt + 3 * 60_000);
  assert.equal(waiting.rounds[1].problemNumber, null);
  assert.equal(waiting.rounds[1].problems, null);
  assert.equal(waiting.rounds[1].matches[0].status, 'waiting');
  f.until(waiting.rounds[1].startsAt);
  const final = (await f.tournaments.handle(members[0], { action: 'tournament-get', id })).event;
  assert.deepEqual(final.rounds[1].problems, config.roundsConfig[2].problems);
  assert.equal(final.rounds[1].endsAt, final.rounds[1].startsAt + 3 * 60_000);
});

test('custom scores survive store restart and unchanged legacy snapshots remain valid', async t => {
  const root = await mkdtemp(join(tmpdir(), 'coms-tournaments-custom-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let time = start;
  const make = () => createClubTournaments({ store: createClubStore({ directory: join(root, 'club'),
    filename: 'tournaments.json', initial: () => ({ version: 1, events: [] }) }),
  numberedProblems: bank, now: () => time, shuffle: players => players });
  const config = { ...form(4), capacity: 2, scoring: 'partial',
    roundsConfig: [{ durationMinutes: 1, problems: [{ number: 1001, points: 15 }] }] };
  let tournaments = make();
  const id = (await tournaments.handle(president, config, asPresident)).event.id;
  await tournaments.handle(president, { action: 'tournament-publish', id }, asPresident);
  for (let index = 0; index < 2; index++) {
    await tournaments.handle(members[index], { action: 'tournament-join', id },
      { displayName: names[index] });
  }
  time += 30_000;
  const matchId = (await tournaments.handle(members[0], { action: 'tournament-get', id })).event.rounds[0].matches[0].id;
  await tournaments.recordResult(members[0], id, matchId, 1001, time,
    { passed: 2, total: 3, solved: false });
  tournaments = make();
  time += 120_000;
  const finished = (await tournaments.handle(members[0], { action: 'tournament-get', id })).event;
  assert.equal(finished.champion, '가람');
  assert.deepEqual(finished.rounds[0].matches[0].scores, [10, 0]);
});

test('a full-score round gives no points for partial cases and ends unresolved when both score zero', async () => {
  const f = fixture();
  const config = { ...form(4), capacity: 2, roundsConfig: [{ durationMinutes: 1,
    problems: [{ number: 1001, points: 50 }, { number: 1002, points: 20 }] }] };
  const id = (await f.tournaments.handle(president, config, asPresident)).event.id;
  await f.tournaments.handle(president, { action: 'tournament-publish', id }, asPresident);
  await enter(f, id, 2);
  f.advance(30_000);
  const active = (await f.tournaments.handle(members[0], { action: 'tournament-get', id })).event.rounds[0];
  const matchId = active.matches[0].id;
  await f.tournaments.recordResult(members[0], id, matchId, 1001, f.at(),
    { passed: 2, total: 3, solved: false });
  await assert.rejects(f.tournaments.recordResult(members[1], id, matchId, 1002, f.at(),
    { passed: 3, total: 3, solved: false }), /채점 결과/);
  f.until(active.endsAt + 60_000);
  const ended = (await f.tournaments.handle(members[0], { action: 'tournament-get', id })).event;
  assert.equal(ended.champion, null);
  assert.equal(ended.rounds[0].matches[0].result, 'no-score');
  assert.deepEqual(ended.rounds[0].matches[0].scores, [0, 0]);
});
