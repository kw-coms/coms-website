import { judgeTier, type JudgeTierProblem } from './judgeTiers'
import './judge-catalog.css'

export function JudgeTierBadge({ problem }: { problem: JudgeTierProblem }) {
  const tier = judgeTier(problem)
  const qualifier = tier.estimated ? 'COM’s 예상 난도' : 'COM’s 난도'
  return <span className="judge-tier" data-family={tier.family} title={`${qualifier} ${tier.label}`} aria-label={`${qualifier} ${tier.label}`}>
    {tier.label}{tier.estimated && <small>예상</small>}
  </span>
}
