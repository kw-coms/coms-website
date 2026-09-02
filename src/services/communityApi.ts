import { request, requestNoContent } from './apiClient'

export async function listCommunityPosts() {
  // The backend list endpoint is DB-paginated (default 20, max 200 per page), but the
  // board UI still filters/sorts/paginates client-side over the full list, so fetch
  // every page. ponytail: fine at club scale; move filter/sort/search server-side if
  // the board outgrows a few thousand posts.
  const size = 200
  // Hard stop: an unbounded `for (;;)` walks forever if the backend ever returns a
  // full page for every offset (a paging bug, a proxy replaying one page), pinning
  // the tab. 50 * 200 = 10,000 posts is far past club scale — hitting it is a bug
  // worth seeing in the console, not a board worth rendering.
  const maxPages = 50
  const all = []
  for (let page = 0; page < maxPages; page += 1) {
    const batch = await request(`/api/community/posts?page=${page}&size=${size}`)
    if (!Array.isArray(batch) || batch.length === 0) break
    all.push(...batch)
    if (batch.length < size) break
    if (page === maxPages - 1) {
      console.warn(`커뮤니티 게시글이 ${maxPages}페이지(${maxPages * size}건) 상한에 도달해 이후 페이지를 불러오지 않았습니다.`)
    }
  }
  return all
}

export async function getCommunityPost(id) {
  return request(`/api/community/posts/${id}`)
}

export async function getMemberReputation(studentId) {
  return request(`/api/community/members/${encodeURIComponent(studentId)}/reputation`)
}

// Body shape mirrors backend CommunityPostReportRequest (reason: one of the six
// ALLOWED_REASONS in CommunityPostReportService, detail: <=500 chars, nullable) and
// coms-member-app's reportCommunityPost, so both clients post the same thing.
// A second OPEN report on the same post by the same member answers 409.
export async function reportCommunityPost(id, reason, detail) {
  return request(`/api/community/posts/${id}/reports`, {
    method: 'POST',
    body: JSON.stringify({ reason, detail: detail || null }),
  })
}

export async function toggleBookmark(id) {
  return request(`/api/community/posts/${id}/bookmark`, {
    method: 'POST',
  })
}

export async function listBookmarkedPosts(page = 0, size = 100) {
  return request(`/api/community/posts/bookmarked/me?page=${page}&size=${size}`)
}

export async function listPostsByAuthor(studentId, page = 0, size = 100) {
  return request(`/api/community/posts/by-author/${encodeURIComponent(studentId)}?page=${page}&size=${size}`)
}

export async function createCommunityPost(body, image = null) {
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

export async function updateCommunityPost(id, body, image = null) {
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

// 회장 전용 — 회원 재지정(studentId) 또는 표시 이름만 변경(name), 둘 중 하나.
export async function updateCommunityPostAuthor(id, { studentId, name }) {
  return request(`/api/community/posts/${id}/author`, {
    method: 'PATCH',
    body: JSON.stringify(studentId ? { studentId } : { name }),
  })
}

export async function pinCommunityPost(id, pinned) {
  return request(`/api/community/posts/${id}/pin`, {
    method: 'PATCH',
    body: JSON.stringify({ pinned }),
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

export async function fetchLinkPreview(url) {
  const u = encodeURIComponent(url)
  return request(`/api/community/posts/tools/link-preview?url=${u}`)
}

export async function deleteCommunityPost(id, reason = '') {
  const cleanReason = reason?.trim() || ''
  return requestNoContent(`/api/community/posts/${id}`, {
    method: 'DELETE',
    body: cleanReason ? JSON.stringify({ reason: cleanReason }) : undefined,
  })
}

export async function listMyDeletedCommunityPosts() {
  return request('/api/community/posts/deleted/me')
}

export async function appealDeletedCommunityPost(id, message) {
  return request(`/api/community/posts/deleted/${id}/appeals`, {
    method: 'POST',
    body: JSON.stringify({ message }),
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
