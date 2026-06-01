import { request, requestNoContent } from './apiClient.js'

export async function listMembers() {
  return request('/api/admin/members')
}

export async function updateMemberRole(id, role) {
  return request(`/api/admin/members/${id}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  })
}

export async function deleteMember(id) {
  return requestNoContent(`/api/admin/members/${id}`, {
    method: 'DELETE',
  })
}
