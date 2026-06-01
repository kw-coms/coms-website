import { useEffect, useMemo, useState } from 'react'
import { getCurrentUser, logoutUser } from '../services/authApi.js'
import { AuthContext } from './useAuth.js'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

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

  const login = async () => {
    const data = await getCurrentUser()
    setUser(data)
  }

  const logout = async () => {
    try {
      await logoutUser()
    } finally {
      setUser(null)
    }
  }

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
