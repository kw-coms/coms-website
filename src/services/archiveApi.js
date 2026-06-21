import { apiUrl, request, requestNoContent, throwApiError } from './apiClient.js'

export async function listFiles() {
  return request('/api/files')
}

export async function createPost({ title, description, category, file }) {
  const formData = new FormData()
  formData.append('title', title)
  if (description) formData.append('description', description)
  formData.append('category', category || 'GENERAL')
  formData.append('file', file)
  const response = await fetch(apiUrl('/api/files'), {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!response.ok) await throwApiError(response, '업로드 중 오류가 발생했습니다.')
  const data = await response.json().catch(() => null)
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
