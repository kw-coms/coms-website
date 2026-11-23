import { requestJudgeClub } from './clubApi'

export type TournamentStatus = 'draft' | 'registration' | 'running' | 'finished' | 'cancelled'

export interface TournamentSummary {
  id: string
  title: string
  startsAt: number
  capacity: 4 | 8 | 16 | 32
  durationMinutes: number
  breakMinutes: number
  status: TournamentStatus
  participantCount: number
  registered: boolean
  champion: string | null
}

export interface TournamentMatch {
  id: string
  number: number
  status: 'waiting' | 'active' | 'settling' | 'finished'
  players: [string | null, string | null]
  winner: string | null
  winnerSlot: 0 | 1 | null
  result: 'solved' | 'score' | 'bye' | 'no-score' | null
  isMine: boolean
  canSubmit: boolean
}

export interface TournamentRound {
  number: number
  startsAt: number
  endsAt: number
  problemNumber: number | null
  matches: TournamentMatch[]
}

export interface TournamentDetail extends TournamentSummary {
  rules: string
  participants: string[]
  problemNumbers: number[] | null
  rounds: TournamentRound[]
}

export function requestTournament<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  return requestJudgeClub<T>(body, signal)
}
