import { request, requestNoContent } from './apiClient'

export async function listMembers() {
  return request('/api/admin/members')
}

export async function getAdminAnalytics() {
  return request('/api/admin/analytics')
}

export async function listAuditLogs(limit = 1000) {
  return request(`/api/admin/audit-logs?limit=${encodeURIComponent(limit)}`)
}

export async function clearAdminCache() {
  return request('/api/admin/cache/clear', { method: 'POST' })
}

export async function listCommunityReports() {
  return request('/api/admin/community/reports')
}

export async function listDeletedCommunityPosts(limit = 300) {
  return request(`/api/admin/community/deleted-posts?limit=${encodeURIComponent(limit)}`)
}

export async function getDeletedCommunityPost(id) {
  return request(`/api/admin/community/deleted-posts/${id}`)
}

export async function restoreDeletedCommunityPost(id) {
  return request(`/api/admin/community/deleted-posts/${id}/restore`, { method: 'POST' })
}

export async function resolveCommunityReport(id, payload) {
  return request(`/api/admin/community/reports/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function listRecruitApplications() {
  return request('/api/admin/recruit-applications')
}

export async function updateRecruitApplicationStatus(id, payload) {
  return request(`/api/admin/recruit-applications/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function updateMemberRole(id, role) {
  return request(`/api/admin/members/${id}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  })
}

export async function listRecruitPromotions() {
  return request('/api/admin/recruit-promotions')
}

export async function updateMemberGeneration(id, generation) {
  return request(`/api/admin/members/${id}/generation`, {
    method: 'PATCH',
    body: JSON.stringify({ generation }),
  })
}

export async function deleteMember(id) {
  return requestNoContent(`/api/admin/members/${id}`, {
    method: 'DELETE',
  })
}

export async function listEligibleMembers() {
  return request('/api/admin/eligible-members')
}

export async function addEligibleMember(payload) {
  return request('/api/admin/eligible-members', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateEligibleMember(id, studentId, name, phone, generation) {
  return requestNoContent(`/api/admin/eligible-members/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ studentId, name, phone: phone || null, generation: generation || null }),
  })
}

export async function deleteEligibleMember(id) {
  return requestNoContent(`/api/admin/eligible-members/${id}`, {
    method: 'DELETE',
  })
}

export async function resetMemberPassword(id, password) {
  return request(`/api/admin/members/${id}/password`, {
    method: 'PUT',
    body: JSON.stringify({ password }),
  })
}

export async function listBannedStudents() {
  return request('/api/admin/banned-students')
}

export async function banStudent(studentId, duration) {
  return requestNoContent('/api/admin/banned-students', {
    method: 'POST',
    body: JSON.stringify({ studentId, duration }),
  })
}

export async function unbanStudent(studentId) {
  return requestNoContent(`/api/admin/banned-students/${studentId}`, {
    method: 'DELETE',
  })
}

export async function importEligibleMembers(file) {
  const formData = new FormData()
  formData.append('file', file)

  return request('/api/admin/eligible-members/import', {
    method: 'POST',
    headers: {},
    body: formData,
  })
}
