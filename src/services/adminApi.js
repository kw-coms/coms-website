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

export async function listEligibleMembers() {
  return request('/api/admin/eligible-members')
}

export async function addEligibleMember(studentId, name) {
  return request('/api/admin/eligible-members', {
    method: 'POST',
    body: JSON.stringify({ studentId, name }),
  })
}

export async function updateEligibleMember(id, studentId, name, phone) {
  return requestNoContent(`/api/admin/eligible-members/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ studentId, name, phone: phone || null }),
  })
}

export async function deleteEligibleMember(id) {
  return requestNoContent(`/api/admin/eligible-members/${id}`, {
    method: 'DELETE',
  })
}

export async function listBannedStudents() {
  return request('/api/admin/banned-students')
}

export async function banStudent(studentId) {
  return requestNoContent('/api/admin/banned-students', {
    method: 'POST',
    body: JSON.stringify({ studentId }),
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
