import { request } from './apiClient.js'

export async function signupUser(payload) {
  return request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function loginUser(payload) {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function logoutUser() {
  return request('/api/auth/logout', { method: 'POST' })
}

export async function getCurrentUser() {
  return request('/api/auth/me')
}
