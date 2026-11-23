import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../../contexts/useAuth'
import { sessionGeneration } from '../../../services/apiClient'
import { requestJudgeClub } from './clubApi'
import { numberedExercises } from './problems'
import type { Exercise } from './types'

export const CLUB_PROBLEM_START = 90_000
type PublishedProblem = { number: number; problem: Exercise }

export function usePublishedProblems(enabled = true) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['judge-published-problems', sessionGeneration()],
    queryFn: ({ signal }) => requestJudgeClub<{ problems: PublishedProblem[] }>({ action: 'problem-catalog' }, signal),
    enabled: enabled && Boolean(user),
    staleTime: 30_000,
    retry: false,
  })
}

export function useNumberedCatalog(): PublishedProblem[] {
  const { data } = usePublishedProblems()
  return useMemo(() => data?.problems?.length ? [...numberedExercises, ...data.problems] : numberedExercises, [data])
}
