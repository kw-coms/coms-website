export const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL || ''

const OPTIONAL_DEV_API_SKIP_KEY = 'kwcoms-dev-api-unavailable'
const optionalDevApiInFlight = new Map()
let optionalDevNoticeShown = false

export function apiUrl(path) {
  const baseUrl = API_BASE_URL.replace(/\/+$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  if (baseUrl.endsWith('/api') && normalizedPath.startsWith('/api/')) {
    return `${baseUrl}${normalizedPath.slice('/api'.length)}`
  }

  return `${baseUrl}${normalizedPath}`
}

// Session-expiry notification: AuthProvider registers a handler so that when a refresh fails on
// a 401, the auth session is cleared and route guards redirect to /login — otherwise the app keeps
// rendering a logged-in shell whose every panel errors with "로그인이 만료되었습니다".
let sessionExpiredHandler: (() => void) | null = null
export function setSessionExpiredHandler(handler: (() => void) | null) {
  sessionExpiredHandler = handler
}
function notifySessionExpired() {
  sessionExpiredHandler?.()
}

// Single-flight the refresh: when several requests get 401 at once, they must
// share ONE /api/auth/refresh call. Otherwise each fires its own refresh, which
// (with refresh-token rotation) is wasteful and can interleave Set-Cookie writes.
//
//  - 'refreshed'   new cookies were issued (or a parallel refresh already did): retry.
//  - 'rejected'    the server refused to renew the session (401): it is gone for good.
//  - 'unavailable' network failure / 5xx / anything else: unknown, so the session
//                  state must not be touched on this evidence alone.
type RefreshOutcome = 'refreshed' | 'rejected' | 'unavailable'
let refreshInFlight: Promise<RefreshOutcome> | null = null
// Bumped once per SUCCESSFUL refresh. A request that was already in flight when
// someone else rotated the token gets a 401 from the token it was sent with, not
// from the current one — refreshing again would rotate a perfectly good session
// (and, with refresh-token rotation, can invalidate it). Comparing the generation
// captured before the request against the current one tells the two cases apart:
// if it moved, just retry; the cookie is already fresh.
let refreshGeneration = 0
async function tryRefreshToken(): Promise<RefreshOutcome> {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = (async (): Promise<RefreshOutcome> => {
    try {
      const res = await fetch(apiUrl('/api/auth/refresh'), { method: 'POST', credentials: 'include' })
      if (res.ok) {
        refreshGeneration += 1
        return 'refreshed'
      }
      return res.status === 401 ? 'rejected' : 'unavailable'
    } catch {
      return 'unavailable'
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

// Shared 401 recovery for request / requestNoContent / requestBlob, which all ran an identical
// copy of this block.
//
// The backend answers a missing, expired or revoked token with 401 and keeps 403 for a signed-in
// member who lacks the role. Only a 401 can be fixed by a new token: refreshing on a 403 burned a
// refresh-token rotation on every permission denial and could never turn it into a 200.
async function recoverFromAuthFailure(path, response, generationBeforeRequest, fetchOnce) {
  const canRefresh = path === '/api/auth/me' || !path.includes('/api/auth/')
  if (!canRefresh || response.status !== 401) return response
  if (refreshGeneration > generationBeforeRequest) return fetchOnce()
  const outcome = await tryRefreshToken()
  if (outcome === 'refreshed') return fetchOnce()
  // A refresh the server refuses means the session is gone: without this, an expired session
  // left the logged-in shell on screen with every panel stuck on a retry that could never
  // succeed. An unreachable refresh endpoint says nothing about the session, so it is left alone.
  if (outcome === 'rejected') notifySessionExpired()
  return response
}

async function readErrorBody(response) {
  const text = await response.text().catch(() => '')
  if (!text) return { data: null, text: '' }
  try {
    return { data: JSON.parse(text), text }
  } catch {
    return { data: null, text }
  }
}

function serverMessageFromBody(data) {
  return data?.message || data?.detail || data?.error || ''
}

// On a 4xx, `message` is what the backend wrote for the member (ResponseStatusException reasons
// via ApiExceptionHandler): wrong password, account lockout, duplicate e-mail, rate limits,
// "관리자 삭제 사유를 입력해주세요." Those are always Korean, so Hangul is the test — an English
// `message` ("Invalid vote value.") is internal, `error`/`detail` are framework defaults
// ("Forbidden"), and nothing a 5xx says is meant for the screen.
function userFacingServerMessage(status, data) {
  const message = typeof data?.message === 'string' ? data.message : ''
  return status >= 400 && status < 500 && /[가-힣]/.test(message) ? message : ''
}

function errorMessageForStatus(status, fallbackMessage = '') {
  if (status === 413) {
    return '업로드 용량이 너무 큽니다. 이미지/영상 크기를 줄여 다시 시도해주세요.'
  }
  if (status === 401) {
    return fallbackMessage || '로그인이 만료되었습니다. 다시 로그인해주세요.'
  }
  if (status === 403) {
    return fallbackMessage || '이 작업을 할 권한이 없습니다.'
  }
  if (status === 404) {
    return '요청한 항목을 찾을 수 없습니다.'
  }
  if (status === 409) {
    return fallbackMessage || '이미 처리되었거나 현재 상태와 충돌합니다. 새로고침 후 다시 시도해주세요.'
  }
  if (status === 400 || status === 422) {
    return fallbackMessage || '입력값을 확인한 뒤 다시 시도해주세요.'
  }
  if (status >= 500) {
    return `서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요. (HTTP ${status})`
  }
  return fallbackMessage || `요청 처리 중 오류가 발생했습니다. (HTTP ${status})`
}

export interface ApiError extends Error {
  status: number
  serverMessage: string
  responseData: unknown
  responseText: string
}

export function createApiError(status, data = null, text = '', fallbackMessage = '') {
  // `fallbackMessage` only stands in for the generic per-status copy; it does not outrank a
  // message the server wrote for the member.
  const error = new Error(userFacingServerMessage(status, data) || errorMessageForStatus(status, fallbackMessage)) as ApiError
  error.status = status
  error.serverMessage = serverMessageFromBody(data)
  error.responseData = data
  error.responseText = text
  return error
}

const NETWORK_ERROR_MESSAGE = '서버에 연결하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.'

// fetch() rejects only when no response arrived at all (offline, DNS, CORS, an aborted request),
// and the browser's own wording for that — "Failed to fetch", "Load failed" — reached the screen
// through every `err.message`. No `status` on purpose: callers read a status-less error as
// transient (AuthProvider retries /me on it and never takes it for a logged-out answer).
function createNetworkError(cause, message = NETWORK_ERROR_MESSAGE) {
  const error = new Error(message, { cause }) as Error & { isNetworkError: boolean }
  error.isNetworkError = true
  return error
}

const TIMEOUT_ERROR_MESSAGE = '서버 응답이 너무 늦습니다. 잠시 후 다시 시도해주세요.'
// Without a limit a request to a hung server never settled: the route guard sat on "로그인 상태를
// 확인하는 중..." and a submit button stayed disabled forever. Uploads (multipart bodies) get much
// longer, since a phone on campus Wi-Fi can take minutes to send a video.
export const REQUEST_TIMEOUT_MS = 30_000
export const UPLOAD_TIMEOUT_MS = 5 * 60_000

function withTimeout(init: RequestInit): RequestInit {
  if (typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function') return init
  const isUpload = typeof FormData !== 'undefined' && init.body instanceof FormData
  const timeout = AbortSignal.timeout(isUpload ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS)
  if (!init.signal) return { ...init, signal: timeout }
  // The caller's own signal (e.g. a cancelled query) still wins; combine when the browser can.
  return typeof AbortSignal.any === 'function' ? { ...init, signal: AbortSignal.any([init.signal, timeout]) } : init
}

async function fetchOrNetworkError(url, init: RequestInit) {
  try {
    return await fetch(url, withTimeout(init))
  } catch (cause) {
    const timedOut = (cause as { name?: string } | null)?.name === 'TimeoutError'
    throw createNetworkError(cause, timedOut ? TIMEOUT_ERROR_MESSAGE : NETWORK_ERROR_MESSAGE)
  }
}

function logInternalApiError(error) {
  if (!import.meta.env?.DEV) return
  // Nothing is hidden when the server's message is the one on screen.
  if (error?.serverMessage === error?.message) return
  if (!error?.serverMessage && !error?.responseText) return
  console.warn('API error details hidden from user message', {
    status: error.status,
    serverMessage: error.serverMessage,
    responseText: error.responseText,
  })
}

export async function throwApiError(response, fallbackMessage = '') {
  const { data, text } = await readErrorBody(response)
  const error = createApiError(response.status, data, text, fallbackMessage)
  logInternalApiError(error)
  throw error
}

function isOptionalDevApiPath(path) {
  return import.meta.env?.DEV && !API_BASE_URL && (path === '/api/fonts' || path === '/api/site-settings')
}

function optionalDevApiUnavailable(path) {
  if (typeof window === 'undefined') return false
  return window.sessionStorage.getItem(`${OPTIONAL_DEV_API_SKIP_KEY}:${path}`) === '1'
}

function rememberOptionalDevApiUnavailable(path, error) {
  if (typeof window === 'undefined') return
  // A font failure must not suppress the independent settings request.
  window.sessionStorage.setItem(`${OPTIONAL_DEV_API_SKIP_KEY}:${path}`, '1')
  if (!optionalDevNoticeShown) {
    optionalDevNoticeShown = true
    console.info('Local backend is unavailable; continuing with guest fallbacks for optional startup API calls.', error?.message || '')
  }
}

function isDevBackendUnavailableError(error) {
  return error?.status >= 500 || error?.isNetworkError === true
}

export async function requestOptional(path, options: RequestInit = {}, fallback = null) {
  if (!isOptionalDevApiPath(path)) return request(path, options)
  if (optionalDevApiUnavailable(path)) return fallback

  const key = `${path}:${options.method || 'GET'}`
  if (!optionalDevApiInFlight.has(key)) {
    optionalDevApiInFlight.set(
      key,
      request(path, options)
        .catch((error) => {
          if (isDevBackendUnavailableError(error)) {
            rememberOptionalDevApiUnavailable(path, error)
            return fallback
          }
          throw error
        })
        .finally(() => {
          optionalDevApiInFlight.delete(key)
        }),
    )
  }
  return optionalDevApiInFlight.get(key)
}

export async function request(path, options: RequestInit = {}) {
  const isFormData = options.body instanceof FormData
  const headers = isFormData
    ? options.headers
    : { 'Content-Type': 'application/json', ...options.headers }

  // `credentials` AFTER the spread: a caller passing its own `options.credentials`
  // (or a spread RequestInit carrying an explicit `credentials: 'same-origin'`)
  // silently dropped the session cookie when it came first.
  const fetchOnce = () => fetchOrNetworkError(apiUrl(path), { ...options, headers, credentials: 'include' })

  const generationBeforeRequest = refreshGeneration
  let response = await fetchOnce()
  response = await recoverFromAuthFailure(path, response, generationBeforeRequest, fetchOnce)

  if (!response.ok) {
    await throwApiError(response)
  }
  const data = await response.json().catch(() => null)
  return data
}

export async function requestNoContent(path, options: RequestInit = {}) {
  const isFormData = options.body instanceof FormData
  const headers = (options.body && !isFormData)
    ? { 'Content-Type': 'application/json', ...options.headers }
    : options.headers
  const fetchOnce = () => fetchOrNetworkError(apiUrl(path), { ...options, headers, credentials: 'include' })

  const generationBeforeRequest = refreshGeneration
  let response = await fetchOnce()
  response = await recoverFromAuthFailure(path, response, generationBeforeRequest, fetchOnce)

  if (!response.ok) {
    await throwApiError(response)
  }
}

export async function requestBlob(path, options: RequestInit = {}) {
  const fetchOnce = () => fetchOrNetworkError(apiUrl(path), { ...options, credentials: 'include' })

  const generationBeforeRequest = refreshGeneration
  let response = await fetchOnce()
  response = await recoverFromAuthFailure(path, response, generationBeforeRequest, fetchOnce)

  if (!response.ok) {
    await throwApiError(response)
  }
  return response.blob()
}
