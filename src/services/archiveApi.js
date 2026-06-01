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

export async function listFiles() {
  return request('/api/files')
}

export async function uploadFile(file) {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch(`${API_BASE_URL}/api/files`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.message || '업로드 중 오류가 발생했습니다.')
  return data
}

export function downloadUrl(id) {
  return `${API_BASE_URL}/api/files/${id}/download`
}

export async function deleteFile(id) {
  const response = await fetch(`${API_BASE_URL}/api/files/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.message || '삭제 중 오류가 발생했습니다.')
  }
}
