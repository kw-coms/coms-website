import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import type { ApiError } from '../services/apiClient'
import { getCurrentUser, logoutUser } from '../services/authApi'
import { getMyPermissions } from '../services/permissionsApi'
import { setSessionExpiredHandler } from '../services/apiClient'
import { setUserContext } from '../services/observability'
import { queryClient } from '../services/queryClient'
import { buildAuthLoadError, isLoggedOutAuthError } from './authErrors'
import { AuthContext } from './useAuth'

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null)
  // 회장이 조정한 직급별 권한. null = 아직 못 받음 → 직급 기본값으로 대체(usePermissions).
  const [permissions, setPermissions] = useState<string[] | null>(null)

  // Keep Sentry's user context in sync with the session (no-op when Sentry is disabled).
  useEffect(() => {
    setUserContext(user)
  }, [user])

  // A 401 that survives a token refresh means the session is truly gone: clear it so route
  // guards redirect to /login instead of leaving a logged-in shell whose every panel errors.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null)
      setPermissions(null)
      queryClient.clear()
    })
    return () => setSessionExpiredHandler(null)
  }, [])

  useEffect(() => {
    let mounted = true

    // A transient blip (backend restart / deploy window / network hiccup) should
    // not log the user out. Retry /me a few times on non-auth errors (no status
    // or 5xx) with backoff before giving up; a real 401/403 is not retried.
    const isTransient = (error: unknown) => {
      if (isLoggedOutAuthError(error)) return false
      const status = Number((error as Partial<ApiError>)?.status)
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

  const studentId = user?.studentId
  const role = user?.role
  const [permissionsNonce, setPermissionsNonce] = useState(0)

  // 로그인한 사용자가 바뀌면(또는 권한 매트릭스를 저장한 뒤) 유효 권한을 다시 읽는다.
  useEffect(() => {
    // 로그아웃/세션 만료는 각자 permissions 를 비우므로 여기서 다시 지울 필요는 없다.
    if (!studentId) return undefined
    let mounted = true
    getMyPermissions()
      .then((data) => {
        if (mounted) setPermissions(Array.isArray(data?.permissions) ? data.permissions : null)
      })
      .catch(() => {
        // 실패해도 로그인 상태를 흔들지 않는다 — 직급 기본값으로 화면을 그린다.
        if (mounted) setPermissions(null)
      })
    return () => { mounted = false }
  }, [studentId, role, permissionsNonce])

  const refreshPermissions = useCallback(() => {
    setPermissionsNonce((value) => value + 1)
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
      setPermissions(null)
      // Drop every cached query so the next account on a shared device can't see the previous
      // user's community list, bookmarks, or vote state (query keys aren't scoped per user).
      queryClient.clear()
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
    () => ({
      user, loading, authError, permissions, refreshPermissions,
      login, logout, refreshUser, retryAuth, setUser,
    }),
    [user, loading, authError, permissions, refreshPermissions, login, logout, refreshUser, retryAuth]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
