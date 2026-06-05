import { request } from './apiClient.js'

export async function submitRecruitApplication(payload) {
  return request('/api/recruit/apply', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
