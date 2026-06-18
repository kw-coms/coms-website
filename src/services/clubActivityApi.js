import { apiUrl, request, requestNoContent } from './apiClient.js'

export async function listClubActivities() {
  return request('/api/club-activities')
}

export async function createClubActivity({ kind, category, title, description, eventDate, image }) {
  const formData = new FormData()
  formData.append('kind', kind)
  formData.append('category', category || 'GENERAL')
  formData.append('title', title)
  formData.append('eventDate', eventDate)
  if (description) formData.append('description', description)
  if (image) formData.append('image', image)

  const response = await fetch(apiUrl('/api/club-activities'), {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.message || data?.detail || '활동 기록 등록 중 오류가 발생했습니다.')
  return data
}

export async function deleteClubActivity(id) {
  return requestNoContent(`/api/club-activities/${id}`, {
    method: 'DELETE',
  })
}
