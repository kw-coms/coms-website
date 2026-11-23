import { archiveExercises, sharedExercises } from './problems'
import { dailyCodingVariant } from './judgeLanguages'

const DAY_MS = 86_400_000
const KST_OFFSET_MS = 9 * 3_600_000
const FIRST_MONDAY = 4 // 1970-01-05, measured from the Unix epoch in calendar days.

export const algorithmProblems = [...sharedExercises, ...archiveExercises].filter((problem) => {
  const variant = dailyCodingVariant(problem.sourceId)
  return problem.level >= 2 && (variant === undefined || variant === 1)
})
const dailyProblems = algorithmProblems.filter((problem) => problem.level <= 3)
const weeklyProblems = algorithmProblems.filter((problem) => problem.level >= 4)

const cycleIndex = (index: number, length: number) => ((index % length) + length) % length
const displayDate = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', timeZone: 'UTC' })

export function algorithmChallenges(now: number) {
  const day = Math.floor((now + KST_OFFSET_MS) / DAY_MS)
  const week = Math.floor((day - FIRST_MONDAY) / 7)
  const monday = FIRST_MONDAY + week * 7

  return {
    nextMidnight: (day + 1) * DAY_MS - KST_OFFSET_MS,
    daily: {
      problem: dailyProblems[cycleIndex(day, dailyProblems.length)],
      dates: displayDate.format(day * DAY_MS),
    },
    weekly: {
      problem: weeklyProblems[cycleIndex(week, weeklyProblems.length)],
      dates: `${displayDate.format(monday * DAY_MS)} – ${displayDate.format((monday + 6) * DAY_MS)}`,
    },
  }
}
