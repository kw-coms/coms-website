const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.message || '요청 처리 중 오류가 발생했습니다.')
  return data
}

export async function listNotices() {
  return request('/api/notices')
}

export async function getNotice(id) {
  return request(`/api/notices/${id}`)
}

export async function createNotice(body) {
  return request('/api/notices', { method: 'POST', body: JSON.stringify(body) })
}

export async function updateNotice(id, body) {
  return request(`/api/notices/${id}`, { method: 'PUT', body: JSON.stringify(body) })
}

export async function deleteNotice(id) {
  const response = await fetch(`${API_BASE_URL}/api/notices/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.message || '삭제 중 오류가 발생했습니다.')
  }
}
