import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { chooseCodingLanguage, problemStarter, readCodingSettings, saveCodingSettings } from '../src/pages/study/exercises/codingSettings.ts'
import { MAX_CODE_BYTES } from '../src/pages/study/playground/runner.ts'

globalThis.localStorage = new JSDOM('', { url: 'https://coms.test' }).window.localStorage
const appearance = { palette: 'paper', fontSize: 18, wrap: true }
const settings = { preferredLanguage: 'cpp', templates: { cpp: 'int main() {}', python: 'import sys\n' }, appearance }

test('coding defaults are per member and retain different templates per language', () => {
  localStorage.clear()
  localStorage.setItem('coms-judge-editor:v1', JSON.stringify(appearance))
  assert.equal(saveCodingSettings('member-one', settings), true)
  assert.deepEqual(readCodingSettings('member-one'), settings)
  assert.deepEqual(readCodingSettings('member-two'), { preferredLanguage: null, templates: {}, appearance: settings.appearance })
  assert.equal(saveCodingSettings(undefined, settings), false)
})

test('oversized UTF-8 templates do not replace saved code', () => {
  assert.equal(saveCodingSettings('size-test-member', settings), true)
  assert.equal(saveCodingSettings('size-test-member', { ...settings, templates: { cpp: '가'.repeat(MAX_CODE_BYTES / 2) } }), false)
  assert.deepEqual(readCodingSettings('size-test-member'), settings)
})

test('requested course or URL language wins and unsupported preferred languages fall back', () => {
  assert.equal(chooseCodingLanguage(['python', 'cpp'], 'python', 'cpp', 'python'), 'python')
  assert.equal(chooseCodingLanguage(['python', 'cpp'], null, 'cpp', 'python'), 'cpp')
  assert.equal(chooseCodingLanguage(['java'], null, 'cpp', 'java'), 'java')
})

test('personal templates start stdio but retain authored function signatures', () => {
  const problem = { mode: 'stdio', starter: { cpp: 'problem starter' } }
  assert.equal(problemStarter(problem, 'cpp', settings), 'int main() {}')
  assert.equal(problemStarter({ ...problem, mode: 'function' }, 'cpp', settings), 'problem starter')
  assert.equal(problemStarter({ mode: 'stdio', starter: {} }, 'java', settings), '')
})
