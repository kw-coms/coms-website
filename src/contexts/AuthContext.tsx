import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCurrentUser, logoutUser } from '../services/authApi'
import { setUserContext } from '../services/observability'
import { buildAuthLoadError, isLoggedOutAuthError } from './authErrors'
import { AuthContext } from './useAuth'

export function AuthProvider({ children }: any) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null)

  // Keep Sentry's user context in sync with the session (no-op when Sentry is disabled).
  useEffect(() => {
    setUserContext(user)
  }, [user])

  useEffect(() => {
    let mounted = true

    // A transient blip (backend restart / deploy window / network hiccup) should
    // not log the user out. Retry /me a few times on non-auth errors (no status
    // or 5xx) with backoff before giving up; a real 401/403 is not retried.
    const isTransient = (error: any) => {
      if (isLoggedOutAuthError(error)) return false
      const status = Number(error?.status)
      return !Number.isFinite(status) || status >= 500
    }
    const delays = [600, 1500]
    const load = async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          const data = await getCurrentUser()
          if (mounted) { setUser(data); setAuthError(null) }
          return
        } catch (error) {
          if (attempt < delays.length && isTransient(error)) {
            await new Promise((r) => setTimeout(r, delays[attempt]))
            if (!mounted) return
            continue
          }
          if (!mounted) return
          setUser(null)
          setAuthError(isLoggedOutAuthError(error) ? null : buildAuthLoadError(error))
          return
        }
      }
    }
    load().finally(() => { if (mounted) setLoading(false) })

    return () => {
      mounted = false
    }
  }, [])

  const login = useCallback(async (data) => {
    setAuthError(null)
    if (data) {
      setUser(data)
    }
    try {
      const currentUser = await getCurrentUser()
      setUser(currentUser)
    } catch {
      // The login response is already authoritative for the visible session state.
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await logoutUser()
    } finally {
      setUser(null)
      setAuthError(null)
    }
  }, [])

  const refreshUser = useCallback(async () => {
    setAuthError(null)
    const currentUser = await getCurrentUser()
    setUser(currentUser)
    return currentUser
  }, [])

  const retryAuth = useCallback(async () => {
    setLoading(true)
    setAuthError(null)
    try {
      const currentUser = await getCurrentUser()
      setUser(currentUser)
      return currentUser
    } catch (error) {
      setUser(null)
      if (isLoggedOutAuthError(error)) {
        setAuthError(null)
        return null
      }
      const nextError = buildAuthLoadError(error)
      setAuthError(nextError)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const value = useMemo(
    () => ({ user, loading, authError, login, logout, refreshUser, retryAuth, setUser }),
    [user, loading, authError, login, logout, refreshUser, retryAuth]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
