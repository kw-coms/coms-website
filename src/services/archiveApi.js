import { request } from './authApi.js'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

export async function getFiles() {
  return request('/files', { method: 'GET' })
}

export async function downloadFile(id, originalName) {
  const response = await fetch(`${API_BASE_URL}/files/${id}/download`, {
    credentials: 'include',
  })

  if (!response.ok) {
    throw new Error('다운로드 실패')
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = originalName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export async function uploadFile(file) {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${API_BASE_URL}/files`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(data?.message || '업로드 실패')
  }

  return data
}
