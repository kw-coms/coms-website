import { request, requestNoContent } from './apiClient.js'

export async function listNotifications() {
  return request('/api/notifications')
}

export async function getNotificationSummary() {
  return request('/api/notifications/summary')
}

export async function markNotificationRead(id) {
  return request(`/api/notifications/${id}/read`, { method: 'PATCH' })
}

export async function markAllNotificationsRead() {
  return requestNoContent('/api/notifications/read-all', { method: 'PATCH' })
}
