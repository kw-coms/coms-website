import { request } from './apiClient'

const ajaxHeaders = { 'X-Requested-With': 'XMLHttpRequest' }

export async function listProfileMiniAppDocuments(app) {
  return request(`/api/mini-apps/${app}/profile`, {
    headers: ajaxHeaders,
  })
}
