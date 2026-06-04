import { request, requestNoContent } from './apiClient.js'

export async function listCommunityPosts() {
  return request('/api/community/posts')
}

export async function getCommunityPost(id) {
  return request(`/api/community/posts/${id}`)
}

export async function createCommunityPost(body, image) {
  if (image) {
    const form = new FormData()
    form.append('title', body.title)
    form.append('content', body.content)
    form.append('image', image)
    return request('/api/community/posts', {
      method: 'POST',
      body: form,
    })
  }

  return request('/api/community/posts', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateCommunityPost(id, body, image) {
  if (image) {
    const form = new FormData()
    form.append('title', body.title)
    form.append('content', body.content)
    form.append('removeImage', body.removeImage ? 'true' : 'false')
    form.append('image', image)
    return request(`/api/community/posts/${id}`, {
      method: 'PATCH',
      body: form,
    })
  }

  return request(`/api/community/posts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function voteCommunityPost(id, value) {
  return request(`/api/community/posts/${id}/vote`, {
    method: 'POST',
    body: JSON.stringify({ value }),
  })
}

export async function deleteCommunityPost(id) {
  return requestNoContent(`/api/community/posts/${id}`, {
    method: 'DELETE',
  })
}
