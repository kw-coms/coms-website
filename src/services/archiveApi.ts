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

export async function createPost({ title, description, category, file }: {
  title: string
  description?: string
  category?: string
  file: File
}) {
  const formData = new FormData()
  formData.append('title', title)
  if (description) formData.append('description', description)
  formData.append('category', category || 'GENERAL')
  formData.append('file', file)
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

// Keep uploading after individual failures. Shared titles are numbered; admin uploads use filenames.
export async function createPosts(files: File[], meta: { title?: string; description?: string; category?: string } = {}) {
  const multiple = files.length > 1
  const results = []
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]
    const title = multiple && meta.title ? `${meta.title} (${index + 1})` : meta.title || file.name
    try {
      const saved = await createPost({ ...meta, title, file })
      results.push({ ok: true, file, saved })
    } catch (err) {
      results.push({ ok: false, file, error: err })
    }
  }
  return results
}

export function downloadUrl(id, contentVersion?: string) {
  return apiUrl(`/api/files/${id}/download${contentVersion ? `?v=${encodeURIComponent(contentVersion)}` : ''}`)
}

export function updateArchiveFile(id, { title, description, category, file }: { title: string; description: string; category: string; file?: File }) {
  const body = new FormData()
  body.append('title', title)
  body.append('description', description)
  body.append('category', category)
  if (file) body.append('file', file)
  return request(`/api/files/${id}`, { method: 'PUT', body })
}

export async function deleteFile(id) {
  return requestNoContent(`/api/files/${id}`, {
    method: 'DELETE',
  })
}
