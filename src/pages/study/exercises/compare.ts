import type { Exercise } from './types'

/**
 * Spec §3 output rules, shared by the UI grader and answer verifier.
 * tokens: ignore all whitespace, compare literal tokens.
 * lines: normalize CRLF/CR, remove ONE final newline;
 * preserve all spaces and remaining (including trailing) blank lines.
 * float: tokenize as above; decimal/exponent numbers must be finite and satisfy
 * |actual - expected| <= tolerance * max(1, |expected|). Signed zero is equal.
 * Other tokens (hex, NaN, Infinity included) compare literally, never numerically.
 * Keep this module erasable-types-only for the runner's Node type stripping.
 */
export function matchesOutput(actual: string, expected: string, mode: Exercise['compare'] = 'tokens'): boolean {
  if (mode === 'lines') {
    const normalize = (text: string) => text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n')
    return JSON.stringify(normalize(actual)) === JSON.stringify(normalize(expected))
  }
  const tokens = (text: string) => text.trim().split(/\s+/u).filter(Boolean)
  const a = tokens(actual)
  const b = tokens(expected)
  if (a.length !== b.length) return false
  const decimal = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/
  return a.every((token, index) => {
    if (typeof mode !== 'object' || !decimal.test(token) || !decimal.test(b[index])) return token === b[index]
    const left = Number(token)
    const right = Number(b[index])
    return Number.isFinite(left) && Number.isFinite(right)
      && Math.abs(left - right) <= mode.float * Math.max(1, Math.abs(right))
  })
}
