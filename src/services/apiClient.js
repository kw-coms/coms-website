export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

export function apiUrl(path) {
  const baseUrl = API_BASE_URL.replace(/\/+$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  if (baseUrl.endsWith('/api') && normalizedPath.startsWith('/api/')) {
    return `${baseUrl}${normalizedPath.slice('/api'.length)}`
  }

  return `${baseUrl}${normalizedPath}`
}

export async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData
  const headers = isFormData
    ? options.headers
    : {
        'Content-Type': 'application/json',
        ...options.headers,
      }

  const response = await fetch(apiUrl(path), {
    credentials: 'include',
    ...options,
    headers,
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(data?.message || '요청 처리 중 오류가 발생했습니다.')
  }

  return data
}

export async function requestNoContent(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    credentials: 'include',
    ...options,
  })

  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.message || '요청 처리 중 오류가 발생했습니다.')
  }
}
