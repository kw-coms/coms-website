import { request, type ApiError } from '../../../services/apiClient'
import { requestJudgeClub } from './clubApi'
import type { ExLang } from './types'

export type ProblemStatus = 'draft' | 'pending' | 'changes' | 'published'
export type ProblemCase = { stdin: string; expected: string }

export type ProblemDraft = {
  title: string
  statement: string
  inputSpec: string
  outputSpec: string
  difficultyTier: number
  topics: string[]
  examples: ProblemCase[]
  tests: ProblemCase[]
  reference: { lang: ExLang; code: string }
  compare: 'tokens' | 'lines'
}

export type ProblemSummary = {
  id: string
  title: string
  status: ProblemStatus
  revision: number
  updatedAt: number
  number: number | null
  verified: boolean
  owned: boolean
}

export type ProblemProposal = ProblemSummary & {
  draft: ProblemDraft
  note: string
  verification: { passed: number; total: number; solved: boolean } | null
}

export type VerificationResult = {
  proposal: ProblemProposal
  judge: { passed: number; total: number; solved: boolean; verdicts: string[]; compileError: boolean; stderr?: string }
}

export const emptyProblemDraft = (): ProblemDraft => ({
  title: '', statement: '', inputSpec: '', outputSpec: '', difficultyTier: 0,
  topics: [], examples: [{ stdin: '', expected: '' }],
  tests: Array.from({ length: 5 }, () => ({ stdin: '', expected: '' })),
  reference: { lang: 'cpp', code: '' }, compare: 'tokens',
})

export function authoringAction<T>(body: Record<string, unknown>): Promise<T> {
  return requestJudgeClub<T>(body)
}

export async function verifyProblem(id: string): Promise<VerificationResult> {
  try {
    return await request('/study/api/run', {
      method: 'POST', body: JSON.stringify({ action: 'problem-verify', authoringId: id }),
    }) as VerificationResult
  } catch (error) {
    if (error instanceof Error && 'responseData' in error) {
      const { responseData } = error as ApiError
      if (responseData && typeof responseData === 'object' && 'messageKo' in responseData && typeof responseData.messageKo === 'string') {
        error.message = responseData.messageKo
      }
    }
    throw error
  }
}
