import { categoryOptionsForUser, textContentForSearch } from './postEditorUtils'

export const PAGE_SIZE = 30
export const CONCEPT_POST_SCORE_THRESHOLD = 5
export const SORT_OPTIONS = [
  { value: 'latest', label: '최신순' },
  { value: 'comments', label: '댓글 많은 순' },
  { value: 'score', label: '추천순' },
  { value: 'views', label: '조회순' },
]

const BOARD_VIEW_DEFAULTS = { page: 1, category: 'ALL', sort: 'latest', query: '' }
const MAX_BOARD_QUERY_LENGTH = 100

/**
 * The board's page / filter / sort / search as carried in the list URL
 * (`/community?page=3&cat=QUESTION&sort=views&q=...`). Anything missing or malformed falls back
 * to the default, so a hand-edited or stale link still opens the board.
 */
export function boardViewFromSearch(search) {
  const params = new URLSearchParams(search || '')
  const page = Number(params.get('page'))
  const sort = params.get('sort')
  return {
    page: Number.isInteger(page) && page >= 1 ? page : BOARD_VIEW_DEFAULTS.page,
    category: params.get('cat') || BOARD_VIEW_DEFAULTS.category,
    sort: SORT_OPTIONS.some((option) => option.value === sort) ? sort : BOARD_VIEW_DEFAULTS.sort,
    query: (params.get('q') || '').slice(0, MAX_BOARD_QUERY_LENGTH),
  }
}

/**
 * Writes a board view into `search`, leaving every other parameter alone and omitting values
 * that are the default — the plain board keeps the plain URL.
 */
export function boardViewToSearch(view, search = '') {
  const params = new URLSearchParams(search || '')
  const entries = [
    ['page', view.page, BOARD_VIEW_DEFAULTS.page],
    ['cat', view.category, BOARD_VIEW_DEFAULTS.category],
    ['sort', view.sort, BOARD_VIEW_DEFAULTS.sort],
    ['q', String(view.query || '').trim().slice(0, MAX_BOARD_QUERY_LENGTH), BOARD_VIEW_DEFAULTS.query],
  ]
  for (const [key, value, fallback] of entries) {
    if (value === fallback || value === undefined || value === null || value === '') params.delete(key)
    else params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

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

export function boardFilterOptionsForUser(user, permissions) {
  return [
    { value: 'ALL', label: '전체글' },
    { value: 'CONCEPT', label: '개념글' },
    ...categoryOptionsForUser(user, permissions),
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
  // Keys bubble up from the controls inside a row (스크랩, the moderator's 삭제). Only a key
  // pressed on the row itself opens the post; otherwise Enter on one of those buttons was
  // swallowed by preventDefault and opened the post instead of pressing the button.
  if (event.target !== event.currentTarget) return
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
