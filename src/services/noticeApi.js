import { request, requestNoContent } from './apiClient.js'

export async function listNotices() {
  return request('/api/notices')
}

export async function getNotice(id) {
  return request(`/api/notices/${id}`)
}

export async function createNotice(body) {
  return request('/api/notices', { method: 'POST', body: JSON.stringify(body) })
}

export async function updateNotice(id, body) {
  return request(`/api/notices/${id}`, { method: 'PUT', body: JSON.stringify(body) })
}

export async function deleteNotice(id) {
  return requestNoContent(`/api/notices/${id}`, {
    method: 'DELETE',
  })
}
