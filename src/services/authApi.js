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

export async function changePassword(currentPassword, newPassword) {
  return request('/api/auth/password', {
    method: 'PATCH',
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}

export async function requestPasswordReset(payload) {
  return request('/api/auth/password-reset/request', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function confirmPasswordReset(payload) {
  return request('/api/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateProfile(payload) {
  return request('/api/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function requestEmailVerification() {
  return request('/api/auth/email-verification/request', { method: 'POST' })
}

export async function confirmEmailVerification(code) {
  return request('/api/auth/email-verification/confirm', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

export async function requestSignupEmailVerification(studentId) {
  return request('/api/auth/email-verification/request-signup', {
    method: 'POST',
    body: JSON.stringify({ studentId }),
  })
}

export async function confirmSignupEmailVerification(studentId, code) {
  return request('/api/auth/email-verification/confirm-signup', {
    method: 'POST',
    body: JSON.stringify({ studentId, code }),
  })
}
