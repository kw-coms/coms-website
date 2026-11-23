import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { algorithmChallenges, algorithmProblems } from '../src/pages/study/exercises/algorithmChallenges.ts'
import { exercisesFor, findNumberedExercise, numberedExercises } from '../src/pages/study/exercises/problems/index.ts'
import { exercisePath, numberedProblemNumber } from '../src/pages/study/exercises/problemNumbers.ts'
import { JUDGE_LANGUAGES } from '../src/pages/study/exercises/types.ts'
import { dailyCodingVariant } from '../src/pages/study/exercises/judgeLanguages.ts'
import { loadNumberedProblems } from '../runner/numbered-judge.mjs'

const challenges = (stamp) => algorithmChallenges(Date.parse(stamp))

test('the daily challenge rotates only at midnight in Korea', () => {
  const before = challenges('2026-11-23T14:59:59.999Z')
  const after = challenges('2026-11-23T15:00:00.000Z')
  assert.equal(before.nextMidnight, Date.parse('2026-11-23T15:00:00Z'))
  assert.equal(before.daily.dates, '11월 23일')
  assert.equal(after.daily.dates, '11월 24일')
  assert.notEqual(before.daily.problem.id, after.daily.problem.id)
  assert.equal(before.weekly.problem.id, after.weekly.problem.id)
  assert.deepEqual(after, challenges('2026-11-24T11:00:00Z'))
})

test('the weekly challenge rotates Monday at midnight in Korea, including across years', () => {
  const sunday = challenges('2027-01-03T14:59:59.999Z')
  const monday = challenges('2027-01-03T15:00:00.000Z')
  assert.equal(sunday.weekly.dates, '12월 28일 – 1월 3일')
  assert.equal(monday.weekly.dates, '1월 4일 – 1월 10일')
  assert.notEqual(sunday.weekly.problem.id, monday.weekly.problem.id)
  assert.ok(sunday.weekly.problem.level >= 4)
  assert.ok(monday.daily.problem.level <= 3)
})

test('every algorithm challenge uses an existing problem offered in each of the three languages', () => {
  assert.ok(algorithmProblems.length > 7)
  for (const lang of ['c', 'java', 'python']) {
    for (const { id } of algorithmProblems) {
      const registered = findNumberedExercise(String(numberedProblemNumber(id)))
      assert.ok(registered?.problem.langs.includes(lang), `${id} is playable in ${lang}`)
    }
  }
})

test('published C, Java and Python exercises each have one shared, distinct problem number', () => {
  const ids = new Set(['c', 'java', 'python'].flatMap((lang) => exercisesFor(lang).map(({ id }) => id)))
  assert.deepEqual(new Set(numberedExercises.filter(({ problem }) => problem.sourceId === undefined).map(({ problem }) => problem.id)), ids)
  assert.equal(new Set(numberedExercises.map(({ number }) => number)).size, numberedExercises.length)
  assert.equal(findNumberedExercise('1001')?.problem.id, 'core-sum-difference')
  assert.equal(findNumberedExercise('1099')?.problem.id, 'py-zip-attendance')
  assert.equal(findNumberedExercise('1100')?.problem.id, 'dc-range-sum')
  assert.equal(findNumberedExercise('1111')?.problem.id, 'dc-shortest-path')
  for (const { number, problem } of numberedExercises) {
    assert.ok(Number.isSafeInteger(number) && number >= 1001)
    for (const lang of problem.langs) assert.equal(exercisePath(lang, problem.id), `/study/algorithms/${number}?lang=${lang}`)
  }
  assert.equal(exercisePath('web', 'web-html-headings'), '/study/web/practice/web-html-headings')
  assert.equal(findNumberedExercise('01001'), undefined)
})

test('new DailyCoding exercises use distinct test inputs and are available for shared challenges', () => {
  const imported = numberedExercises.filter(({ problem }) => problem.id.startsWith('dc-'))
  assert.ok(imported.length >= 12)
  for (const { problem } of imported) {
    assert.deepEqual(new Set(problem.langs), new Set(JUDGE_LANGUAGES))
    const cases = [...problem.examples, ...problem.tests].map(({ stdin }) => stdin.trim())
    assert.equal(new Set(cases).size, cases.length, `${problem.id} repeats a test input`)
    assert.ok(algorithmProblems.some(({ id }) => id === problem.id))
  }
})

test('published archive and runner cover the same numbers and languages without shipping raw archive cases to the browser', () => {
  const archivePath = new URL('../src/pages/study/exercises/dailyCodingArchive.json', import.meta.url)
  const rows = JSON.parse(readFileSync(archivePath, 'utf8'))
  assert.equal(rows.length, 598)
  assert.ok(rows.every((row) => !('testcases' in row) && !('tests' in row) && !('solution' in row)))
  assert.equal(findNumberedExercise('910001')?.problem.sourceId, 900001)
  const runner = loadNumberedProblems(new URL('../runner/numbered-problems.json', import.meta.url))
  assert.equal(Object.keys(runner).length, numberedExercises.length)
  for (const { number, problem } of numberedExercises) {
    assert.deepEqual(runner[number].langs, problem.langs, `language mismatch on ${number}`)
  }
  assert.ok(rows.some((row) => dailyCodingVariant(row.sourceId) === 10))
  assert.ok(rows.filter((row) => dailyCodingVariant(row.sourceId)).every((row) =>
    row.title.endsWith(`연습 ${dailyCodingVariant(row.sourceId)}`) && !row.topics.some(tag => tag.startsWith('기업:'))))
  assert.ok(algorithmProblems.every((problem) => (dailyCodingVariant(problem.sourceId) ?? 1) === 1))
})
