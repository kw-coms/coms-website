import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import type { ApiError } from '../services/apiClient'
import { getCurrentUser, logoutUser } from '../services/authApi'
import { getMyPermissions } from '../services/permissionsApi'
import { setSessionExpiredHandler } from '../services/apiClient'
import { setUserContext } from '../services/observability'
import { queryClient } from '../services/queryClient'
import { showToast } from '../components/common/Toast'
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

  // Read by the session-expired handler below, which is registered once and must see the
  // current session rather than the one captured when it was created.
  const userRef = useRef(null)
  useEffect(() => {
    userRef.current = user
  }, [user])

  // A request the server will no longer authenticate, together with a refresh it refuses,
  // means the session is truly gone: clear it so route guards redirect to /login instead of
  // leaving a logged-in shell whose every panel errors.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      // Logged-out visitors reach this on every page load (/me is refused, and so is the
      // refresh). There is no session to end, and clearing the query cache here would cancel
      // the public queries that are still loading.
      if (!userRef.current) return
      userRef.current = null
      setUser(null)
      setPermissions(null)
      queryClient.clear()
      showToast({ message: '로그인이 만료되었습니다. 다시 로그인해주세요.' })
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
  // Which permissions request has come back, successfully or not. `permissions === null` alone
  // cannot tell "still on its way" from "failed", and a route guard has to: it waits for the
  // first and must not wait for the second.
  const permissionsRequest = studentId ? `${studentId}|${role}|${permissionsNonce}` : ''
  const [settledPermissionsRequest, setSettledPermissionsRequest] = useState('')
  const permissionsSettled = Boolean(permissionsRequest) && settledPermissionsRequest === permissionsRequest

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
      .finally(() => {
        if (mounted) setSettledPermissionsRequest(permissionsRequest)
      })
    return () => { mounted = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- permissionsRequest is derived from these three
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

  // Forget the session on this device without asking the server. Called on its own when the
  // server has already ended it — a password change revokes every token the member holds.
  const clearSession = useCallback(() => {
    // The session-expired handler reads this ref; clearing it now keeps a request that fails
    // before the next render from announcing an expiry on top of the caller's own message.
    userRef.current = null
    setUser(null)
    setAuthError(null)
    setPermissions(null)
    // Drop every cached query so the next account on a shared device can't see the previous
    // user's community list, bookmarks, or vote state (query keys aren't scoped per user).
    queryClient.clear()
  }, [])

  const logout = useCallback(async () => {
    try {
      await logoutUser()
    } catch {
      // The auth cookies are HttpOnly, so only the server can end the session. If the request
      // did not go through, the member is still signed in and a reload would bring the account
      // straight back: keep the session on screen and say so rather than show a logged-out shell.
      showToast({ message: '로그아웃하지 못했습니다. 아직 로그인된 상태이니 잠시 후 다시 시도해주세요.', tone: 'error' })
      return false
    }
    clearSession()
    return true
  }, [clearSession])

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
      user, loading, authError, permissions, permissionsSettled, refreshPermissions,
      login, logout, clearSession, refreshUser, retryAuth, setUser,
    }),
    [user, loading, authError, permissions, permissionsSettled, refreshPermissions, login, logout, clearSession, refreshUser, retryAuth]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
