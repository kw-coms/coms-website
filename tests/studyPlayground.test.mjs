import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { classifyBlock, initialCode, stripAnnotations, needsStdin, applyTemplate } from '../src/pages/study/playground/classify.ts'
import { compareOutput, normalizeOutput } from '../src/pages/study/playground/compare.ts'
import { createStore, blockKey, encodeShareHash, decodeShareHash, SHARE_MAX_CHARS } from '../src/pages/study/playground/storage.ts'
import { buildLabScene, encodeLabShare, labLink } from '../src/pages/study/playground/labShare.ts'
import { runRemote, retryAfterSeconds } from '../src/pages/study/playground/runner.ts'
import { setSessionExpiredHandler } from '../src/services/apiClient.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ---------- 1. every block of every page, with its decision (reviewed by a human in the snapshot diff) ----------
const PAGES = ['web', 'c', 'java', 'python', 'arduino']
const rows = []
const counts = {}
for (const page of PAGES) {
  const doc = new JSDOM(readFileSync(resolve(root, `src/pages/study/content/${page}.html`), 'utf8')).window.document
  const blocks = [...doc.querySelectorAll('pre.code')]
  counts[page] = { total: blocks.length, runnable: 0 }
  blocks.forEach((pre, i) => {
    const code = pre.textContent
    const d = classifyBlock(page, code, { run: pre.getAttribute('data-run'), template: pre.getAttribute('data-template'), lang: pre.getAttribute('data-lang') })
    if (d.run) counts[page].runnable++
    const first = code.split('\n').find((l) => l.trim()) ?? ''
    rows.push([`${page}#${i}`, d.run ? 'RUN' : '---', d.lang, d.template ?? '', d.stdin ? 'stdin' : '', d.reason, first.trim().slice(0, 48)].join('\t'))
  })
}
const table = rows.join('\n') + '\n'
const snapshot = resolve(root, 'tests/fixtures/study-playground-blocks.tsv')
if (process.env.UPDATE_SNAPSHOT === '1' || !existsSync(snapshot)) writeFileSync(snapshot, table)
assert.equal(table, readFileSync(snapshot, 'utf8'),
  'a study code block changed its run decision. Review the diff, then regenerate with UPDATE_SNAPSHOT=1 node --import tsx tests/studyPlayground.test.mjs')
console.log('runnable blocks per page:', JSON.stringify(counts))
assert.ok(counts.c.runnable >= 40 && counts.python.runnable >= 40 && counts.java.runnable >= 20)

// ---------- 2. classification rules ----------
const c = (page, code, attrs) => classifyBlock(page, code, attrs)
assert.equal(c('c', '#include <stdio.h>\nint main(void) { return 0; }').run, true)
assert.equal(c('c', 'gcc hello.c -o hello').lang, 'shell')
assert.equal(c('c', 'int x = 5;\nprintf("%d", x);').run, false, 'statements without main are not runnable by default')
assert.deepEqual([c('c', 'int x = 5;', { template: 'c-main' }).run, c('c', 'int x = 5;', { template: 'c-main' }).template], [true, 'c-main'])
assert.equal(c('c', '#include <stdio.h>\nint main(void) { return 0; }', { run: 'false' }).run, false, 'data-run=false wins')
assert.equal(c('c', 'for (시작; 조건; 증감) {\n}').reason, 'korean-placeholder-outside-strings')
assert.equal(c('c', 'int main(void) { printf("안녕"); return 0; } // 한글 주석').run, true, 'Korean in strings and comments is fine')
assert.equal(c('python', '>>> 1 + 2\n3').lang, 'repl')
assert.equal(c('python', 'pip install requests').run, false)
assert.equal(c('python', 'name = input("이름? ")\nprint(name)').stdin, true)
assert.equal(c('java', 'public class Hello {\n  public static void main(String[] a) {}\n}').run, true)
assert.equal(c('java', 'public class Student {\n  int x;\n}').run, false)
assert.equal(c('java', 'int[] a = {1, 2};', { template: 'java-main' }).template, 'java-main')
assert.equal(c('web', '<p>안녕</p>').lang, 'html')
assert.equal(c('web', 'console.log(1);').lang, 'js')
assert.equal(c('web', 'document.querySelector("a")').run, false, 'DOM snippets point to the demo boxes')
assert.equal(c('web', 'h1 {\n  color: red;\n}').run, false)
assert.equal(c('arduino', 'void setup() {}\nvoid loop() {}').run, true)
assert.equal(c('arduino', 'pinMode(2, INPUT);').run, false)
assert.equal(needsStdin('c', 'scanf("%d", &n);'), true)
assert.equal(needsStdin('c', 'printf("scanf");'), false, 'scanf inside a string is not input')
assert.equal(needsStdin('java', 'Scanner sc = new Scanner(System.in);'), true)

// ---------- 3. annotations and templates ----------
assert.equal(stripAnnotations('a = 1   ← one\n   ← continued\nb = 2\n↑ caption'), 'a = 1\nb = 2')
const annotated = c('web', 'console.log(1);   ← prints')
assert.equal(annotated.run, true)
assert.equal(annotated.strip, true)
assert.equal(initialCode(annotated, 'console.log(1);   ← prints'), 'console.log(1);\n')
const cMain = applyTemplate('c-main', '    int x = 5;\n    printf("%d\\n", x);')
assert.match(cMain, /#include <stdio\.h>[\s\S]*int main\(void\) \{\n {4}int x = 5;\n {4}printf\("%d\\n", x\);\n {4}return 0;\n\}\n$/)
const jMain = applyTemplate('java-main', 'import java.io.*;\nint x = 1;')
assert.match(jMain, /^import java\.io\.\*;\n\npublic class Main \{\n {4}public static void main\(String\[\] args\) \{\n {8}int x = 1;\n {4}\}\n\}\n$/)
assert.match(applyTemplate('java-main', 'int x;'), /^import java\.util\.\*;/)

// ---------- 4. expected-output comparison ----------
assert.equal(normalizeOutput('  a \n\n b\t c '), 'a b c')
assert.equal(compareOutput('Hello,  COM\'s!\n\n', "Hello, COM's!").match, true)
assert.equal(compareOutput('a\nb', 'a b').match, true, 'whitespace-insensitive, newlines included')
const diff = compareOutput('a\nX\nc', 'a\nb\nc')
assert.equal(diff.match, false)
assert.deepEqual(diff.diff.map((d) => `${d.kind}:${d.text}`), ['same:a', 'del:b', 'add:X', 'same:c'])
assert.equal(compareOutput('', '').match, true)

// ---------- 5. persistence ----------
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) } }
const backing = mem()
const store = createStore('c', backing)
const key = blockKey(3, 'int main(){}')
assert.equal(store.get(key), null)
store.set(key, 'edited')
assert.equal(createStore('c', backing).get(key).code, 'edited', 'survives a new store instance (revisit)')
assert.equal(createStore('java', backing).get(key), null, 'per page')
store.clear(key)
assert.equal(store.get(key), null)
{
  // The one-step backup of a draft that a shared code was saved over lives beside it and survives clear().
  const backups = createStore('c', mem())
  assert.equal(backups.getBackup(key), null)
  backups.set(key, 'mine')
  backups.setBackup(key, 'mine')
  backups.set(key, 'shared')
  assert.equal(backups.get(key).code, 'shared')
  assert.equal(backups.getBackup(key).code, 'mine')
  backups.clear(key)
  assert.equal(backups.getBackup(key).code, 'mine', 'resetting a block keeps the backup')
  backups.clearBackup(key)
  assert.equal(backups.getBackup(key), null)
}
assert.notEqual(blockKey(3, 'a'), blockKey(3, 'b'), 'the key follows the original text')
const blocked = createStore('c', { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } })
blocked.set('k', 'v')
assert.equal(blocked.get('k'), null, 'blocked storage never throws')
assert.equal(createStore('c', null).get('k'), null)
backing.setItem('coms-study-playground:c', '{not json')
assert.equal(createStore('c', backing).get('k'), null, 'corrupt JSON is ignored')
const many = createStore('big', mem())
for (let i = 0; i < 100; i++) many.set(`k${i}`, 'x')
assert.equal(many.get('k99').code, 'x')
assert.equal(many.get('k0'), null, 'oldest entries are dropped past the cap')

// ---------- 6. share link codec ----------
const korean = '#include <stdio.h>\nint main(void) {\n    printf("안녕, 광운!\\n");\n}\n'
const hash = encodeShareHash(12, korean)
assert.match(hash, /^#pg=12\.[A-Za-z0-9_-]+$/)
assert.deepEqual(decodeShareHash(hash), { index: 12, code: korean })
assert.equal(encodeShareHash(0, 'x'.repeat(SHARE_MAX_CHARS)), null, 'too long for a link')
assert.equal(decodeShareHash('#pg=1.!!!'), null)
assert.equal(decodeShareHash('#other'), null)
assert.equal(decodeShareHash('#pg=1.' + Buffer.from([0xff, 0xfe]).toString('base64url')), null, 'invalid UTF-8')

// ---------- 7. Circuit Lab share (same format as lab/src/core/share.ts) ----------
const scene = buildLabScene('void setup() {}\nvoid loop() {}\n')
assert.deepEqual(Object.keys(scene), ['version', 'title', 'parts', 'wires', 'code'])
assert.deepEqual(scene.parts.map((p) => p.kind), ['arduino-uno'])
assert.deepEqual(scene.wires, [])
const token = await encodeLabShare('void setup() {}\nvoid loop() {}\n')
assert.match(token, /^[A-Za-z0-9_-]+$/)
const inflated = await new Response(new Blob([Buffer.from(token, 'base64url')]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text()
assert.deepEqual(JSON.parse(inflated), buildLabScene('void setup() {}\nvoid loop() {}\n'))
assert.equal(labLink(token), `/lab/#s=${token}`)
assert.equal(await encodeLabShare('x'.repeat(40 * 1024)), null, 'over the Lab 32 KB limit -> caller falls back to copy + open')
const realCS = globalThis.CompressionStream
globalThis.CompressionStream = undefined
assert.equal(await encodeLabShare('void setup() {}'), null, 'no CompressionStream -> fallback')
globalThis.CompressionStream = realCS

// ---------- 8. runner ----------
const realFetch = globalThis.fetch
const reply = (status, body, headers = {}) => async (_url, init) => { reply.last = JSON.parse(init.body); return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } }) }
globalThis.fetch = reply(200, { ok: true, stage: 'run', stdout: 'hi\n', stderr: '', exitCode: 0, signal: null, timedOut: false, truncated: false, timeMs: 12, diagnostics: [] })
let r = await runRemote('c', 'int main(){}', 'in')
assert.equal(r.kind, 'output')
assert.equal(r.output.stdout, 'hi\n')
assert.deepEqual(reply.last, { lang: 'c', code: 'int main(){}', stdin: 'in' })
globalThis.fetch = reply(200, { ok: false, stage: 'compile', stdout: '', stderr: 'e', exitCode: null, diagnostics: [{ line: 3, column: 5, severity: 'error', message: 'm', hintKo: 'h' }, { nope: 1 }] })
r = await runRemote('java', 'x', '')
assert.equal(r.output.stage, 'compile')
assert.equal(r.output.ok, false)
assert.deepEqual(r.output.diagnostics.map((d) => d.line), [3], 'malformed diagnostics are dropped')
globalThis.fetch = reply(401, {})
assert.equal((await runRemote('python', 'x', '')).kind, 'login')
{
  // An expired access cookie: refresh once, retry once; a refused refresh asks to sign in without retrying.
  const calls = []
  const script = (...statuses) => async (url) => {
    calls.push(url)
    const status = statuses.shift()
    return new Response(status === 200 ? JSON.stringify({ ok: true, stage: 'run', stdout: 'hi\n', stderr: '', exitCode: 0, diagnostics: [] }) : status === 204 ? null : '{}', { status })
  }
  globalThis.fetch = script(401, 204, 200)
  assert.equal((await runRemote('c', 'x', '')).kind, 'output')
  assert.deepEqual(calls, ['/study/api/run', '/api/auth/refresh', '/study/api/run'])
  calls.length = 0
  globalThis.fetch = script(401, 401)
  let expired = 0
  setSessionExpiredHandler(() => { expired++ })
  assert.equal((await runRemote('c', 'x', '')).kind, 'login')
  assert.deepEqual(calls, ['/study/api/run', '/api/auth/refresh'])
  assert.equal(expired, 1, 'a refused refresh signs the page out like any other request of the site')
  setSessionExpiredHandler(null)
  calls.length = 0
  {
    // Parallel runs that all get a 401 share ONE refresh (single-flight) and each retries once.
    const seen = []
    globalThis.fetch = async (url) => {
      seen.push(url)
      if (url === '/api/auth/refresh') { await new Promise((r) => setTimeout(r, 20)); return new Response(null, { status: 204 }) }
      const retried = seen.filter((u) => u === '/study/api/run').length > 2
      return new Response(retried ? JSON.stringify({ ok: true, stage: 'run', stdout: '', stderr: '', exitCode: 0, diagnostics: [] }) : '{}', { status: retried ? 200 : 401 })
    }
    const both = await Promise.all([runRemote('c', 'x', ''), runRemote('c', 'y', '')])
    assert.deepEqual(both.map((r) => r.kind), ['output', 'output'])
    assert.equal(seen.filter((u) => u === '/api/auth/refresh').length, 1)
  }
  calls.length = 0
  globalThis.fetch = script(401, 204, 401)
  assert.equal((await runRemote('c', 'x', '')).kind, 'login')
  assert.equal(calls.length, 3, 'no refresh loop')
}
globalThis.fetch = reply(429, { error: 'rate-limited', messageKo: '천천히' }, { 'Retry-After': '7' })
r = await runRemote('python', 'x', '')
assert.deepEqual([r.kind, r.messageKo, r.retryAfterSec], ['busy', '천천히', 7])
globalThis.fetch = reply(429, { error: 'busy' })
r = await runRemote('python', 'x', '')
assert.deepEqual([r.kind, r.retryAfterSec], ['busy', 5])
globalThis.fetch = reply(400, { error: 'rejected', messageKo: '안 돼요' })
assert.deepEqual(await runRemote('python', 'x', ''), { kind: 'rejected', messageKo: '안 돼요' })
globalThis.fetch = reply(502, 'bad gateway')
assert.equal((await runRemote('python', 'x', '')).kind, 'network')
globalThis.fetch = async () => { throw new TypeError('offline') }
assert.equal((await runRemote('python', 'x', '')).kind, 'network')
globalThis.fetch = async () => assert.fail('oversized input must not reach the network')
assert.equal((await runRemote('c', 'x'.repeat(65 * 1024), '')).kind, 'rejected')
assert.equal((await runRemote('c', 'x', 'y'.repeat(17 * 1024))).kind, 'rejected')
const ctl = new AbortController()
globalThis.fetch = async (_u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))
const pending = runRemote('c', 'x', '', ctl.signal)
ctl.abort()
await assert.rejects(pending, 'an aborted run rejects (the caller ignores it)')
{
  // Older Safari has neither AbortSignal.any nor AbortSignal.timeout: the run must still work and still be abortable.
  const { any, timeout } = AbortSignal
  AbortSignal.any = undefined
  AbortSignal.timeout = undefined
  try {
    globalThis.fetch = reply(200, { ok: true, stage: 'run', stdout: 'old\n', stderr: '', exitCode: 0, diagnostics: [] })
    assert.equal((await runRemote('c', 'x', '', new AbortController().signal)).output.stdout, 'old\n')
    globalThis.fetch = async (_u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))
    const c = new AbortController()
    const pending = runRemote('c', 'x', '', c.signal)
    c.abort()
    await assert.rejects(pending)
  } finally { AbortSignal.any = any; AbortSignal.timeout = timeout }
}
globalThis.fetch = realFetch
assert.equal(retryAfterSeconds(null, null, 5), 5)
assert.equal(retryAfterSeconds('999', null, 5), 60, 'capped at a minute')
assert.equal(retryAfterSeconds(null, { retryAfterSec: 2.2 }, 5), 3)

console.log('studyPlayground ok')
