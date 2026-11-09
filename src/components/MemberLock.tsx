import { Lock } from 'lucide-react'
import { useAuth } from '../contexts/useAuth'

/** Lock mark beside a members-only label. Shown only once auth has loaded and nobody is signed in. */
export default function MemberLock({ size = 11 }: { size?: number }) {
  const { user, loading } = useAuth()
  if (loading || user) return null
  return (
    <>
      <Lock size={size} aria-hidden="true" data-member-lock className="inline-block shrink-0 align-[-1px] opacity-70" />
      <span className="sr-only"> (회원 전용)</span>
    </>
  )
}
