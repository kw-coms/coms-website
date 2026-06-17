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
    form.append('category', body.category || 'GENERAL')
    form.append('anonymousName', body.anonymousName || '')
    form.append('image', image)
    return request('/api/community/posts', {
      method: 'POST',
      body: form,
    })
  }

  return request('/api/community/posts', {
    method: 'POST',
    body: JSON.stringify({ ...body, removeImage: Boolean(body.removeImage) }),
  })
}

export async function updateCommunityPost(id, body, image) {
  if (image) {
    const form = new FormData()
    form.append('title', body.title)
    form.append('content', body.content)
    form.append('category', body.category || 'GENERAL')
    form.append('removeImage', body.removeImage ? 'true' : 'false')
    form.append('anonymousName', body.anonymousName || '')
    form.append('image', image)
    return request(`/api/community/posts/${id}`, {
      method: 'PATCH',
      body: form,
    })
  }

  return request(`/api/community/posts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...body, removeImage: Boolean(body.removeImage) }),
  })
}

export async function voteCommunityPost(id, value) {
  return request(`/api/community/posts/${id}/vote`, {
    method: 'POST',
    body: JSON.stringify({ value }),
  })
}

export async function voteCommunityPoll(id, pollId, optionIndex) {
  return request(`/api/community/posts/${id}/poll-votes`, {
    method: 'POST',
    body: JSON.stringify({ pollId, optionIndex }),
  })
}

export async function closeCommunityPoll(id, pollId) {
  return request(`/api/community/posts/${id}/polls/${encodeURIComponent(pollId)}/close`, {
    method: 'POST',
  })
}

export async function searchYoutubeVideos(query) {
  const q = encodeURIComponent(query)
  return request(`/api/community/posts/tools/youtube/search?q=${q}`)
}

export async function deleteCommunityPost(id, reason = '') {
  const cleanReason = reason?.trim() || ''
  return requestNoContent(`/api/community/posts/${id}`, {
    method: 'DELETE',
    body: cleanReason ? JSON.stringify({ reason: cleanReason }) : undefined,
  })
}

export async function uploadPostImages(postId, files) {
  const form = new FormData()
  files.forEach((f) => form.append('images', f))
  return request(`/api/community/posts/${postId}/images`, {
    method: 'POST',
    body: form,
  })
}

export async function deletePostImage(postId, imageId) {
  return requestNoContent(`/api/community/posts/${postId}/images/${imageId}`, {
    method: 'DELETE',
  })
}

export async function uploadPostVideo(postId, file) {
  const form = new FormData()
  form.append('video', file)
  return request(`/api/community/posts/${postId}/videos`, {
    method: 'POST',
    body: form,
  })
}

export async function uploadPostFile(postId, file) {
  const form = new FormData()
  form.append('file', file)
  return request(`/api/community/posts/${postId}/files`, {
    method: 'POST',
    body: form,
  })
}

export async function deletePostVideo(postId, videoId) {
  return requestNoContent(`/api/community/posts/${postId}/videos/${videoId}`, {
    method: 'DELETE',
  })
}

export async function listComments(postId) {
  return request(`/api/community/posts/${postId}/comments`)
}

export async function createComment(postId, content, parentCommentId = null, anonymousName = '') {
  return request(`/api/community/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content, parentCommentId, anonymousName }),
  })
}

export async function updateComment(postId, commentId, content) {
  return request(`/api/community/posts/${postId}/comments/${commentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ content, parentCommentId: null }),
  })
}

export async function deleteComment(postId, commentId) {
  return requestNoContent(`/api/community/posts/${postId}/comments/${commentId}`, {
    method: 'DELETE',
  })
}
