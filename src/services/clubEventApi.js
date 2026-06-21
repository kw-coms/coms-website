import { request, requestNoContent } from './apiClient.js'

export async function listClubEvents() {
  return request('/api/club-events')
}

export async function getClubEvent(id) {
  return request(`/api/club-events/${id}`)
}

export async function createClubEvent({ title, description, startsAt, endsAt }) {
  return request('/api/club-events', {
    method: 'POST',
    body: JSON.stringify({ title, description, startsAt, endsAt }),
  })
}

export async function updateClubEvent(id, { title, description, startsAt, endsAt }) {
  return request(`/api/club-events/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title, description, startsAt, endsAt }),
  })
}

export async function uploadClubEventEntry(id, { title, authorName, description, file, files }) {
  const form = new FormData()
  form.append('title', title)
  if (authorName) form.append('authorName', authorName)
  if (description) form.append('description', description)
  const uploadFiles = Array.from(files || (file ? [file] : []))
  uploadFiles.forEach((item) => form.append('files', item))
  return request(`/api/club-events/${id}/entries`, {
    method: 'POST',
    body: form,
  })
}

export async function voteClubEventEntry(id, entryId) {
  return request(`/api/club-events/${id}/entries/${entryId}/vote`, {
    method: 'POST',
    body: JSON.stringify({ entryId }),
  })
}

export async function deleteClubEvent(id) {
  return requestNoContent(`/api/club-events/${id}`, {
    method: 'DELETE',
  })
}

export async function deleteClubEventEntry(id, entryId) {
  return requestNoContent(`/api/club-events/${id}/entries/${entryId}`, {
    method: 'DELETE',
  })
}
