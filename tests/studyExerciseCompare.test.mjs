import assert from 'node:assert/strict'
import { matchesOutput } from '../src/pages/study/exercises/grade.ts'
import { compare } from '../scripts/verify-exercises.mjs'

const cases = [
  ['final newline', 'one\n', 'one', 'lines', true],
  ['trailing blank line matters', 'one\n\n', 'one', 'lines', false],
  ['leading spaces matter', ' one\ntwo', 'one\ntwo', 'lines', false],
  ['trailing spaces matter', 'one \ntwo', 'one\ntwo', 'lines', false],
  ['internal spaces matter', 'one  two', 'one two', 'lines', false],
  ['internal blank line matters', 'one\n\ntwo', 'one\ntwo', 'lines', false],
  ['CRLF', 'one\r\ntwo\r\n', 'one\ntwo\n', 'lines', true],
  ['tokens ignore whitespace', ' \tone\r\n\n two \n', 'one two', 'tokens', true],
  ['empty token streams', ' \n\t', '', 'tokens', true],
  ['tokens are literal', '-0', '0', 'tokens', false],
  ['hex is not a decimal float', '0x10', '16', { float: 0.01 }, false],
  ['absolute tolerance', '0.00005', '0', { float: 0.0001 }, true],
  ['relative tolerance', '1000.05', '1000', { float: 0.0001 }, true],
  ['outside tolerance', '1000.2', '1000', { float: 0.0001 }, false],
  ['negative zero', '-0', '0', { float: 0 }, true],
  ['decimal exponent', '+1.6e1', '16', { float: 0 }, true],
  ['NaN literal', 'NaN', 'NaN', { float: 0.1 }, true],
  ['Infinity literal', 'Infinity', 'Infinity', { float: 0.1 }, true],
  ['nonfinite is not numeric', 'Infinity', '1e999', { float: 0.1 }, false],
  ['overflowing decimal is not finite', '1e999', '1e999', { float: 0.1 }, false],
  ['NaN differs', 'NaN', 'nan', { float: 0.1 }, false],
]
for (const [name, actual, expected, mode, want] of cases) {
  for (const [consumer, fn] of [['grader', matchesOutput], ['verifier', compare]]) {
    assert.equal(fn(actual, expected, mode), want, `${consumer}: ${name}`)
  }
}
console.log(`studyExerciseCompare: ${cases.length * 2} assertions passed`)
