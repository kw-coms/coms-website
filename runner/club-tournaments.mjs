import { randomBytes, randomInt } from 'node:crypto';
import { ClubError, clubMemberId } from './club-store.mjs';

const GRACE_MS = 60_000;
const MAX_EVENTS = 50;
const ID = /^[a-f0-9]{24}$/;
const CAPACITIES = new Set([4, 8, 16, 32]);
const fail = (status, message) => { throw new ClubError(status, message); };
const validTime = value => Number.isSafeInteger(value) && value >= 0;
const randomId = () => randomBytes(12).toString('hex');
const shuffleParticipants = participants => {
  const seeded = [...participants];
  for (let index = seeded.length - 1; index > 0; index--) {
    const swap = randomInt(index + 1);
    [seeded[index], seeded[swap]] = [seeded[swap], seeded[index]];
  }
  return seeded;
};
const cleanName = name => typeof name === 'string' && name.trim() && name.trim().length <= 30
  ? name.trim() : null;

function eventFor(state, id, canManage) {
  if (typeof id !== 'string' || !ID.test(id)) fail(400, '대회 주소를 확인해 주세요.');
  const event = state.events.find(item => item.id === id);
  if (!event || (!event.published && !canManage)) fail(404, '대회를 찾을 수 없어요.');
  return event;
}

function matchFor(event, matchId) {
  if (typeof matchId !== 'string' || !ID.test(matchId)) fail(400, '대진 주소를 확인해 주세요.');
  const round = event.rounds.find(item => item.matches.some(match => match.id === matchId));
  const match = round?.matches.find(item => item.id === matchId);
  if (!match) fail(404, '대진을 찾을 수 없어요.');
  return { round, match };
}

function makeMatch(players) {
  return { id: randomId(), players, winner: null, result: null, records: {} };
}

function start(event, shuffle) {
  const players = shuffle(event.participants.map(item => item.member));
  const matchCount = 1 << (Math.ceil(Math.log2(players.length)) - 1);
  const byes = matchCount * 2 - players.length;
  const byeOrder = [
    ...Array.from({ length: matchCount }, (_, index) => index).filter(index => index % 2 === 0),
    ...Array.from({ length: matchCount }, (_, index) => index).filter(index => index % 2 !== 0),
  ];
  const byeSlots = new Set(byeOrder.slice(0, byes));
  const matches = [];
  let cursor = 0;
  for (let index = 0; index < matchCount; index++) {
    const first = players[cursor++];
    matches.push(makeMatch([first, byeSlots.has(index) ? null : players[cursor++]]));
  }
  const problemOffset = event.problemNumbers.length - Math.ceil(Math.log2(players.length));
  event.rounds = [{ number: 1, startsAt: event.startsAt,
    endsAt: event.startsAt + event.durationMinutes * 60_000,
    problemNumber: event.problemNumbers[problemOffset], matches }];
  event.status = 'running';
}

function chooseWinner(match) {
  const [first, second] = match.players;
  if (!first || !second) return first ?? second ?? null;
  const left = match.records[first], right = match.records[second];
  if (!left && !right) return null;
  if (!left) return right.passed ? second : null;
  if (!right) return left.passed ? first : null;
  if (left.solved !== right.solved) return left.solved ? first : second;
  if (left.solved && right.solved) return left.receivedAt <= right.receivedAt ? first : second;
  if (left.passed !== right.passed) return left.passed > right.passed ? first : second;
  if (left.passed === 0) return null;
  return left.receivedAt <= right.receivedAt ? first : second;
}

function settle(event, time, shuffle) {
  if (event.status === 'registration' && time >= event.startsAt) {
    if (event.participants.length < 2) event.status = 'cancelled';
    else start(event, shuffle);
  }
  while (event.status === 'running') {
    const round = event.rounds.at(-1);
    if (time < round.endsAt + GRACE_MS) break;
    for (const match of round.matches) {
      if (match.result) continue;
      match.winner = chooseWinner(match);
      if (match.players.some(player => player === null) && match.winner) match.result = 'bye';
      else if (!match.winner) match.result = 'no-score';
      else match.result = match.records[match.winner]?.solved ? 'solved' : 'score';
    }
    const winners = round.matches.map(match => match.winner);
    if (round.matches.length === 1) {
      event.status = 'finished';
      event.champion = winners[0];
      break;
    }
    const startsAt = round.endsAt + GRACE_MS + event.breakMinutes * 60_000;
    const matches = [];
    for (let index = 0; index < winners.length; index += 2) {
      matches.push(makeMatch([winners[index], winners[index + 1] ?? null]));
    }
    event.rounds.push({ number: round.number + 1, startsAt,
      endsAt: startsAt + event.durationMinutes * 60_000,
      problemNumber: event.problemNumbers[event.problemNumbers.length - Math.log2(matches.length) - 1],
      matches });
  }
}

function displayName(event, member) {
  return event.participants.find(item => item.member === member)?.name ?? null;
}

function view(event, member, canManage, time) {
  const summary = { id: event.id, title: event.title, startsAt: event.startsAt,
    capacity: event.capacity, durationMinutes: event.durationMinutes, breakMinutes: event.breakMinutes,
    status: event.status, participantCount: event.participants.length,
    registered: event.participants.some(item => item.member === member),
    champion: event.champion ? displayName(event, event.champion) : null };
  return { ...summary, rules: event.rules,
    participants: event.participants.map(item => item.name),
    problemNumbers: canManage ? [...event.problemNumbers] : null,
    rounds: event.rounds.map(round => ({
      number: round.number, startsAt: round.startsAt, endsAt: round.endsAt,
      problemNumber: canManage || time >= round.startsAt ? round.problemNumber : null,
      matches: round.matches.map((match, index) => ({
        id: match.id, number: index + 1,
        status: match.result ? 'finished' : time < round.startsAt ? 'waiting'
          : time < round.endsAt ? 'active' : 'settling',
        players: match.players.map(value => value ? displayName(event, value) : null),
        winner: match.winner ? displayName(event, match.winner) : null,
        winnerSlot: match.winner ? match.players.indexOf(match.winner) : null,
        result: match.result,
        isMine: match.players.includes(member),
        canSubmit: event.status === 'running' && match.players.includes(member) &&
          match.players.every(Boolean) && !match.result && time >= round.startsAt && time < round.endsAt,
      })),
    })) };
}

function summary(event, member) {
  return { id: event.id, title: event.title, startsAt: event.startsAt,
    capacity: event.capacity, durationMinutes: event.durationMinutes, breakMinutes: event.breakMinutes,
    status: event.status, participantCount: event.participants.length,
    registered: event.participants.some(item => item.member === member),
    champion: event.champion ? displayName(event, event.champion) : null };
}

export function createClubTournaments({ store, numberedProblems, now = Date.now, shuffle = shuffleParticipants }) {
  if (!store?.update || !numberedProblems || typeof now !== 'function' || typeof shuffle !== 'function') {
    throw new TypeError('Tournament store, numbered problems, and clock are required');
  }
  const currentTime = () => {
    const time = now();
    if (!validTime(time)) throw new RangeError('Invalid tournament clock');
    return time;
  };
  const selectMatch = (state, member, eventId, matchId, number, receivedAt, time) => {
    if (!validTime(receivedAt) || receivedAt > time) fail(400, '제출 시간을 확인할 수 없어요.');
    const event = eventFor(state, eventId, false);
    const { round, match } = matchFor(event, matchId);
    if (!event.participants.some(item => item.member === member) || !match.players.includes(member) || !match.players.every(Boolean)) {
      fail(403, '참가한 대진만 제출할 수 있어요.');
    }
    if (round.problemNumber !== number) fail(400, '대진 문제 번호가 일치하지 않아요.');
    return { event, round, match };
  };
  return {
    async handle(key, body, { canManage = false, displayName: name = null } = {}) {
      const member = clubMemberId(key);
      if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.action !== 'string') {
        fail(400, '대회 요청을 확인해 주세요.');
      }
      const time = currentTime();
      return store.update(state => {
        for (const event of state.events) settle(event, time, shuffle);
        if (body.action === 'tournament-list') {
          return { events: state.events.filter(event => canManage || event.published)
            .sort((a, b) => b.startsAt - a.startsAt).slice(0, MAX_EVENTS)
            .map(event => summary(event, member)) };
        }
        if (body.action === 'tournament-save') {
          if (!canManage) fail(403, '회장만 대회를 관리할 수 있어요.');
          const title = typeof body.title === 'string' ? body.title.trim() : '';
          const rules = typeof body.rules === 'string' ? body.rules.trim() : '';
          const rounds = Math.log2(body.capacity);
          if (!title || title.length > 80 || !rules || rules.length > 2000 ||
              !validTime(body.startsAt) || body.startsAt <= time || !CAPACITIES.has(body.capacity) ||
              !Number.isInteger(body.durationMinutes) || body.durationMinutes < 5 || body.durationMinutes > 60 ||
              !Number.isInteger(body.breakMinutes) || body.breakMinutes < 0 || body.breakMinutes > 30 ||
              !Array.isArray(body.problemNumbers) || body.problemNumbers.length !== rounds ||
              new Set(body.problemNumbers).size !== rounds ||
              body.problemNumbers.some(number => !Number.isSafeInteger(number) || !Object.hasOwn(numberedProblems, number))) {
            fail(400, '대회 제목·규칙·시작 시각·라운드 문제를 확인해 주세요.');
          }
          let event;
          if (body.id === undefined) {
            if (state.events.length >= MAX_EVENTS) {
              const oldest = state.events.filter(item => item.status === 'finished' || item.status === 'cancelled')
                .sort((left, right) => left.startsAt - right.startsAt)[0];
              if (oldest) state.events.splice(state.events.indexOf(oldest), 1);
            }
            if (state.events.length >= MAX_EVENTS) fail(503, '대회 등록 공간이 가득 찼어요.');
            let id;
            do { id = randomId(); } while (state.events.some(item => item.id === id));
            event = { id, status: 'draft', published: false, participants: [], rounds: [], champion: null };
            state.events.push(event);
          } else {
            event = eventFor(state, body.id, true);
            if (event.status !== 'draft') fail(409, '공개 전 대회만 수정할 수 있어요.');
          }
          Object.assign(event, { title, rules, startsAt: body.startsAt, capacity: body.capacity,
            durationMinutes: body.durationMinutes, breakMinutes: body.breakMinutes,
            problemNumbers: [...body.problemNumbers] });
          return { event: view(event, member, canManage, time) };
        }
        const event = eventFor(state, body.id, canManage);
        if (body.action === 'tournament-get') return { event: view(event, member, canManage, time) };
        if (body.action === 'tournament-publish') {
          if (!canManage) fail(403, '회장만 대회를 관리할 수 있어요.');
          if (event.status !== 'draft' || event.startsAt <= time) fail(409, '공개할 수 없는 대회예요.');
          event.status = 'registration';
          event.published = true;
        } else if (body.action === 'tournament-cancel') {
          if (!canManage) fail(403, '회장만 대회를 관리할 수 있어요.');
          if (event.status === 'finished' || event.status === 'cancelled') fail(409, '이미 종료된 대회예요.');
          event.status = 'cancelled';
        } else if (body.action === 'tournament-join') {
          if (event.status !== 'registration' || time >= event.startsAt) fail(409, '참가 신청이 끝난 대회예요.');
          if (event.participants.some(item => item.member === member)) fail(409, '이미 참가 신청했어요.');
          if (event.participants.length >= event.capacity) fail(409, '참가 인원이 가득 찼어요.');
          const label = cleanName(name) ?? `참가자 ${event.participants.length + 1}`;
          event.participants.push({ member, name: label });
        } else if (body.action === 'tournament-leave') {
          if (event.status !== 'registration' || time >= event.startsAt) fail(409, '참가 취소 기간이 지났어요.');
          const index = event.participants.findIndex(item => item.member === member);
          if (index < 0) fail(409, '참가 신청 내역이 없어요.');
          event.participants.splice(index, 1);
        } else fail(400, '지원하지 않는 대회 요청이에요.');
        return { event: view(event, member, canManage, time) };
      });
    },
    async assertSubmission(key, eventId, matchId, problemNumber, receivedAt) {
      const member = clubMemberId(key);
      const time = currentTime();
      return store.update(state => {
        for (const event of state.events) settle(event, time, shuffle);
        const { event, round, match } = selectMatch(state, member, eventId, matchId, problemNumber, receivedAt, time);
        if (event.status !== 'running' || match.result || receivedAt < round.startsAt ||
            receivedAt >= round.endsAt || time >= round.endsAt + GRACE_MS) {
          fail(409, '대진 제출 시간이 지났어요.');
        }
        return { event: view(event, member, false, time) };
      });
    },
    async recordResult(key, eventId, matchId, problemNumber, receivedAt, { passed, solved }) {
      const member = clubMemberId(key);
      const time = currentTime();
      if (!Number.isSafeInteger(passed) || passed < 0 || typeof solved !== 'boolean') {
        fail(400, '채점 결과를 확인할 수 없어요.');
      }
      return store.update(state => {
        const { event, round, match } = selectMatch(state, member, eventId, matchId, problemNumber, receivedAt, time);
        if (event.status !== 'running' || match.result || receivedAt < round.startsAt ||
            receivedAt >= round.endsAt || time >= round.endsAt + GRACE_MS) {
          settle(event, time, shuffle);
          return { recorded: false };
        }
        const previous = match.records[member];
        if (!previous || (solved && !previous.solved) ||
            (solved === previous.solved && (passed > previous.passed ||
              (passed === previous.passed && receivedAt < previous.receivedAt)))) {
          match.records[member] = { passed, solved, receivedAt };
        }
        return { recorded: true };
      });
    },
  };
}
