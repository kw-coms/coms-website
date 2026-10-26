import { apiUrl, request, requestNoContent } from './apiClient'

export async function voteArchiveFile(id, value) {
  return request(`/api/files/${id}/vote`, {
    method: 'POST',
    body: JSON.stringify({ value }),
  })
}

export async function listFiles() {
  return request('/api/files')
}

export async function createPost({ title, description, category, file, files }: {
  title: string
  description?: string
  category?: string
  file?: File
  files?: File[]
}) {
  const formData = new FormData()
  formData.append('title', title)
  if (description) formData.append('description', description)
  formData.append('category', category || 'GENERAL')
  if (file) formData.append('file', file)
  files?.forEach(attachment => formData.append('files', attachment))
  return request('/api/files', {
    method: 'POST',
    body: formData,
  })
}

export function updateArchiveAuthor(id, uploaderName) {
  return request(`/api/files/${id}/author`, {
    method: 'PATCH',
    body: JSON.stringify(typeof uploaderName === 'string' ? { uploaderName } : uploaderName),
  })
}

export function downloadUrl(id, contentVersion?: string) {
  return apiUrl(`/api/files/${id}/download${contentVersion ? `?v=${encodeURIComponent(contentVersion)}` : ''}`)
}

export function attachmentDownloadUrl(postId, attachmentId, contentVersion?: string) {
  if (attachmentId == null) return downloadUrl(postId, contentVersion)
  return apiUrl(`/api/files/${postId}/attachments/${attachmentId}/download${contentVersion ? `?v=${encodeURIComponent(contentVersion)}` : ''}`)
}

export function updateArchiveFile(id, { title, description, category, file, files }: { title: string; description: string; category: string; file?: File; files?: File[] }) {
  const body = new FormData()
  body.append('title', title)
  body.append('description', description)
  body.append('category', category)
  if (file) body.append('file', file)
  files?.forEach(attachment => body.append('files', attachment))
  return request(`/api/files/${id}`, { method: 'PUT', body })
}

export async function deleteFile(id) {
  return requestNoContent(`/api/files/${id}`, {
    method: 'DELETE',
  })
}
