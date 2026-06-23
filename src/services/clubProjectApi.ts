import { apiUrl, request, requestNoContent, throwApiError } from './apiClient'

// ─── Public read ─────────────────────────────────────────────────────────────

export async function listClubProjects() {
  return request('/api/club-projects')
}

export async function listClubProjectCategories() {
  return request('/api/club-projects/categories')
}

// ─── Admin project CRUD ──────────────────────────────────────────────────────

function projectFormData({ category, title, description, eyebrow, madeBy, linkUrl, displayUrl, position }) {
  const form = new FormData()
  if (category != null) form.append('category', category)
  if (title != null) form.append('title', title)
  if (description != null) form.append('description', description)
  if (eyebrow != null) form.append('eyebrow', eyebrow)
  if (madeBy != null) form.append('madeBy', madeBy)
  if (linkUrl != null) form.append('linkUrl', linkUrl)
  if (displayUrl != null) form.append('displayUrl', displayUrl)
  if (position != null) form.append('position', String(position))
  return form
}

export async function createClubProject(fields) {
  const response = await fetch(apiUrl('/api/club-projects'), {
    method: 'POST',
    credentials: 'include',
    body: projectFormData(fields),
  })
  if (!response.ok) await throwApiError(response, '프로젝트 등록 중 오류가 발생했습니다.')
  const data = await response.json().catch(() => null)
  return data
}

export async function updateClubProject(id, fields) {
  return request(`/api/club-projects/${id}`, {
    method: 'PATCH',
    body: projectFormData(fields),
  })
}

export async function deleteClubProject(id) {
  return requestNoContent(`/api/club-projects/${id}`, {
    method: 'DELETE',
  })
}

// ─── Admin distributable files (apk/zip) ─────────────────────────────────────

export async function uploadClubProjectFile(id, file) {
  const form = new FormData()
  form.append('file', file)
  return request(`/api/club-projects/${id}/files`, {
    method: 'POST',
    body: form,
  })
}

export async function deleteClubProjectFile(id, fileId) {
  return requestNoContent(`/api/club-projects/${id}/files/${fileId}`, {
    method: 'DELETE',
  })
}

// ─── Admin-managed categories (CRUD) ─────────────────────────────────────────

export async function createClubProjectCategory({ key, name, position }: any) {
  return request('/api/admin/club-project-categories', {
    method: 'POST',
    body: JSON.stringify({ key, name, position }),
  })
}

export async function updateClubProjectCategory(id, { name, position }: any) {
  return request(`/api/admin/club-project-categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name, position }),
  })
}

export async function deleteClubProjectCategory(id) {
  return requestNoContent(`/api/admin/club-project-categories/${id}`, {
    method: 'DELETE',
  })
}
