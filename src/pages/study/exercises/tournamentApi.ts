import { requestJudgeClub } from './clubApi'

export type TournamentStatus = 'draft' | 'registration' | 'running' | 'finished' | 'cancelled'
export type TournamentScoring = 'full' | 'partial'
export type TournamentProblem = { number: number; points: number }
export type TournamentRoundConfig = { durationMinutes: number; problems: TournamentProblem[] }
export type TournamentSavePayload = {
  title: string
  rules: string
  startsAt: number
  registrationClosesAt: number
  capacity: number
  breakMinutes: number
  scoring: TournamentScoring
  roundsConfig: TournamentRoundConfig[]
  durationMinutes: number
  problemNumbers: number[]
}

export interface TournamentSummary {
  id: string
  title: string
  startsAt: number
  capacity: number
  durationMinutes: number
  breakMinutes: number
  registrationClosesAt?: number
  scoring?: TournamentScoring
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
  scores?: [number, number] | null
  isMine: boolean
  canSubmit: boolean
}

export interface TournamentRound {
  number: number
  startsAt: number
  endsAt: number
  problemNumber: number | null
  problems?: TournamentProblem[] | null
  matches: TournamentMatch[]
}

export interface TournamentDetail extends TournamentSummary {
  rules: string
  participants: string[]
  problemNumbers: number[] | null
  roundsConfig?: TournamentRoundConfig[] | null
  rounds: TournamentRound[]
}

export function requestTournament<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  return requestJudgeClub<T>(body, signal)
}
