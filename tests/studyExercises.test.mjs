import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import http from 'node:http'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { loadProblems, buildProgram, compare, validateWeb, chapterMismatches, runRemote } from '../scripts/verify-exercises.mjs'
import { chapters } from '../src/pages/study/exercises/chapters.ts'

const problems = await loadProblems()
const langs = ['c', 'java', 'python']
const chapterIds = {}
for (const lang of [...langs, 'web']) {
  const html = await readFile(new URL(`../src/pages/study/content/${lang}.html`, import.meta.url), 'utf8')
  chapterIds[lang] = new Set([...html.matchAll(/<section\b[^>]*\bid=["']([^"']+)["']/g)].map(m => m[1]))
}
const nonempty = value => assert.ok(typeof value === 'string' && value.trim().length > 0, 'expected nonempty string')
const rawTag = /<\/?[a-z][a-z0-9-]*(?:\s+[^<>]*|\s*\/?)>/i

test('every allowlisted chapter exists on its study page', () => {
  for (const [lang, allowed] of Object.entries(chapters)) {
    assert.equal(new Set(allowed).size, allowed.length, `duplicate ${lang} chapter`)
    for (const chapter of allowed) assert.ok(chapterIds[lang].has(chapter), `${lang}: allowlisted chapter ${chapter} has no section[id]`)
  }
})

test('verifier reports chapters outside the allowlist', async () => {
  const mismatches = await chapterMismatches([
    { id: 'bad-web', chapter: 'missing' },
    { id: 'bad-c', langs: ['c'], chapter: { c: 'missing' } },
  ])
  assert.ok(mismatches.some(message => message.includes('bad-web/web: chapter missing')))
  assert.ok(mismatches.some(message => message.includes('bad-c/c: chapter missing')))
})

test('all problem chapters match the allowlist and a study page section', async () => {
  assert.deepEqual(await chapterMismatches(problems), [])
})

test('web schema accepts the start and project chapters', () => {
  const web = problems.find(problem => !('langs' in problem))
  assert.ok(web)
  for (const chapter of ['start', 'project']) assert.doesNotThrow(() => validateWeb({ ...web, chapter }))
})

function common(p) {
  for (const key of ['id', 'title', 'statement', 'explain']) nonempty(p[key])
  assert.match(p.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  assert.ok(Number.isInteger(p.level) && p.level >= 1 && p.level <= 5)
  assert.ok(Array.isArray(p.topics) && p.topics.length > 0)
  p.topics.forEach(nonempty)
  assert.ok(Array.isArray(p.hints) && p.hints.length >= 1 && p.hints.length <= 3)
  p.hints.forEach(nonempty)
  assert.ok(!rawTag.test(p.statement), 'statement must use mini-markdown, not raw HTML')
  for (const field of ['inputSpec', 'outputSpec']) if (p[field] !== undefined) nonempty(p[field])
}

test('problem collection is nonempty and ids are globally unique', () => {
  assert.ok(problems.length > 0)
  assert.equal(new Set(problems.map(p => p.id)).size, problems.length)
})

for (const p of problems) {
  test(`exercise schema: ${p.id}`, () => {
    common(p)
    if (!('langs' in p)) {
      validateWeb(p)
      assert.ok(chapters.web.includes(p.chapter), `unknown web chapter ${p.chapter}`)
      assert.ok(chapterIds.web.has(p.chapter), `unknown web chapter ${p.chapter}`)
      return
    }
    assert.ok(Array.isArray(p.langs) && p.langs.length > 0)
    assert.equal(new Set(p.langs).size, p.langs.length)
    assert.ok(p.langs.every(lang => langs.includes(lang)))
    assert.ok(['stdio', 'function'].includes(p.mode))
    assert.ok(p.chapter && typeof p.chapter === 'object')
    assert.ok(Array.isArray(p.examples) && p.examples.length >= 1)
    assert.ok(Array.isArray(p.tests) && p.tests.length >= 3)
    const cases = [...p.examples, ...p.tests]
    assert.ok(cases.length <= 10)
    for (const c of cases) {
      assert.equal(typeof c.stdin, 'string')
      assert.equal(typeof c.expected, 'string')
      if (c.explain !== undefined) nonempty(c.explain)
      assert.ok(Buffer.byteLength(c.stdin) <= 16 * 1024)
    }
    assert.ok(cases.reduce((n, c) => n + Buffer.byteLength(c.stdin), 0) <= 32 * 1024)
    for (const lang of p.langs) {
      assert.ok(chapters[lang].includes(p.chapter[lang]), `unknown ${lang} chapter ${p.chapter[lang]}`)
      assert.ok(chapterIds[lang].has(p.chapter[lang]), `unknown ${lang} chapter ${p.chapter[lang]}`)
      for (const kind of ['starter', 'solution']) {
        nonempty(p[kind]?.[lang])
        nonempty(buildProgram(p, lang, kind))
      }
      if (p.mode === 'function') {
        const marker = lang === 'python' ? '#@USER@' : '/*@USER@*/'
        assert.equal(p.harness[lang].split(marker).length - 1, 1)
        assert.ok(p.harness[lang].split('\n').some(line => line.trim() === marker), 'marker must occupy its own line')
      }
    }
    if (p.compare !== undefined && !['tokens', 'lines'].includes(p.compare)) {
      assert.equal(typeof p.compare, 'object')
      assert.deepEqual(Object.keys(p.compare), ['float'])
      assert.ok(Number.isFinite(p.compare.float) && p.compare.float >= 0)
    }
  })
}

test('verifier compares tokens, meaningful lines and finite numeric tolerance', () => {
  assert.ok(compare(' 1\n2 ', '1 2'))
  assert.ok(!compare('1 2', '1 3'))
  assert.ok(!compare('1', '1 2'))
  assert.ok(compare('a\r\nb\n', 'a\nb', 'lines'))
  assert.ok(!compare('a b', 'a\nb', 'lines'))
  assert.ok(!compare(' a\nb', 'a\nb', 'lines'))
  assert.ok(compare('1000.5 label', '1000 label', { float: 0.001 }))
  assert.ok(compare('0.0005', '0', { float: 0.001 }))
  assert.ok(!compare('1.01', '1', { float: 0.001 }))
  assert.ok(!compare('NaN', '0', { float: 1 }))
  assert.ok(!compare('1e999', '1', { float: 1 }))
  assert.ok(!compare('1 label', '1 other', { float: 0.1 }))
})

test('harness insertion preserves replacement metacharacters and rejects duplicate markers', () => {
  const p = { id: 'fixture', mode: 'function', harness: { c: 'before\n/*@USER@*/\nafter' }, solution: { c: '$& $$ $`' } }
  assert.equal(buildProgram(p, 'c', 'solution'), 'before\n$& $$ $`\nafter')
  p.harness.c += '\n/*@USER@*/'
  assert.throws(() => buildProgram(p, 'c', 'solution'), /exactly one marker/)
})

for (const socket of [false, true]) {
  test(`runner request contract over ${socket ? 'Unix socket' : 'HTTP'} (mock transport)`, async t => {
    const response = { stage: 'run', results: [{ stdout: '3', exitCode: 0 }] }
    let received
    t.mock.method(http, 'request', (...args) => {
      const options = socket ? args[0] : args[1]
      const callback = args.at(-1)
      const req = new EventEmitter()
      req.destroy = error => { req.emit('error', error); req.emit('close') }
      req.end = body => {
        received = { options, url: socket ? null : args[0], body: JSON.parse(body) }
        queueMicrotask(() => {
          const res = new PassThrough()
          res.statusCode = 200
          callback(res)
          res.end(JSON.stringify(response))
          req.emit('close')
        })
      }
      return req
    })
    const endpoint = socket ? 'unix:/tmp/study.sock' : 'http://127.0.0.1:3000'
    assert.deepEqual(await runRemote(endpoint, 'python', 'print(3)', ['']), response)
    assert.equal(received.options.method, 'POST')
    assert.equal(received.options.headers['X-Runner-Client'], 'verify')
    assert.deepEqual(received.body, { lang: 'python', code: 'print(3)', tests: [''] })
    if (socket) {
      assert.equal(received.options.socketPath, '/tmp/study.sock')
      assert.equal(received.options.path, '/study/api/run')
    } else assert.equal(received.url.href, 'http://127.0.0.1:3000/study/api/run')
  })
}
