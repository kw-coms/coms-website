import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCurrentUser, logoutUser } from '../services/authApi.js'
import { setUserContext } from '../services/observability.js'
import { AuthContext } from './useAuth.js'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Keep Sentry's user context in sync with the session (no-op when Sentry is disabled).
  useEffect(() => {
    setUserContext(user)
  }, [user])

  useEffect(() => {
    let mounted = true

    getCurrentUser()
      .then((data) => {
        if (mounted) setUser(data)
      })
      .catch(() => {
        if (mounted) setUser(null)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  const login = useCallback(async (data) => {
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
    }
  }, [])

  const refreshUser = useCallback(async () => {
    const currentUser = await getCurrentUser()
    setUser(currentUser)
    return currentUser
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, logout, refreshUser, setUser }),
    [user, loading, login, logout, refreshUser]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
