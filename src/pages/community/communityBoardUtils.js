import { categoryOptionsForUser, textContentForSearch } from './postEditorUtils.js'

export const PAGE_SIZE = 30
export const CONCEPT_POST_SCORE_THRESHOLD = 5
export const SORT_OPTIONS = [
  { value: 'latest', label: '최신순' },
  { value: 'comments', label: '댓글 많은 순' },
  { value: 'score', label: '추천순' },
  { value: 'views', label: '조회순' },
]

export function deletedRecordText(value) {
  const raw = String(value || '')
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return textContentForSearch(raw)
    return parsed.map((block) => {
      if (!block || typeof block !== 'object') return ''
      if (block.type === 'text') return textContentForSearch(block.content || '')
      if (block.type === 'poll') return `투표: ${block.question || ''}`
      if (block.type === 'externalEmbed') return block.title || block.url || ''
      if (block.type === 'file') return block.name || '첨부파일'
      if (block.type === 'image') return block.name || '이미지'
      if (block.type === 'video') return block.name || '영상'
      return ''
    }).filter(Boolean).join(' · ')
  } catch {
    return textContentForSearch(raw)
  }
}

export function deletionIdentity(name, studentId) {
  const safeName = name || '알 수 없음'
  return studentId ? `${safeName}(${studentId})` : safeName
}

export function boardFilterOptionsForUser(user) {
  return [
    { value: 'ALL', label: '전체글' },
    { value: 'CONCEPT', label: '개념글' },
    ...categoryOptionsForUser(user),
  ]
}

export function postScore(post) {
  return (post.upvotes || 0) - (post.downvotes || 0)
}

export function isConceptPost(post) {
  return post.conceptPost ?? postScore(post) >= CONCEPT_POST_SCORE_THRESHOLD
}

export function isEdited(post) {
  return Boolean(post?.edited)
}

export function postImageUrls(post) {
  return [post?.imageUrl, ...(post?.imageUrls || [])]
    .filter(Boolean)
    .filter((url, index, urls) => urls.indexOf(url) === index)
}

export function postHasImages(post) {
  return postImageUrls(post).length > 0
}

export function paginationRange(currentPage, totalPages) {
  const pages = new Set([1, totalPages])
  for (let page = currentPage - 1; page <= currentPage + 1; page += 1) {
    if (page >= 1 && page <= totalPages) pages.add(page)
  }

  const sorted = [...pages].sort((a, b) => a - b)
  return sorted.flatMap((page, index) => {
    const previous = sorted[index - 1]
    if (index > 0 && page - previous > 1) return [`gap-${previous}-${page}`, page]
    return [page]
  })
}

export function shortDate(iso) {
  const date = new Date(iso)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })
}

export function openRowWithKeyboard(event, open) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    open()
  }
}

export function clickableCell(open) {
  return {
    onClick: open,
  }
}
