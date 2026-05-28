const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'

export function getToken() {
  return localStorage.getItem('token')
}

export function clearAuth() {
  localStorage.removeItem('token')
  localStorage.removeItem('studentId')
  localStorage.removeItem('name')
}

async function request(path, options = {}) {
  const token = getToken()
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(data?.message || '요청 처리 중 오류가 발생했습니다.')
  }

  return data
}

export async function signupUser(payload) {
  return request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function loginUser(payload) {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}