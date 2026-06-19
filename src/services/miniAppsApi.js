import { request } from './apiClient.js'

const ajaxHeaders = { 'X-Requested-With': 'XMLHttpRequest' }

export async function listProfileMiniAppDocuments(app) {
  return request(`/api/mini-apps/${app}/profile`, {
    headers: ajaxHeaders,
  })
}
