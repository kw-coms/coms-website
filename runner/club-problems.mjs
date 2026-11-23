import { randomBytes } from 'node:crypto';
import { ClubError, clubMemberId } from './club-store.mjs';

const LANGUAGES = ['c', 'cpp', 'java', 'python', 'javascript'];
const ID = /^[0-9a-f]{24}$/;
const MAX_CODE_BYTES = 64 * 1024;
const MAX_INPUT_BYTES = 16 * 1024;
const MAX_OUTPUT_BYTES = 8 * 1024;
const MAX_ALL_INPUT_BYTES = 32 * 1024;
const MAX_PROPOSALS = 500;
const fail = (status, message) => { throw new ClubError(status, message); };
const bytes = value => Buffer.byteLength(value, 'utf8');
const cleanText = (value, max) => typeof value === 'string' && value.trim().length <= max ? value.trim() : null;

function validateDraft(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, '문제 내용을 확인해 주세요.');
  const title = cleanText(value.title, 100);
  const statement = cleanText(value.statement, 12_000);
  const inputSpec = cleanText(value.inputSpec, 2_000);
  const outputSpec = cleanText(value.outputSpec, 2_000);
  if (!title || !statement || inputSpec === null || outputSpec === null ||
      !Number.isInteger(value.difficultyTier) || value.difficultyTier < 0 || value.difficultyTier > 31 ||
      !Array.isArray(value.topics) || value.topics.length > 8 ||
      value.topics.some(topic => !cleanText(topic, 30)) ||
      !Array.isArray(value.examples) || value.examples.length < 1 || value.examples.length > 3 ||
      !Array.isArray(value.tests) || value.tests.length < 5 || value.tests.length > 7 ||
      value.examples.length + value.tests.length > 10 ||
      !value.reference || typeof value.reference !== 'object' || Array.isArray(value.reference) ||
      !LANGUAGES.includes(value.reference.lang) || typeof value.reference.code !== 'string' ||
      !value.reference.code.trim() || bytes(value.reference.code) > MAX_CODE_BYTES ||
      !['tokens', 'lines'].includes(value.compare)) {
    fail(400, '제목·설명·난이도·예제 1~3개·비공개 테스트 5~7개와 기준 답안을 확인해 주세요.');
  }
  const cases = [...value.examples, ...value.tests];
  if (cases.some(item => !item || typeof item !== 'object' || Array.isArray(item) ||
      typeof item.stdin !== 'string' || typeof item.expected !== 'string' ||
      bytes(item.stdin) > MAX_INPUT_BYTES || bytes(item.expected) > MAX_OUTPUT_BYTES) ||
      cases.reduce((sum, item) => sum + bytes(item.stdin), 0) > MAX_ALL_INPUT_BYTES ||
      new Set(cases.map(item => item.stdin)).size !== cases.length) {
    fail(400, '입출력 크기와 중복 입력을 확인해 주세요.');
  }
  return {
    title, statement, inputSpec, outputSpec, difficultyTier: value.difficultyTier,
    topics: value.topics.map(topic => topic.trim()),
    examples: value.examples.map(({ stdin, expected }) => ({ stdin, expected })),
    tests: value.tests.map(({ stdin, expected }) => ({ stdin, expected })),
    reference: { lang: value.reference.lang, code: value.reference.code }, compare: value.compare,
  };
}

function requireId(id) {
  if (typeof id !== 'string' || !ID.test(id)) fail(400, '문제 제안 주소를 확인해 주세요.');
}

function find(state, id, member, canManage) {
  requireId(id);
  const proposal = state.proposals.find(item => item.id === id);
  if (!proposal || (proposal.owner !== member && (!canManage || proposal.status === 'draft'))) {
    fail(404, '문제 제안을 찾을 수 없어요.');
  }
  return proposal;
}

function requireRevision(proposal, revision) {
  if (!Number.isSafeInteger(revision) || revision !== proposal.revision) {
    fail(409, '다른 화면에서 수정된 문제예요. 새로고침한 뒤 다시 시도해 주세요.');
  }
}

function summary(proposal, member) {
  return {
    id: proposal.id, title: proposal.draft.title, status: proposal.status,
    revision: proposal.revision, updatedAt: proposal.updatedAt, number: proposal.number,
    verified: proposal.status === 'published' ||
      (proposal.verification?.revision === proposal.revision && proposal.verification.solved === true),
    owned: proposal.owner === member,
  };
}

function detail(proposal, member) {
  return {
    ...summary(proposal, member), draft: structuredClone(proposal.draft), note: proposal.note,
    verification: proposal.verification
      ? { passed: proposal.verification.passed, total: proposal.verification.total, solved: proposal.verification.solved }
      : null,
  };
}

function publicExercise(proposal) {
  const { draft, number } = proposal;
  return {
    id: `club-problem-${number}`, title: draft.title,
    level: Math.min(5, Math.max(1, Math.ceil(draft.difficultyTier / 6))),
    difficultyTier: draft.difficultyTier, topics: [...draft.topics], langs: [...LANGUAGES],
    chapter: {}, statement: draft.statement, inputSpec: draft.inputSpec, outputSpec: draft.outputSpec,
    examples: draft.examples.map(({ stdin, expected }) => ({ stdin, expected })),
    tests: [], mode: 'stdio', starter: {}, solution: {}, explain: '', hints: [], compare: draft.compare,
  };
}

function judgeProblem(proposal) {
  return {
    langs: [...LANGUAGES],
    cases: [...proposal.draft.examples, ...proposal.draft.tests].map(({ stdin, expected }) => ({ stdin, expected })),
    compare: proposal.draft.compare,
  };
}

export function createClubProblems({ store, numberedProblems, now = Date.now }) {
  if (!store?.read || !store?.update || !numberedProblems || typeof now !== 'function') {
    throw new TypeError('Problem store, numbered bank, and clock are required');
  }
  const currentTime = () => {
    const time = now();
    if (!Number.isSafeInteger(time) || time < 0) throw new RangeError('Invalid problem clock');
    return time;
  };
  const register = proposal => {
    const previous = numberedProblems[proposal.number];
    if (previous && JSON.stringify(previous) !== JSON.stringify(judgeProblem(proposal))) {
      throw new Error(`Numbered problem collision: ${proposal.number}`);
    }
    numberedProblems[proposal.number] = judgeProblem(proposal);
  };

  return {
    async hydrate() {
      const state = await store.read();
      for (const proposal of state.proposals) if (proposal.status === 'published') register(proposal);
    },
    async handle(key, body, { canManage = false } = {}) {
      const member = clubMemberId(key);
      if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.action !== 'string') {
        fail(400, '문제 요청을 확인해 주세요.');
      }
      if (body.action === 'problem-catalog') {
        const state = await store.read();
        return { problems: state.proposals.filter(item => item.status === 'published')
          .map(item => ({ number: item.number, problem: publicExercise(item) }))
          .sort((a, b) => a.number - b.number) };
      }
      if (body.action === 'problem-list') {
        const state = await store.read();
        return { proposals: state.proposals.filter(item => item.owner === member || (canManage && item.status !== 'draft'))
          .sort((a, b) => b.updatedAt - a.updatedAt).map(item => summary(item, member)) };
      }
      if (body.action === 'problem-get') {
        const state = await store.read();
        return { proposal: detail(find(state, body.id, member, canManage), member) };
      }
      const time = currentTime();
      if (body.action === 'problem-save') {
        const draft = validateDraft(body.draft);
        const { proposal } = await store.update(state => {
          let proposal;
          if (body.id === undefined) {
            if (state.proposals.length >= MAX_PROPOSALS) fail(507, '문제 제안 저장 공간이 가득 찼어요.');
            proposal = { id: randomBytes(12).toString('hex'), owner: member, status: 'draft', revision: 0,
              number: null, updatedAt: time, note: '', verification: null, draft };
            state.proposals.push(proposal);
          } else {
            proposal = find(state, body.id, member, canManage);
            requireRevision(proposal, body.revision);
            if (proposal.status === 'published') fail(409, '공개된 문제는 수정할 수 없어요.');
            if (proposal.status === 'pending' && !canManage) fail(409, '검토 중인 문제는 수정할 수 없어요.');
            proposal.draft = draft;
            proposal.status = 'draft';
            proposal.note = '';
            proposal.verification = null;
            proposal.revision += 1;
            proposal.updatedAt = time;
          }
          return { proposal: detail(proposal, member) };
        });
        return { proposal };
      }
      let published;
      const { proposal } = await store.update(state => {
        const entry = find(state, body.id, member, canManage);
        requireRevision(entry, body.revision);
        if (body.action === 'problem-submit') {
          if (entry.owner !== member && !canManage) fail(403, '내 문제만 제출할 수 있어요.');
          if (!['draft', 'changes'].includes(entry.status)) fail(409, '제출할 수 없는 상태예요.');
          if (entry.verification?.revision === entry.revision) entry.verification.revision += 1;
          entry.status = 'pending';
          entry.note = '';
        } else if (body.action === 'problem-return') {
          if (!canManage) fail(403, '관리자만 검토 의견을 남길 수 있어요.');
          if (entry.status !== 'pending' || !cleanText(body.note, 1_000)) fail(400, '검토 의견을 입력해 주세요.');
          entry.status = 'changes';
          entry.note = body.note.trim();
        } else if (body.action === 'problem-publish') {
          if (!canManage) fail(403, '관리자만 문제를 공개할 수 있어요.');
          if (!['draft', 'pending'].includes(entry.status) ||
              !entry.verification?.solved || entry.verification.revision !== entry.revision) {
            fail(409, '현재 문제의 기준 답안을 모든 테스트로 검증해 주세요.');
          }
          let next = state.nextNumber;
          if (!Number.isSafeInteger(next) || next < 90_000) throw new Error('Invalid problem number sequence');
          while (Object.hasOwn(numberedProblems, next)) next++;
          if (!Number.isSafeInteger(next)) fail(507, '사용 가능한 문제 번호가 없어요.');
          entry.number = next;
          state.nextNumber = next + 1;
          entry.status = 'published';
          published = entry;
        } else fail(400, '지원하지 않는 문제 요청이에요.');
        entry.revision += 1;
        entry.updatedAt = time;
        return { proposal: detail(entry, member) };
      });
      if (published) register(published);
      return { proposal };
    },
    async verification(key, id, { canManage = false } = {}) {
      const member = clubMemberId(key);
      const state = await store.read();
      const proposal = find(state, id, member, canManage);
      if (proposal.status === 'published') fail(409, '공개된 문제예요.');
      return { id, revision: proposal.revision, lang: proposal.draft.reference.lang,
        code: proposal.draft.reference.code, problem: judgeProblem(proposal) };
    },
    async finishVerification(key, id, revision, grade, { canManage = false } = {}) {
      const member = clubMemberId(key);
      if (!grade || !Number.isSafeInteger(grade.passed) || !Number.isSafeInteger(grade.total) ||
          grade.total < 1 || grade.passed < 0 || grade.passed > grade.total ||
          typeof grade.solved !== 'boolean') fail(400, '기준 답안의 채점 결과를 확인해 주세요.');
      const time = currentTime();
      const { proposal } = await store.update(state => {
        const proposal = find(state, id, member, canManage);
        requireRevision(proposal, revision);
        if (proposal.status === 'published') fail(409, '공개된 문제예요.');
        const expectedTotal = proposal.draft.examples.length + proposal.draft.tests.length;
        if (grade.total !== expectedTotal || grade.solved !== (grade.passed === grade.total)) {
          fail(400, '기준 답안의 채점 결과를 확인해 주세요.');
        }
        proposal.verification = { revision, passed: grade.passed, total: grade.total, solved: grade.solved };
        proposal.updatedAt = time;
        return { proposal: detail(proposal, member) };
      });
      return proposal;
    },
  };
}
