import { ROLE_LABELS } from '../../utils/roleAccess'

// 직급 태그 — 사이트의 hairline+soft-tint 뱃지 문법(회원 프로필 평판 뱃지와 동일 계열).
// 5단계 전부 태그를 가지며, 상위 직급일수록 색이 진하고 준회원은 점선(임시 소속 느낌).
const TAG_STYLES: Record<string, string> = {
  ADMIN: 'border-amber-500/40 bg-amber-500/10 text-amber-600',
  VICE_PRESIDENT: 'border-violet-500/40 bg-violet-500/10 text-violet-600',
  OFFICER: 'border-sky-500/40 bg-sky-500/10 text-sky-600',
  USER: 'border-[var(--app-hairline)] bg-black/[0.04] text-[var(--app-muted)]',
  ASSOCIATE: 'border-dashed border-[var(--app-hairline-strong,rgba(0,0,0,0.16))] bg-transparent text-[var(--app-subtle)]',
}

export default function RoleTag({ role, className = '' }: { role?: string | null; className?: string }) {
  const key = role && TAG_STYLES[role] ? role : 'USER'
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold leading-4 ${TAG_STYLES[key]} ${className}`}>
      {ROLE_LABELS[key]}
    </span>
  )
}
