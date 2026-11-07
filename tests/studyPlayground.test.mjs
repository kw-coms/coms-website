import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { classifyBlock, initialCode, stripAnnotations, needsStdin, applyTemplate } from '../src/pages/study/playground/classify.ts'
import { compareOutput, normalizeOutput } from '../src/pages/study/playground/compare.ts'
import { createStore, saveBlock, restoreBlock, blockKey, encodeShareHash, decodeShareHash, SHARE_MAX_CHARS } from '../src/pages/study/playground/storage.ts'
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
const mem = () => { const m = new Map(); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), get length() { return m.size }, key: (i) => [...m.keys()][i] ?? null } }
const backing = mem()
const store = createStore('c', backing)
const key = blockKey(3, 'int main(){}')
assert.equal(store.get(key), null)
store.put(key, { code: 'edited', at: 1 })
assert.equal(createStore('c', backing).get(key).code, 'edited', 'survives a new store instance (revisit)')
assert.equal(createStore('java', backing).get(key), null, 'per page')
assert.deepEqual([...backing.m.keys()], [`coms-study-playground:c:${key}`], 'one record per block, no page-wide object')
store.remove(key)
assert.equal(store.get(key), null)
assert.notEqual(blockKey(3, 'a'), blockKey(3, 'b'), 'the key follows the original text')
const blocked = createStore('c', { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } })
blocked.put('k', { code: 'v', at: 1 })
assert.equal(blocked.get('k'), null, 'blocked storage never throws')
assert.equal(createStore('c', null).get('k'), null)
backing.setItem('coms-study-playground:c:k', '{not json')
assert.equal(createStore('c', backing).get('k'), null, 'corrupt JSON is ignored')
backing.setItem('coms-study-playground:c', '{"k":{"code":"old page-wide format"}}')
assert.equal(createStore('c', backing).get('k'), null, 'the old page-wide key is ignored')
{
  // saveBlock / restoreBlock: the only write path of a draft.
  const st = createStore('p', mem())
  const state = (k, baseline = null) => ({ key: k, baseline, dirty: true })
  const A = state('a'), B = state('b')
  saveBlock(st, A, 'a1', 'a0'); saveBlock(st, B, 'b1', 'b0')
  assert.deepEqual([st.get('a').code, st.get('b').code], ['a1', 'b1'], 'different blocks do not interfere')
  assert.equal(A.baseline, 'a1'); assert.equal(A.dirty, false)
  saveBlock(st, A, 'a2', 'a0')
  assert.equal(st.get('a').backup, undefined, 'own previous save is not a backup')
  st.put('a', { code: 'a-elsewhere', at: 2 }) // another tab saved
  saveBlock(st, A, 'a3', 'a0')
  assert.deepEqual([st.get('a').code, st.get('a').backup], ['a3', 'a-elsewhere'], 'the other tab draft is kept as the backup')
  assert.equal(st.get('b').code, 'b1')
  // Restore: declined when another tab changed the draft; the record and the state stay untouched.
  A.dirty = true
  st.put('a', { code: 'a-elsewhere2', backup: 'a-old', at: 3 })
  assert.equal(restoreBlock(st, A, 'a-typing'), 'declined')
  assert.deepEqual(st.get('a'), { code: 'a-elsewhere2', backup: 'a-old', at: 3 }); assert.equal(A.dirty, true)
  // Accepted when nothing changed: the editor text (unsaved edits included) becomes the backup.
  A.baseline = 'a-elsewhere2'
  assert.equal(restoreBlock(st, A, 'a-typing'), 'restored')
  assert.equal(st.get('a').code, 'a-old'); assert.equal(st.get('a').backup, 'a-typing')
  assert.equal(A.baseline, 'a-old'); assert.equal(A.dirty, false)
  assert.equal(restoreBlock(st, B, 'x'), 'none', 'no backup, nothing to restore')
  // Back to the original code removes the record unless a backup still hangs on it.
  saveBlock(st, B, 'b0', 'b0'); assert.equal(st.get('b'), null); assert.equal(B.baseline, null)
  // An empty draft is a draft: saving shared code over it keeps '' as the backup, and restore gives '' back.
  const E = state('e'); saveBlock(st, E, '', 'e0')
  assert.equal(st.get('e').code, '')
  E.baseline = null; saveBlock(st, E, 'shared', 'e0')
  assert.equal(st.get('e').backup, '')
  assert.equal(restoreBlock(st, E, 'shared'), 'restored'); assert.equal(st.get('e').code, '')
  // The shared-view save: the draft being replaced becomes the backup.
  const C = state('c'); saveBlock(st, C, 'mine', 'c0')
  C.baseline = null; saveBlock(st, C, 'shared', 'c0')
  assert.deepEqual([st.get('c').code, st.get('c').backup], ['shared', 'mine'])
}
{
  // A write that fails (quota, private mode) keeps the edit pending; the next flush retries and succeeds.
  const inner = mem(); let failing = true
  const flaky = { ...inner, getItem: inner.getItem, setItem: (k, v) => { if (failing) throw new DOMException('full', 'QuotaExceededError'); inner.setItem(k, v) } }
  Object.defineProperty(flaky, 'length', { get: () => inner.m.size })
  const st = createStore('f', flaky)
  const b = { key: 'k', baseline: 'old', dirty: true }
  assert.equal(saveBlock(st, b, 'new', 'init'), false)
  assert.deepEqual([b.baseline, b.dirty], ['old', true], 'a failed write keeps baseline and dirty')
  failing = false
  assert.equal(saveBlock(st, b, 'new', 'init'), true)
  assert.deepEqual([b.baseline, b.dirty, st.get('k').code], ['new', false, 'new'], 'the retry succeeds')
  // Restore: a failed write changes nothing, the editor text is kept by the caller.
  st.put('k', { code: 'new', backup: 'older', at: 1 })
  failing = true
  assert.equal(restoreBlock(st, b, 'typing'), 'failed')
  assert.equal(st.get('k').code, 'new'); assert.equal(b.baseline, 'new')
  failing = false
  assert.equal(restoreBlock(st, b, 'typing'), 'restored')
}
{
  // Orphan prune: only this page's records of vanished blocks, and only when the record AND its `seen` are over 30 days old.
  const DAY = 24 * 60 * 60 * 1000, now = 100 * DAY
  const m = mem()
  const c = createStore('c', m), java = createStore('java', m)
  c.put('0-current', { code: 'mine', at: 1 })              // mounted but ancient: survives
  c.touch('0-current', 1)                                  // ... and so does its stale `seen`
  c.put('1-old', { code: 'x', at: now - 31 * DAY })        // orphan, stale record, no seen: removed
  c.put('2-recent', { code: 'x', at: now - 29 * DAY })     // fresh record: survives
  c.put('4-aged', { code: 'x', at: now - 40 * DAY }); c.touch('4-aged', now - DAY)          // stale record, fresh seen: survives
  c.put('5-fresh', { code: 'x', at: now - DAY }); c.touch('5-fresh', now - 40 * DAY)        // fresh record, stale seen: survives
  c.put('6-both', { code: 'x', backup: 'b', at: now - 40 * DAY }); c.touch('6-both', now - 40 * DAY) // both stale: removed with its seen key
  m.setItem('coms-study-playground:c:7-orphanseen:seen', String(now - 40 * DAY))            // orphan seen without a record: old
  m.setItem('coms-study-playground:c:3-junk', '{nope')     // unparseable counts as old
  java.put('1-old', { code: 'other page', at: 1 })         // another page's ancient record: never touched
  java.put('9-orphan', { code: 'other page', at: 1 })
  c.prune(['0-current'], now)
  assert.equal(c.get('0-current').code, 'mine'); assert.notEqual(m.getItem('coms-study-playground:c:0-current:seen'), null)
  for (const keep of ['2-recent', '4-aged', '5-fresh']) assert.equal(c.get(keep).code, 'x', keep)
  for (const gone of ['1-old', '6-both']) assert.equal(c.get(gone), null, gone)
  assert.equal(m.getItem('coms-study-playground:c:6-both:seen'), null, 'the seen key goes with the record')
  assert.equal(m.getItem('coms-study-playground:c:7-orphanseen:seen'), null)
  assert.equal(m.getItem('coms-study-playground:c:3-junk'), null)
  assert.equal(java.get('1-old').code, 'other page'); assert.equal(java.get('9-orphan').code, 'other page')
  java.prune([], now) // the other page prunes its own orphans only
  assert.equal(java.get('9-orphan'), null); assert.equal(c.get('2-recent').code, 'x')
}
{
  // The reviewer's case: tab A runs the old lesson version with an aged, clean draft; tab B (new version) prunes.
  const DAY = 24 * 60 * 60 * 1000, now = 100 * DAY
  const m = mem()
  const a = createStore('c', m), b = createStore('c', m)
  a.put('0-oldversion', { code: 'draft', backup: 'older draft', at: now - 40 * DAY })
  a.touch('0-oldversion', now) // A mounted it just now
  b.prune(['0-newversion'], now)
  assert.deepEqual([a.get('0-oldversion').code, a.get('0-oldversion').backup], ['draft', 'older draft'], 'a live tab\'s draft survives the other tab\'s prune')
}
{
  // A failing `seen` write (quota) never breaks saving and never marks anything dirty.
  const inner = mem()
  const flaky = { ...inner, setItem: (k, v) => { if (k.endsWith(':seen')) throw new DOMException('full', 'QuotaExceededError'); inner.setItem(k, v) } }
  const st = createStore('s', flaky)
  st.touch('0-a')
  const b = { key: '0-a', baseline: null, dirty: false }
  assert.equal(saveBlock(st, b, 'code', 'init'), true)
  assert.equal(st.get('0-a').code, 'code'); assert.equal(b.dirty, false)
}
{
  // A full storage: nothing is evicted, the save fails, the edit stays pending.
  const inner = mem()
  const tiny = { ...inner, setItem: (k, v) => { if (!inner.m.has(k) && inner.m.size >= 3) throw new DOMException('full', 'QuotaExceededError'); inner.setItem(k, v) } }
  Object.defineProperty(tiny, 'length', { get: () => inner.m.size })
  const q = createStore('q', tiny)
  for (let i = 0; i < 3; i++) q.put(`b${i}`, { code: 'x', at: 1 })
  const b = { key: 'fresh', baseline: null, dirty: true }
  assert.equal(saveBlock(q, b, 'z', 'init'), false)
  assert.equal(inner.m.size, 3, 'no record was deleted'); assert.equal(b.dirty, true)
  assert.equal(q.get('b0').code, 'x')
}
{
  // A failed removal (unavailable or throwing) keeps baseline and dirty.
  const b = { key: 'k', baseline: 'old', dirty: true }
  for (const st of [createStore('r', null), createStore('r', { getItem: () => null, setItem() {} }), createStore('r', { getItem: () => null, setItem() {}, removeItem() { throw new Error('blocked') } })]) {
    assert.equal(saveBlock(st, b, 'init', 'init'), false)
    assert.deepEqual([b.baseline, b.dirty], ['old', true])
  }
}

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
const reply = (status, body, headers = {}) => async (_url, init) => { if (init.body) reply.last = JSON.parse(init.body); return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } }) }
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
globalThis.fetch = reply(403, {})
assert.equal((await runRemote('python', 'x', '')).kind, 'login', 'a plain 403 still asks to sign in')
globalThis.fetch = reply(403, { error: 'rejected', messageKo: '이 사이트에서만 코드를 실행할 수 있어요.' })
assert.deepEqual(await runRemote('python', 'x', ''), { kind: 'rejected', messageKo: '이 사이트에서만 코드를 실행할 수 있어요.' }, 'the cross-site refusal explains itself')
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
  // A stalled session refresh must never hang the run button (the refresh is shared with the whole page).
  const okBody = () => new Response(JSON.stringify({ ok: true, stage: 'run', stdout: 'ok\n', stderr: '', exitCode: 0, diagnostics: [] }))
  const realTimeout = AbortSignal.timeout.bind(AbortSignal)
  const keepAlive = setInterval(() => {}, 20) // AbortSignal.timeout timers are unref'd: keep node running while we wait for them

  // (a) the refresh never answers (and ignores the abort): runRemote still settles by a deadline, in Korean
  AbortSignal.timeout = (ms) => realTimeout(Math.min(ms, 40))
  try {
    let refreshes = 0
    globalThis.fetch = async (url) => {
      if (url === '/api/auth/refresh') { refreshes++; return new Promise(() => {}) }
      return new Response('{}', { status: 401 })
    }
    const stalled = await runRemote('c', 'x', '')
    assert.equal(stalled.kind, 'network')
    assert.match(stalled.messageKo, /로그인 상태를 확인하지 못했어요/)
    assert.equal(refreshes, 1)

    // (c) the stalled refresh times out on its own (scaled to 40 ms here), so the next run can refresh again and succeed
    await new Promise((resolve) => setTimeout(resolve, 100))
    let healthy = false
    globalThis.fetch = async (url, init) => {
      if (url === '/api/auth/refresh') { refreshes++; return new Response(null, { status: 204 }) }
      healthy = healthy || init?.method === 'POST' && refreshes >= 2
      return refreshes >= 2 ? okBody() : new Response('{}', { status: 401 })
    }
    assert.equal((await runRemote('c', 'x', '')).kind, 'output')
    assert.equal(refreshes, 2, 'the second run started a new refresh')
  } finally { AbortSignal.timeout = realTimeout }

  // (b) caller A aborts while the shared refresh is pending; caller B still gets the refreshed session
  let release
  let refreshCalls = 0
  let posts = 0
  globalThis.fetch = async (url) => {
    if (url === '/api/auth/refresh') { refreshCalls++; await new Promise((resolve) => { release = resolve }); return new Response(null, { status: 204 }) }
    posts++
    return posts <= 2 ? new Response('{}', { status: 401 }) : okBody()
  }
  const aborter = new AbortController()
  const a = runRemote('c', 'a', '', aborter.signal)
  const b = runRemote('c', 'b', '')
  await new Promise((resolve) => setTimeout(resolve, 20))
  aborter.abort()
  await assert.rejects(a, { name: 'AbortError' })
  release()
  assert.equal((await b).kind, 'output')
  assert.equal(refreshCalls, 1, 'A and B shared one refresh')
  clearInterval(keepAlive)
}
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
