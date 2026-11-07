import assert from 'node:assert/strict'
import { JSDOM, VirtualConsole } from 'jsdom'
import { buildExerciseDoc } from '../src/pages/study/exercises/web.ts'

const files = { html: '<p>hello</p>', css: 'p { color: red }', js: 'console.log("hi")' }
const doc = buildExerciseDoc(files, [{ name: '치환 메타문자', code: 'return "$&" === "$&"' }], 'fixed-nonce')
assert.match(doc, /fixed-nonce/)
assert.match(doc, /return "\$&" === "\$&"/, 'replacement text must not expand JavaScript replacement tokens')
assert.match(doc, /return functions\[i\]\(t\)/, 'CSP forbids dynamic evaluation')
assert.doesNotMatch(doc, /new Function\(/)
assert.match(doc, /document\.querySelector\(sel\)/)

const escaped = buildExerciseDoc(files, [{ name: '닫힘', code: 'return "</script>"' }], 'n')
assert.match(escaped, /return "<\\\/script>"/, 'check source must not close the inline grader script')

async function execute(files, checks) {
  const dom = new JSDOM(buildExerciseDoc(files, checks, 'test-nonce'), { runScripts: 'dangerously', url: 'https://example.test/', virtualConsole: new VirtualConsole() })
  try {
    return await Promise.race([
      new Promise((resolve) => dom.window.addEventListener('message', (event) => {
        if (event.data?.__exercise) resolve(event.data)
      })),
      new Promise((_, reject) => setTimeout(() => reject(Error('grader did not post results')), 2600)),
    ])
  } finally { dom.window.close() }
}

const actual = await execute({
  html: '<button id="b">눌러요</button><input id="i"><p id="out">처음</p>',
  css: '#out { color: red }',
  js: 'console.log("준비"); document.querySelector("#b").onclick = () => { document.querySelector("#out").textContent = "완료" }',
}, [
  { name: 'DOM과 이벤트', code: 't.click("#b"); t.type("#i", "값"); return t.$("#i").value === "값" && t.text("#out") === "완료"' },
  { name: '스타일과 로그', code: 'return t.style("#out", "color") === "rgb(255, 0, 0)" && t.log.includes("준비")' },
  { name: '실패 문구', code: 'return "조건 미달"' },
])
assert.equal(actual.nonce, 'test-nonce')
assert.deepEqual(Array.from(actual.results, (r) => [r.name, r.passed, r.message]), [
  ['DOM과 이벤트', true, '통과'], ['스타일과 로그', true, '통과'], ['실패 문구', false, '조건 미달'],
])

const slow = await execute(files, [{ name: '제한 시간', code: 'await new Promise(() => {}); return true' }])
assert.deepEqual(Array.from(slow.results, (r) => [r.passed, r.message]), [[false, '검사 시간이 초과됐어요.']])
