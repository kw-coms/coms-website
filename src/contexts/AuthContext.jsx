import { createContext, useContext, useEffect, useState } from 'react'
import { clearAuth, getMe, logoutUser } from '../services/authApi.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined)

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => setUser(null))
  }, [])

  const logout = async () => {
    await logoutUser().catch(() => {})
    clearAuth()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, setUser, logout, isLoading: user === undefined }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}
