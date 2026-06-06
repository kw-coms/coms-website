import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCurrentUser, logoutUser } from '../services/authApi.js'
import { apiUrl } from '../services/apiClient.js'
import { listFonts } from '../services/fontApi.js'
import { AuthContext } from './useAuth.js'

let cachedFonts = null

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

  useEffect(() => {
    let mounted = true
    const styleId = 'user-site-font-style'

    async function applySelectedFont() {
      const selectedFontId = user?.selectedFontId
      const existing = document.getElementById(styleId)
      if (existing) existing.remove()

      if (!selectedFontId) {
        document.documentElement.style.removeProperty('--user-font-family')
        return
      }

      try {
        if (!cachedFonts) cachedFonts = await listFonts()
        if (!mounted) return
        const font = cachedFonts.find((item) => item.id === selectedFontId)
        if (!font) {
          document.documentElement.style.removeProperty('--user-font-family')
          return
        }
        const family = `UserFont${font.id}`
        const style = document.createElement('style')
        style.id = styleId
        style.textContent = `@font-face{font-family:${family};src:url("${apiUrl(font.fileUrl)}");font-display:swap;}`
        document.head.appendChild(style)
        document.documentElement.style.setProperty('--user-font-family', `${family}, 'Freesentation', 'Pretendard', 'LexendThin', 'Segoe UI', sans-serif`)
      } catch {
        document.documentElement.style.removeProperty('--user-font-family')
      }
    }

    applySelectedFont()
    return () => { mounted = false }
  }, [user?.selectedFontId])

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
