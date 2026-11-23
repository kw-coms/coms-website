import assert from 'node:assert/strict'
import test from 'node:test'
import { algorithmChallenges, algorithmProblems } from '../src/pages/study/exercises/algorithmChallenges.ts'
import { exercisesFor } from '../src/pages/study/exercises/problems/index.ts'

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
    const registered = new Set(exercisesFor(lang).map(({ id }) => id))
    for (const { id } of algorithmProblems) assert.ok(registered.has(id), `${id} is playable in ${lang}`)
  }
})
