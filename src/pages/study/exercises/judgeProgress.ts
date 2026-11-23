import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../../contexts/useAuth'
import { sessionGeneration } from '../../../services/apiClient'
import { numberedProblemPath } from './problemNumbers'

export interface JudgeProgress { solved: number[]; solvedToday: number; streak: number }

export function readJudgeProgress(value: unknown): JudgeProgress | null {
  if (!value || typeof value !== 'object') return null
  const { solved, solvedToday, streak } = value as JudgeProgress
  if (!Array.isArray(solved) || !solved.every((number) => Number.isSafeInteger(number) && number > 0) ||
      !Number.isSafeInteger(solvedToday) || solvedToday < 0 || !Number.isSafeInteger(streak) || streak < 0) return null
  return { solved, solvedToday, streak }
}

export function useJudgeProgress(enabled: boolean): JudgeProgress | null {
  const { user } = useAuth()
  const query = useQuery({
    queryKey: ['judge-progress', sessionGeneration()],
    enabled: enabled && Boolean(user),
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async ({ signal }) => {
      const response = await fetch('/study/api/progress', { credentials: 'same-origin', cache: 'no-store', signal })
      return response.ok ? readJudgeProgress(await response.json()) : null
    },
  })
  return enabled && user ? query.data ?? null : null
}

export async function shareJudgeResult({ number, title, progress }: {
  number?: number; title?: string; progress: JudgeProgress
}): Promise<void> {
  const path = number === undefined ? '/study/algorithms' : numberedProblemPath(number)
  const url = new URL(path, window.location.origin).href
  const text = [
    number === undefined ? 'COM’s 알고리즘 풀이 기록' : `COM’s ${number}번 ${title ?? ''} 해결`,
    `누적 ${progress.solved.length}문제 해결${progress.streak > 0 ? ` · ${progress.streak}일 연속 풀이` : ''}`,
  ].join('\n')
  if (navigator.share) { await navigator.share({ text, url }); return }
  await navigator.clipboard.writeText(`${text}\n${url}`)
}
