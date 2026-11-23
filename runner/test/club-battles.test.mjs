import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClubBattles } from '../club-battles.mjs';
import { createClubStore } from '../club-store.mjs';

const base = Date.parse('2026-11-24T00:00:00Z');
const bank = { 1100: { langs: ['c', 'cpp', 'java', 'python', 'javascript'] } };
const host = 'm:host_1', guest = 'm:guest_2', third = 'm:guest_3';

function makeFixture(initial = { version: 1, rooms: [] }) {
  let time = base;
  let state = structuredClone(initial);
  let pending = Promise.resolve();
  const store = {
    read: async () => structuredClone(state),
    update(mutator) {
      const work = pending.then(() => {
        const next = structuredClone(state);
        const result = mutator(next);
        state = next;
        return result;
      });
      pending = work.catch(() => {});
      return work;
    },
  };
  return {
    battles: createClubBattles({ store, numberedProblems: bank, now: () => time }),
    advance: delta => { time += delta; return time; },
    at: () => time,
    state: () => structuredClone(state),
  };
}

test('private invite joins once, starts the timer, and keeps member identity private', async () => {
  const f = makeFixture();
  const created = (await f.battles.handle(host, { action: 'battle-create', problemNumber: 1100, durationMinutes: 10 })).battle;
  assert.match(created.code, /^[A-F0-9]{12}$/);
  assert.equal(created.status, 'waiting');
  assert.equal(created.opponentJoined, false);
  assert.equal(created.startedAt, null);
  assert.ok(!JSON.stringify(created).includes('host_1'));
  assert.deepEqual((await f.battles.handle(third, { action: 'battle-list' })).battles, []);
  await assert.rejects(f.battles.handle(third, { action: 'battle-get', code: created.code }), /참가한 배틀/);
  await assert.rejects(f.battles.handle(host, { action: 'battle-join', code: created.code }), /이미 참가/);
  const joined = await Promise.allSettled([guest, third].map(key => f.battles.handle(key, { action: 'battle-join', code: created.code })));
  assert.equal(joined.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(joined.filter(row => row.status === 'rejected').length, 1);
  const participant = joined[0].status === 'fulfilled' ? guest : third;
  const active = (await f.battles.handle(participant, { action: 'battle-get', code: created.code })).battle;
  assert.equal(active.status, 'active');
  assert.equal(active.endsAt, base + 600_000);
  assert.equal(active.opponentJoined, true);
  assert.equal(active.isHost, false);
  assert.ok(!JSON.stringify(active).includes(participant.slice(2)));
  assert.equal((await f.battles.handle(host, { action: 'battle-get', code: created.code })).battle.isHost, true);
});

test('a member has one open room, host can cancel only while waiting, and waiting rooms expire', async () => {
  const f = makeFixture();
  await assert.rejects(f.battles.handle(host, { action: 'battle-create', problemNumber: 9999, durationMinutes: 10 }), /문제 번호/);
  await assert.rejects(f.battles.handle(host, { action: 'battle-create', problemNumber: 1100, durationMinutes: 9 }), /제한 시간/);
  const code = (await f.battles.handle(host, { action: 'battle-create', problemNumber: 1100, durationMinutes: 15 })).battle.code;
  await assert.rejects(f.battles.handle(host, { action: 'battle-create', problemNumber: 1100, durationMinutes: 20 }), /진행 중/);
  await assert.rejects(f.battles.handle(guest, { action: 'battle-cancel', code }), /참가한 배틀/);
  assert.equal((await f.battles.handle(host, { action: 'battle-cancel', code })).battle.status, 'cancelled');
  const second = (await f.battles.handle(host, { action: 'battle-create', problemNumber: 1100, durationMinutes: 10 })).battle.code;
  f.advance(2 * 60 * 60 * 1000);
  assert.equal((await f.battles.handle(host, { action: 'battle-get', code: second })).battle.status, 'expired');
  await assert.rejects(f.battles.handle(guest, { action: 'battle-join', code: second }), /입장할 수 없는/);
});

test('battle submission validates exact invite, problem, membership and receipt window', async () => {
  const f = makeFixture();
  const code = (await f.battles.handle(host, { action: 'battle-create', problemNumber: 1100, durationMinutes: 10 })).battle.code;
  await assert.rejects(f.battles.assertSubmission(host, code, 1100, f.at()), /제출 시간이 지난/);
  f.advance(100);
  await f.battles.handle(guest, { action: 'battle-join', code });
  await assert.rejects(f.battles.assertSubmission(third, code, 1100, f.at()), /참가한 배틀/);
  await assert.rejects(f.battles.assertSubmission(host, 'BAD', 1100, f.at()), /초대 코드/);
  await assert.rejects(f.battles.assertSubmission(host, code, 1101, f.at()), /문제 번호/);
  await assert.rejects(f.battles.assertSubmission(host, code, 1100, base), /제출 시간이 지난/);
  assert.equal((await f.battles.assertSubmission(host, code, 1100, f.at())).battle.status, 'active');
  f.advance(600_000);
  await assert.rejects(f.battles.assertSubmission(host, code, 1100, f.at()), /제출 시간이 지난/);
});

test('verified accepted submission uses server receipt time, winner and tie', async () => {
  const f = makeFixture();
  const code = (await f.battles.handle(host, { action: 'battle-create', problemNumber: 1100, durationMinutes: 10 })).battle.code;
  f.advance(10);
  await f.battles.handle(guest, { action: 'battle-join', code });
  f.advance(300);
  const firstReceipt = f.at();
  f.advance(100);
  const secondReceipt = f.at();
  await f.battles.recordAccepted(guest, code, 1100, secondReceipt);
  assert.equal((await f.battles.recordAccepted(host, code, 1100, firstReceipt)).battle.status, 'finished');
  assert.equal((await f.battles.handle(host, { action: 'battle-get', code })).battle.result, 'win');
  assert.equal((await f.battles.handle(guest, { action: 'battle-get', code })).battle.result, 'loss');
  await assert.rejects(f.battles.assertSubmission(host, code, 1100, f.at()), /제출 시간이 지난/);
  await f.battles.recordAccepted(guest, code, 1100, firstReceipt);
  assert.equal((await f.battles.handle(guest, { action: 'battle-get', code })).battle.result, 'draw');
  await assert.rejects(f.battles.recordAccepted(guest, code, 1100, firstReceipt), /이미 종료된/);
  const list = (await f.battles.handle(host, { action: 'battle-list' })).battles;
  assert.equal(list.length, 1);
  assert.equal(list[0].result, 'draw');
});

test('in-flight grading can finish during grace, then finalizes once the deadline passes', async () => {
  const f = makeFixture();
  const code = (await f.battles.handle(host, { action: 'battle-create', problemNumber: 1100, durationMinutes: 10 })).battle.code;
  f.advance(10);
  await f.battles.handle(guest, { action: 'battle-join', code });
  f.advance(599_990);
  const receipt = f.at() - 1;
  await f.battles.assertSubmission(host, code, 1100, receipt);
  f.advance(15_000);
  assert.equal((await f.battles.recordAccepted(host, code, 1100, receipt)).battle.status, 'settling');
  f.advance(45_010);
  const settled = (await f.battles.handle(host, { action: 'battle-get', code })).battle;
  assert.equal(settled.status, 'finished');
  assert.equal(settled.result, 'win');
  await assert.rejects(f.battles.recordAccepted(guest, code, 1100, receipt), /제출 시간이 지난/);
  const second = makeFixture();
  const code2 = (await second.battles.handle(host, { action: 'battle-create', problemNumber: 1100, durationMinutes: 10 })).battle.code;
  await second.battles.handle(guest, { action: 'battle-join', code: code2 });
  second.advance(660_000);
  assert.equal((await second.battles.handle(host, { action: 'battle-get', code: code2 })).battle.status, 'expired');
  assert.equal((await second.battles.handle(host, { action: 'battle-get', code: code2 })).battle.result, 'unsolved');
});

test('history is bounded and malformed member, action and invite are rejected', async () => {
  const f = makeFixture();
  await assert.rejects(f.battles.handle('guest', { action: 'battle-list' }), /로그인한 동아리원/);
  await assert.rejects(f.battles.handle(host, null), /배틀 요청/);
  await assert.rejects(f.battles.handle(host, { action: 'battle-join', code: '../unsafe' }), /초대 코드/);
  for (let index = 0; index < 35; index++) {
    const room = (await f.battles.handle(host, { action: 'battle-create', problemNumber: 1100, durationMinutes: 10 })).battle;
    assert.equal((await f.battles.handle(host, { action: 'battle-cancel', code: room.code })).battle.status, 'cancelled');
    f.advance(1);
  }
  const history = (await f.battles.handle(host, { action: 'battle-list' })).battles;
  assert.equal(history.length, 30);
  assert.ok(history[0].createdAt > history.at(-1).createdAt);
});

test('battle room and winner survive a fresh durable store instance without exposing member keys', async t => {
  const root = await mkdtemp(join(tmpdir(), 'coms-club-battle-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let time = base;
  const make = () => createClubBattles({
    store: createClubStore({ directory: join(root, 'club'), filename: 'battles.json', initial: () => ({ version: 1, rooms: [] }) }),
    numberedProblems: bank, now: () => time,
  });
  let battles = make();
  const code = (await battles.handle(host, { action: 'battle-create', problemNumber: 1100, durationMinutes: 10 })).battle.code;
  time += 1_000;
  await battles.handle(guest, { action: 'battle-join', code });
  time += 2_000;
  await battles.recordAccepted(host, code, 1100, time);
  battles = make();
  const loaded = (await battles.handle(host, { action: 'battle-get', code })).battle;
  assert.equal(loaded.yourAcceptedAt, time);
  assert.equal(loaded.opponentAcceptedAt, null);
  assert.ok(!JSON.stringify(loaded).includes(host));
  await battles.recordAccepted(guest, code, 1100, time);
  assert.equal((await make().handle(host, { action: 'battle-get', code })).battle.result, 'draw');
});

test('room retention removes old closed history and capacity rejects additional live rooms', async () => {
  const room = (index, status) => ({
    code: index.toString(16).toUpperCase().padStart(12, '0'), problemNumber: 1100,
    durationMinutes: 10, status, createdAt: base + index,
    startedAt: status === 'active' ? base : null,
    endsAt: status === 'active' ? base + 600_000 : null,
    host: `old-${index}`, guest: status === 'active' ? `other-${index}` : null,
    hostAcceptedAt: null, guestAcceptedAt: null,
  });
  const closed = makeFixture({ version: 1, rooms: Array.from({ length: 1001 }, (_, index) => room(index, 'cancelled')) });
  await closed.battles.handle(host, { action: 'battle-list' });
  assert.equal(closed.state().rooms.length, 1000);
  assert.equal(closed.state().rooms[0].createdAt, base + 1);
  const replacement = await closed.battles.handle(host, { action: 'battle-create', problemNumber: 1100, durationMinutes: 10 });
  assert.equal(replacement.battle.status, 'waiting');
  assert.equal(closed.state().rooms.length, 1000);
  assert.equal(closed.state().rooms[0].createdAt, base + 2);
  const full = makeFixture({ version: 1, rooms: Array.from({ length: 1000 }, (_, index) => room(index, 'active')) });
  await assert.rejects(full.battles.handle(host, { action: 'battle-create', problemNumber: 1100, durationMinutes: 10 }), /더 만들 수 없어요/);
});
