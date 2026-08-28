// 커뮤니티/공지 전반의 상태 칩 — RoleTag와 같은 hairline+soft-tint 문법으로
// 흩어져 있던 하드코드 파스텔 hex와 원색 뱃지를 한 시스템으로 모은다.
// alpha 틴트라 라이트/다크 모두에서 배경 위에 자연스럽게 앉는다.
const CHIP_VARIANTS = {
  category: 'border-[var(--app-accent-border,rgba(0,113,227,0.35))] bg-[var(--app-accent-soft)] text-[var(--app-accent-text)]',
  pinned: 'border-amber-500/40 bg-amber-500/10 text-amber-600',
  concept: 'border-amber-500/50 bg-amber-500/20 text-amber-700',
  admin: 'border-rose-500/40 bg-rose-500/10 text-rose-600',
  neutral: 'border-[var(--app-hairline)] bg-black/[0.04] text-[var(--app-muted)]',
} as const

export type ChipVariant = keyof typeof CHIP_VARIANTS

export default function Chip({ variant = 'neutral', children, className = '' }: {
  variant?: ChipVariant
  children: React.ReactNode
  className?: string
}) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold leading-4 ${CHIP_VARIANTS[variant]} ${className}`}>
      {children}
    </span>
  )
}
