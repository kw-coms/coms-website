import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { sessionGeneration } from '../../../services/apiClient'
import { requestJudgeClub, type BattleView } from './clubApi'

function remainingTime(endsAt: number, now: number) {
  const seconds = Math.max(0, Math.ceil((endsAt - now) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export default function ClubBattleBanner({ code }: { code: string }) {
  const [now, setNow] = useState(Date.now)
  const query = useQuery({
    queryKey: ['judge-battle', sessionGeneration(), code],
    queryFn: ({ signal }) => requestJudgeClub<{ battle: BattleView }>({ action: 'battle-get', code }, signal),
    refetchInterval: (state) => ['waiting', 'active', 'settling'].includes(state.state.data?.battle.status ?? '') ? 3_000 : false,
    retry: false,
  })
  const battle = query.data?.battle
  const active = battle?.status === 'active'
  useEffect(() => {
    if (!active) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [active])

  return <aside className="judge-battle-banner" aria-label="배틀 상태">
    <strong>친선 배틀</strong>
    {query.isError ? <span>방 상태를 확인하지 못했어요. <button type="button" onClick={() => void query.refetch()}>다시 확인</button></span>
      : active && battle?.endsAt != null
        ? <span role="timer" aria-label="남은 시간">{remainingTime(battle.endsAt, now)}</span>
        : <span role="status">{battle?.status === 'settling' ? '제출 결과 확인 중' : battle?.status === 'waiting' ? '참가 대기' : battle ? '배틀 종료' : '방 상태 확인 중'}</span>}
    {battle?.yourAcceptedAt != null && <span>내 정답 기록됨</span>}
    {battle?.opponentAcceptedAt != null && <span>상대 정답 기록됨</span>}
  </aside>
}
