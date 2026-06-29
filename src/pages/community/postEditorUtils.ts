import { sanitizeHtml } from '../../utils/sanitizeHtml'

export const MAX_TITLE_LENGTH = 120
export const MAX_ANONYMOUS_NAME_LENGTH = 20
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024
export const MAX_FILE_BYTES = 50 * 1024 * 1024
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
export const ALLOWED_FILE_TYPES = ['application/zip', 'application/x-zip-compressed', 'application/octet-stream']
export const MAX_EXTRA_IMAGES = 5
export const MAX_VIDEOS = 3
export const MAX_FILES = 5
const IMAGE_OPTIMIZE_MAX_EDGE = 1920
const IMAGE_OPTIMIZE_QUALITY = 0.82
const LEGACY_MEDIA_WIDTHS = {
  small: 35,
  medium: 55,
  large: 75,
  full: 100,
}
export const MEDIA_ALIGN_OPTIONS = [
  { value: 'left', label: '왼쪽' },
  { value: 'center', label: '가운데' },
  { value: 'right', label: '오른쪽' },
]
export const POLL_DURATION_OPTIONS = [
  { value: 60, label: '1시간' },
  { value: 360, label: '6시간' },
  { value: 1440, label: '1일' },
  { value: 4320, label: '3일' },
  { value: 10080, label: '7일' },
  { value: 0, label: '종료 없음' },
]
const FORMATTED_TEXT_RE = /<\/?(strong|b|em|i|u|span|font|br|div|p|pre|code)\b/i
const EDITOR_ALLOWED_STYLES = new Set(['background-color', 'color', 'font-family'])
const SAFE_CODE_CLASS_RE = /^language-[a-z0-9]+$/i
export const EDITOR_SANITIZE_OPTIONS = {
  allowedTags: ['b', 'br', 'code', 'div', 'em', 'font', 'i', 'p', 'pre', 'span', 'strong', 'u'],
  allowedAttributes: ['class', 'color', 'face', 'style'],
  allowedStyles: EDITOR_ALLOWED_STYLES,
}

let _localIdCounter = 0
export function localId() { return `blk-${++_localIdCounter}` }

export function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function appendCleanChildren(source, target) {
  for (const child of Array.from(source.childNodes)) {
    const clean = cleanEditorNode(child)
    if (clean) target.appendChild(clean)
  }
}

function cleanEditorNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent.replace(/\u200B/g, ''))
  if (node.nodeType !== Node.ELEMENT_NODE) return document.createTextNode('')

  const tag = node.tagName.toLowerCase()
  if (tag === 'br') return document.createElement('br')
  if (tag === 'pre' || tag === 'code') {
    const el = document.createElement(tag)
    // Preserve a single `language-*` hint; drop any other class (styling/CSS-injection surface).
    const className = (node.getAttribute('class') || '').trim()
    if (SAFE_CODE_CLASS_RE.test(className)) el.setAttribute('class', className)
    appendCleanChildren(node, el)
    return el
  }
  if (['b', 'strong', 'i', 'em', 'u'].includes(tag)) {
    const el = document.createElement(tag)
    appendCleanChildren(node, el)
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
    appendCleanChildren(node, el)
    return el
  }
  if (tag === 'div' || tag === 'p') {
    const fragment = document.createDocumentFragment()
    appendCleanChildren(node, fragment)
    fragment.appendChild(document.createElement('br'))
    return fragment
  }
  const fragment = document.createDocumentFragment()
  appendCleanChildren(node, fragment)
  return fragment
}

export function sanitizeEditorHtml(value) {
  // Deprecated compatibility adapter: new HTML sinks should call sanitizeHtml() directly.
  if (typeof document === 'undefined') return sanitizeHtml(value, EDITOR_SANITIZE_OPTIONS)
  const template = document.createElement('template')
  template.innerHTML = String(value || '')
  const container = document.createElement('div')
  appendCleanChildren(template.content, container)
  return sanitizeHtml(container.innerHTML, EDITOR_SANITIZE_OPTIONS)
}

export function textToEditorHtml(value) {
  const raw = String(value || '')
  if (FORMATTED_TEXT_RE.test(raw)) return sanitizeEditorHtml(raw)
  return escapeHtml(raw).replace(/\n/g, '<br>')
}

export function hasFormattedText(value) {
  return FORMATTED_TEXT_RE.test(String(value || ''))
}

export function textContentForSearch(value) {
  if (!hasFormattedText(value) || typeof document === 'undefined') return String(value || '')
  const template = document.createElement('template')
  template.innerHTML = sanitizeEditorHtml(value)
  return template.content.textContent || ''
}

export function mediaWidthPercent(width) {
  const numeric = Number(width)
  if (Number.isFinite(numeric)) return Math.min(100, Math.max(25, numeric))
  return LEGACY_MEDIA_WIDTHS[width] || LEGACY_MEDIA_WIDTHS.large
}

function isGraduateStudentId(studentId) {
  if (!/^\d{10}$/.test(String(studentId || ''))) return true
  const admissionYear = Number(String(studentId).slice(0, 4))
  return admissionYear <= new Date().getFullYear() - 7
}

export function canAccessAnonymousBoard(user) {
  return user?.role === 'ADMIN' || !isGraduateStudentId(user?.studentId)
}

function youtubeVideoIdFromUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    if (url.hostname === 'youtu.be') return url.pathname.slice(1)
    if (url.hostname.endsWith('youtube.com')) {
      if (url.pathname.startsWith('/watch')) return url.searchParams.get('v')
      if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2]
      if (url.pathname.startsWith('/embed/')) return url.pathname.split('/')[2]
    }
  } catch {
    return null
  }
  return null
}

function youtubeEmbedUrl(videoId) {
  return `https://www.youtube.com/embed/${videoId}`
}

export function externalBlockFromUrl(value, meta: {
  title?: string
  thumbnailUrl?: string
  description?: string
  image?: string
  siteName?: string
  width?: number
  align?: string
} = {}) {
  const raw = String(value || '').trim()
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error('올바른 URL을 입력해주세요.')
  }
  if (url.protocol !== 'https:') throw new Error('외부 콘텐츠는 https URL만 사용할 수 있습니다.')
  const videoId = youtubeVideoIdFromUrl(raw)
  if (videoId) {
    return {
      type: 'externalEmbed',
      provider: 'youtube',
      kind: 'youtube',
      url: `https://www.youtube.com/watch?v=${videoId}`,
      embedUrl: youtubeEmbedUrl(videoId),
      title: meta.title || 'YouTube 영상',
      thumbnailUrl: meta.thumbnailUrl || '',
      width: 75,
      align: 'center',
      id: localId(),
    }
  }
  const path = url.pathname.toLowerCase()
  if (/\.(png|jpe?g|gif|webp|avif)$/.test(path)) {
    return { type: 'externalEmbed', provider: 'external', kind: 'image', url: raw, title: meta.title || '외부 이미지', width: 75, align: 'center', id: localId() }
  }
  if (/\.(mp4|webm|mov)$/.test(path)) {
    return { type: 'externalEmbed', provider: 'external', kind: 'video', url: raw, title: meta.title || '외부 영상', width: 75, align: 'center', id: localId() }
  }
  // Any other generic https URL becomes an OpenGraph-style link-preview card. The meta
  // (title/description/image/siteName) is populated by the link-preview API on insert;
  // when that is unavailable we still produce a usable card showing just the domain.
  return {
    type: 'externalEmbed',
    provider: 'external',
    kind: 'link',
    url: raw,
    title: meta.title || url.hostname,
    description: meta.description || '',
    image: meta.image || '',
    siteName: meta.siteName || url.hostname,
    width: 75,
    align: 'center',
    id: localId(),
  }
}

export function safeExternalSrc(url) {
  return /^https:\/\//i.test(String(url || '')) ? url : ''
}

const YOUTUBE_EMBED_ALLOWLIST = /^https:\/\/www\.youtube(-nocookie)?\.com\/embed\/[A-Za-z0-9_-]{6,20}([?&].*)?$/

/**
 * Strict allowlist for the YouTube iframe src. Only the canonical youtube.com /
 * youtube-nocookie.com /embed/<id> form is accepted, so a stored externalEmbed
 * block can never smuggle an arbitrary-origin iframe past the generic https check.
 * Returns the URL when it passes, otherwise '' so the iframe is not rendered.
 */
export function safeYoutubeEmbedSrc(url) {
  const value = String(url || '')
  return YOUTUBE_EMBED_ALLOWLIST.test(value) ? value : ''
}

export function newPollBlock(question, optionText, closesAt = '') {
  const options = (Array.isArray(optionText) ? optionText : String(optionText || '').split(/\n+/))
    .map((item) => (typeof item === 'object'
      ? { label: String(item.label || '').trim(), imageUrl: String(item.imageUrl || '').trim() }
      : { label: String(item || '').trim(), imageUrl: '' }))
    .filter((item) => item.label)
    .slice(0, 10)
  if (!question.trim()) throw new Error('투표 질문을 입력해주세요.')
  if (options.length < 2) throw new Error('투표 보기는 2개 이상 입력해주세요.')
  for (const option of options) {
    if (option.imageUrl) {
      try {
        const url = new URL(option.imageUrl)
        if (url.protocol !== 'https:') throw new Error()
      } catch {
        throw new Error('투표 보기 이미지는 https URL만 사용할 수 있습니다.')
      }
    }
  }
  return {
    type: 'poll',
    pollId: `poll-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    question: question.trim(),
    options,
    closesAt: closesAt || undefined,
    id: localId(),
  }
}

export function pollOptionLabel(option) {
  return typeof option === 'object' ? option.label : String(option || '')
}

export function pollOptionImageUrl(option) {
  return typeof option === 'object' ? option.imageUrl : ''
}

export function formatPollDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function datetimeLocalValue(minutesFromNow = 60) {
  const date = new Date(Date.now() + minutesFromNow * 60 * 1000)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}


function hasInlineImageBlock(blocks, imageUrl) {
  return Boolean(imageUrl) && blocks.some((block) => block.type === 'image' && block.url === imageUrl)
}

export function parsePostBlocks(post) {
  if (!post) return [{ type: 'text', content: '', id: localId() }]
  const withLegacyImage = (blocks) => {
    if (post.imageUrl && !hasInlineImageBlock(blocks, post.imageUrl)) {
      return [
        ...blocks,
        { type: 'image', status: 'saved', legacy: true, name: post.imageOriginalName || '이미지', url: post.imageUrl, width: 'large', align: 'center', id: localId() },
      ]
    }
    return blocks
  }
  try {
    const parsed = JSON.parse(post.content)
    if (Array.isArray(parsed)) {
      return withLegacyImage(parsed.map((block) => {
        if (block.type === 'image') {
          const info = (post.imageInfos || []).find((i) => i.id === block.mediaId)
          return { type: 'image', status: 'saved', mediaId: block.mediaId, name: block.name || info?.originalName, url: info?.url, width: block.width || 'large', align: block.align || 'center', id: localId() }
        }
        if (block.type === 'video') {
          const info = (post.videoInfos || []).find((v) => v.id === block.mediaId)
          return { type: 'video', status: 'saved', mediaId: block.mediaId, name: block.name || info?.originalName, url: info?.url, width: block.width || 'large', align: block.align || 'center', id: localId() }
        }
        if (block.type === 'file') {
          const info = (post.fileInfos || []).find((f) => f.id === block.fileId)
          return { type: 'file', status: 'saved', fileId: block.fileId, name: block.name || info?.originalName, url: info?.url, id: localId() }
        }
        if (block.type === 'externalEmbed') {
          return { ...block, width: block.width || 75, align: block.align || 'center', id: localId() }
        }
        if (block.type === 'poll') {
          return { type: 'poll', pollId: block.pollId, question: block.question || '', options: Array.isArray(block.options) ? block.options : [], id: localId() }
        }
        return { type: 'text', content: block.content || '', id: localId() }
      }))
    }
  } catch {
    return withLegacyImage([{ type: 'text', content: post.content || '', id: localId() }])
  }
  return withLegacyImage([{ type: 'text', content: post.content || '', id: localId() }])
}
const CATEGORY_OPTIONS = [
  { value: 'GENERAL', label: '일반' },
  { value: 'QUESTION', label: '질문' },
  { value: 'INFO', label: '정보' },
  { value: 'ANONYMOUS', label: '익명' },
]

export function categoryLabel(value) {
  return CATEGORY_OPTIONS.find((item) => item.value === value)?.label || '일반'
}

export function categoryOptionsForUser(user) {
  return canAccessAnonymousBoard(user) ? CATEGORY_OPTIONS : CATEGORY_OPTIONS.filter((item) => item.value !== 'ANONYMOUS')
}

export function figureInlineStyle(wPct, align) {
  const base = 'max-width:100%;user-select:none;-webkit-user-select:none;-webkit-user-drag:element;cursor:grab'
  if (align === 'left') return `${base};display:block;float:left;width:${wPct}%;margin:0.25rem 1rem 0.75rem 0;`
  if (align === 'right') return `${base};display:block;float:right;width:${wPct}%;margin:0.25rem 0 0.75rem 1rem;`
  return `${base};display:block;clear:both;width:${wPct}%;margin:0.75rem auto;`
}

export function domToBlocks(editorEl, figMeta) {
  const blocks = []
  let html = ''
  const flushText = () => {
    const clean = sanitizeEditorHtml(html)
    if (clean) blocks.push({ type: 'text', content: clean, id: localId() })
    html = ''
  }
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) { html += escapeHtml(node.textContent.replace(/\u200B/g, '')); return }
    if (node.nodeName === 'BR') { html += '<br>'; return }
    if (node.nodeName === 'FIGURE') {
      flushText()
      const id = node.dataset.blockId
      const meta = figMeta.get(id)
      if (meta) {
        const m = (node.style.width || '').match(/^(\d+(?:\.\d+)?)%$/)
        const wPct = m ? Math.round(Number(m[1])) : (meta.width || 75)
        blocks.push({ ...meta, id, width: wPct, align: node.dataset.align || meta.align || 'center' })
      }
      return
    }
    const isBlock = ['DIV', 'P', 'H1', 'H2', 'H3'].includes(node.nodeName)
    if (isBlock && html && !html.endsWith('<br>')) html += '<br>'
    if (!isBlock && node.nodeType === Node.ELEMENT_NODE) {
      html += sanitizeEditorHtml(node.outerHTML)
      return
    }
    for (const child of node.childNodes) walk(child)
    if (isBlock && html && !html.endsWith('<br>')) html += '<br>'
  }
  for (const child of editorEl.childNodes) walk(child)
  flushText()
  return blocks
}

export function isAllowedArchiveFile(file) {
  return file?.name?.toLowerCase().endsWith('.zip') && ALLOWED_FILE_TYPES.includes(file.type || 'application/octet-stream')
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

export async function optimizeImageFile(file: File) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type) || file.type === 'image/gif') return file
  if (typeof createImageBitmap !== 'function') return file

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, IMAGE_OPTIMIZE_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  if (scale >= 1 && file.size <= MAX_IMAGE_BYTES * 0.75) {
    bitmap.close?.()
    return file
  }

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close?.()
    return file
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()

  const outputType = file.type === 'image/png' ? 'image/webp' : file.type
  const blob = await canvasToBlob(canvas, outputType, IMAGE_OPTIMIZE_QUALITY) as Blob | null
  if (!blob || blob.size >= file.size) return file

  const nextName = outputType === file.type ? file.name : file.name.replace(/\.[^.]+$/, '.webp')
  return new File([blob], nextName, { type: outputType, lastModified: Date.now() })
}
