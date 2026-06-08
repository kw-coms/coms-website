import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { linkify } from '../utils/linkify.jsx'
import {
  ArrowLeft,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
  Download,
  ImagePlus,
  MessageSquare,
  Paperclip,
  Pencil,
  Search,
  Send,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Video,
  X,
} from 'lucide-react'
import {
  createCommunityPost,
  createComment,
  deleteComment,
  deleteCommunityPost,
  getCommunityPost,
  listComments,
  listCommunityPosts,
  updateComment,
  updateCommunityPost,
  uploadPostImages,
  uploadPostFile,
  uploadPostVideo,
  voteCommunityPost,
} from '../services/communityApi.js'
import { apiUrl } from '../services/apiClient.js'
import { useAuth } from '../contexts/useAuth.js'

const PAGE_SIZE = 30
const CONCEPT_POST_SCORE_THRESHOLD = 5
const MAX_TITLE_LENGTH = 120
const MAX_COMMENT_LENGTH = 1000
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_VIDEO_BYTES = 100 * 1024 * 1024
const MAX_FILE_BYTES = 50 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
const ALLOWED_FILE_TYPES = ['application/zip', 'application/x-zip-compressed', 'application/octet-stream']
const MAX_EXTRA_IMAGES = 5
const MAX_VIDEOS = 3
const MAX_FILES = 5
const IMAGE_OPTIMIZE_MAX_EDGE = 1920
const IMAGE_OPTIMIZE_QUALITY = 0.82
const LEGACY_MEDIA_WIDTHS = {
  small: 35,
  medium: 55,
  large: 75,
  full: 100,
}
const MEDIA_ALIGN_OPTIONS = [
  { value: 'left', label: '왼쪽' },
  { value: 'center', label: '가운데' },
  { value: 'right', label: '오른쪽' },
]
const FORMATTED_TEXT_RE = /<\/?(strong|b|em|i|u|span|font|br|div|p)\b/i

let _localIdCounter = 0
function localId() { return `blk-${++_localIdCounter}` }

function escapeHtml(value) {
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
    if (color && !/url|expression|javascript/i.test(color)) style.push(`color:${color}`)
    if (backgroundColor && !/url|expression|javascript/i.test(backgroundColor)) style.push(`background-color:${backgroundColor}`)
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

function sanitizeEditorHtml(value) {
  if (typeof document === 'undefined') return escapeHtml(value)
  const template = document.createElement('template')
  template.innerHTML = String(value || '')
  const container = document.createElement('div')
  appendCleanChildren(template.content, container)
  return container.innerHTML
    .replace(/\u200B/g, '')
    .replace(/(<br\s*\/?>\s*)+$/gi, '')
}

function textToEditorHtml(value) {
  const raw = String(value || '')
  if (FORMATTED_TEXT_RE.test(raw)) return sanitizeEditorHtml(raw)
  return escapeHtml(raw).replace(/\n/g, '<br>')
}

function hasFormattedText(value) {
  return FORMATTED_TEXT_RE.test(String(value || ''))
}

function textContentForSearch(value) {
  if (!hasFormattedText(value) || typeof document === 'undefined') return String(value || '')
  const template = document.createElement('template')
  template.innerHTML = sanitizeEditorHtml(value)
  return template.content.textContent || ''
}

function mediaWidthPercent(width) {
  const numeric = Number(width)
  if (Number.isFinite(numeric)) return Math.min(100, Math.max(25, numeric))
  return LEGACY_MEDIA_WIDTHS[width] || LEGACY_MEDIA_WIDTHS.large
}


function hasInlineImageBlock(blocks, imageUrl) {
  return Boolean(imageUrl) && blocks.some((block) => block.type === 'image' && block.url === imageUrl)
}

function parsePostBlocks(post) {
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
]
const BOARD_FILTER_OPTIONS = [
  { value: 'ALL', label: '전체글' },
  { value: 'CONCEPT', label: '개념글' },
  ...CATEGORY_OPTIONS,
]

function categoryLabel(value) {
  return CATEGORY_OPTIONS.find((item) => item.value === value)?.label || '일반'
}

function postScore(post) {
  return (post.upvotes || 0) - (post.downvotes || 0)
}

function isConceptPost(post) {
  return post.conceptPost ?? postScore(post) >= CONCEPT_POST_SCORE_THRESHOLD
}

function isEdited(post) {
  return Boolean(post?.edited)
}

function postImageUrls(post) {
  return [post?.imageUrl, ...(post?.imageUrls || [])]
    .filter(Boolean)
    .filter((url, index, urls) => urls.indexOf(url) === index)
}

function postHasImages(post) {
  return postImageUrls(post).length > 0
}


function paginationRange(currentPage, totalPages) {
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

function shortDate(iso) {
  const date = new Date(iso)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })
}

function renderPostBlocks(post) {
  const blocks = parsePostBlocks(post)
  const imageDownloadUrl = (url) => {
    if (!url) return null
    if (url.endsWith('/image')) return apiUrl(`${url}/download`)
    return apiUrl(url.replace(/\/images\/(\d+)$/, '/images/$1/download'))
  }
  const videoDownloadUrl = (url) => (
    url ? apiUrl(url.replace(/\/videos\/(\d+)$/, '/videos/$1/download')) : null
  )
  const attachments = blocks
    .filter((block) => (block.type === 'image' || block.type === 'video' || block.type === 'file') && block.url)
    .map((block) => ({
      key: `${block.type}-${block.url}`,
      name: block.name || (block.type === 'image' ? 'image' : block.type === 'video' ? 'video' : 'attachment.zip'),
      href: block.type === 'image' ? imageDownloadUrl(block.url) : block.type === 'video' ? videoDownloadUrl(block.url) : apiUrl(block.url),
    }))
    .filter((item, index, items) => item.href && items.findIndex((candidate) => candidate.href === item.href) === index)
  const allAttachments = attachments
  const mediaContainerStyle = (width, align) => {
    const base = {
      width: `${mediaWidthPercent(width)}%`,
      maxWidth: '100%',
      userSelect: 'none',
      WebkitUserDrag: 'none',
      textAlign: align === 'right' ? 'right' : align === 'center' ? 'center' : 'left',
    }
    if (align === 'left') {
      return { ...base, display: 'block', float: 'left', margin: '0.25rem 1rem 0.75rem 0' }
    }
    if (align === 'right') {
      return { ...base, display: 'block', float: 'right', margin: '0.25rem 0 0.75rem 1rem' }
    }
    return { ...base, display: 'inline-block', margin: '0.15rem 0.2rem', verticalAlign: 'top' }
  }
  return (
    <div className="px-4 py-5 sm:px-5">
      {blocks.map((block, i) => {
        if (block.type === 'text') {
          if (!block.content.trim()) return null
          if (hasFormattedText(block.content)) {
            return (
              <span
                key={i}
                className="text-size-container whitespace-pre-wrap break-words auto-text-post"
                dangerouslySetInnerHTML={{ __html: sanitizeEditorHtml(block.content) }}
              />
            )
          }
          return (
            <span key={i} className="text-size-container whitespace-pre-wrap break-words auto-text-post">
              {linkify(block.content)}
            </span>
          )
        }
        if (block.type === 'image') {
          const src = block.url ? apiUrl(block.url) : null
          if (!src) return null
          return (
            <div key={i} className="community-post-media group relative my-2" style={mediaContainerStyle(block.width, block.align)}>
              <img src={src} alt={block.name || '이미지'} draggable={false} className="community-inline-media-image" />
              <a
                href={imageDownloadUrl(block.url)}
                download={block.name}
                className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Download size={12} />
                다운로드
              </a>
            </div>
          )
        }
        if (block.type === 'video') {
          const src = block.url ? apiUrl(block.url) : null
          if (!src) return null
          const downloadUrl = videoDownloadUrl(block.url)
          return (
            <div key={i} className="community-post-media group relative my-2" style={mediaContainerStyle(block.width, block.align)}>
              <video controls preload="metadata" src={src} className="block h-auto w-full rounded" />
              <a
                href={downloadUrl}
                download={block.name}
                className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Download size={12} />
                다운로드
              </a>
            </div>
          )
        }
        if (block.type === 'file') return null
        return null
      })}
      <div style={{ clear: 'both' }} />
      {allAttachments.length > 0 && (
        <div className="mt-5 border-t border-black/10 pt-4">
          <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--theme-body-muted)]">첨부파일</p>
          <div className="flex flex-col gap-2">
            {allAttachments.map((attachment) => (
              <a
                key={attachment.key}
                href={attachment.href}
                download={attachment.name}
                className="inline-flex min-h-10 items-center gap-2 rounded border border-black/10 bg-black/[0.03] px-3 py-2 text-sm font-semibold text-[#3b4890] transition hover:bg-black/[0.06] hover:underline"
              >
                <Download size={14} />
                <span className="break-all">{attachment.name}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function openRowWithKeyboard(event, open) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    open()
  }
}

function clickableCell(open) {
  return {
    onClick: open,
  }
}


function MediaAlignControls({ value, onChange }) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-black/10 bg-white/85 px-2 py-1 shadow-sm">
      {MEDIA_ALIGN_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold transition ${value === option.value ? 'bg-[var(--theme-text)] text-[var(--theme-bg)]' : 'text-[var(--theme-body-muted)] hover:bg-black/5 hover:text-[var(--theme-body-dark)]'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}


function figureInlineStyle(wPct, align) {
  const base = 'max-width:100%;user-select:none;-webkit-user-select:none;-webkit-user-drag:element;cursor:grab'
  if (align === 'left') return `${base};display:block;float:left;width:${wPct}%;margin:0.25rem 1rem 0.75rem 0;`
  if (align === 'right') return `${base};display:block;float:right;width:${wPct}%;margin:0.25rem 0 0.75rem 1rem;`
  return `${base};display:inline-block;vertical-align:top;width:${wPct}%;margin:0.15rem 0.2rem;`
}

function domToBlocks(editorEl, figMeta) {
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

function FigureToolbar({ editorRef, figId, meta, onResize, onAlign, onDelete, onDeselect }) {
  const toolbarRef = useRef(null)
  const [rect, setRect] = useState(null)

  useEffect(() => {
    const el = editorRef.current
    if (!el || !figId) return
    const figEl = el.querySelector(`[data-block-id="${figId}"]`)
    if (!figEl) return
    const measure = () => setRect(figEl.getBoundingClientRect())
    measure()
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [editorRef, figId])

  useEffect(() => {
    const handleDown = (e) => {
      const figEl = editorRef.current?.querySelector(`[data-block-id="${figId}"]`)
      if (figEl && !figEl.contains(e.target) && !toolbarRef.current?.contains(e.target)) onDeselect()
    }
    document.addEventListener('mousedown', handleDown)
    return () => document.removeEventListener('mousedown', handleDown)
  }, [editorRef, figId, onDeselect])

  const startResize = (e, fromRight) => {
    e.preventDefault()
    e.stopPropagation()
    const figEl = editorRef.current?.querySelector(`[data-block-id="${figId}"]`)
    if (!figEl) return
    const startX = e.clientX
    const startW = figEl.offsetWidth
    const parentW = figEl.parentElement?.offsetWidth || startW
    const onMove = (ev) => {
      const delta = fromRight ? ev.clientX - startX : startX - ev.clientX
      const pct = Math.max(25, Math.min(100, Math.round(((startW + delta) / parentW) * 100 / 5) * 5))
      onResize(pct)
      setRect(figEl.getBoundingClientRect())
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  if (!rect) return null
  const hCls = 'fixed z-50 block h-3 w-3 -translate-x-1/2 -translate-y-1/2 border-2 border-blue-500 bg-white'

  return createPortal(
    <>
      <div className="pointer-events-none fixed z-40 border-2 border-blue-500"
        style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} />
      <div ref={toolbarRef}
        className="fixed z-50 flex items-center gap-1 whitespace-nowrap rounded border border-black/10 bg-white/95 px-2 py-1 shadow backdrop-blur-sm"
        style={{ left: rect.left + rect.width / 2, top: Math.max(4, rect.top - 36), transform: 'translateX(-50%)' }}
      >
        <MediaAlignControls value={meta?.align || 'center'} onChange={onAlign} />
        <span className="mx-0.5 h-3 w-px bg-black/15" />
        <button type="button" onClick={onDelete}
          className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-red-500 hover:bg-red-50">삭제</button>
      </div>
      <span className={`${hCls} cursor-nw-resize`} style={{ left: rect.left, top: rect.top }} onMouseDown={(e) => startResize(e, false)} />
      <span className={`${hCls} cursor-ne-resize`} style={{ left: rect.left + rect.width, top: rect.top }} onMouseDown={(e) => startResize(e, true)} />
      <span className={`${hCls} cursor-sw-resize`} style={{ left: rect.left, top: rect.top + rect.height }} onMouseDown={(e) => startResize(e, false)} />
      <span className={`${hCls} cursor-se-resize`} style={{ left: rect.left + rect.width, top: rect.top + rect.height }} onMouseDown={(e) => startResize(e, true)} />
    </>,
    document.body
  )
}

function RichEditor({ initialBlocks, apiRef, onError }) {
  const divRef = useRef(null)
  const figMeta = useRef(new Map())
  const savedRange = useRef(null)
  const [selectedFigId, setSelectedFigId] = useState(null)
  const [selectedMeta, setSelectedMeta] = useState(null)
  const [dropIndicator, setDropIndicator] = useState(null)
  const [draggingFigId, setDraggingFigId] = useState(null)
  const initialized = useRef(false)

  useEffect(() => {
    setSelectedMeta(selectedFigId ? (figMeta.current.get(selectedFigId) ?? null) : null)
  }, [selectedFigId])

  const escH = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const safeSrc = (url) => (url && /^(blob:|\/)/i.test(url) ? url : '')
  const dragFigureId = useRef(null)

  const trailingTypingNode = () => document.createTextNode('\u200B')

  const setCaretAfter = (node) => {
    const sel = window.getSelection()
    if (!sel) return
    const after = document.createRange()
    after.setStartAfter(node)
    after.collapse(true)
    sel.removeAllRanges()
    sel.addRange(after)
    savedRange.current = after.cloneRange()
  }

  const ensureTypingSpaceAfter = (node) => {
    if (!node?.parentNode) return null
    const next = node.nextSibling
    if (next?.nodeType === Node.TEXT_NODE && next.textContent?.startsWith('\u200B')) return next
    const spacer = trailingTypingNode()
    node.parentNode.insertBefore(spacer, next)
    return spacer
  }

  const rangeFromPoint = (clientX, clientY) => {
    if (document.caretPositionFromPoint) {
      const position = document.caretPositionFromPoint(clientX, clientY)
      if (position) {
        const range = document.createRange()
        range.setStart(position.offsetNode, position.offset)
        range.collapse(true)
        return range
      }
    }
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(clientX, clientY)
    return null
  }

  const rangeRect = (range) => {
    if (!range) return null
    const rect = range.getBoundingClientRect()
    if (rect.width || rect.height) return rect
    const marker = document.createElement('span')
    marker.textContent = '\u200B'
    range.insertNode(marker)
    const markerRect = marker.getBoundingClientRect()
    marker.remove()
    return markerRect
  }

  const updateDropIndicator = (clientX, clientY) => {
    const editor = divRef.current
    const range = rangeFromPoint(clientX, clientY)
    const rect = rangeRect(range)
    const editorRect = editor?.getBoundingClientRect()
    if (!rect || !editorRect) {
      setDropIndicator(null)
      return range
    }
    setDropIndicator({
      left: Math.max(0, rect.left - editorRect.left),
      top: Math.max(0, rect.top - editorRect.top),
      height: Math.max(24, rect.height || 24),
    })
    return range
  }

  const insertAtRange = (node, range) => {
    const editor = divRef.current
    if (!editor) return
    let targetRange = range
    if (!targetRange || !editor.contains(targetRange.commonAncestorContainer)) {
      targetRange = document.createRange()
      targetRange.selectNodeContents(editor)
      targetRange.collapse(false)
    }
    let container = targetRange.commonAncestorContainer
    if (container.nodeType === Node.TEXT_NODE) container = container.parentNode
    if (container.closest?.('figure')) {
      const fig = container.closest('figure')
      targetRange = document.createRange()
      targetRange.setStartAfter(fig)
      targetRange.collapse(true)
    }
    targetRange.deleteContents()
    targetRange.insertNode(node)
    const spacer = ensureTypingSpaceAfter(node)
    setCaretAfter(spacer || node)
  }

  const attachFigureClick = (fig) => {
    if (fig.dataset.editorBound === 'true') return
    fig.dataset.editorBound = 'true'
    fig.draggable = true
    fig.style.webkitUserDrag = 'element'
    fig.addEventListener('dragstart', (e) => {
      e.stopPropagation()
      const id = fig.dataset.blockId
      dragFigureId.current = id
      setDraggingFigId(id)
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('application/x-coms-editor-figure', id)
      e.dataTransfer.setData('text/plain', '\u200B')
      setSelectedFigId(id)
    })
    fig.addEventListener('dragend', () => {
      dragFigureId.current = null
      setDraggingFigId(null)
      setDropIndicator(null)
    })
    fig.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      setSelectedFigId(fig.dataset.blockId)
    })
  }

  useEffect(() => {
    const el = divRef.current
    if (!el || initialized.current) return
    initialized.current = true
    figMeta.current = new Map()
    let html = ''
    for (const block of initialBlocks) {
      if (block.type === 'text') {
        html += textToEditorHtml(block.content)
      } else if (block.type === 'image' || block.type === 'video') {
        const id = block.id || localId()
        const wPct = mediaWidthPercent(block.width)
        const align = block.align || 'left'
        figMeta.current.set(id, { type: block.type, status: block.status || 'saved', mediaId: block.mediaId, file: block.file, preview: block.preview, name: block.name, url: block.url, width: wPct, align, legacy: block.legacy })
        const src = safeSrc(block.preview || (block.url ? apiUrl(block.url) : ''))
        const inner = block.type === 'image'
          ? `<img src="${escH(src)}" alt="" draggable="false" class="community-inline-media-image" style="pointer-events:none">`
          : `<video src="${escH(src)}" controls preload="metadata" draggable="false" style="display:block;width:100%;height:auto"></video>`
        html += `<figure class="community-editor-figure" contenteditable="false" data-block-id="${id}" data-type="${block.type}" data-align="${align}" style="${figureInlineStyle(wPct, align)}">${inner}</figure>\u200B`
      } else if (block.type === 'file') {
        const id = block.id || localId()
        figMeta.current.set(id, { type: 'file', status: block.status || 'saved', fileId: block.fileId, file: block.file, name: block.name, url: block.url })
        html += `<figure class="community-editor-figure" contenteditable="false" draggable="true" data-block-id="${id}" data-type="file" style="display:inline-block;vertical-align:top;margin:0.15rem 0.2rem;user-select:none;-webkit-user-select:none;-webkit-user-drag:element;cursor:grab"><span style="display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(0,0,0,0.1);border-radius:4px;background:rgba(0,0,0,0.03);padding:6px 10px;font-size:13px;font-weight:600;pointer-events:none">📎 ${escH(block.name || '파일')}</span></figure>\u200B`
      }
    }
    el.innerHTML = html || ''
    el.querySelectorAll('figure').forEach(attachFigureClick)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveSelection = () => {
    const sel = window.getSelection()
    if (sel?.rangeCount > 0 && divRef.current?.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      savedRange.current = sel.getRangeAt(0).cloneRange()
    }
  }

  const restoreSelection = () => {
    const sel = window.getSelection()
    const range = savedRange.current
    if (!sel || !range || !divRef.current?.contains(range.commonAncestorContainer)) return false
    sel.removeAllRanges()
    sel.addRange(range)
    return true
  }

  const formatBlock = (command, value = null) => {
    divRef.current?.focus()
    restoreSelection()
    document.execCommand(command, false, value)
    saveSelection()
  }

  const insertAtCursor = (node) => {
    const sel = window.getSelection()
    let range = savedRange.current ? savedRange.current.cloneRange() : (sel?.rangeCount > 0 && divRef.current?.contains(sel.getRangeAt(0).commonAncestorContainer) ? sel.getRangeAt(0) : null)
    if (range) {
      let container = range.commonAncestorContainer
      if (container.nodeType === Node.TEXT_NODE) container = container.parentNode
      if (container.closest?.('figure')) {
        const fig = container.closest('figure')
        range = document.createRange()
        range.setStartAfter(fig)
        range.collapse(true)
      }
      insertAtRange(node, range)
    } else {
      divRef.current?.appendChild(node)
      const spacer = ensureTypingSpaceAfter(node)
      setCaretAfter(spacer || node)
    }
  }

  const insertFile = (file) => {
    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type)
    const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type)
    const isFileType = isAllowedArchiveFile(file)
    if (!isImage && !isVideo && !isFileType) { onError?.('지원하지 않는 파일 형식입니다.'); return }
    const blocks = divRef.current ? domToBlocks(divRef.current, figMeta.current) : []
    if (isImage && blocks.filter(b => b.type === 'image').length >= MAX_EXTRA_IMAGES) { onError?.('이미지는 최대 5개까지 추가할 수 있습니다.'); return }
    if (isVideo && blocks.filter(b => b.type === 'video').length >= MAX_VIDEOS) { onError?.('영상은 최대 3개까지 추가할 수 있습니다.'); return }
    if (isFileType && blocks.filter(b => b.type === 'file').length >= MAX_FILES) { onError?.('첨부파일은 최대 5개까지 추가할 수 있습니다.'); return }
    if (isImage && file.size > MAX_IMAGE_BYTES) { onError?.('이미지는 5MB 이하만 업로드할 수 있습니다.'); return }
    if (isVideo && file.size > MAX_VIDEO_BYTES) { onError?.('영상은 100MB 이하만 업로드할 수 있습니다.'); return }
    if (isFileType && file.size > MAX_FILE_BYTES) { onError?.('첨부파일은 50MB 이하만 업로드할 수 있습니다.'); return }
    onError?.('')
    const type = isImage ? 'image' : isVideo ? 'video' : 'file'
    const id = localId()
    const preview = type !== 'file' ? URL.createObjectURL(file) : null
    figMeta.current.set(id, { type, status: 'pending', file, preview, name: file.name, width: 75, align: type === 'file' ? 'center' : 'left' })
    const figure = document.createElement('figure')
    figure.className = 'community-editor-figure'
    figure.contentEditable = 'false'
    figure.draggable = true
    figure.dataset.blockId = id
    figure.dataset.type = type
    figure.dataset.align = type === 'file' ? 'center' : 'left'
    if (type === 'image') {
      figure.setAttribute('style', figureInlineStyle(75, 'left'))
      const img = document.createElement('img')
      img.src = preview
      img.className = 'community-inline-media-image'
      img.setAttribute('style', 'pointer-events:none')
      img.draggable = false
      figure.appendChild(img)
    } else if (type === 'video') {
      figure.setAttribute('style', figureInlineStyle(75, 'left'))
      const vid = document.createElement('video')
      vid.src = preview
      vid.controls = true
      vid.preload = 'metadata'
      vid.setAttribute('style', 'display:block;width:100%;height:auto')
      figure.appendChild(vid)
    } else {
      figure.setAttribute('style', 'display:inline-block;vertical-align:top;margin:0.15rem 0.2rem;user-select:none;-webkit-user-select:none;-webkit-user-drag:element;cursor:grab')
      const span = document.createElement('span')
      span.setAttribute('style', 'display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(0,0,0,0.1);border-radius:4px;background:rgba(0,0,0,0.03);padding:6px 10px;font-size:13px;font-weight:600')
      span.textContent = `📎 ${file.name}`
      figure.appendChild(span)
    }
    attachFigureClick(figure)
    insertAtCursor(figure)
  }

  useEffect(() => {
    if (!apiRef) return
    apiRef.current = {
      insertFiles: (files) => { saveSelection(); files.forEach(insertFile) },
      formatBlock,
      saveSelection,
      getBlocks: () => divRef.current ? domToBlocks(divRef.current, figMeta.current) : [],
      getFigMeta: () => figMeta.current,
      updateFigureMeta: (id, changes) => {
        const meta = figMeta.current.get(id)
        if (meta) figMeta.current.set(id, { ...meta, ...changes })
      },
    }
  })

  const handleFigureResize = (wPct) => {
    const el = divRef.current
    if (!selectedFigId || !el) return
    const figEl = el.querySelector(`[data-block-id="${selectedFigId}"]`)
    if (!figEl) return
    const meta = figMeta.current.get(selectedFigId)
    const align = meta?.align || 'center'
    figEl.setAttribute('style', figureInlineStyle(wPct, align))
    figMeta.current.set(selectedFigId, { ...meta, width: wPct })
  }

  const handleFigureAlign = (align) => {
    const el = divRef.current
    if (!selectedFigId || !el) return
    const figEl = el.querySelector(`[data-block-id="${selectedFigId}"]`)
    if (!figEl) return
    const meta = figMeta.current.get(selectedFigId)
    const wPct = meta?.width || 75
    figEl.dataset.align = align
    figEl.setAttribute('style', figureInlineStyle(wPct, align))
    figMeta.current.set(selectedFigId, { ...meta, align })
    setSelectedMeta({ ...meta, align })
  }

  const handleFigureDelete = () => {
    const el = divRef.current
    if (!selectedFigId || !el) return
    const figEl = el.querySelector(`[data-block-id="${selectedFigId}"]`)
    const meta = figMeta.current.get(selectedFigId)
    if (meta?.preview) URL.revokeObjectURL(meta.preview)
    figMeta.current.delete(selectedFigId)
    figEl?.remove()
    setDraggingFigId(null)
    setSelectedFigId(null)
  }

  return (
    <div className="relative">
      <div
        ref={divRef}
        contentEditable
        suppressContentEditableWarning
        onMouseUp={saveSelection}
        onKeyUp={saveSelection}
        onFocus={saveSelection}
        onClick={(e) => { if (!e.target.closest?.('figure')) setSelectedFigId(null); saveSelection() }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            document.execCommand('insertLineBreak')
          }
        }}
        onDragOver={(e) => {
          if (e.dataTransfer?.types?.includes('application/x-coms-editor-figure')
            || Array.from(e.dataTransfer?.items || []).some(i => i.kind === 'file')) {
            e.preventDefault()
            e.dataTransfer.dropEffect = e.dataTransfer.types.includes('application/x-coms-editor-figure') ? 'move' : 'copy'
            updateDropIndicator(e.clientX, e.clientY)
          }
        }}
        onDragLeave={(e) => {
          if (!(e.relatedTarget instanceof Node) || !divRef.current?.contains(e.relatedTarget)) setDropIndicator(null)
        }}
        onDrop={(e) => {
          const movingFigId = e.dataTransfer?.getData('application/x-coms-editor-figure') || dragFigureId.current
          if (movingFigId) {
            e.preventDefault()
            const fig = divRef.current?.querySelector(`[data-block-id="${movingFigId}"]`)
            if (!fig) return
            const range = updateDropIndicator(e.clientX, e.clientY)
            insertAtRange(fig, range)
            attachFigureClick(fig)
            dragFigureId.current = null
            setDraggingFigId(null)
            setDropIndicator(null)
            setSelectedFigId(null)
            requestAnimationFrame(() => setSelectedFigId(movingFigId))
            return
          }
          const files = Array.from(e.dataTransfer?.files || [])
          if (!files.length) return
          e.preventDefault()
          const range = updateDropIndicator(e.clientX, e.clientY)
          savedRange.current = range
          files.forEach(insertFile)
          setDropIndicator(null)
        }}
        onPaste={(e) => {
          const items = Array.from(e.clipboardData?.items || [])
          const fileItem = items.find(i => i.kind === 'file')
          if (fileItem) {
            e.preventDefault()
            const file = fileItem.getAsFile()
            if (file) insertFile(file)
            return
          }
          e.preventDefault()
          const text = e.clipboardData?.getData('text/plain') || ''
          document.execCommand('insertText', false, text)
        }}
        className="min-h-[420px] w-full whitespace-pre-wrap break-words bg-white px-4 py-5 text-sm leading-7 text-[var(--theme-body-dark)] outline-none sm:px-5"
        placeholder="내용을 입력하세요. 이미지, 동영상을 드래그하거나 툴바에서 삽입할 수 있습니다."
      />
      {dropIndicator && (
        <div
          className="community-drop-indicator pointer-events-none absolute z-10 w-1 rounded-full bg-[#3b4890] shadow-[0_0_0_3px_rgba(59,72,144,0.18)]"
          style={{ left: dropIndicator.left, top: dropIndicator.top, height: dropIndicator.height }}
        />
      )}
      {selectedFigId && selectedFigId !== draggingFigId && (
        <FigureToolbar
          editorRef={divRef}
          figId={selectedFigId}
          meta={selectedMeta}
          onResize={handleFigureResize}
          onAlign={handleFigureAlign}
          onDelete={handleFigureDelete}
          onDeselect={() => setSelectedFigId(null)}
        />
      )}
    </div>
  )
}

function isAllowedArchiveFile(file) {
  return file?.name?.toLowerCase().endsWith('.zip') && ALLOWED_FILE_TYPES.includes(file.type || 'application/octet-stream')
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

async function optimizeImageFile(file) {
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
  const blob = await canvasToBlob(canvas, outputType, IMAGE_OPTIMIZE_QUALITY)
  if (!blob || blob.size >= file.size) return file

  const nextName = outputType === file.type ? file.name : file.name.replace(/\.[^.]+$/, '.webp')
  return new File([blob], nextName, { type: outputType, lastModified: Date.now() })
}

function PostForm({ initialPost, onCancel, onSave }) {
  const isEditing = Boolean(initialPost)
  const [title, setTitle] = useState(initialPost?.title || '')
  const [category, setCategory] = useState(initialPost?.category || 'GENERAL')
  const [saving, setSaving] = useState(false)
  const [savingStep, setSavingStep] = useState('')
  const [error, setError] = useState('')
  const editorApiRef = useRef(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialBlocks = useMemo(() => isEditing ? parsePostBlocks(initialPost) : [], [])
  const applyFormat = (command, value = null) => {
    editorApiRef.current?.formatBlock(command, value)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!title.trim()) { setError('제목을 입력해주세요.'); return }
    const blocks = editorApiRef.current?.getBlocks() || []
    const hasContent = blocks.some(b => (b.type === 'text' && textContentForSearch(b.content).trim()) || b.type === 'image' || b.type === 'video' || b.type === 'file')
    if (!hasContent) { setError('내용을 입력하거나 사진/영상/첨부파일을 추가해주세요.'); return }

    setSaving(true)
    setError('')
    try {
      let postId
      if (isEditing) {
        postId = initialPost.id
      } else {
        setSavingStep('글 등록 중...')
        const placeholder = textContentForSearch(blocks.find(b => b.type === 'text' && textContentForSearch(b.content).trim())?.content || '').trim() || '...'
        const created = await createCommunityPost({ title: title.trim(), content: placeholder, category })
        postId = created.id
      }

      const uploadedBlocks = []
      for (const block of blocks) {
        if (block.type === 'text') {
          uploadedBlocks.push(block)
        } else if (block.status !== 'saved' && block.file) {
          setSavingStep(`업로드 중: ${block.name}`)
          if (block.type === 'image') {
            setSavingStep(`이미지 최적화 중: ${block.name}`)
            const uploadFile = await optimizeImageFile(block.file)
            const ids = await uploadPostImages(postId, [uploadFile])
            if (!Array.isArray(ids) || !ids[0]) throw new Error(`${block.name} 이미지 업로드 응답이 올바르지 않습니다.`)
            editorApiRef.current?.updateFigureMeta(block.id, { status: 'saved', mediaId: ids[0] })
            uploadedBlocks.push({ ...block, status: 'saved', mediaId: ids[0], name: uploadFile.name })
          } else if (block.type === 'video') {
            const videoId = await uploadPostVideo(postId, block.file)
            if (!videoId) throw new Error(`${block.name} 영상 업로드 응답이 올바르지 않습니다.`)
            editorApiRef.current?.updateFigureMeta(block.id, { status: 'saved', mediaId: videoId })
            uploadedBlocks.push({ ...block, status: 'saved', mediaId: videoId })
          } else if (block.type === 'file') {
            const fileId = await uploadPostFile(postId, block.file)
            if (!fileId) throw new Error(`${block.name} 첨부파일 업로드 응답이 올바르지 않습니다.`)
            editorApiRef.current?.updateFigureMeta(block.id, { status: 'saved', fileId })
            uploadedBlocks.push({ ...block, status: 'saved', fileId })
          }
        } else {
          uploadedBlocks.push(block)
        }
      }

      const contentJson = JSON.stringify(
        uploadedBlocks.map(b => {
          if (b.type === 'text') return { type: 'text', content: b.content }
          if (b.type === 'image' && b.mediaId) return { type: 'image', mediaId: b.mediaId, name: b.name, width: b.width || 75, align: b.align || 'center' }
          if (b.type === 'video' && b.mediaId) return { type: 'video', mediaId: b.mediaId, name: b.name, width: b.width || 75, align: b.align || 'center' }
          if (b.type === 'file' && b.fileId) return { type: 'file', fileId: b.fileId, name: b.name }
          return null
        }).filter(Boolean)
      )

      const removeLegacyImage = Boolean(initialPost?.imageUrl && !uploadedBlocks.some(b => b.legacy))
      setSavingStep('저장 중...')
      const saved = await updateCommunityPost(postId, { title: title.trim(), content: contentJson, category, removeImage: removeLegacyImage })
      onSave(saved)
    } catch (err) {
      setError(err.message || '저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
      setSavingStep('')
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-white/10 bg-white/80 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.12)] sm:p-5">
      <div className="flex flex-wrap gap-2">
        <select value={category} onChange={(e) => setCategory(e.target.value)}
          className="rounded border border-black/15 bg-white px-3 py-2 text-sm font-semibold text-[var(--theme-body-dark)] outline-none focus:border-[var(--theme-accent)]"
        >
          {CATEGORY_OPTIONS.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
      </div>

      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={MAX_TITLE_LENGTH}
        placeholder="제목" readOnly={isEditing}
        className={`w-full rounded border border-black/15 px-4 py-3 text-base text-[var(--theme-body-dark)] outline-none focus:border-[var(--theme-accent)] sm:text-sm ${isEditing ? 'bg-black/5 text-[var(--theme-body-muted)]' : 'bg-white'}`}
      />

      <div className="overflow-hidden rounded border border-black/15 bg-white">
        <div className="community-editor-toolbar flex flex-wrap items-center gap-2 border-b border-black/10 bg-black/[0.03] px-3 py-2">
          <span className="mr-1 text-xs font-black uppercase tracking-[0.2em] text-[var(--theme-body-muted)]">Editor</span>
          <div className="inline-flex overflow-hidden rounded border border-black/15 bg-white">
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('bold')}
              className="min-h-9 px-3 text-sm font-black text-[var(--theme-body-dark)] hover:bg-black/5">B</button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('italic')}
              className="min-h-9 px-3 text-sm italic text-[var(--theme-body-dark)] hover:bg-black/5">I</button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('underline')}
              className="min-h-9 px-3 text-sm underline text-[var(--theme-body-dark)] hover:bg-black/5">U</button>
          </div>
          <label className="inline-flex min-h-9 items-center gap-1.5 rounded border border-black/15 bg-white px-2 text-xs font-semibold text-[var(--theme-body-mid)] hover:bg-black/5">
            글자색
            <input type="color" defaultValue="#111827" className="h-6 w-7 cursor-pointer border-0 bg-transparent p-0"
              onMouseDown={(e) => e.preventDefault()} onChange={(e) => applyFormat('foreColor', e.target.value)} />
          </label>
          <label className="inline-flex min-h-9 items-center gap-1.5 rounded border border-black/15 bg-white px-2 text-xs font-semibold text-[var(--theme-body-mid)] hover:bg-black/5">
            배경
            <input type="color" defaultValue="#fff3a3" className="h-6 w-7 cursor-pointer border-0 bg-transparent p-0"
              onMouseDown={(e) => e.preventDefault()} onChange={(e) => applyFormat('hiliteColor', e.target.value)} />
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-black/15 bg-white px-3 py-2 text-sm font-semibold text-[var(--theme-body-mid)] hover:bg-black/5">
            <ImagePlus size={14} />이미지
            <input type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp" className="hidden"
              onChange={(e) => { editorApiRef.current?.insertFiles(Array.from(e.target.files)); e.target.value = '' }} />
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-black/15 bg-white px-3 py-2 text-sm font-semibold text-[var(--theme-body-mid)] hover:bg-black/5">
            <Video size={14} />동영상
            <input type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden"
              onChange={(e) => { editorApiRef.current?.insertFiles(Array.from(e.target.files)); e.target.value = '' }} />
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-black/15 bg-white px-3 py-2 text-sm font-semibold text-[var(--theme-body-mid)] hover:bg-black/5">
            <Paperclip size={14} />압축파일
            <input type="file" multiple accept=".zip,application/zip,application/x-zip-compressed" className="hidden"
              onChange={(e) => { editorApiRef.current?.insertFiles(Array.from(e.target.files)); e.target.value = '' }} />
          </label>
          <span className="text-xs text-[var(--theme-body-muted)]">본문 칸에 드래그하거나 Ctrl+V로 바로 삽입 · 큰 이미지는 저장할 때 자동 최적화</span>
        </div>
        <RichEditor initialBlocks={initialBlocks} apiRef={editorApiRef} onError={(msg) => setError(msg)} />
      </div>

      {error && <p className="text-sm font-semibold text-red-500">{error}</p>}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" disabled={saving || !title.trim()}
          className="min-h-11 rounded bg-[var(--theme-text)] px-5 py-2.5 text-sm font-semibold text-[var(--theme-bg)] disabled:opacity-50 sm:min-h-0"
        >
          {saving ? (savingStep || '저장 중...') : isEditing ? '수정 완료' : '글 등록'}
        </button>
        <button type="button" onClick={onCancel}
          className="inline-flex min-h-11 items-center justify-center gap-1 rounded border border-black/15 bg-white px-4 py-2.5 text-sm font-semibold text-[var(--theme-body-mid)] sm:min-h-0"
        >
          <X size={14} />취소
        </button>
      </div>
    </form>
  )
}

function BoardHeader({ title = "COM's 게시판", children }) {
  return (
    <div className="border-b border-white/10 bg-black/20 px-4 py-5 sm:px-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-200">Community</p>
          <h1 className="mt-2 break-words text-2xl font-black text-white sm:text-4xl">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-white/60">말머리별로 글을 보고, 게시글은 별도 화면처럼 열립니다.</p>
        </div>
        {children && <div className="flex w-full shrink-0 sm:w-auto sm:justify-end">{children}</div>}
      </div>
    </div>
  )
}

export default function Community({ onBack }) {
  const { user } = useAuth()
  const { id: urlId } = useParams()
  const navigate = useNavigate()
  const [posts, setPosts] = useState([])
  const [currentPost, setCurrentPost] = useState(null)
  const [mode, setMode] = useState('list')
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [activeCategory, setActiveCategory] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [comments, setComments] = useState([])
  const [commentInput, setCommentInput] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [replyInput, setReplyInput] = useState('')
  const [replyMentionEnabled, setReplyMentionEnabled] = useState(true)
  const [editingCommentId, setEditingCommentId] = useState(null)
  const [editCommentInput, setEditCommentInput] = useState('')
  const [commentSaving, setCommentSaving] = useState(false)

  useEffect(() => {
    let mounted = true
    listCommunityPosts()
      .then((data) => { if (mounted) setPosts(data) })
      .catch((err) => { if (mounted) setError(err.message || '커뮤니티 글을 불러오지 못했습니다.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const indexedPosts = useMemo(
    () => posts.map((post) => ({
      ...post,
      _searchKey: `${post.title} ${post.authorDisplayName || post.authorName || ''}`.toLowerCase(),
    })),
    [posts]
  )

  const filteredPosts = useMemo(() => {
    const byCategory = activeCategory === 'ALL'
      ? indexedPosts
      : activeCategory === 'CONCEPT'
        ? indexedPosts.filter(isConceptPost)
        : indexedPosts.filter((post) => (post.category || 'GENERAL') === activeCategory)
    if (!searchQuery.trim()) return byCategory
    const q = searchQuery.toLowerCase()
    return byCategory.filter((post) => post._searchKey.includes(q))
  }, [activeCategory, indexedPosts, searchQuery])
  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / PAGE_SIZE))
  const pageStartIndex = (page - 1) * PAGE_SIZE
  const visiblePosts = useMemo(
    () => filteredPosts.slice(pageStartIndex, pageStartIndex + PAGE_SIZE),
    [filteredPosts, pageStartIndex],
  )
  const paginationItems = useMemo(() => paginationRange(page, totalPages), [page, totalPages])
  const showingFrom = filteredPosts.length === 0 ? 0 : pageStartIndex + 1
  const showingTo = Math.min(filteredPosts.length, pageStartIndex + visiblePosts.length)

  useEffect(() => {
    if (page > totalPages) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPage(totalPages)
    }
  }, [page, totalPages])

  const mergePost = (post) => {
    setPosts((prev) => {
      const exists = prev.some((item) => item.id === post.id)
      if (!exists) return [post, ...prev]
      return prev.map((item) => (item.id === post.id ? { ...item, ...post } : item))
    })
    setCurrentPost(post)
  }

  const bumpCurrentPostCommentCount = (delta) => {
    if (!currentPost || delta === 0) return
    const postId = currentPost.id
    setCurrentPost((prev) => {
      if (!prev) return prev
      return { ...prev, commentCount: Math.max(0, Number(prev.commentCount || 0) + delta) }
    })
    setPosts((prev) => prev.map((post) => (
      post.id === postId ? { ...post, commentCount: Math.max(0, Number(post.commentCount || 0) + delta) } : post
    )))
  }

  const commentCountSuffix = (post) => {
    const count = Number(post?.commentCount || 0)
    return count > 0 ? ` [${count.toLocaleString('ko-KR')}]` : ''
  }

  const replyMentionFor = (comment) => {
    const name = comment?.authorName?.trim()
    return name ? `@${name}` : ''
  }

  const buildReplyContent = (parentId) => {
    const body = replyInput.trim()
    if (!body) return ''
    const parent = comments.find((comment) => comment.id === parentId)
    const mention = replyMentionEnabled ? replyMentionFor(parent) : ''
    const content = mention ? `${mention} ${body}` : body
    if (content.length > MAX_COMMENT_LENGTH) {
      alert(`태그를 포함한 답글은 ${MAX_COMMENT_LENGTH}자 이하로 입력해주세요.`)
      return ''
    }
    return content
  }

  useEffect(() => {
    if (!urlId) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setMode('list')
      setCurrentPost(null)
      setComments([])
      setCommentInput('')
      setReplyTo(null)
      setReplyInput('')
      setReplyMentionEnabled(true)
      setEditingCommentId(null)
      setEditCommentInput('')
      /* eslint-enable react-hooks/set-state-in-effect */
      return
    }
    const numId = Number(urlId)
    if (isNaN(numId)) { navigate('/community', { replace: true }); return }
    setDetailLoading(true)
    setComments([])
    setCommentInput('')
    setReplyTo(null)
    setReplyInput('')
    setReplyMentionEnabled(true)
    setEditingCommentId(null)
    setEditCommentInput('')
    let mounted = true
    Promise.all([
      getCommunityPost(numId),
      listComments(numId).catch(() => []),
    ])
      .then(([detail, commentList]) => {
        if (!mounted) return
        mergePost(detail)
        setComments(Array.isArray(commentList) ? commentList : [])
        setMode('detail')
        window.setTimeout(() => {
          const targetId = window.location.hash?.slice(1)
          if (targetId) document.getElementById(targetId)?.scrollIntoView({ block: 'center' })
        }, 60)
      })
      .catch(() => { if (mounted) navigate('/community', { replace: true }) })
      .finally(() => { if (mounted) setDetailLoading(false) })
    return () => { mounted = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlId])

  const openPost = (post) => {
    navigate('/community/' + post.id)
  }

  const handleAddComment = async () => {
    if (!commentInput.trim() || !currentPost) return
    setCommentSaving(true)
    try {
      const comment = await createComment(currentPost.id, commentInput.trim())
      setComments((prev) => [...prev, comment])
      bumpCurrentPostCommentCount(1)
      setCommentInput('')
    } catch (err) {
      alert(err.message || '댓글 등록 실패')
    } finally {
      setCommentSaving(false)
    }
  }

  const handleAddReply = async (parentId) => {
    if (!replyInput.trim() || !currentPost) return
    setCommentSaving(true)
    try {
      const content = buildReplyContent(parentId)
      if (!content) return
      const comment = await createComment(currentPost.id, content, parentId)
      setComments((prev) => [...prev, comment])
      bumpCurrentPostCommentCount(1)
      setReplyInput('')
      setReplyTo(null)
      setReplyMentionEnabled(true)
    } catch (err) {
      alert(err.message || '답글 등록 실패')
    } finally {
      setCommentSaving(false)
    }
  }

  const handleDeleteComment = async (commentId) => {
    if (!currentPost || !window.confirm('댓글을 삭제하시겠습니까?')) return
    try {
      await deleteComment(currentPost.id, commentId)
      const toDelete = new Set([commentId])
      let changed = true
      while (changed) {
        changed = false
        comments.forEach((comment) => {
          if (comment.parentCommentId && toDelete.has(comment.parentCommentId) && !toDelete.has(comment.id)) {
            toDelete.add(comment.id)
            changed = true
          }
        })
      }
      setComments((prev) => {
        let changed = true
        while (changed) {
          changed = false
          prev.forEach((comment) => {
            if (comment.parentCommentId && toDelete.has(comment.parentCommentId) && !toDelete.has(comment.id)) {
              toDelete.add(comment.id)
              changed = true
            }
          })
        }
        return prev.filter((comment) => !toDelete.has(comment.id))
      })
      bumpCurrentPostCommentCount(-toDelete.size)
    } catch (err) {
      alert(err.message || '댓글 삭제 실패')
    }
  }

  const startEditComment = (comment) => {
    setEditingCommentId(comment.id)
    setEditCommentInput(comment.content || '')
    setReplyTo(null)
    setReplyInput('')
  }

  const handleUpdateComment = async (commentId) => {
    if (!currentPost || !editCommentInput.trim()) return
    setCommentSaving(true)
    try {
      const updated = await updateComment(currentPost.id, commentId, editCommentInput.trim())
      setComments((prev) => prev.map((comment) => (comment.id === commentId ? updated : comment)))
      setEditingCommentId(null)
      setEditCommentInput('')
    } catch (err) {
      alert(err.message || '댓글 수정 실패')
    } finally {
      setCommentSaving(false)
    }
  }

  const backToList = () => {
    setMode('list')
    setCurrentPost(null)
    setComments([])
    setCommentInput('')
    setReplyTo(null)
    setReplyInput('')
    setReplyMentionEnabled(true)
    setEditingCommentId(null)
    setEditCommentInput('')
    if (urlId) navigate('/community')
  }

  const handleSave = (saved) => {
    mergePost(saved)
    setMode('detail')
    navigate('/community/' + saved.id)
  }

  const handleDelete = async (post) => {
    if (!window.confirm('게시글을 삭제하시겠습니까?')) return
    try {
      await deleteCommunityPost(post.id)
      setPosts((prev) => prev.filter((item) => item.id !== post.id))
      backToList()
    } catch (err) {
      alert(err.message || '삭제 중 오류가 발생했습니다.')
    }
  }

  const handleAdminDeleteFromList = async (event, post) => {
    event.stopPropagation()
    await handleDelete(post)
  }

  const handleVote = async (value) => {
    if (!currentPost) return
    try {
      const updated = await voteCommunityPost(currentPost.id, value)
      mergePost(updated)
    } catch (err) {
      alert(err.message || '투표 처리 중 오류가 발생했습니다.')
    }
  }

  const currentPostConcept = currentPost ? isConceptPost(currentPost) : false
  const commentTree = useMemo(() => {
    const nodes = new Map(comments.map((comment) => [comment.id, { ...comment, children: [] }]))
    const roots = []
    comments.forEach((comment) => {
      const node = nodes.get(comment.id)
      const parent = comment.parentCommentId ? nodes.get(comment.parentCommentId) : null
      if (parent) {
        parent.children.push(node)
      } else {
        roots.push(node)
      }
    })
    return roots
  }, [comments])

  const goToPage = (nextPage) => {
    setPage(Math.min(Math.max(nextPage, 1), totalPages))
  }

  const renderPagination = (placement = 'top') => {
    const disabledClass = 'opacity-35'
    const iconButtonClass = 'shape-cut-sm flex size-10 items-center justify-center border border-white/10 bg-white/8 text-white/68 transition enabled:hover:bg-white/14 disabled:pointer-events-none sm:size-9'

    return (
      <div className={`flex flex-col gap-3 ${placement === 'bottom' ? 'items-center' : 'lg:flex-row lg:items-center lg:justify-between'}`}>
        <div className="text-center text-xs font-semibold text-white/48 lg:text-left">
          {filteredPosts.length > 0
            ? `${showingFrom.toLocaleString('ko-KR')}-${showingTo.toLocaleString('ko-KR')} / ${filteredPosts.length.toLocaleString('ko-KR')}`
            : '0 / 0'}
          <span className="mx-2 text-white/20">|</span>
          {page.toLocaleString('ko-KR')} / {totalPages.toLocaleString('ko-KR')} 페이지
        </div>
        <div className="max-w-full overflow-x-auto pb-1">
          <div className="flex w-max items-center justify-center gap-1.5 px-1">
            <button
              type="button"
              onClick={() => goToPage(1)}
              disabled={page === 1}
              className={`hidden sm:flex ${iconButtonClass} ${page === 1 ? disabledClass : ''}`}
              aria-label="첫 페이지"
              title="첫 페이지"
            >
              <ChevronsLeft size={15} />
            </button>
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page === 1}
              className={`${iconButtonClass} ${page === 1 ? disabledClass : ''}`}
              aria-label="이전 페이지"
              title="이전 페이지"
            >
              <ChevronLeft size={15} />
            </button>
            {paginationItems.map((item) => (
              typeof item === 'string' ? (
                <span key={item} className="flex size-10 items-center justify-center text-sm font-black text-white/32 sm:size-9">...</span>
              ) : (
                <button
                  key={item}
                  type="button"
                  onClick={() => goToPage(item)}
                  className={`shape-cut-sm flex size-10 items-center justify-center border text-sm font-black transition sm:size-9 ${
                    page === item
                      ? 'border-[var(--theme-accent)] bg-[var(--theme-accent)] text-[var(--theme-bg)] shadow-[0_0_22px_rgba(255,211,105,0.25)]'
                      : 'border-white/10 bg-white/8 text-white/70 hover:bg-white/14 hover:text-white'
                  }`}
                  aria-current={page === item ? 'page' : undefined}
                >
                  {item}
                </button>
              )
            ))}
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page === totalPages}
              className={`${iconButtonClass} ${page === totalPages ? disabledClass : ''}`}
              aria-label="다음 페이지"
              title="다음 페이지"
            >
              <ChevronRight size={15} />
            </button>
            <button
              type="button"
              onClick={() => goToPage(totalPages)}
              disabled={page === totalPages}
              className={`hidden sm:flex ${iconButtonClass} ${page === totalPages ? disabledClass : ''}`}
              aria-label="마지막 페이지"
              title="마지막 페이지"
            >
              <ChevronsRight size={15} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderPostCard = (post) => {
    const open = () => openPost(post)
    const concept = isConceptPost(post)

    return (
      <div
        key={post.id}
        tabIndex={0}
        role="button"
        onClick={open}
        onKeyDown={(event) => openRowWithKeyboard(event, open)}
        className={`shape-cut-sm cursor-pointer border border-white/10 bg-black/18 p-4 text-left text-white/75 transition hover:bg-white/8 focus:bg-white/10 focus:outline-none ${concept ? 'border-[var(--theme-accent)]/30 bg-[var(--theme-accent)]/8' : ''}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-black">
              <span className="text-white/38">#{post.id}</span>
              <span className="shape-cut-sm border border-cyan-200/15 bg-cyan-200/10 px-2 py-1 text-cyan-100">{categoryLabel(post.category || 'GENERAL')}</span>
              {concept && <span className="rounded bg-[#f0c36d] px-1.5 py-0.5 text-[10px] text-[#3a2b00]">개념글</span>}
              {postHasImages(post) && <span className="text-cyan-200">[사진]</span>}
              {(post.videoInfos?.length > 0) && <span className="text-cyan-200">[영상]</span>}
              {isEdited(post) && <span className="text-white/42">수정</span>}
              {post.authorAdmin && <span className="rounded bg-red-600 px-1 py-0.5 text-[10px] text-white">주딱</span>}
            </div>
            <h3 className="mt-2 truncate text-base font-black leading-6 text-white" title={post.title}>
              {post.title}
              <span className="text-cyan-200">{commentCountSuffix(post)}</span>
            </h3>
          </div>
          {user?.role === 'ADMIN' && (
            <button
              type="button"
              onClick={(event) => handleAdminDeleteFromList(event, post)}
              className="shape-cut-sm shrink-0 border border-red-300/30 px-2.5 py-1.5 text-[11px] font-black text-red-200 transition hover:bg-red-500/20"
            >
              삭제
            </button>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold text-white/48">
          <span className="min-w-0 truncate text-white/62">{post.authorDisplayName || post.authorName}</span>
          <span className="text-right">{shortDate(post.createdAt)}</span>
          <span>조회 {post.viewCount}</span>
          <span className="text-right">개추 {postScore(post)}</span>
        </div>
      </div>
    )
  }

  const renderComment = (comment, level = 0) => {
    const depth = Math.min(level, 6)
    const indent = depth === 0 ? 0 : `clamp(8px, ${depth * 3}vw, ${depth * 16}px)`
    const isEditing = editingCommentId === comment.id
    const isReplying = replyTo === comment.id
    return (
      <div key={comment.id} className="divide-y divide-black/8">
        <div
          id={`comment-${comment.id}`}
          className={`scroll-mt-28 flex items-start gap-3 px-4 py-3 ${level > 0 ? 'border-l-2 border-[#3b4890]/20 bg-black/[0.02]' : ''}`}
          style={{ marginLeft: indent }}
        >
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-xs font-bold text-[var(--theme-body-dark)]">{comment.authorName}</span>
              <span className="text-[11px] text-[var(--theme-body-muted)]">{new Date(comment.createdAt).toLocaleString('ko-KR')}</span>
              {comment.edited && (
                <span className="text-[11px] font-bold text-[var(--theme-body-muted)]">
                  수정 {comment.updatedAt ? new Date(comment.updatedAt).toLocaleString('ko-KR') : ''}
                </span>
              )}
            </div>
            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  value={editCommentInput}
                  onChange={(e) => setEditCommentInput(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault()
                      handleUpdateComment(comment.id)
                    }
                  }}
                  maxLength={MAX_COMMENT_LENGTH}
                  rows={3}
                  className="w-full rounded border border-black/15 bg-[#fafafa] px-3 py-2 text-base outline-none focus:border-[#3b4890] focus:bg-white sm:text-sm"
                  disabled={commentSaving}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleUpdateComment(comment.id)}
                    disabled={commentSaving || !editCommentInput.trim()}
                    className="rounded bg-[#3b4890] px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                  >
                    저장
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingCommentId(null); setEditCommentInput('') }}
                    className="rounded border border-black/15 bg-white px-3 py-2 text-xs font-bold text-[var(--theme-body-muted)]"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-size-container auto-text-comment whitespace-pre-wrap break-words text-[var(--theme-body-dark)]">{linkify(comment.content)}</p>
            )}
            {!isEditing && (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setReplyTo(isReplying ? null : comment.id)
                    setReplyInput('')
                    setReplyMentionEnabled(true)
                    setEditingCommentId(null)
                    setEditCommentInput('')
                  }}
                  className="text-xs font-bold text-[#3b4890] hover:underline"
                >
                  댓글 달기
                </button>
                {comment.deletable && (
                  <button
                    type="button"
                    onClick={() => startEditComment(comment)}
                    className="text-xs font-bold text-[#3b4890] hover:underline"
                  >
                    수정
                  </button>
                )}
                {comment.deletable && (
                  <button
                    type="button"
                    onClick={() => handleDeleteComment(comment.id)}
                    className="text-xs font-bold text-red-500 hover:underline"
                  >
                    삭제
                  </button>
                )}
              </div>
            )}
            {isReplying && (
              <div className="mt-2 space-y-2">
                {replyMentionEnabled && replyMentionFor(comment) && (
                  <div className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#3b4890]/20 bg-[#eef3ff] px-2.5 py-1 text-xs font-bold text-[#3b4890]">
                    <span className="truncate">{replyMentionFor(comment)}</span>
                    <button
                      type="button"
                      onClick={() => setReplyMentionEnabled(false)}
                      className="rounded-full px-1 text-[#3b4890]/70 hover:bg-[#3b4890]/10 hover:text-[#3b4890]"
                      aria-label="답글 태그 제거"
                    >
                      ×
                    </button>
                  </div>
                )}
                <textarea
                  value={replyInput}
                  onChange={(e) => setReplyInput(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault()
                      handleAddReply(comment.id)
                    }
                  }}
                  placeholder="댓글을 입력하세요"
                  maxLength={Math.max(0, MAX_COMMENT_LENGTH - (replyMentionEnabled ? replyMentionFor(comment).length + 1 : 0))}
                  rows={3}
                  className="w-full rounded border border-black/15 bg-[#fafafa] px-3 py-2 text-base outline-none focus:border-[#3b4890] focus:bg-white sm:text-sm"
                  disabled={commentSaving}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddReply(comment.id)}
                    disabled={commentSaving || !replyInput.trim()}
                    className="rounded bg-[#3b4890] px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                  >
                    등록
                  </button>
                  <button
                    type="button"
                    onClick={() => { setReplyTo(null); setReplyInput('') }}
                    className="rounded border border-black/15 bg-white px-3 py-2 text-xs font-bold text-[var(--theme-body-muted)]"
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {comment.children?.map((child) => renderComment(child, level + 1))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {mode === 'list' && (
        <div className="flex justify-center sm:justify-start">
          <button type="button" onClick={onBack} className="shape-cut-sm w-full border border-[var(--theme-border-soft)] bg-[var(--theme-surface-96)] px-4 py-2.5 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white sm:w-auto">
            메인으로 돌아가기
          </button>
        </div>
      )}

      <section className="overflow-hidden shape-cut border border-white/10 bg-white/5 text-[var(--theme-body-dark)] shadow-[0_22px_70px_var(--theme-shadow-glass)] backdrop-blur-md">
        {mode === 'list' && (
          <>
            <BoardHeader>
              <button type="button" onClick={() => setMode('write')} className="shape-cut-sm w-full bg-white/85 px-5 py-3 text-sm font-bold text-[var(--theme-body-dark)] transition hover:bg-white sm:w-auto sm:py-2.5">
                글쓰기
              </button>
            </BoardHeader>
            <div className="border-b border-white/10 bg-black/18 px-4 py-4 sm:px-7">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="-mx-1 overflow-x-auto pb-1">
                    <div className="flex min-w-max gap-2 px-1 text-sm font-bold lg:min-w-0 lg:flex-wrap">
                      {BOARD_FILTER_OPTIONS.map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => {
                            setActiveCategory(item.value)
                            setPage(1)
                          }}
                          className={`shape-cut-sm min-h-10 px-4 py-2 transition sm:min-h-9 ${
                            activeCategory === item.value
                              ? 'bg-white text-[var(--theme-body-dark)] shadow-[0_0_18px_rgba(255,255,255,0.12)]'
                              : 'border border-white/10 bg-white/8 text-white/68 hover:bg-white/14 hover:text-white'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="relative flex items-center">
                      <Search size={15} className="pointer-events-none absolute left-3 text-white/45" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
                        placeholder="제목, 작성자 검색"
                        className="shape-cut-sm h-11 w-full border border-white/10 bg-black/24 py-2 pl-9 pr-3 text-base text-white placeholder-white/35 outline-none transition focus:border-[var(--theme-accent)] sm:h-10 sm:w-64 sm:text-sm"
                      />
                    </div>
                    <span className="shape-cut-sm border border-white/10 bg-white/8 px-3 py-2 text-center text-xs font-bold text-white/55">
                      {filteredPosts.length.toLocaleString('ko-KR')}개
                    </span>
                  </div>
                </div>
                <div className="border-t border-white/10 pt-4">
                  {renderPagination('top')}
                </div>
              </div>
            </div>
            {error && <p className="mx-5 mt-5 shape-cut-sm border border-red-300/20 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-100 sm:mx-7">{error}</p>}
            <div className="m-4 space-y-3 md:hidden">
              {loading && (
                <div className="shape-cut-sm border border-white/10 bg-black/18 px-4 py-12 text-center text-sm font-semibold text-white/65">불러오는 중...</div>
              )}
              {!loading && filteredPosts.length === 0 && (
                <div className="shape-cut-sm border border-white/10 bg-black/18 px-4 py-12 text-center text-sm font-semibold text-white/65">등록된 글이 없습니다.</div>
              )}
              {visiblePosts.map(renderPostCard)}
            </div>
            <div className="m-5 hidden overflow-x-auto shape-cut-sm border border-white/10 bg-black/18 md:block sm:m-7">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead className="border-b border-white/10 bg-white/8 text-xs uppercase tracking-[0.16em] text-white/48">
                  <tr>
                    <th className="w-20 px-4 py-3 font-semibold">번호</th>
                    <th className="w-24 px-4 py-3 font-semibold">말머리</th>
                    <th className="px-4 py-3 text-left font-semibold">제목</th>
                    <th className="w-36 px-4 py-3 font-semibold">글쓴이</th>
                    <th className="w-28 px-4 py-3 font-semibold">작성일</th>
                    <th className="w-20 px-4 py-3 font-semibold">조회</th>
                    <th className="w-20 px-4 py-3 font-semibold">개추</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {loading && (
                    <tr><td colSpan="7" className="px-4 py-16 text-center text-white/65">불러오는 중...</td></tr>
                  )}
                  {!loading && filteredPosts.length === 0 && (
                    <tr><td colSpan="7" className="px-4 py-16 text-center text-white/65">등록된 글이 없습니다.</td></tr>
                  )}
                  {visiblePosts.map((post) => {
                    const open = () => openPost(post)
                    const concept = isConceptPost(post)
                    return (
                    <tr
                      key={post.id}
                      tabIndex={0}
                      role="button"
                      onClick={open}
                      onKeyDown={(event) => openRowWithKeyboard(event, open)}
                      className={`cursor-pointer text-white/75 transition hover:bg-white/5 focus:bg-white/10 focus:outline-none ${concept ? 'bg-yellow-200/5' : ''}`}
                    >
                      <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-center text-xs text-white/45">{post.id}</td>
                      <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-center text-xs font-bold text-cyan-100">{categoryLabel(post.category || 'GENERAL')}</td>
                      <td {...clickableCell(open)} className="cursor-pointer px-4 py-4">
                        <span className="block max-w-[520px] truncate text-left font-semibold text-white">
                          {concept && <span className="mr-1 rounded bg-[#f0c36d] px-1.5 py-0.5 text-[10px] font-black text-[#3a2b00]">개념글</span>}
                          {post.title}
                          <span className="text-cyan-200">{commentCountSuffix(post)}</span>
                        </span>
                        {postHasImages(post) && <span className="ml-1 text-xs text-cyan-200">[사진]</span>}
                        {(post.videoInfos?.length > 0) && <span className="ml-1 text-xs text-cyan-200">[영상]</span>}
                        {isEdited(post) && <span className="ml-1 text-[10px] font-bold text-white/45">수정</span>}
                        {post.authorAdmin && <span className="ml-1 rounded bg-red-600 px-1 py-0.5 text-[10px] font-black text-white">주딱</span>}
                      </td>
                      <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-center text-xs font-semibold">
                        <span>{post.authorDisplayName || post.authorName}</span>
                        {user?.role === 'ADMIN' && (
                          <button
                            type="button"
                            onClick={(event) => handleAdminDeleteFromList(event, post)}
                            className="ml-2 rounded border border-red-300/30 px-2 py-1 text-[10px] font-black text-red-200 hover:bg-red-500/20"
                          >
                            삭제
                          </button>
                        )}
                      </td>
                      <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-center text-xs text-white/45">{shortDate(post.createdAt)}</td>
                      <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-center text-xs">{post.viewCount}</td>
                      <td {...clickableCell(open)} className="cursor-pointer px-4 py-4 text-center text-xs">{postScore(post)}</td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-white/10 bg-black/18 px-5 py-4 sm:px-7">
              {renderPagination('bottom')}
            </div>
          </>
        )}

        {mode === 'write' && (
          <>
            <BoardHeader title="글쓰기">
              <button type="button" onClick={backToList} className="shape-cut-sm inline-flex w-full items-center justify-center gap-1 border border-white/10 bg-white/10 px-4 py-3 text-sm font-bold text-white sm:w-auto sm:py-2">
                <ArrowLeft size={14} />
                목록
              </button>
            </BoardHeader>
            <div className="p-4 sm:p-7">
              <PostForm onCancel={backToList} onSave={handleSave} />
            </div>
          </>
        )}

        {mode === 'edit' && currentPost && (
          <>
            <BoardHeader title="글 수정">
              <button type="button" onClick={() => setMode('detail')} className="shape-cut-sm inline-flex w-full items-center justify-center gap-1 border border-white/10 bg-white/10 px-4 py-3 text-sm font-bold text-white sm:w-auto sm:py-2">
                <ArrowLeft size={14} />
                본문
              </button>
            </BoardHeader>
            <div className="p-4 sm:p-7">
              <PostForm initialPost={currentPost} onCancel={() => setMode('detail')} onSave={handleSave} />
            </div>
          </>
        )}

        {mode === 'detail' && (
          <>
            <BoardHeader title={detailLoading ? '글 여는 중...' : currentPost?.title || '게시글'}>
              <button type="button" onClick={backToList} className="shape-cut-sm inline-flex w-full items-center justify-center gap-1 border border-white/10 bg-white/10 px-4 py-3 text-sm font-bold text-white sm:w-auto sm:py-2">
                <ArrowLeft size={14} />
                목록
              </button>
            </BoardHeader>
            {detailLoading || !currentPost ? (
              <p className="px-4 py-16 text-center text-sm text-[var(--theme-body-muted)]">글을 여는 중...</p>
            ) : (
              <article className="m-0 overflow-hidden bg-white shadow-[0_18px_50px_rgba(0,0,0,0.14)] sm:m-7 sm:rounded-lg">
                <div className="border-b border-black/10 px-4 py-5 sm:px-5">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-black text-[#3b4890]">
                    <span>{categoryLabel(currentPost.category || 'GENERAL')}</span>
                    {currentPostConcept && <span className="rounded bg-[#f0c36d] px-1.5 py-0.5 text-[10px] font-black text-[#3a2b00]">개념글</span>}
                  </div>
                  <h2 className="break-words text-xl font-black leading-8 sm:text-2xl">{currentPost.title}</h2>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--theme-body-muted)]">
                    <span className="font-bold text-[var(--theme-body-mid)]">{currentPost.authorDisplayName || currentPost.authorName}</span>
                    {currentPost.authorAdmin && <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white">주딱</span>}
                    {currentPost.concept && <span className="rounded bg-yellow-400 px-1.5 py-0.5 text-[10px] font-black text-black">개념글</span>}
                    <span>{new Date(currentPost.createdAt).toLocaleString('ko-KR')}</span>
                    {isEdited(currentPost) && <span>수정 {new Date(currentPost.updatedAt).toLocaleString('ko-KR')}</span>}
                    <span>조회 {currentPost.viewCount}</span>
                    <span>개추 {postScore(currentPost)}</span>
                  </div>
                </div>
                <div className="min-h-[220px] sm:min-h-[280px]">
                  {renderPostBlocks(currentPost)}
                </div>
                <div className="grid grid-cols-2 gap-2 border-y border-black/10 bg-[#fafafa] px-4 py-4 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-3 sm:py-5">
                  <button type="button" onClick={() => handleVote(1)} className={`inline-flex min-h-12 items-center justify-center gap-2 border px-3 py-3 text-sm font-black sm:px-5 ${currentPost.myVote === 1 ? 'border-[#3b4890] bg-[#3b4890] text-white' : 'border-black/15 bg-white text-[#3b4890]'}`}>
                    <ThumbsUp size={16} />
                    개추 {currentPost.upvotes}
                  </button>
                  <button type="button" onClick={() => handleVote(-1)} className={`inline-flex min-h-12 items-center justify-center gap-2 border px-3 py-3 text-sm font-black sm:px-5 ${currentPost.myVote === -1 ? 'border-red-600 bg-red-600 text-white' : 'border-black/15 bg-white text-red-600'}`}>
                    <ThumbsDown size={16} />
                    비추 {currentPost.downvotes}
                  </button>
                </div>
                <div className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:flex-wrap sm:justify-between">
                  <button type="button" onClick={backToList} className="min-h-11 border border-black/15 bg-white px-4 py-2 text-sm font-bold sm:min-h-0">
                    목록
                  </button>
                  {currentPost.editable && (
                    <div className="grid grid-cols-2 gap-2 sm:flex">
                      <button type="button" onClick={() => setMode('edit')} className="inline-flex min-h-11 items-center justify-center gap-1 border border-black/15 bg-white px-4 py-2 text-sm font-bold sm:min-h-0">
                        <Pencil size={14} />
                        수정
                      </button>
                      <button type="button" onClick={() => handleDelete(currentPost)} className="inline-flex min-h-11 items-center justify-center gap-1 border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-600 sm:min-h-0">
                        <Trash2 size={14} />
                        삭제
                      </button>
                    </div>
                  )}
                </div>

                {/* 댓글 섹션 */}
                <div className="border-t border-black/10">
                  <div className="flex items-center gap-2 bg-[#f5f5f5] px-4 py-3">
                    <MessageSquare size={15} className="text-[#3b4890]" />
                    <span className="text-sm font-black text-[#3b4890]">댓글 {comments.length}</span>
                  </div>
                  {comments.length > 0 && (
                    <div className="divide-y divide-black/8">
                      {commentTree.map((comment) => renderComment(comment))}
                    </div>
                  )}
                  <div className="flex flex-col gap-2 border-t border-black/8 bg-white px-4 py-3">
                    <textarea
                      value={commentInput}
                      onChange={(e) => setCommentInput(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                          e.preventDefault()
                          handleAddComment()
                        }
                      }}
                      placeholder="댓글을 입력하세요"
                      maxLength={MAX_COMMENT_LENGTH}
                      rows={3}
                      className="min-h-24 rounded border border-black/15 bg-[#fafafa] px-3 py-2 text-base outline-none focus:border-[#3b4890] focus:bg-white sm:text-sm"
                      disabled={commentSaving}
                    />
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs font-semibold text-[var(--theme-body-muted)]">Enter는 줄바꿈, Ctrl/⌘+Enter 또는 버튼으로 등록</p>
                      <button
                        type="button"
                        onClick={handleAddComment}
                        disabled={commentSaving || !commentInput.trim()}
                        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded bg-[#3b4890] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#2d3a7a] disabled:opacity-40"
                      >
                        <Send size={13} />
                        등록
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            )}
          </>
        )}
      </section>
    </div>
  )
}
