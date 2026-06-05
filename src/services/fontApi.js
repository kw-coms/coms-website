import { request } from './apiClient.js'

export async function listFonts() {
  return request('/api/fonts')
}

export async function listAdminFonts() {
  return request('/api/admin/fonts')
}

export async function uploadFont(name, file) {
  const form = new FormData()
  form.append('name', name)
  form.append('file', file)
  return request('/api/admin/fonts', {
    method: 'POST',
    body: form,
  })
}

export async function setFontActive(id, active) {
  return request(`/api/admin/fonts/${id}/active`, {
    method: 'PATCH',
    body: JSON.stringify({ active }),
  })
}
