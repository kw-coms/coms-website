import { request, requestNoContent } from './apiClient.js'

export async function listCommunityPosts() {
  return request('/api/community/posts')
}

export async function createCommunityPost(body) {
  return request('/api/community/posts', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateCommunityPost(id, body) {
  return request(`/api/community/posts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteCommunityPost(id) {
  return requestNoContent(`/api/community/posts/${id}`, {
    method: 'DELETE',
  })
}
