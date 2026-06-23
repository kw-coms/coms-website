import { sanitizeHtml } from '../../utils/sanitizeHtml'

const DELETED_CONTENT_ALLOWED_STYLES = new Set(['background-color', 'color', 'font-family'])
const DELETED_CONTENT_SANITIZE_OPTIONS = {
  allowedTags: ['b', 'br', 'div', 'em', 'font', 'i', 'p', 'span', 'strong', 'u'],
  allowedAttributes: ['color', 'face', 'style'],
  allowedStyles: DELETED_CONTENT_ALLOWED_STYLES,
}

export function buildDeletedCommentTree(comments) {
  const nodes = new Map<any, any>(comments.map((comment) => [comment.originalCommentId, { ...comment, children: [] }]))
  const roots = []
  comments.forEach((comment) => {
    const node = nodes.get(comment.originalCommentId)
    const parent = comment.originalParentCommentId ? nodes.get(comment.originalParentCommentId) : null
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

export function deletedCategoryLabel(value) {
  const map = {
    GENERAL: '일반',
    QUESTION: '질문',
    ANONYMOUS: '익명',
    CONCEPT: '컨셉',
    INFO: '정보',
    PROMOTION: '홍보',
    SMALL_GROUP: '소모임',
  }
  return map[value] || value || '일반'
}

export function deletedAppealStatusLabel(value) {
  const map = { OPEN: '대기', APPROVED: '승인', REJECTED: '거절', RESOLVED: '처리됨' }
  return map[value] || value
}

export function deletedPostMatchesSearch(post, normalizedSearch) {
  if (!normalizedSearch) return true
  return deletedPostSearchText(post).includes(normalizedSearch)
}

export function deletedPostMatchesStatus(post, statusFilter) {
  if (statusFilter === 'RESTORED') return Boolean(post.restoredPostId)
  if (statusFilter === 'OPEN') return !post.restoredPostId
  return true
}

export function deletedPostMatchesEvidence(post, evidenceFilter) {
  if (evidenceFilter === 'MEDIA') {
    return (post.imageInfos || []).length > 0 || (post.videoInfos || []).length > 0 || (post.fileInfos || []).length > 0
  }
  if (evidenceFilter === 'COMMENTS') {
    return Number(post.commentCount || 0) > 0 || (post.commentInfos || []).length > 0
  }
  if (evidenceFilter === 'POLL') {
    return deletedPostBlocks(post).some((block) => block.type === 'poll')
  }
  return true
}

export function deletedPostBlocks(post) {
  const images = post.imageInfos || []
  const videos = post.videoInfos || []
  const files = post.fileInfos || []
  const fallback = String(post.content || '').trim()
  if (!fallback) return []
  try {
    const parsed = JSON.parse(fallback)
    if (!Array.isArray(parsed)) return [{ type: 'text', content: fallback }]
    return parsed.map((block) => {
      if (block?.type === 'image') {
        const imageInfo = images.find((image) => image.originalImageId === block.mediaId || image.id === block.mediaId)
        return {
          type: 'image',
          imageInfo,
          url: imageInfo?.url,
          name: block.name || imageInfo?.originalName,
          width: block.width || 75,
          align: block.align || 'center',
        }
      }
      if (block?.type === 'externalEmbed' && block.kind === 'image' && isSafeHttpsUrl(block.url)) {
        return { type: 'externalImage', url: block.url, title: block.title || '외부 이미지' }
      }
      if (block?.type === 'video') {
        const mediaInfo = videos.find((media) => media.originalMediaId === block.mediaId || media.id === block.mediaId)
        return {
          type: 'video',
          mediaInfo,
          url: mediaInfo?.url,
          name: block.name || mediaInfo?.originalName,
          width: block.width || 75,
          align: block.align || 'center',
        }
      }
      if (block?.type === 'file') {
        const mediaInfo = files.find((media) => media.originalMediaId === block.fileId || media.id === block.fileId)
        return {
          type: 'file',
          mediaInfo,
          url: mediaInfo?.url,
          name: block.name || mediaInfo?.originalName,
        }
      }
      if (block?.type === 'poll') {
        return { type: 'poll', question: block.question || '', options: Array.isArray(block.options) ? block.options : [] }
      }
      return { type: 'text', content: block?.content || '' }
    }).filter((block) => block.type !== 'text' || String(block.content || '').trim())
  } catch {
    return [{ type: 'text', content: fallback }]
  }
}

export function deletedPollOptionLabel(option) {
  if (typeof option === 'object' && option !== null) {
    return String(option.label || option.text || option.title || option.value || '')
  }
  return String(option || '')
}

export function deletedMediaWidth(width) {
  const numeric = Number(width)
  if (Number.isFinite(numeric)) return Math.min(100, Math.max(35, numeric))
  if (width === 'small') return 35
  if (width === 'medium') return 55
  return 75
}

export function deletedHasFormattedText(value) {
  return /<\/?(?:b|strong|i|em|u|s|mark|span|br|p|div|font)\b/i.test(String(value || ''))
}

export function sanitizeDeletedHtml(value) {
  // Deprecated compatibility adapter: new deleted-content sinks should call sanitizeHtml() directly.
  if (typeof document === 'undefined') return sanitizeHtml(value, DELETED_CONTENT_SANITIZE_OPTIONS)
  const template = document.createElement('template')
  template.innerHTML = String(value || '')
  const container = document.createElement('div')
  appendDeletedCleanChildren(template.content, container)
  return sanitizeHtml(container.innerHTML, DELETED_CONTENT_SANITIZE_OPTIONS)
}

export function formatDateTime(value) {
  if (!value) return '영구'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '알 수 없음'
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function deletedPostIdentity(name, studentId) {
  const safeName = name || '-'
  return studentId ? `${safeName}(${studentId})` : safeName
}

function deletedPostSearchText(post) {
  const blocks = deletedPostBlocks(post)
  return [
    post.title,
    post.originalPostId,
    post.category,
    post.authorName,
    post.authorStudentId,
    post.deletedByName,
    post.deletedByStudentId,
    post.deletionReason,
    post.restoredPostId,
    ...blocks.map((block) => {
      if (block.type === 'poll') return [block.question, ...block.options.map(deletedPollOptionLabel)].join(' ')
      return [block.content, block.name, block.title].join(' ')
    }),
    ...(post.imageInfos || []).map((item) => item.originalName),
    ...(post.videoInfos || []).map((item) => item.originalName),
    ...(post.fileInfos || []).map((item) => item.originalName),
    ...(post.commentInfos || []).flatMap((comment) => [comment.authorName, comment.authorStudentId, comment.content]),
  ].map((value) => String(value || '').toLowerCase()).join(' ')
}

function appendDeletedCleanChildren(source, target) {
  for (const child of Array.from(source.childNodes)) {
    const clean = cleanDeletedNode(child)
    if (clean) target.appendChild(clean)
  }
}

function cleanDeletedNode(node) {
  if (node.nodeType === 3) return document.createTextNode(node.textContent.replace(/\u200B/g, ''))
  if (node.nodeType !== 1) return document.createTextNode('')

  const tag = node.tagName.toLowerCase()
  if (tag === 'br') return document.createElement('br')
  if (['b', 'strong', 'i', 'em', 'u'].includes(tag)) {
    const el = document.createElement(tag)
    appendDeletedCleanChildren(node, el)
    return el
  }
  if (tag === 'span' || tag === 'font') {
    const el = document.createElement('span')
    const style = []
    const color = node.style?.color || node.getAttribute('color')
    const backgroundColor = node.style?.backgroundColor
    const rawFontFamily = node.style?.fontFamily || node.getAttribute('face')
    const fontFamily = typeof rawFontFamily === 'string' && /^[\w\s\-,'"]+$/.test(rawFontFamily) ? rawFontFamily : ''
    if (color && !/url|expression|javascript/i.test(color)) style.push(`color:${color}`)
    if (backgroundColor && !/url|expression|javascript/i.test(backgroundColor)) style.push(`background-color:${backgroundColor}`)
    if (fontFamily) style.push(`font-family:${fontFamily}`)
    if (style.length) el.setAttribute('style', style.join(';'))
    appendDeletedCleanChildren(node, el)
    return el
  }
  if (tag === 'div' || tag === 'p') {
    const fragment = document.createDocumentFragment()
    appendDeletedCleanChildren(node, fragment)
    fragment.appendChild(document.createElement('br'))
    return fragment
  }
  const fragment = document.createDocumentFragment()
  appendDeletedCleanChildren(node, fragment)
  return fragment
}

function isSafeHttpsUrl(value) {
  try {
    return new URL(String(value || '')).protocol === 'https:'
  } catch {
    return false
  }
}
