const families = [
  { name: '브론즈', key: 'bronze' },
  { name: '실버', key: 'silver' },
  { name: '골드', key: 'gold' },
  { name: '플래티넘', key: 'platinum' },
  { name: '다이아몬드', key: 'diamond' },
  { name: '루비', key: 'ruby' },
] as const

export type JudgeTierProblem = { level: number; difficultyTier?: number; sourceId?: number }

export function judgeTier(problem: JudgeTierProblem) {
  const value = problem.difficultyTier
  if (value === 0) return { label: '미평가', family: 'unrated', value: 0, estimated: false }
  if (value === 31) return { label: '마스터', family: 'master', value: 31, estimated: false }

  const inferred = value === undefined
  const tier = inferred ? [1, 6, 11, 16, 21][Math.min(Math.max(problem.level - 1, 0), 4)] : value
  if (!Number.isInteger(tier) || tier < 1 || tier > 30) return { label: '미평가', family: 'unrated', value: 0, estimated: false }
  const family = families[Math.floor((tier - 1) / 5)]
  const grade = ['V', 'IV', 'III', 'II', 'I'][(tier - 1) % 5]
  return { label: `${family.name} ${grade}`, family: family.key, value: tier, estimated: inferred }
}

export const JUDGE_TIER_FAMILIES = [
  { value: 'unrated', label: '미평가' },
  ...families.map(({ name, key }) => ({ value: key, label: name })),
  { value: 'master', label: '마스터' },
]
