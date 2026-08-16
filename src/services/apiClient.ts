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
let refreshInFlight: Promise<boolean> | null = null
async function tryRefreshToken() {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = (async () => {
    try {
      const res = await fetch(apiUrl('/api/auth/refresh'), { method: 'POST', credentials: 'include' })
      return res.ok
    } catch {
      return false
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
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

function errorMessageForStatus(status, fallbackMessage = '') {
  if (status === 413) {
    return '업로드 용량이 너무 큽니다. 이미지/영상 크기를 줄여 다시 시도해주세요.'
  }
  if (status === 401) {
    return fallbackMessage || '로그인이 만료되었습니다. 다시 로그인해주세요.'
  }
  if (status === 403) {
    return fallbackMessage || '접근 권한이 없거나 로그인 상태가 만료되었습니다. 다시 로그인해주세요.'
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
  // On 401/403, `message` carries the backend's intentional user-facing text (wrong password,
  // unverified email — ResponseStatusException reasons via ApiExceptionHandler). Other statuses
  // keep the b955a1a policy of hiding server text; `error`/`detail` are framework defaults
  // ("Forbidden") and are never shown.
  const authMessage = (status === 401 || status === 403) ? data?.message : ''
  const error = new Error(errorMessageForStatus(status, fallbackMessage || authMessage || '')) as ApiError
  error.status = status
  error.serverMessage = serverMessageFromBody(data)
  error.responseData = data
  error.responseText = text
  return error
}

function logInternalApiError(error) {
  if (!import.meta.env?.DEV) return
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
  return import.meta.env?.DEV && !API_BASE_URL && (path === '/api/auth/me' || path === '/api/fonts' || path === '/api/site-settings')
}

function optionalDevApiUnavailable() {
  if (typeof window === 'undefined') return false
  return window.sessionStorage.getItem(OPTIONAL_DEV_API_SKIP_KEY) === '1'
}

function rememberOptionalDevApiUnavailable(error) {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(OPTIONAL_DEV_API_SKIP_KEY, '1')
  if (!optionalDevNoticeShown) {
    optionalDevNoticeShown = true
    console.info('Local backend is unavailable; continuing with guest fallbacks for optional startup API calls.', error?.message || '')
  }
}

function isDevBackendUnavailableError(error) {
  return error?.status >= 500 || /Failed to fetch|NetworkError|Load failed/i.test(error?.message || '')
}

export async function requestOptional(path, options: RequestInit = {}, fallback = null) {
  if (!isOptionalDevApiPath(path)) return request(path, options)
  if (optionalDevApiUnavailable()) return fallback

  const key = `${path}:${options.method || 'GET'}`
  if (!optionalDevApiInFlight.has(key)) {
    optionalDevApiInFlight.set(
      key,
      request(path, options)
        .catch((error) => {
          if (isDevBackendUnavailableError(error)) {
            rememberOptionalDevApiUnavailable(error)
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

  const fetchOnce = () => fetch(apiUrl(path), { credentials: 'include', ...options, headers })

  let response = await fetchOnce()
  const canRefresh = path === '/api/auth/me' || !path.includes('/api/auth/')
  if ((response.status === 401 || response.status === 403) && canRefresh) {
    if (await tryRefreshToken()) response = await fetchOnce()
    else if (response.status === 401) notifySessionExpired()
  }

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
  const fetchOnce = () => fetch(apiUrl(path), { credentials: 'include', ...options, headers })

  let response = await fetchOnce()
  const canRefresh = path === '/api/auth/me' || !path.includes('/api/auth/')
  if ((response.status === 401 || response.status === 403) && canRefresh) {
    if (await tryRefreshToken()) response = await fetchOnce()
    else if (response.status === 401) notifySessionExpired()
  }

  if (!response.ok) {
    await throwApiError(response)
  }
}

export async function requestBlob(path, options: RequestInit = {}) {
  const fetchOnce = () => fetch(apiUrl(path), { credentials: 'include', ...options })

  let response = await fetchOnce()
  const canRefresh = path === '/api/auth/me' || !path.includes('/api/auth/')
  if ((response.status === 401 || response.status === 403) && canRefresh) {
    if (await tryRefreshToken()) response = await fetchOnce()
    else if (response.status === 401) notifySessionExpired()
  }

  if (!response.ok) {
    await throwApiError(response)
  }
  return response.blob()
}
