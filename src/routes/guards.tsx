import { useEffect, useState, type PropsWithChildren } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import PageShell from '../components/PageShell'
import { scrollToTopInstant } from '../utils/themeColors'
import { canAccessOperationsPanel } from '../utils/roleAccess'
import { usePermissions } from '../contexts/usePermissions'

export function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    scrollToTopInstant()
  }, [pathname])

  return null
}

export function RequireAuth({ children }: PropsWithChildren) {
  const { user, loading, authError } = useAuth()
  const location = useLocation()
  if (loading) return (
    <PageShell>
      <div className="rounded-lg border border-[var(--app-hairline)] bg-white/82 p-8 text-center text-[var(--app-muted)] shadow-[0_18px_45px_rgba(0,0,0,0.08)] backdrop-blur-xl">
        로그인 상태를 확인하는 중...
      </div>
    </PageShell>
  )
  // Auth could not be confirmed (not logged in, or a transient error): send the
  // user to the login screen rather than a dead-end "retry" error. Carry `from`
  // so they return here after logging in.
  if (authError || !user) return <Navigate to="/login" state={{ from: location, authIssue: Boolean(authError) }} replace />
  return children
}

// Longest RequireAdmin holds back a "no access" redirect while /api/permissions/me is still
// outstanding. A request that fails ends the wait at once; this bound is for one that never
// answers at all, which would otherwise never leave the checking screen.
export const PERMISSIONS_WAIT_MS = 10_000

export function RequireAdmin({ children }: PropsWithChildren) {
  const { user, loading, authError } = useAuth()
  const { permissions, settled } = usePermissions()
  const location = useLocation()
  const [permissionsWaitExpired, setPermissionsWaitExpired] = useState(false)
  const awaitingPermissions = Boolean(user) && !settled

  useEffect(() => {
    if (!awaitingPermissions) return undefined
    const timer = setTimeout(() => setPermissionsWaitExpired(true), PERMISSIONS_WAIT_MS)
    return () => clearTimeout(timer)
  }, [awaitingPermissions])

  const allowed = canAccessOperationsPanel(permissions)
  // Until the server answers, `permissions` is only the role's default set. A role the 회장
  // opened up in the matrix (e.g. 회원 + archive.manage) is denied by those defaults, so
  // deciding on them sent such a member to the home page on every hard reload of /admin.
  // Roles the defaults already admit still get in right away; only the denial waits.
  const verdictPending = !allowed && awaitingPermissions && !permissionsWaitExpired

  if (loading || verdictPending) return (
    <PageShell>
      <div className="rounded-lg border border-[var(--app-hairline)] bg-white/82 p-8 text-center text-[var(--app-muted)] shadow-[0_18px_45px_rgba(0,0,0,0.08)] backdrop-blur-xl">
        {loading ? '로그인 상태를 확인하는 중...' : '권한을 확인하는 중...'}
      </div>
    </PageShell>
  )
  if (authError || !user) return <Navigate to="/login" state={{ from: location, authIssue: Boolean(authError) }} replace />
  if (!allowed) return <Navigate to="/" replace />
  return children
}
