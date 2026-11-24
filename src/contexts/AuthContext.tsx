import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import type { ApiError } from '../services/apiClient'
import { getCurrentUser, logoutUser } from '../services/authApi'
import { getMyPermissions } from '../services/permissionsApi'
import { advanceSessionGeneration, clearSessionHint, hasSessionHint, sessionGeneration, setSessionExpiredHandler } from '../services/apiClient'
import { setUserContext } from '../services/observability'
import { queryClient } from '../services/queryClient'
import { showToast } from '../components/common/Toast'
import { buildAuthLoadError, isLoggedOutAuthError } from './authErrors'
import { AuthContext } from './useAuth'
import { clearMemberDrafts } from '../utils/editorDraft'
import { clearNoticeReadState } from '../utils/noticeReads'
import { beginMemberLogout, cancelMemberLogout, finishMemberLogout, isMemberSessionCurrent, setMemberSessionOwner } from '../utils/memberSession'
import { forgetDrawStorage } from '../utils/draw'
import { defaultPermissionsForRole } from '../utils/roleAccess'

const logoutChannel = 'coms:auth:logout'
const PERMISSIONS_TIMEOUT_MS = 5_000
const permissionOwner = (member) => {
  const id = member?.id ?? member?.studentId
  return id == null ? '' : JSON.stringify([id, member.role])
}
const notifyOtherTabs = (memberId?: number | string) => {
  if (memberId == null || typeof BroadcastChannel === 'undefined') return
  const channel = new BroadcastChannel(logoutChannel)
  channel.postMessage(String(memberId))
  channel.close()
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUserState] = useState(null)
  const userRef = useRef(null)
  const [permissionSnapshot, setPermissionSnapshot] = useState<{ owner: string; request: string; values: string[] } | null>(null)
  const [settledPermissionsRequest, setSettledPermissionsRequest] = useState('')
  const [permissionsNonce, setPermissionsNonce] = useState(0)
  const setUser = useCallback((next, freshLogin = false) => {
    if (freshLogin || permissionOwner(next) !== permissionOwner(userRef.current)) {
      setPermissionSnapshot(null)
      setSettledPermissionsRequest('')
    }
    if (freshLogin) setPermissionsNonce((value) => value + 1)
    setMemberSessionOwner(next?.studentId, freshLogin)
    userRef.current = next
    setUserState(next)
  }, [])
  const [loading, setLoading] = useState(() => hasSessionHint())
  const [authError, setAuthError] = useState(null)

  // Keep Sentry's user context in sync with the session (no-op when Sentry is disabled).
  useEffect(() => {
    setUserContext(user)
  }, [user])

  // Read by the session-expired handler below, which is registered once and must see the
  // current session rather than the one captured when it was created.
  // A request the server will no longer authenticate, together with a refresh it refuses,
  // means the session is truly gone: clear it so route guards redirect to /login instead of
  // leaving a logged-in shell whose every panel errors.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setLoading(false)
      // Logged-out visitors reach this on every page load (/me is refused, and so is the
      // refresh). There is no session to end, and clearing the query cache here would cancel
      // the public queries that are still loading.
      if (!userRef.current) return
      notifyOtherTabs(userRef.current.id)
      forgetDrawStorage(userRef.current.id)
      setUser(null)
      queryClient.clear()
      showToast({ message: '로그인이 만료되었습니다. 다시 로그인해주세요.' })
    })
    return () => setSessionExpiredHandler(null)
  }, [setUser])

  useEffect(() => {
    let mounted = true

    if (!hasSessionHint()) {
      queueMicrotask(() => { if (mounted) setLoading(false) })
      return () => { mounted = false }
    }
    const started = sessionGeneration()

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
          if (mounted && sessionGeneration().session === started.session) { setUser(data); setAuthError(null) }
          return
        } catch (error) {
          if (attempt < delays.length && isTransient(error)) {
            await new Promise((r) => setTimeout(r, delays[attempt]))
            if (!mounted || sessionGeneration().session !== started.session) return
            continue
          }
          if (!mounted || sessionGeneration().session !== started.session) return
          setUser(null)
          setAuthError(isLoggedOutAuthError(error) ? null : buildAuthLoadError(error))
          return
        }
      }
    }
    load().finally(() => {
      if (mounted && sessionGeneration().session === started.session) setLoading(false)
    })

    return () => {
      mounted = false
    }
  }, [setUser])

  const owner = permissionOwner(user)
  // Which permissions request has come back, successfully or not. `permissions === null` alone
  // cannot tell "still on its way" from "failed", and a route guard has to: it waits for the
  // first and must not wait for the second.
  const permissionsRequest = owner ? `${owner}|${permissionsNonce}` : ''
  const permissions = permissionSnapshot?.request === permissionsRequest ? permissionSnapshot.values : null
  const permissionsSettled = Boolean(permissionsRequest) && settledPermissionsRequest === permissionsRequest
  // Controls can use the last answer for this member and role, or the role's defaults on first load.
  const previousPermissions = permissionSnapshot?.owner === owner ? permissionSnapshot.values : null
  const displayPermissions = permissions ?? (permissionsSettled ? previousPermissions ?? defaultPermissionsForRole(user?.role) : null)

  // 로그인한 사용자가 바뀌면(또는 권한 매트릭스를 저장한 뒤) 유효 권한을 다시 읽는다.
  useEffect(() => {
    if (!permissionsRequest) return undefined
    let mounted = true
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), PERMISSIONS_TIMEOUT_MS)
    getMyPermissions(controller.signal)
      .then((data) => {
        if (mounted && Array.isArray(data?.permissions)) {
          setPermissionSnapshot({ owner, request: permissionsRequest, values: data.permissions })
        }
      })
      .catch(() => { /* Keep the previous snapshot for display only. */ })
      .finally(() => {
        clearTimeout(timeout)
        if (mounted) setSettledPermissionsRequest(permissionsRequest)
      })
    return () => {
      mounted = false
      clearTimeout(timeout)
      controller.abort()
    }
  }, [owner, permissionsRequest])

  const refreshPermissions = useCallback(() => {
    setPermissionsNonce((value) => value + 1)
  }, [])

  const login = useCallback(async (data) => {
    advanceSessionGeneration()
    const started = sessionGeneration()
    setLoading(false)
    setAuthError(null)
    if (data) {
      setUser(data, true)
    }
    try {
      const currentUser = await getCurrentUser()
      if (sessionGeneration().session === started.session) setUser(currentUser, !data)
    } catch {
      // The login response is already authoritative for the visible session state.
    }
  }, [setUser])

  // Forget the session on this device without asking the server. Called on its own when the
  // server has already ended it — a password change revokes every token the member holds.
  const clearSession = useCallback((notify = true) => {
    // The session-expired handler reads this ref; clearing it now keeps a request that fails
    // before the next render from announcing an expiry on top of the caller's own message.
    if (notify) notifyOtherTabs(userRef.current?.id)
    forgetDrawStorage(userRef.current?.id)
    setUser(null)
    clearSessionHint()
    setLoading(false)
    setAuthError(null)
    // Drop every cached query so the next account on a shared device can't see the previous
    // user's community list, bookmarks, or vote state (query keys aren't scoped per user).
    queryClient.clear()
  }, [setUser])

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined
    const channel = new BroadcastChannel(logoutChannel)
    channel.onmessage = (event) => {
      if (userRef.current && event.data === String(userRef.current.id)) clearSession(false)
    }
    return () => channel.close()
  }, [clearSession])

  const logout = useCallback(async () => {
    const owner = userRef.current?.studentId
    if (!isMemberSessionCurrent(owner)) return false
    if (!beginMemberLogout()) {
      showToast({ message: '로그아웃 상태를 동기화하지 못했습니다. 잠시 후 다시 시도해주세요.', tone: 'error' })
      return false
    }
    try {
      await logoutUser()
    } catch {
      cancelMemberLogout()
      // The auth cookies are HttpOnly, so only the server can end the session. If the request
      // did not go through, the member is still signed in and a reload would bring the account
      // straight back: keep the session on screen and say so rather than show a logged-out shell.
      showToast({ message: '로그아웃하지 못했습니다. 아직 로그인된 상태이니 잠시 후 다시 시도해주세요.', tone: 'error' })
      return false
    }
    // A deliberate logout on a shared browser leaves nothing of this member behind. A session that
    // merely expired keeps its drafts so the member can sign back in and finish the post.
    finishMemberLogout()
    clearMemberDrafts(owner)
    clearNoticeReadState(owner)
    clearSession()
    return true
  }, [clearSession])

  const refreshUser = useCallback(async () => {
    setAuthError(null)
    const started = sessionGeneration()
    const currentUser = await getCurrentUser()
    if (sessionGeneration().session === started.session) setUser(currentUser)
    return sessionGeneration().session === started.session ? currentUser : userRef.current
  }, [setUser])

  const retryAuth = useCallback(async () => {
    setLoading(true)
    setAuthError(null)
    const started = sessionGeneration()
    try {
      const currentUser = await getCurrentUser()
      if (sessionGeneration().session !== started.session) return userRef.current
      setUser(currentUser)
      return currentUser
    } catch (error) {
      if (sessionGeneration().session !== started.session) return userRef.current
      setUser(null)
      if (isLoggedOutAuthError(error)) {
        setAuthError(null)
        return null
      }
      const nextError = buildAuthLoadError(error)
      setAuthError(nextError)
      return null
    } finally {
      if (sessionGeneration().session === started.session) setLoading(false)
    }
  }, [setUser])

  const value = useMemo(
    () => ({
      user, loading, authError, permissions, displayPermissions, permissionsSettled, refreshPermissions,
      login, logout, clearSession, refreshUser, retryAuth, setUser,
    }),
    [user, loading, authError, permissions, displayPermissions, permissionsSettled, refreshPermissions, login, logout, clearSession, refreshUser, retryAuth, setUser]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
