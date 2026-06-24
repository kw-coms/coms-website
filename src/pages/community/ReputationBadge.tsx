import { reputationTierStyle } from './communityBoardUtils'

export default function ReputationBadge({ tier, label, className = '' }: any) {
  if (!tier || !label) return null
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-black ${reputationTierStyle(tier)} ${className}`}
      title={`커뮤니티 등급 · ${label}`}
    >
      {label}
    </span>
  )
}
