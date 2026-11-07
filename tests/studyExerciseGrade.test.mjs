import assert from 'node:assert/strict'
import { runTests } from '../src/pages/study/exercises/api.ts'
import { buildProgram, gradeExercise, gradeOutput, mapDiagnostics, matchesOutput } from '../src/pages/study/exercises/grade.ts'

const exercise = {
  id: 'sample', title: '샘플', level: 1, topics: ['입출력'], langs: ['c'], chapter: { c: 'start' },
  statement: '샘플', examples: [{ stdin: '1', expected: '1\n' }], tests: [{ stdin: '2', expected: '2\n' }],
  mode: 'stdio', starter: { c: '' }, solution: { c: '' }, explain: '', hints: [],
}
const run = (stdout, overrides = {}) => ({ stdout, stderr: '', exitCode: 0, signal: null, timedOut: false, truncated: false, timeMs: 1, skipped: false, ...overrides })
const result = (runs, overrides = {}) => ({ ok: true, stage: 'run', stderr: '', diagnostics: [], timeMs: 2, results: runs, ...overrides })

assert.equal(matchesOutput('1 \n 2', '1 2'), true)
assert.equal(matchesOutput('1\n2\n', '1 2', 'lines'), false)
assert.equal(matchesOutput('1\r\n\r\n2\r\n', '1\n\n2\n', 'lines'), true)
assert.equal(matchesOutput('1\n\n2', '1\n2', 'lines'), false)
assert.equal(matchesOutput('3.14160 units', '3.14159 units', { float: 0.0001 }), true)
assert.equal(matchesOutput('101', '100', { float: 0.001 }), false)
assert.equal(matchesOutput('word 1.0', 'other 1.0', { float: 0.1 }), false)

let grade = gradeOutput(exercise, 'c', '', result([run('1'), run('bad')]))
assert.deepEqual([grade.passed, grade.total, grade.solved], [1, 2, false])
assert.deepEqual(grade.cases.map((row) => row.verdict), ['correct', 'wrong'])
assert(grade.cases[1].diff.some((line) => line.kind === 'del'))
assert(grade.cases[1].diff.some((line) => line.kind === 'add'))

grade = gradeOutput(exercise, 'c', '', result([run('', { timedOut: true, exitCode: 1, truncated: true }), run('', { exitCode: 1, stderr: 'boom' })]))
assert.deepEqual(grade.cases.map((row) => row.verdict), ['timeout', 'runtime'])
grade = gradeOutput(exercise, 'c', '', result([run('', { truncated: true, exitCode: null, signal: 'SIGKILL' }), { skipped: true }]))
assert.deepEqual(grade.cases.map((row) => row.verdict), ['truncated', 'skipped'])
grade = gradeOutput(exercise, 'c', '', result([], { ok: false, stage: 'compile', stderr: 'syntax' }))
assert.equal(grade.compileError, true)
assert.equal(grade.cases.length, 0)

const fn = {
  ...exercise, mode: 'function',
  harness: { c: '#include <stdio.h>\nint value(void);\n/*@USER@*/\nint main(void) { printf("%d", value()); }' },
}
assert.match(buildProgram(fn, 'c', 'int value(void) { return 1; }'), /int value\(void\) \{ return 1; \}\nint main/)
assert.match(buildProgram(fn, 'c', 'const char *text = "$& $` $\'";'), /const char \*text = "\$& \$` \$'";/, 'student replacement metacharacters remain literal')
const mapped = mapDiagnostics([
  { line: 1, severity: 'error', message: 'include' },
  { line: 3, severity: 'error', message: 'student first' },
  { line: 4, severity: 'error', message: 'student second' },
  { line: 5, severity: 'error', message: 'main' },
], fn, 'c', 'line one\nline two')
assert.deepEqual(mapped.map(({ line, source }) => [line, source]), [[1, 'harness'], [1, 'student'], [2, 'student'], [5, 'harness']])

const savedFetch = globalThis.fetch
const calls = []
globalThis.fetch = async (url, init) => {
  calls.push([url, JSON.parse(init.body)])
  return new Response(JSON.stringify(result([run('1\n'), run('2\n')])), { status: 200 })
}
try {
  const graded = await gradeExercise(exercise, 'c', 'code')
  assert.equal(graded.kind, 'graded')
  assert.equal(graded.grade.solved, true)
  assert.deepEqual(calls[0][1], { lang: 'c', code: 'code', tests: ['1', '2'] })
  const paths = []
  globalThis.fetch = async (url, init) => {
    paths.push(url)
    if (url === '/api/auth/refresh') return new Response(null, { status: 204 })
    if (paths.length === 1) return new Response('{}', { status: 401 })
    assert.deepEqual(JSON.parse(init.body).tests, ['1', '2'])
    return new Response(JSON.stringify(result([run('1'), run('2')])), { status: 200 })
  }
  assert.equal((await gradeExercise(exercise, 'c', 'code')).kind, 'graded')
  assert.deepEqual(paths, ['/study/api/run', '/api/auth/refresh', '/study/api/run'])
  globalThis.fetch = async () => assert.fail('invalid batch should not reach the network')
  assert.equal((await runTests('c', '', [])).kind, 'rejected')
  assert.equal((await runTests('c', '', ['x'.repeat(17 * 1024)])).kind, 'rejected')
} finally { globalThis.fetch = savedFetch }

console.log('studyExerciseGrade ok')
