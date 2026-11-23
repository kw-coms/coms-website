import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { buildNumberedCode, gradeNumberedOutput, loadNumberedProblems } from '../numbered-judge.mjs';
import { createRunnerServer, validateRequest } from '../server.mjs';

const problem = {
  langs: ['python', 'cpp'],
  cases: [
    { stdin: 'PRIVATE INPUT A\n', expected: 'PRIVATE ANSWER A\n' },
    { stdin: 'PRIVATE INPUT B\n', expected: 'PRIVATE ANSWER B\n' },
  ],
};
const output = stdout => ({ stdout, stderr: 'private runtime detail', exitCode: 0, signal: null, timedOut: false, truncated: false, timeMs: 2 });
const success = { ok: true, stage: 'run', results: [output('PRIVATE ANSWER A\n'), output('PRIVATE ANSWER B\n')], diagnostics: [], stderr: '', timeMs: 4 };
const requestBody = { lang: 'python', code: 'print(input())', problemNumber: 1100 };

function request(server, path, { method = 'POST', body, member = 'student_1' } = {}) {
  return new Promise(resolve => {
    const data = body === undefined ? '' : JSON.stringify(body);
    const incoming = Readable.from(data ? [Buffer.from(data)] : []);
    incoming.method = method;
    incoming.url = path;
    incoming.complete = true;
    incoming.socket = { remoteAddress: '127.0.0.1' };
    incoming.headers = { 'content-type': 'application/json', 'x-runner-client': member, 'content-length': String(Buffer.byteLength(data)) };
    const response = {
      destroyed: false, setHeader() {},
      writeHead(status) { this.status = status; },
      end(payload) { resolve({ status: this.status, payload: JSON.parse(payload) }); },
    };
    server.emit('request', incoming, response);
  });
}

test('numbered bank rejects malformed identifiers and oversized hidden input', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'coms-numbered-bank-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'bank.json');
  await writeFile(file, JSON.stringify({ 1100: problem }));
  assert.deepEqual(loadNumberedProblems(file), { 1100: problem });
  await writeFile(file, JSON.stringify({ '01100': problem }));
  assert.throws(() => loadNumberedProblems(file), /Invalid numbered problem/);
  await writeFile(file, JSON.stringify({ 1100: { ...problem, cases: [{ stdin: 'x'.repeat(16 * 1024 + 1), expected: '' }] } }));
  assert.throws(() => loadNumberedProblems(file), /Invalid numbered problem/);
  await writeFile(file, JSON.stringify({ 1100: { ...problem, harness: { python: '#@USER@ #@USER@' } } }));
  assert.throws(() => loadNumberedProblems(file), /Invalid numbered problem/);
});

test('the numbered request excludes client-controlled cases and legacy request shapes remain valid', () => {
  assert.equal(validateRequest(requestBody), null);
  assert.ok(validateRequest({ ...requestBody, stdin: 'forged' }));
  assert.ok(validateRequest({ ...requestBody, tests: ['forged'] }));
  assert.ok(validateRequest({ ...requestBody, problemNumber: '1100' }));
  assert.equal(validateRequest({ lang: 'python', code: 'print(1)', tests: ['x'] }), null);
  assert.equal(validateRequest({ lang: 'python', code: 'print(1)', stdin: 'x' }), null);
});

test('harness insertion preserves literal replacement tokens and rejects duplicate markers', () => {
  const wrapped = { harness: { python: 'before\n#@USER@\nafter' } };
  assert.equal(buildNumberedCode(wrapped, 'python', 'value="$&"'), 'before\nvalue="$&"\nafter');
  assert.throws(() => buildNumberedCode({ harness: { python: '#@USER@ #@USER@' } }, 'python', 'x'));
});

test('grading reports verdicts without returning hidden inputs, outputs or runtime stderr', () => {
  assert.deepEqual(gradeNumberedOutput(problem, success), {
    passed: 2, total: 2, solved: true, verdicts: ['correct', 'correct'], diagnostics: [],
    compileError: false, stderr: '', timeMs: 4,
  });
  const wrong = gradeNumberedOutput(problem, { ...success, results: [output('wrong'), { ...output(''), timedOut: true }] });
  assert.deepEqual(wrong.verdicts, ['wrong', 'timeout']);
  assert.equal(wrong.solved, false);
  assert.doesNotMatch(JSON.stringify(wrong), /PRIVATE INPUT|PRIVATE ANSWER|private runtime detail/);
  assert.deepEqual(gradeNumberedOutput(problem, { stage: 'compile', stderr: 'syntax error', diagnostics: [], timeMs: 1 }), {
    passed: 0, total: 2, solved: false, verdicts: [], diagnostics: [], compileError: true, stderr: 'syntax error', timeMs: 1,
  });
  assert.throws(() => gradeNumberedOutput(problem, { ...success, results: [] }), /Incomplete/);
});

test('numbered grading uses the study comparison rules', () => {
  const token = { langs: ['python'], cases: [{ stdin: '', expected: '1 2\n' }] };
  const run = stdout => ({ stage: 'run', results: [output(stdout)], diagnostics: [], stderr: '', timeMs: 1 });
  assert.equal(gradeNumberedOutput(token, run('1\n   2')).solved, true);
  assert.equal(gradeNumberedOutput({ ...token, compare: 'lines' }, run('1\n   2')).solved, false);
  const float = { ...token, compare: { float: 0.001 }, cases: [{ stdin: '', expected: '1.0\n' }] };
  assert.equal(gradeNumberedOutput(float, run('1.0009\n')).solved, true);
  assert.equal(gradeNumberedOutput(float, run('1.002\n')).solved, false);
});

test('the progress proxy uses member authentication and does not forward cookies', async () => {
  const config = await (await import('node:fs/promises')).readFile(new URL('../../nginx.frontend.conf', import.meta.url), 'utf8');
  const location = config.match(/location = \/study\/api\/progress \{([\s\S]*?)\n    \}/)?.[1] ?? '';
  assert.match(location, /auth_request \/lab\/_auth;/);
  assert.match(location, /auth_request_set \$runner_client \$upstream_http_x_member_id;/);
  assert.match(location, /proxy_set_header X-Runner-Client \$runner_client;/);
  assert.match(location, /proxy_set_header Cookie "";/);
  assert.match(location, /proxy_pass http:\/\/unix:\/run\/coms-study\/run.sock:\/study\/api\/progress;/);
});

test('numbered submissions use server cases, member isolation and only verified solves advance progress', async () => {
  const calls = [], stored = new Map();
  const progress = {
    async get(key) { return { solved: stored.get(key) ?? [], solvedToday: 0, streak: 0 }; },
    async recordSolved(key, number) { stored.set(key, [...new Set([...(stored.get(key) ?? []), number])]); return this.get(key); },
  };
  const server = createRunnerServer({
    trustProxy: true, numberedProblems: { 1100: problem }, judgeProgress: progress,
    executor: async body => { calls.push(body); return body.code.includes('correct') ? success : { ...success, results: [output('bad'), output('bad')] }; },
    queue: { submit: work => work() }, limiter: { take: () => true, close() {} }, logger() {},
  });
  const forged = await request(server, '/study/api/run', { body: { ...requestBody, tests: ['PRIVATE ANSWER A'], solved: true } });
  assert.equal(forged.status, 400);
  const wrong = await request(server, '/study/api/run', { body: { ...requestBody, solved: true } });
  assert.equal(wrong.status, 200);
  assert.equal(wrong.payload.judge.solved, false);
  assert.deepEqual(wrong.payload.progress.solved, []);
  const right = await request(server, '/study/api/run', { body: { ...requestBody, code: 'correct' } });
  assert.equal(right.status, 200);
  assert.deepEqual(right.payload.progress.solved, [1100]);
  assert.deepEqual(calls.at(-1), { lang: 'python', code: 'correct', tests: problem.cases.map(entry => entry.stdin) });
  assert.doesNotMatch(JSON.stringify(right.payload), /PRIVATE INPUT|PRIVATE ANSWER|private runtime detail/);
  const sameMember = await request(server, '/study/api/progress', { method: 'GET' });
  const otherMember = await request(server, '/study/api/progress', { method: 'GET', member: 'student_2' });
  assert.deepEqual(sameMember.payload.solved, [1100]);
  assert.deepEqual(otherMember.payload.solved, []);
  const missing = await request(server, '/study/api/run', { body: { ...requestBody, problemNumber: 9999 } });
  assert.equal(missing.status, 400);
  const unsupported = await request(server, '/study/api/run', { body: { ...requestBody, lang: 'java' } });
  assert.equal(unsupported.status, 400);
  const anonymous = await request(server, '/study/api/progress', { method: 'GET', member: '' });
  assert.equal(anonymous.status, 401);
  assert.equal(calls.length, 2);
  server.close();
});
