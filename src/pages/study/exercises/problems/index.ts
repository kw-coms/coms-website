import type { Exercise, WebExercise } from '../types'
import { numberedProblemNumber } from '../problemNumbers'
import core from './core'
import c from './c'
import java from './java'
import python from './python'
import web from './web'
import dailyCodingArrays from './dailyCodingArrays'
import dailyCodingGraphs from './dailyCodingGraphs'
import { sampleExercises, sampleWebExercises } from '../__fixtures__/sample'

// Build-only opt-in; production does not expose this switch to clients.
declare const __STUDY_EXERCISE_FIXTURES__: boolean
const fixtures = typeof __STUDY_EXERCISE_FIXTURES__ !== 'undefined' && __STUDY_EXERCISE_FIXTURES__
export const sharedExercises = [...core, ...dailyCodingArrays, ...dailyCodingGraphs]
const programs: Exercise[] = [...core, ...c, ...java, ...python, ...dailyCodingArrays, ...dailyCodingGraphs, ...(fixtures ? sampleExercises : [])]
export const webExercises: WebExercise[] = [...web, ...(fixtures ? sampleWebExercises : [])]
const all = [...programs, ...webExercises]

export const numberedExercises = programs.flatMap((problem) => {
  const number = numberedProblemNumber(problem.id)
  return number === undefined ? [] : [{ number, problem }]
}).sort((a, b) => a.number - b.number)

export function findNumberedExercise(number: string) {
  return numberedExercises.find((entry) => String(entry.number) === number)
}

export function exercisesFor(studyId: string): (Exercise | WebExercise)[] {
  if (studyId === 'web') return webExercises
  if (studyId === 'c' || studyId === 'java' || studyId === 'python')
    return programs.filter((problem) => problem.langs.includes(studyId))
  return []
}

export function findExercise(id: string): Exercise | WebExercise | undefined {
  return all.find((problem) => problem.id === id)
}

export const exerciseCounts = {
  c: exercisesFor('c').length,
  java: exercisesFor('java').length,
  python: exercisesFor('python').length,
  web: webExercises.length,
}
