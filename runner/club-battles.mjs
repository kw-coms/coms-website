import { randomBytes } from 'node:crypto';
import { ClubError, clubMemberId } from './club-store.mjs';

const WAIT_MS = 2 * 60 * 60 * 1000;
const GRACE_MS = 60 * 1000;
const MAX_ROOMS = 1000;
const MAX_HISTORY = 30;
const DURATIONS = new Set([10, 15, 20]);
const ROOM_CODE = /^[A-F0-9]{12}$/;
const OPEN = new Set(['waiting', 'active', 'settling']);

const fail = (status, message) => { throw new ClubError(status, message); };
const timestamp = value => Number.isSafeInteger(value) && value >= 0;
const memberOf = (room, member) => room.host === member || room.guest === member;
const sideOf = (room, member) => room.host === member ? 'host' : 'guest';
const acceptedOf = (room, side) => room[`${side}AcceptedAt`];

function settle(room, time) {
  if (room.status === 'waiting' && time >= room.createdAt + WAIT_MS) room.status = 'expired';
  if (room.status !== 'active' && room.status !== 'settling') return;
  if (room.hostAcceptedAt !== null && room.guestAcceptedAt !== null) {
    room.status = 'finished';
  } else if (time >= room.endsAt + GRACE_MS) {
    room.status = room.hostAcceptedAt === null && room.guestAcceptedAt === null ? 'expired' : 'finished';
  } else if (time >= room.endsAt) {
    room.status = 'settling';
  }
}

function settleAll(state, time, limit = MAX_ROOMS) {
  for (const room of state.rooms) settle(room, time);
  if (state.rooms.length <= limit) return;
  const finished = state.rooms.filter(room => !OPEN.has(room.status))
    .sort((a, b) => a.createdAt - b.createdAt);
  const remove = new Set(finished.slice(0, state.rooms.length - limit).map(room => room.code));
  state.rooms = state.rooms.filter(room => !remove.has(room.code));
}

function resultFor(room, side) {
  if (room.status !== 'finished' && room.status !== 'expired') return null;
  if (room.hostAcceptedAt === null && room.guestAcceptedAt === null) return 'unsolved';
  const mine = acceptedOf(room, side);
  const theirs = acceptedOf(room, side === 'host' ? 'guest' : 'host');
  if (mine === null) return 'loss';
  if (theirs === null) return 'win';
  return mine === theirs ? 'draw' : mine < theirs ? 'win' : 'loss';
}

function view(room, member) {
  const side = sideOf(room, member);
  return {
    code: room.code,
    problemNumber: room.problemNumber,
    durationMinutes: room.durationMinutes,
    status: room.status,
    createdAt: room.createdAt,
    startedAt: room.startedAt,
    endsAt: room.endsAt,
    yourAcceptedAt: acceptedOf(room, side),
    opponentAcceptedAt: acceptedOf(room, side === 'host' ? 'guest' : 'host'),
    isHost: side === 'host',
    opponentJoined: room.guest !== null,
    result: resultFor(room, side),
  };
}

function roomFor(state, code) {
  if (typeof code !== 'string' || !ROOM_CODE.test(code)) fail(400, '올바른 배틀 초대 코드를 입력해 주세요.');
  const room = state.rooms.find(entry => entry.code === code);
  if (!room) fail(404, '배틀을 찾을 수 없어요.');
  return room;
}

function selectedRoom(state, member, code, problemNumber, receivedAt, time, recording = false) {
  if (!timestamp(receivedAt) || receivedAt > time) fail(400, '제출 시간을 확인할 수 없어요.');
  const room = roomFor(state, code);
  if (!memberOf(room, member)) fail(403, '참가한 배틀만 제출할 수 있어요.');
  if (room.problemNumber !== problemNumber) fail(400, '배틀 문제 번호가 일치하지 않아요.');
  if (room.startedAt === null || room.endsAt === null ||
      receivedAt < room.startedAt || receivedAt >= room.endsAt ||
      !['active', 'settling', ...(recording ? ['finished'] : [])].includes(room.status) ||
      time >= room.endsAt + GRACE_MS) {
    fail(409, '제출 시간이 지난 배틀이에요.');
  }
  if (room.status === 'finished' && recording) {
    const previous = acceptedOf(room, sideOf(room, member));
    if (previous === null || receivedAt >= previous) fail(409, '이미 종료된 배틀이에요.');
  }
  return room;
}

export function createClubBattles({ store, numberedProblems, now = Date.now }) {
  if (!store?.read || !store?.update || !numberedProblems || typeof now !== 'function') {
    throw new TypeError('Battle store, numbered problems, and clock are required');
  }
  const currentTime = () => {
    const time = now();
    if (!timestamp(time)) throw new RangeError('Invalid battle clock');
    return time;
  };

  return {
    async handle(key, body) {
      const member = clubMemberId(key);
      const time = currentTime();
      if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, '배틀 요청을 확인해 주세요.');
      return store.update(state => {
        settleAll(state, time, body.action === 'battle-create' ? MAX_ROOMS - 1 : MAX_ROOMS);
        if (body.action === 'battle-list') {
          const rooms = state.rooms.filter(room => memberOf(room, member))
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, MAX_HISTORY);
          return { battles: rooms.map(room => view(room, member)) };
        }
        if (body.action === 'battle-create') {
          const { problemNumber, durationMinutes } = body;
          if (!Number.isSafeInteger(problemNumber) || !Object.hasOwn(numberedProblems, problemNumber) ||
              !DURATIONS.has(durationMinutes)) fail(400, '문제 번호와 제한 시간을 확인해 주세요.');
          if (state.rooms.some(room => OPEN.has(room.status) && memberOf(room, member))) {
            fail(409, '진행 중인 배틀을 먼저 끝내 주세요.');
          }
          if (state.rooms.length >= MAX_ROOMS) fail(503, '배틀을 더 만들 수 없어요. 잠시 후 다시 시도해 주세요.');
          let code;
          do { code = randomBytes(6).toString('hex').toUpperCase(); }
          while (state.rooms.some(room => room.code === code));
          const room = {
            code, problemNumber, durationMinutes, status: 'waiting', createdAt: time,
            startedAt: null, endsAt: null, host: member, guest: null,
            hostAcceptedAt: null, guestAcceptedAt: null,
          };
          state.rooms.push(room);
          return { battle: view(room, member) };
        }
        const room = roomFor(state, body.code);
        if (body.action === 'battle-join') {
          if (room.status !== 'waiting') fail(409, '입장할 수 없는 배틀이에요.');
          if (memberOf(room, member)) fail(409, '이미 참가한 배틀이에요.');
          if (state.rooms.some(entry => OPEN.has(entry.status) && memberOf(entry, member))) {
            fail(409, '진행 중인 배틀을 먼저 끝내 주세요.');
          }
          room.guest = member;
          room.startedAt = time;
          room.endsAt = time + room.durationMinutes * 60 * 1000;
          room.status = 'active';
          return { battle: view(room, member) };
        }
        if (!memberOf(room, member)) fail(403, '참가한 배틀만 볼 수 있어요.');
        if (body.action === 'battle-get') return { battle: view(room, member) };
        if (body.action === 'battle-cancel') {
          if (room.status !== 'waiting' || room.host !== member) fail(409, '대기 중인 배틀의 방장만 취소할 수 있어요.');
          room.status = 'cancelled';
          return { battle: view(room, member) };
        }
        fail(400, '지원하지 않는 배틀 요청이에요.');
      });
    },
    async assertSubmission(key, code, problemNumber, receivedAt) {
      const member = clubMemberId(key);
      const time = currentTime();
      return store.update(state => {
        settleAll(state, time);
        const room = selectedRoom(state, member, code, problemNumber, receivedAt, time);
        return { battle: view(room, member) };
      });
    },
    async recordAccepted(key, code, problemNumber, receivedAt) {
      const member = clubMemberId(key);
      const time = currentTime();
      return store.update(state => {
        settleAll(state, time);
        const room = selectedRoom(state, member, code, problemNumber, receivedAt, time, true);
        const side = sideOf(room, member);
        const field = `${side}AcceptedAt`;
        if (room[field] === null || receivedAt < room[field]) room[field] = receivedAt;
        settle(room, time);
        return { battle: view(room, member) };
      });
    },
  };
}
