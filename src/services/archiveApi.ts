import { apiUrl, request, requestNoContent, throwApiError } from './apiClient'

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
  const response = await fetch(apiUrl('/api/files'), {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!response.ok) await throwApiError(response, '업로드 중 오류가 발생했습니다.')
  const data = await response.json().catch(() => null)
  return data
}

// Batch-create one resource entry per selected file by reusing the single-create
// endpoint in a loop (no backend change). Each file gets the shared meta; when more
// than one file is selected the title is suffixed with a 1-based index to stay distinct.
// Returns per-file results so callers can report partial success/failure.
export async function createPosts(files, meta) {
  const multiple = files.length > 1
  const results = []
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]
    const title = multiple ? `${meta.title} (${index + 1})` : meta.title
    try {
      const saved = await createPost({ ...meta, title, file })
      results.push({ ok: true, file, saved })
    } catch (err) {
      results.push({ ok: false, file, error: err })
    }
  }
  return results
}

export function downloadUrl(id) {
  return apiUrl(`/api/files/${id}/download`)
}

export async function deleteFile(id) {
  return requestNoContent(`/api/files/${id}`, {
    method: 'DELETE',
  })
}
