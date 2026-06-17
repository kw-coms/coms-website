function plainText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function contentText(value, depth = 0) {
  if (value == null || depth > 3) return ''
  if (Array.isArray(value)) return value.map((item) => contentText(item, depth + 1)).filter(Boolean).join(' ')
  if (typeof value === 'object') {
    if (value.type === 'poll') return value.question || value.title || value.prompt || ''
    if (value.type === 'externalEmbed') return value.title || value.url || ''
    if (value.type === 'file' || value.type === 'image' || value.type === 'video') return value.name || ''
    return contentText(value.content ?? value.text ?? '', depth + 1)
  }
  const text = String(value || '').trim()
  if (!text) return ''
  if ((text.startsWith('[') || text.startsWith('{') || text.startsWith('"')) && /"type"\s*:/.test(text)) {
    try {
      return contentText(JSON.parse(text), depth + 1)
    } catch {
      return plainText(text)
    }
  }
  return plainText(text)
}

function score(post) {
  return Number(post?.upvotes || 0) - Number(post?.downvotes || 0)
}

function timestamp(value) {
  const time = new Date(value || 0).getTime()
  return Number.isFinite(time) ? time : 0
}

function matchesCategory(post, category) {
  if (category === 'ALL') return true
  if (category === 'CONCEPT') return Boolean(post?.conceptPost) || score(post) >= 5
  return (post?.category || 'GENERAL') === category
}

function searchKey(post) {
  return [
    post?.title,
    post?.authorDisplayName,
    post?.authorName,
    contentText(post?.content),
  ].filter(Boolean).join(' ').toLowerCase()
}

export function filterAndSortCommunityPosts(posts, {
  category = 'ALL',
  query = '',
  sort = 'latest',
  canSeeAnonymous = true,
} = {}) {
  const q = String(query || '').trim().toLowerCase()
  const terms = q ? q.split(/\s+/).filter(Boolean) : []
  const filtered = (Array.isArray(posts) ? posts : [])
    .filter((post) => canSeeAnonymous || post?.category !== 'ANONYMOUS')
    .filter((post) => matchesCategory(post, category))
    .filter((post) => {
      if (terms.length === 0) return true
      const key = searchKey(post)
      return terms.every((term) => key.includes(term))
    })

  return [...filtered].sort((a, b) => {
    if (sort === 'comments') return Number(b.commentCount || 0) - Number(a.commentCount || 0) || timestamp(b.createdAt) - timestamp(a.createdAt)
    if (sort === 'score') return score(b) - score(a) || timestamp(b.createdAt) - timestamp(a.createdAt)
    if (sort === 'views') return Number(b.viewCount || 0) - Number(a.viewCount || 0) || timestamp(b.createdAt) - timestamp(a.createdAt)
    return timestamp(b.createdAt) - timestamp(a.createdAt)
  })
}

function formatTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('ko-KR')
}

function identity(name, studentId) {
  const safeName = name || '알 수 없음'
  return studentId ? `${safeName}(${studentId})` : safeName
}

function appealStatusLabel(status) {
  if (status === 'APPROVED') return '검토 완료'
  if (status === 'REJECTED') return '검토 완료'
  return '복원 요청'
}

export function buildDeletedPostTimeline(record) {
  const events = []
  if (record?.createdAt) {
    events.push({ label: '작성됨', time: formatTime(record.createdAt), detail: '커뮤니티에 게시' })
  }
  if (record?.deletedAt) {
    events.push({
      label: '삭제됨',
      time: formatTime(record.deletedAt),
      detail: identity(record.deletedByName, record.deletedByStudentId),
    })
  }
  if (record?.latestAppealCreatedAt) {
    events.push({
      label: '복원 요청',
      time: formatTime(record.latestAppealCreatedAt),
      detail: record.latestAppealMessage || '검토 대기 중',
    })
  }
  if (record?.latestAppealResolvedAt) {
    events.push({
      label: appealStatusLabel(record.latestAppealStatus),
      time: formatTime(record.latestAppealResolvedAt),
      detail: record.latestAppealResolutionNote || (record.latestAppealStatus === 'REJECTED' ? '요청 반려' : '요청 승인'),
    })
  }
  if (record?.restoredAt) {
    events.push({ label: '복원됨', time: formatTime(record.restoredAt), detail: '커뮤니티에 다시 표시됨' })
  }
  return events
}
