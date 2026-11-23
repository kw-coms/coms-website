import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/useAuth'
import { listOpenOpportunityGatherings } from '../../services/gatheringApi'
import { type Opportunity } from '../../services/opportunityApi'
import { opportunityPhases } from './opportunityStatus'

function MemberOpportunityGatherings({ opportunity, ended }: { opportunity: Opportunity; ended: boolean }) {
  const list = useQuery({ queryKey: ['gatherings', 'opportunities'], queryFn: listOpenOpportunityGatherings })
  const linked = list.data?.filter((gathering) => gathering.opportunityId === opportunity.id) ?? []
  if (ended && linked.length === 0) return null

  return <div className="mt-4 border-t border-[var(--app-hairline)] pt-4">
    <h3 className="text-sm font-semibold">함께 갈 사람 모집</h3>
    {list.isLoading && <p role="status" className="mt-2 text-sm text-[var(--app-muted)]">모집을 불러오는 중...</p>}
    {list.isError && <p role="alert" className="mt-2 text-sm text-[var(--app-muted)]">모집을 불러오지 못했어요.</p>}
    {linked.length > 0 && <ul className="mt-2 space-y-2">{linked.map((gathering) => <li key={gathering.id}>
      <Link to={`/gatherings/${gathering.id}`} className="text-sm font-semibold text-[var(--app-accent-text)] underline-offset-2 hover:underline">
        {gathering.title} · {gathering.participantCount}{gathering.capacity ? `/${gathering.capacity}` : ''}명{gathering.full ? ' · 정원 마감' : ''}
      </Link>
    </li>)}</ul>}
    {list.isSuccess && linked.length === 0 && <p className="mt-2 text-sm text-[var(--app-muted)]">아직 이 일정의 모집이 없어요.</p>}
    {!ended && <Link to={`/gatherings?opportunity=${opportunity.id}&create=1`} className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-[var(--app-accent-text)] underline-offset-2 hover:underline">함께 갈 사람 모집하기</Link>}
  </div>
}

export default function ExternalOpportunityGatherings({ opportunity, now }: { opportunity: Opportunity; now: number }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  const ended = opportunityPhases(opportunity, now).overall === 'ended'
  if (loading) return null
  if (!user) return ended ? null : <Link to="/login" state={{ from: location }} className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-[var(--app-accent-text)] underline-offset-2 hover:underline">로그인하고 함께 갈 사람 모집하기</Link>
  return <MemberOpportunityGatherings opportunity={opportunity} ended={ended} />
}
