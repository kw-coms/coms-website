import { apiUrl, request, requestNoContent } from './apiClient.js'

export async function listFiles() {
  return request('/api/files')
}

export async function uploadFile(file) {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch(apiUrl('/api/files'), {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.message || '업로드 중 오류가 발생했습니다.')
  return data
}

export function downloadUrl(id) {
  return apiUrl(`/api/files/${id}/download`)
}

export async function deleteFile(id) {
  return requestNoContent(`/api/files/${id}`, {
    method: 'DELETE',
  })
}
