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

export async function updateClubActivity(id, { kind, category, title, description, eventDate }) {
  const formData = new FormData()
  if (kind != null) formData.append('kind', kind)
  if (category != null) formData.append('category', category)
  if (title != null) formData.append('title', title)
  if (description != null) formData.append('description', description)
  if (eventDate != null) formData.append('eventDate', eventDate)
  return request(`/api/club-activities/${id}`, {
    method: 'PATCH',
    body: formData,
  })
}

export async function getClubActivity(id) {
  return request(`/api/club-activities/${id}`)
}

export async function voteClubActivity(id, value) {
  return request(`/api/club-activities/${id}/vote`, {
    method: 'POST',
    body: JSON.stringify({ value }),
  })
}

export async function deleteClubActivity(id) {
  return requestNoContent(`/api/club-activities/${id}`, {
    method: 'DELETE',
  })
}

// ─── Multi-media (mirrors the community media endpoints) ──────────────────────

export async function uploadClubActivityImages(id, files) {
  const form = new FormData()
  Array.from(files).forEach((file) => form.append('images', file))
  return request(`/api/club-activities/${id}/images`, {
    method: 'POST',
    body: form,
  })
}

export async function deleteClubActivityImage(id, imageId) {
  return requestNoContent(`/api/club-activities/${id}/images/${imageId}`, {
    method: 'DELETE',
  })
}

export async function uploadClubActivityFile(id, file) {
  const form = new FormData()
  form.append('file', file)
  return request(`/api/club-activities/${id}/files`, {
    method: 'POST',
    body: form,
  })
}

export async function deleteClubActivityFile(id, fileId) {
  return requestNoContent(`/api/club-activities/${id}/files/${fileId}`, {
    method: 'DELETE',
  })
}

// ─── Admin-managed categories (CRUD) ─────────────────────────────────────────

export async function listClubActivityCategories() {
  return request('/api/club-activities/categories')
}

export async function createClubActivityCategory({ key, name, position }) {
  return request('/api/admin/club-activity-categories', {
    method: 'POST',
    body: JSON.stringify({ key, name, position }),
  })
}

export async function updateClubActivityCategory(id, { name, position }) {
  return request(`/api/admin/club-activity-categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name, position }),
  })
}

export async function deleteClubActivityCategory(id) {
  return requestNoContent(`/api/admin/club-activity-categories/${id}`, {
    method: 'DELETE',
  })
}
