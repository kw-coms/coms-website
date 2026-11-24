import { Link } from 'react-router-dom'
import type { GroupCard } from '../../../services/studyGroupApi'
import { statusLabel } from './studyGroupHelpers'
import './studyGroups.css'

export function GroupCards({ groups }: { groups: GroupCard[] }) {
  return <div className="study-groups-grid">{groups.map(group => <Link className="study-group-card" to={`/study/groups/${group.id}`} key={group.id}>
    <span className="study-group-state">{statusLabel(group.status)}</span>
    <strong>{group.name}</strong>
    <span>{group.topicTags.join(' · ') || '주제 미정'}</span>
    <span>{group.schedule || '일정 협의 중'} · {group.leaderName}</span>
    {group.interestCount != null && <span>관심 {group.interestCount}명</span>}
  </Link>)}</div>
}
