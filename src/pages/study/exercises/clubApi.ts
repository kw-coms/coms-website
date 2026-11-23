import { request, type ApiError } from '../../../services/apiClient'

export interface BattleView {
  code: string
  problemNumber: number
  durationMinutes: number
  status: 'waiting' | 'active' | 'settling' | 'finished' | 'expired' | 'cancelled'
  createdAt: number
  startedAt: number | null
  endsAt: number | null
  yourAcceptedAt: number | null
  opponentAcceptedAt: number | null
  isHost: boolean
  opponentJoined: boolean
  result: 'win' | 'loss' | 'draw' | 'unsolved' | null
}

export interface ClubSetView {
  id: string
  title: string
  problemNumbers: number[]
  shared: boolean
  updatedAt: number
  owned: boolean
}

export interface ClubVoteView {
  count: number
  median: number | null
  ownVote: number | null
  canVote: boolean
}

export async function requestJudgeClub<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  try {
    return await request('/study/api/club', { method: 'POST', body: JSON.stringify(body), signal }) as T
  } catch (error) {
    if (error instanceof Error && 'responseData' in error) {
      const { status, responseData } = error as ApiError
      if (status >= 400 && status < 500 && responseData && typeof responseData === 'object' &&
          'messageKo' in responseData && typeof responseData.messageKo === 'string') {
        error.message = responseData.messageKo
      }
    }
    throw error
  }
}
