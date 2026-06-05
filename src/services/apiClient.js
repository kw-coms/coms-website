export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

export function apiUrl(path) {
  const baseUrl = API_BASE_URL.replace(/\/+$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  if (baseUrl.endsWith('/api') && normalizedPath.startsWith('/api/')) {
    return `${baseUrl}${normalizedPath.slice('/api'.length)}`
  }

  return `${baseUrl}${normalizedPath}`
}

async function tryRefreshToken() {
  const res = await fetch(apiUrl('/api/auth/refresh'), { method: 'POST', credentials: 'include' })
  return res.ok
}

export async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData
  const headers = isFormData
    ? options.headers
    : { 'Content-Type': 'application/json', ...options.headers }

  const fetchOnce = () => fetch(apiUrl(path), { credentials: 'include', ...options, headers })

  let response = await fetchOnce()
  if (response.status === 401 && !path.includes('/api/auth/')) {
    if (await tryRefreshToken()) response = await fetchOnce()
  }

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.message || data?.detail || data?.error || '요청 처리 중 오류가 발생했습니다.')
  }
  return data
}

export async function requestNoContent(path, options = {}) {
  const isFormData = options.body instanceof FormData
  const headers = (options.body && !isFormData)
    ? { 'Content-Type': 'application/json', ...options.headers }
    : options.headers
  const fetchOnce = () => fetch(apiUrl(path), { credentials: 'include', ...options, headers })

  let response = await fetchOnce()
  if (response.status === 401 && !path.includes('/api/auth/')) {
    if (await tryRefreshToken()) response = await fetchOnce()
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.message || data?.detail || data?.error || '요청 처리 중 오류가 발생했습니다.')
  }
}
