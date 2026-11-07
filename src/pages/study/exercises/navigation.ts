import type { Exercise, WebExercise, ExLang } from './types'
import { chapters } from './chapters'

export type Problem = Exercise | WebExercise
export { chapters }
export const chapterOf = (problem: Problem, studyId: string): string => typeof problem.chapter === 'string' ? problem.chapter : problem.chapter[studyId as ExLang] ?? ''
export function problemStatus(entry?: { solved: boolean; tries: number; viewed?: boolean }): string {
  return entry?.solved ? '✓ 해결' : entry?.viewed ? '👀 답 확인' : entry?.tries ? '◐ 도전 중' : 'new'
}

/** Recommend within the furthest opened/finished chapter, then move forward when it is complete. */
export function recommendProblem(problems: Problem[], studyId: string, progress: Record<string, { solved: boolean; lastAt: number }>, completed: string[] = []): Problem | undefined {
  const order = chapters[studyId] ?? []
  const rank = (problem: Problem) => Math.max(0, order.indexOf(chapterOf(problem, studyId)))
  const reached = Math.max(0, ...completed.map((id) => order.indexOf(id)), ...problems.filter((p) => progress[p.id]?.lastAt).map(rank))
  const unsolved = problems.filter((p) => !progress[p.id]?.solved)
  return unsolved.filter((p) => rank(p) === reached).sort((a, b) => a.level - b.level)[0]
    ?? unsolved.sort((a, b) => rank(a) - rank(b) || a.level - b.level)[0]
}
