import { sanitizeHtml } from '../../utils/sanitizeHtml'
import { canModerateCommunity, canUseAnonymousBoard, defaultPermissionsForRole } from '../../utils/roleAccess'

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
const FORMATTED_TEXT_RE = /<\/?(a|strong|b|em|i|u|span|font|br|div|p|pre|code)\b/i
const EDITOR_ALLOWED_STYLES = new Set(['background-color', 'color', 'font-family'])
const SAFE_CODE_CLASS_RE = /^language-[a-z0-9]+$/i
export const EDITOR_SANITIZE_OPTIONS = {
  allowedTags: ['a', 'b', 'br', 'code', 'div', 'em', 'font', 'i', 'p', 'pre', 'span', 'strong', 'u'],
  allowedAttributes: ['class', 'color', 'face', 'href', 'rel', 'style', 'target'],
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
  if (tag === 'a') {
    const el = document.createElement('a')
    const href = node.getAttribute('href') || ''
    try {
      const base = typeof window === 'undefined' ? 'https://coms.kw.ac.kr' : window.location.origin
      const url = new URL(href, base)
      if (['http:', 'https:', 'mailto:'].includes(url.protocol)) el.setAttribute('href', href)
    } catch {
      // Keep the link text but drop an invalid href.
    }
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

// The only escapes an HTML fragment needs in its text, and so the only ones the editor writes.
const EDITOR_ENTITY_RE = /&(amp|lt|gt|quot|nbsp|#39|#x27);/g
const EDITOR_ENTITY_TEXT = { amp: '&', lt: '<', gt: '>', quot: '"', nbsp: '\u00A0', '#39': "'", '#x27': "'" }
// Characters an HTML fragment cannot carry unescaped: a raw `<`, `>`, a newline, or an `&`
// that does not start one of the entities above.
const VERBATIM_TEXT_RE = /[<>\n]|&(?!(?:amp|lt|gt|quot|nbsp|#39|#x27);)/

/**
 * What a reader should see for a text block that carries no markup.
 *
 * The editor stores every paragraph as an HTML fragment, so an unformatted paragraph still has
 * "Q&A" written as `Q&amp;A` and "a < b" as `a &lt; b`. Rendered as plain text that reads
 * "Q&amp;A". Text saved before the block editor, or by another client, is verbatim instead and
 * must be left alone; it gives itself away by containing a character from VERBATIM_TEXT_RE.
 */
export function plainBlockText(value) {
  const raw = String(value || '')
  if (VERBATIM_TEXT_RE.test(raw)) return raw
  return raw.replace(EDITOR_ENTITY_RE, (_match, name) => EDITOR_ENTITY_TEXT[name])
}

export function textContentForSearch(value) {
  if (!hasFormattedText(value) || typeof document === 'undefined') return plainBlockText(value)
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

// 백엔드 CommunityAccess.canSeeAnonymous 의 거울: 중재 권한은 졸업 여부와 무관하게
// 통과하고, 그 밖에는 community.anonymous_board 권한 + 졸업생 제외 규칙.
export function canAccessAnonymousBoard(user, permissions) {
  const effective = permissions ?? defaultPermissionsForRole(user?.role)
  if (canModerateCommunity(effective)) return true
  return canUseAnonymousBoard(effective) && !isGraduateStudentId(user?.studentId)
}

function youtubeVideoIdFromUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    if (url.hostname === 'youtu.be') return url.pathname.slice(1)
    if (url.hostname === 'youtube.com' || url.hostname.endsWith('.youtube.com')) {
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
          // closesAt/closedAt live in the content. Dropping them here meant that opening a post
          // in the editor and saving it sent the poll back without its deadline or its closure.
          return {
            type: 'poll',
            pollId: block.pollId,
            question: block.question || '',
            options: Array.isArray(block.options) ? block.options : [],
            ...(block.closesAt ? { closesAt: block.closesAt } : {}),
            ...(block.closedAt ? { closedAt: block.closedAt } : {}),
            id: localId(),
          }
        }
        return { type: 'text', content: block.content || '', id: localId() }
      }))
    }
  } catch {
    return withLegacyImage([{ type: 'text', content: post.content || '', id: localId() }])
  }
  return withLegacyImage([{ type: 'text', content: post.content || '', id: localId() }])
}

/**
 * The JSON the community API stores as a post body. Media blocks that have not been uploaded
 * yet (no id) are left out.
 */
export function serializePostBlocks(blocks) {
  return JSON.stringify(
    (Array.isArray(blocks) ? blocks : []).map((b) => {
      if (b.type === 'text') return { type: 'text', content: b.content }
      if (b.type === 'image' && b.mediaId) return { type: 'image', mediaId: b.mediaId, name: b.name, width: b.width || 75, align: b.align || 'center' }
      if (b.type === 'video' && b.mediaId) return { type: 'video', mediaId: b.mediaId, name: b.name, width: b.width || 75, align: b.align || 'center' }
      if (b.type === 'file' && b.fileId) return { type: 'file', fileId: b.fileId, name: b.name }
      if (b.type === 'externalEmbed') {
        if (b.kind === 'link') {
          // A link card is its preview: without description/image/siteName it came back from a
          // save as a bare title.
          return {
            type: 'externalEmbed',
            provider: b.provider,
            kind: 'link',
            url: b.url,
            title: b.title,
            description: b.description || '',
            image: b.image || '',
            siteName: b.siteName || '',
            width: b.width || 75,
            align: b.align || 'center',
          }
        }
        return { type: 'externalEmbed', provider: b.provider, kind: b.kind, url: b.url, embedUrl: b.embedUrl, title: b.title, thumbnailUrl: b.thumbnailUrl, width: b.width || 75, align: b.align || 'center' }
      }
      if (b.type === 'poll') return { type: 'poll', pollId: b.pollId, question: b.question, options: b.options || [], closesAt: b.closesAt, closedAt: b.closedAt }
      return null
    }).filter(Boolean),
  )
}

export const EMPTY_POST_STAND_IN = '...'

/**
 * The text the server takes from a text block when it checks whether the follow-up save of a
 * new post merely completes it (CommunityTextService.stripHtml). Keep the two in step: a
 * stand-in that does not match is what used to publish new posts already marked "수정".
 */
function serverPlainText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/**
 * The body a new post is created with while its media is still uploading (uploads need the
 * post's id): the first text block as plain text, so the post already reads sensibly if an
 * upload fails. Falls back to "..." when there is no leading text, or when the text contains
 * angle brackets — sent as a plain body those would be read as markup and refused.
 */
export function creationStandIn(blocks) {
  const firstText = (Array.isArray(blocks) ? blocks : []).find((block) => block?.type === 'text')
  const text = serverPlainText(firstText?.content).trim()
  return text && !/[<>]/.test(text) ? text : EMPTY_POST_STAND_IN
}

/** True when a block still has a local file that must be uploaded before the post can be saved. */
export function needsUpload(block) {
  return block?.type !== 'text' && block?.status !== 'saved' && Boolean(block?.file)
}

/**
 * Uploaded media an edit took out of the post, as `[{ type, id }]`.
 *
 * Removing a block only removes the reference; the upload stays on the server, still counted
 * against the per-post limit, until it is deleted by id.
 */
export function removedSavedMedia(before, after) {
  const idOf = (block) => (block?.type === 'file' ? block.fileId : block?.mediaId)
  const keyOf = (block) => `${block.type}:${idOf(block)}`
  const isSavedMedia = (block) => ['image', 'video', 'file'].includes(block?.type) && idOf(block) != null
  const kept = new Set((Array.isArray(after) ? after : []).filter(isSavedMedia).map(keyOf))
  const removed = new Map()
  for (const block of Array.isArray(before) ? before : []) {
    if (isSavedMedia(block) && !kept.has(keyOf(block))) removed.set(keyOf(block), { type: block.type, id: idOf(block) })
  }
  return [...removed.values()]
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

export function categoryOptionsForUser(user, permissions) {
  return canAccessAnonymousBoard(user, permissions)
    ? CATEGORY_OPTIONS
    : CATEGORY_OPTIONS.filter((item) => item.value !== 'ANONYMOUS')
}

/**
 * The categories an existing post may be moved to. A post cannot cross the anonymous boundary in
 * either direction (the server refuses: its comments were written under the other rule), so the
 * editor only offers the side the post is already on.
 */
export function categoryOptionsForPost(options, postedCategory) {
  if (!postedCategory) return options
  const anonymous = postedCategory === 'ANONYMOUS'
  const sameSide = options.filter((item) => (item.value === 'ANONYMOUS') === anonymous)
  if (sameSide.some((item) => item.value === postedCategory)) return sameSide
  // The editor may not be offered this category for new posts (a moderator fixing someone's
  // anonymous post). It still has to be selectable, or saving would try to move the post.
  const posted = CATEGORY_OPTIONS.find((item) => item.value === postedCategory)
  return posted ? [posted, ...sameSide] : sameSide
}

export function figureInlineStyle(wPct, align) {
  const base = 'max-width:100%;user-select:none;-webkit-user-select:none;-webkit-user-drag:element;cursor:grab'
  if (align === 'left') return `${base};display:block;float:left;width:${wPct}%;margin:0.25rem 1rem 0.75rem 0;`
  if (align === 'right') return `${base};display:block;float:right;width:${wPct}%;margin:0.25rem 0 0.75rem 1rem;`
  return `${base};display:block;clear:both;width:${wPct}%;margin:0.75rem auto;`
}

// React's style prop needs an object, not the CSS string figureInlineStyle returns.
export function styleTextToObject(styleText) {
  return Object.fromEntries(
    String(styleText || '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [property, ...valueParts] = part.split(':')
        return [property.replace(/-([a-z])/g, (_, char) => char.toUpperCase()), valueParts.join(':').trim()]
      }),
  )
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
