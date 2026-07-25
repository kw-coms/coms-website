import { useEffect, type PropsWithChildren } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import PageShell from '../components/PageShell'
import { scrollToTopInstant } from '../utils/themeColors'
import { canAccessOperationsPanel } from '../utils/roleAccess'

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

export function RequireAdmin({ children }: PropsWithChildren) {
  const { user, loading, authError } = useAuth()
  const location = useLocation()
  if (loading) return (
    <PageShell>
      <div className="rounded-lg border border-[var(--app-hairline)] bg-white/82 p-8 text-center text-[var(--app-muted)] shadow-[0_18px_45px_rgba(0,0,0,0.08)] backdrop-blur-xl">
        로그인 상태를 확인하는 중...
      </div>
    </PageShell>
  )
  if (authError || !user) return <Navigate to="/login" state={{ from: location, authIssue: Boolean(authError) }} replace />
  if (!canAccessOperationsPanel(user.role)) return <Navigate to="/" replace />
  return children
}
