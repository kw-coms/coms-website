import { Lock } from 'lucide-react'
import { useAuth } from '../contexts/useAuth'

/** Lock mark beside a members-only label. Shown only once auth has loaded and nobody is signed in
 * (not when the check itself failed: that visitor may be a member). */
export default function MemberLock({ size = 11 }: { size?: number }) {
  const { user, loading, authError } = useAuth()
  if (loading || user || authError) return null
  return (
    <>
      <Lock size={size} aria-hidden="true" data-member-lock className="inline-block shrink-0 align-[-1px] opacity-70" />
      <span className="sr-only"> (회원 전용)</span>
    </>
  )
}
