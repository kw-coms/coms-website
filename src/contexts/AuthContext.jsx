import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCurrentUser, logoutUser } from '../services/authApi.js'
import { setUserContext } from '../services/observability.js'
import { buildAuthLoadError, isLoggedOutAuthError } from './authErrors.js'
import { AuthContext } from './useAuth.js'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null)

  // Keep Sentry's user context in sync with the session (no-op when Sentry is disabled).
  useEffect(() => {
    setUserContext(user)
  }, [user])

  useEffect(() => {
    let mounted = true

    getCurrentUser()
      .then((data) => {
        if (mounted) {
          setUser(data)
          setAuthError(null)
        }
      })
      .catch((error) => {
        if (!mounted) return
        setUser(null)
        setAuthError(isLoggedOutAuthError(error) ? null : buildAuthLoadError(error))
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

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
