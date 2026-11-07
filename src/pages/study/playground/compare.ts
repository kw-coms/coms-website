// "예상 출력과 비교": whitespace-insensitive comparison of the real stdout with the page's expected output.

export const normalizeOutput = (text: string) => text.replace(/\s+/g, ' ').trim()

export interface DiffLine { kind: 'same' | 'add' | 'del'; text: string }
export interface Comparison { match: boolean; diff: DiffLine[] }

const lines = (text: string) => text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)

/** Line diff (LCS) of expected -> actual: 'del' = expected but missing, 'add' = printed but not expected. */
export function compareOutput(actual: string, expected: string): Comparison {
  const match = normalizeOutput(actual) === normalizeOutput(expected)
  const a = lines(expected)
  const b = lines(actual)
  const n = a.length
  const m = b.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  const diff: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { diff.push({ kind: 'same', text: a[i] }); i++; j++ }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) diff.push({ kind: 'del', text: a[i++] })
    else diff.push({ kind: 'add', text: b[j++] })
  }
  while (i < n) diff.push({ kind: 'del', text: a[i++] })
  while (j < m) diff.push({ kind: 'add', text: b[j++] })
  return { match, diff }
}
