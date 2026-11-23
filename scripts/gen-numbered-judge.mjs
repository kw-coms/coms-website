// Run with node --import tsx scripts/gen-numbered-judge.mjs [path/to/DailyCoding/problemCatalog.js].
// Use the pinned public DailyCoding source. No operational credentials or private DB cases are needed.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import core from '../src/pages/study/exercises/problems/core.ts'
import c from '../src/pages/study/exercises/problems/c.ts'
import java from '../src/pages/study/exercises/problems/java.ts'
import python from '../src/pages/study/exercises/problems/python.ts'
import arrays from '../src/pages/study/exercises/problems/dailyCodingArrays.ts'
import graphs from '../src/pages/study/exercises/problems/dailyCodingGraphs.ts'
import { JUDGE_LANGUAGES, MAX_CASES } from '../src/pages/study/exercises/types.ts'
import { dailyCodingNumber, dailyCodingVariant, numberedLanguages } from '../src/pages/study/exercises/judgeLanguages.ts'
import { numberedProblemNumber } from '../src/pages/study/exercises/problemNumbers.ts'

const metadataPath = new URL('../src/pages/study/exercises/dailyCodingArchive.json', import.meta.url)
const bankPath = new URL('../runner/numbered-problems.json', import.meta.url)
const tierGroups = {
  bronze: [0, 1, 3], silver: [5, 1, 5], gold: [10, 2, 8],
  platinum: [15, 4, 9], diamond: [20, 7, 9], ruby: [25, 1, 9],
}

const productionSort = {
  id: 900001, title: '정렬 배틀: 숫자 정렬', tier: 'bronze', difficulty: 3, tags: ['정렬', '배열'],
  desc: '정수 N개를 오름차순으로 정렬해 출력하세요.',
  inputDesc: '첫 줄에 N(1 ≤ N ≤ 1000), 둘째 줄에 절댓값이 10억 이하인 정수 N개가 주어집니다.',
  outputDesc: '정렬된 정수를 공백으로 구분해 출력합니다.',
  hint: '사용하는 언어의 정수 정렬 기능을 활용해 보세요.',
  examples: [{ input: '5\n5 1 4 2 3\n', output: '1 2 3 4 5' }],
  // The public statement was reviewed on the server. These cases are authored for COM’s.
  testcases: [
    { input: '1\n0\n', output: '0' },
    { input: '6\n9 -2 9 0 -10 -2\n', output: '-10 -2 -2 0 9 9' },
    { input: '4\n4 3 2 1\n', output: '1 2 3 4' },
    { input: '4\n0 -1000000000 1000000000 0\n', output: '-1000000000 0 0 1000000000' },
  ],
}

function difficultyTier(problem) {
  if (problem.tier === 'master') return 31
  const group = tierGroups[problem.tier]
  if (!group || !Number.isFinite(problem.difficulty)) return 0
  const [base, min, max] = group
  return base + 1 + Math.round(4 * (Math.min(max, Math.max(min, problem.difficulty)) - min) / (max - min))
}

const asCase = ({ input, output }) => ({ stdin: input, expected: output })
const normalize = value => value.trim().split(/\s+/).join(' ')

function selectCases(problem) {
  const unique = new Map()
  for (const test of [...problem.testcases, ...problem.examples].map(asCase)) {
    if (typeof test.stdin !== 'string' || typeof test.expected !== 'string') throw new Error(`Non-text case: ${problem.id}`)
    const key = test.stdin.replace(/\r\n/g, '\n').replace(/\n$/, '')
    const previous = unique.get(key)
    if (previous && normalize(previous.expected) !== normalize(test.expected)) {
      throw new Error(`Conflicting outputs for one input: ${problem.id}`)
    }
    if (!previous) unique.set(key, test)
  }
  const cases = [...unique.values()].slice(0, MAX_CASES)
  const bytes = cases.map(({ stdin, expected }) => {
    if (Buffer.byteLength(expected) > 8192) throw new Error(`Case output exceeds runner limit: ${problem.id}`)
    return Buffer.byteLength(stdin)
  })
  if (!cases.length || bytes.some(size => size > 16384) || bytes.reduce((a, b) => a + b, 0) > 32768) {
    throw new Error(`Cases exceed runner limits: ${problem.id}`)
  }
  return cases
}

function lineArray(rows) {
  return '[\n' + rows.map(row => '  ' + JSON.stringify(row)).join(',\n') + '\n]\n'
}

const catalogPath = process.argv[2]
let archive
let archiveBank
if (catalogPath) {
  const { PROBLEMS } = await import(pathToFileURL(resolve(catalogPath)).href)
  // Match the original seeder's first definition on repeated ids.
  const selected = new Map()
  for (const problem of [...PROBLEMS, productionSort]) {
    if ((problem.problemType ?? 'coding') === 'coding' && !selected.has(problem.id)) selected.set(problem.id, problem)
  }
  const sorted = [...selected.values()].sort((a, b) => a.id - b.id)
  archive = sorted.map(p => {
    const variant = dailyCodingVariant(p.id)
    const base = variant ? selected.get(p.id - variant + 1) ?? p : p
    return {
      sourceId: p.id, title: variant ? `${p.title.slice(0, p.title.lastIndexOf(' - '))} · 연습 ${variant}` : p.title,
      difficultyTier: difficultyTier(base), topics: variant ? p.tags.filter(tag => !tag.startsWith('기업:') && tag !== '학습팩') : p.tags,
      statement: variant ? p.desc.split('\n\n')[0] : p.desc,
      inputSpec: p.inputDesc, outputSpec: p.outputDesc, hint: p.hint, examples: p.examples.map(asCase),
    }
  })
  archiveBank = Object.fromEntries(sorted.map(p => [dailyCodingNumber(p.id), { langs: JUDGE_LANGUAGES, cases: selectCases(p) }]))
} else {
  archive = JSON.parse(readFileSync(metadataPath, 'utf8'))
  const previous = JSON.parse(readFileSync(bankPath, 'utf8'))
  archiveBank = Object.fromEntries(archive.map(({ sourceId }) => {
    const number = dailyCodingNumber(sourceId)
    if (!previous[number]) throw new Error(`Missing archived judge entry ${number}`)
    return [number, previous[number]]
  }))
}

const nativeBank = Object.fromEntries([...core, ...c, ...java, ...python, ...arrays, ...graphs].map(p => {
  const number = numberedProblemNumber(p.id)
  if (number === undefined) throw new Error(`Missing numbered problem: ${p.id}`)
  return [number, {
    langs: numberedLanguages(p), cases: [...p.examples, ...p.tests].map(({ stdin, expected }) => ({ stdin, expected })),
    compare: p.compare, harness: p.harness,
  }]
}))

const bank = { ...nativeBank, ...archiveBank }
if (Object.keys(bank).length !== Object.keys(nativeBank).length + archive.length) throw new Error('COM’s problem number collision')
if (catalogPath) writeFileSync(metadataPath, lineArray(archive))
writeFileSync(bankPath, '{\n' + Object.entries(bank).map(([n, p]) => `  "${n}": ${JSON.stringify(p)}`).join(',\n') + '\n}\n')
console.log(`Numbered judge: ${Object.keys(nativeBank).length} study problems, ${archive.length} DailyCoding problems.`)
