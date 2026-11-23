import { randomUUID } from 'node:crypto';
import { ClubError, clubMemberId } from './club-store.mjs';

const MAX_SETS = 20;
const MAX_PROBLEMS = 40;
const SET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createClubSocial({ store, numberedProblems, judgeProgress, now = Date.now }) {
  const problemExists = number => Number.isSafeInteger(number) && number > 0 &&
    Object.hasOwn(numberedProblems, number);
  const requireProblem = number => {
    if (!problemExists(number)) throw new ClubError(400, '문제 번호를 확인해 주세요.');
  };
  const requireSetId = id => {
    if (typeof id !== 'string' || !SET_ID.test(id)) throw new ClubError(400, '문제집 주소를 확인해 주세요.');
  };
  const setView = (entry, member) => ({
    id: entry.id,
    title: entry.title,
    problemNumbers: [...entry.problemNumbers],
    shared: entry.shared,
    updatedAt: entry.updatedAt,
    owned: entry.owner === member,
  });
  const voteView = async (state, member, key, number) => {
    const values = state.votes.filter(entry => entry.problemNumber === number).map(entry => entry.tier).sort((a, b) => a - b);
    const ownVote = state.votes.find(entry => entry.problemNumber === number && entry.member === member)?.tier ?? null;
    const verified = await judgeProgress.get(key);
    return {
      count: values.length,
      // Round between the two middle votes when the count is even.
      median: values.length ? Math.round((values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2) : null,
      ownVote,
      canVote: verified.solved.includes(number),
    };
  };
  const requireOwned = (state, id, member) => {
    const found = state.sets.find(entry => entry.id === id);
    if (!found) throw new ClubError(404, '문제집을 찾을 수 없어요.');
    if (found.owner !== member) throw new ClubError(403, '내 문제집만 바꿀 수 있어요.');
    return found;
  };

  return {
    async handle(key, body) {
      const member = clubMemberId(key);
      const action = body?.action;
      if (action === 'sets-list') {
        const state = await store.read();
        return { sets: state.sets.filter(entry => entry.owner === member)
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .map(entry => setView(entry, member)) };
      }
      if (action === 'sets-open') {
        requireSetId(body.id);
        const state = await store.read();
        const entry = state.sets.find(item => item.id === body.id);
        if (!entry || (entry.owner !== member && !entry.shared)) throw new ClubError(404, '문제집을 찾을 수 없어요.');
        return { set: setView(entry, member) };
      }
      if (action === 'sets-save') {
        if (body.id !== undefined) requireSetId(body.id);
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        if (!title || title.length > 60 || !Array.isArray(body.problemNumbers) ||
            body.problemNumbers.length < 1 || body.problemNumbers.length > MAX_PROBLEMS || body.problemNumbers.some(number => !problemExists(number)) ||
            typeof body.shared !== 'boolean') throw new ClubError(400, '문제집 제목과 문제 번호를 확인해 주세요.');
        const problemNumbers = [...new Set(body.problemNumbers)];
        return store.update(state => {
          let entry;
          if (body.id === undefined) {
            if (state.sets.filter(item => item.owner === member).length >= MAX_SETS) {
              throw new ClubError(400, '문제집은 20개까지 만들 수 있어요.');
            }
            entry = { id: randomUUID(), owner: member, title, problemNumbers, shared: body.shared, updatedAt: now() };
            state.sets.push(entry);
          } else {
            entry = requireOwned(state, body.id, member);
            Object.assign(entry, { title, problemNumbers, shared: body.shared, updatedAt: now() });
          }
          return { set: setView(entry, member) };
        });
      }
      if (action === 'sets-delete') {
        requireSetId(body.id);
        return store.update(state => {
          const entry = requireOwned(state, body.id, member);
          state.sets.splice(state.sets.indexOf(entry), 1);
          return { deleted: true };
        });
      }
      if (action === 'vote-get' || action === 'vote-put') {
        requireProblem(body.problemNumber);
        if (action === 'vote-get') return voteView(await store.read(), member, key, body.problemNumber);
        if (!Number.isInteger(body.tier) || body.tier < 1 || body.tier > 31) {
          throw new ClubError(400, '난이도를 다시 선택해 주세요.');
        }
        const progress = await judgeProgress.get(key);
        if (!progress.solved.includes(body.problemNumber)) throw new ClubError(403, '이 문제를 해결한 회원만 투표할 수 있어요.');
        const state = await store.update(data => {
          const entry = data.votes.find(vote => vote.problemNumber === body.problemNumber && vote.member === member);
          if (entry) entry.tier = body.tier;
          else data.votes.push({ problemNumber: body.problemNumber, member, tier: body.tier });
          return data;
        });
        return voteView(state, member, key, body.problemNumber);
      }
      throw new ClubError(400, '지원하지 않는 문제집 요청이에요.');
    },
  };
}
