import { useEffect, useMemo, useRef, useState } from 'react'
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
  updateCommunityPost,
  uploadPostImages,
  uploadPostVideo,
  voteCommunityPost,
} from '../services/communityApi.js'
import { apiUrl } from '../services/apiClient.js'
import { useAuth } from '../contexts/useAuth.js'

const PAGE_SIZE = 30
const CONCEPT_POST_SCORE_THRESHOLD = 5
const MAX_TITLE_LENGTH = 120
const MAX_CONTENT_LENGTH = 5000
const MAX_COMMENT_LENGTH = 1000
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_VIDEO_BYTES = 100 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
const MAX_EXTRA_IMAGES = 5
const MAX_VIDEOS = 3
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

let _localIdCounter = 0
function localId() { return `blk-${++_localIdCounter}` }

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
  const alignMarginStyle = (align) =>
    align === 'left' ? { marginRight: 'auto' }
    : align === 'right' ? { marginLeft: 'auto' }
    : { marginLeft: 'auto', marginRight: 'auto' }
  return (
    <div className="px-4 py-5 sm:px-5">
      {blocks.map((block, i) => {
        if (block.type === 'text') {
          if (!block.content.trim()) return null
          return (
            <div key={i} className="text-size-container whitespace-pre-wrap break-words auto-text-post">
              {linkify(block.content)}
            </div>
          )
        }
        if (block.type === 'image') {
          const src = block.url ? apiUrl(block.url) : null
          if (!src) return null
          return (
            <div key={i} className="group relative my-3" style={{ width: `${mediaWidthPercent(block.width)}%`, ...alignMarginStyle(block.align) }}>
              <img src={src} alt={block.name || '이미지'} className="block w-full max-h-[560px] object-contain" />
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
          const downloadUrl = apiUrl(block.url.replace(/\/videos\/(\d+)$/, '/videos/$1/download'))
          return (
            <div key={i} className="group relative my-3" style={{ width: `${mediaWidthPercent(block.width)}%`, ...alignMarginStyle(block.align) }}>
              <video controls src={src} className="block w-full max-h-[480px] rounded" />
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
        return null
      })}
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

function MediaStatus({ block }) {
  if (block.status === 'uploading') {
    return <p className="mt-1 text-xs font-semibold text-[var(--theme-accent)]">업로드 중...</p>
  }
  if (block.status === 'failed') {
    return <p className="mt-1 text-xs font-semibold text-red-500">{block.error || '업로드 실패'}</p>
  }
  if (block.status === 'pending') {
    return <p className="mt-1 text-xs text-[var(--theme-body-muted)]">등록하면 업로드됩니다</p>
  }
  return <p className="mt-1 text-xs text-emerald-600">저장됨</p>
}

function ResizableMedia({ block, onWidthChange, onAlignChange, onDelete }) {
  const [selected, setSelected] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!selected) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setSelected(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [selected])

  const startDrag = (e, fromRight) => {
    e.preventDefault()
    e.stopPropagation()
    const el = ref.current
    if (!el) return
    const startX = e.clientX
    const startW = el.offsetWidth
    const parentW = el.parentElement?.offsetWidth || el.offsetWidth
    const onMove = (ev) => {
      const delta = fromRight ? ev.clientX - startX : startX - ev.clientX
      const pct = Math.max(25, Math.min(100, Math.round(((startW + delta) / parentW) * 100 / 5) * 5))
      onWidthChange(pct)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const src = block.preview || (block.url ? apiUrl(block.url) : null)
  const wPct = mediaWidthPercent(block.width)
  const marginStyle = block.align === 'left' ? { marginRight: 'auto' }
    : block.align === 'right' ? { marginLeft: 'auto' }
    : { marginLeft: 'auto', marginRight: 'auto' }

  return (
    <div
      ref={ref}
      className="relative my-1"
      style={{ width: `${wPct}%`, ...marginStyle }}
      onClick={(e) => { e.stopPropagation(); setSelected(true) }}
    >
      {block.type === 'image'
        ? <img src={src} alt={block.name} className="block w-full max-h-[460px] object-contain" />
        : <video src={src} controls className="block w-full max-h-[420px]" />
      }
      {selected && (
        <>
          <div className="pointer-events-none absolute inset-0 border-2 border-blue-500" />
          <div className="absolute -top-9 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded border border-black/10 bg-white px-2 py-1 shadow">
            <MediaAlignControls value={block.align || 'center'} onChange={onAlignChange} />
            <span className="mx-0.5 h-3 w-px bg-black/15" />
            <button type="button" onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-red-500 hover:bg-red-50">
              삭제
            </button>
          </div>
          <span className="absolute left-0 top-0 z-20 block h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-nw-resize border-2 border-blue-500 bg-white"
            onMouseDown={(e) => startDrag(e, false)} />
          <span className="absolute right-0 top-0 z-20 block h-3 w-3 translate-x-1/2 -translate-y-1/2 cursor-ne-resize border-2 border-blue-500 bg-white"
            onMouseDown={(e) => startDrag(e, true)} />
          <span className="absolute bottom-0 left-0 z-20 block h-3 w-3 -translate-x-1/2 translate-y-1/2 cursor-sw-resize border-2 border-blue-500 bg-white"
            onMouseDown={(e) => startDrag(e, false)} />
          <span className="absolute bottom-0 right-0 z-20 block h-3 w-3 translate-x-1/2 translate-y-1/2 cursor-se-resize border-2 border-blue-500 bg-white"
            onMouseDown={(e) => startDrag(e, true)} />
        </>
      )}
      <MediaStatus block={block} />
    </div>
  )
}

function selectionOffsetWithin(element) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return element.textContent?.length || 0
  const range = selection.getRangeAt(0)
  if (!element.contains(range.endContainer)) return element.textContent?.length || 0
  const before = range.cloneRange()
  before.selectNodeContents(element)
  before.setEnd(range.endContainer, range.endOffset)
  return before.toString().length
}

function pointOffsetWithin(element, clientX, clientY) {
  let range = null
  if (document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(clientX, clientY)
    if (position) {
      range = document.createRange()
      range.setStart(position.offsetNode, position.offset)
      range.collapse(true)
    }
  } else if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(clientX, clientY)
  }
  if (!range || !element.contains(range.startContainer)) return element.textContent?.length || 0
  const before = range.cloneRange()
  before.selectNodeContents(element)
  before.setEnd(range.startContainer, range.startOffset)
  return before.toString().length
}

function PlainTextEditor({ value, onChange, onPaste, onFilesAtOffset, onCaretChange, placeholder, minRows = 3, maxLength }) {
  const editorRef = useRef(null)
  const minHeight = `${Math.max(minRows, 2) * 1.75 + 1}rem`

  useEffect(() => {
    const editor = editorRef.current
    if (editor && editor.textContent !== value) {
      editor.textContent = value
    }
  }, [value])

  const syncContent = (element) => {
    let next = element.textContent || ''
    if (maxLength && next.length > maxLength) {
      next = next.slice(0, maxLength)
      element.textContent = next
      const range = document.createRange()
      range.selectNodeContents(element)
      range.collapse(false)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
    }
    onChange(next)
    onCaretChange?.(selectionOffsetWithin(element))
  }

  const handlePlainPaste = (e) => {
    onPaste?.(e, selectionOffsetWithin(e.currentTarget))
    if (e.defaultPrevented) return
    const text = e.clipboardData?.getData('text/plain')
    if (!text) return
    e.preventDefault()
    document.execCommand('insertText', false, text)
    syncContent(e.currentTarget)
  }

  return (
    <div className="relative">
      {!value && (
        <span className="pointer-events-none absolute left-2 top-2 text-sm leading-7 text-[var(--theme-body-muted)]/70">
          {placeholder}
        </span>
      )}
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        tabIndex={0}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => syncContent(e.currentTarget)}
        onFocus={(e) => onCaretChange?.(selectionOffsetWithin(e.currentTarget))}
        onKeyUp={(e) => onCaretChange?.(selectionOffsetWithin(e.currentTarget))}
        onMouseUp={(e) => onCaretChange?.(selectionOffsetWithin(e.currentTarget))}
        onPaste={handlePlainPaste}
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer?.items || []).some((item) => item.kind === 'file')) {
            e.preventDefault()
          }
        }}
        onDrop={(e) => {
          const files = Array.from(e.dataTransfer?.files || [])
          if (files.length === 0) return
          e.preventDefault()
          e.stopPropagation()
          onFilesAtOffset?.(files, pointOffsetWithin(e.currentTarget, e.clientX, e.clientY))
        }}
        onBlur={(e) => {
          if ((e.currentTarget.textContent || '') !== value) {
            e.currentTarget.textContent = value
          }
        }}
        className="min-h-[80px] w-full whitespace-pre-wrap break-words rounded border border-transparent bg-white px-2 py-2 text-sm leading-7 text-[var(--theme-body-dark)] outline-none focus:border-[var(--theme-accent)]"
        style={{ minHeight }}
      />
    </div>
  )
}

function PostForm({ initialPost, onCancel, onSave }) {
  const isEditing = Boolean(initialPost)
  const [title, setTitle] = useState(initialPost?.title || '')
  const [category, setCategory] = useState(initialPost?.category || 'GENERAL')
  const [blocks, setBlocks] = useState(() => isEditing ? parsePostBlocks(initialPost) : [{ type: 'text', content: '', id: localId() }])
  const [saving, setSaving] = useState(false)
  const [savingStep, setSavingStep] = useState('')
  const [error, setError] = useState('')
  const [activeTextTarget, setActiveTextTarget] = useState(null)
  const [removeLegacyImage, setRemoveLegacyImage] = useState(false)

  const validateFile = (file, nextImageCount, nextVideoCount) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.type)) {
      if (nextImageCount > MAX_EXTRA_IMAGES) return '이미지는 최대 5개까지 추가할 수 있습니다.'
      if (file.size > MAX_IMAGE_BYTES) return '이미지는 5MB 이하만 업로드할 수 있습니다.'
      return null
    }
    if (ALLOWED_VIDEO_TYPES.includes(file.type)) {
      if (nextVideoCount > MAX_VIDEOS) return '영상은 최대 3개까지 추가할 수 있습니다.'
      if (file.size > MAX_VIDEO_BYTES) return '영상은 100MB 이하만 업로드할 수 있습니다.'
      return null
    }
    return '지원하지 않는 파일 형식입니다. (이미지: JPG/PNG/GIF/WebP, 영상: MP4/WebM/MOV)'
  }

  const mediaBlocksFromFiles = (files, existingBlocks) => {
    const toAdd = []
    let nextImageCount = existingBlocks.filter((b) => b.type === 'image').length
    let nextVideoCount = existingBlocks.filter((b) => b.type === 'video').length
    for (const file of files) {
      const isImage = ALLOWED_IMAGE_TYPES.includes(file.type)
      const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type)
      const err = validateFile(file, nextImageCount + (isImage ? 1 : 0), nextVideoCount + (isVideo ? 1 : 0))
      if (err) { setError(err); return [] }
      const type = isImage ? 'image' : 'video'
      if (type === 'image') nextImageCount += 1
      if (type === 'video') nextVideoCount += 1
      toAdd.push({ type, status: 'pending', file, name: file.name, preview: URL.createObjectURL(file), width: 75, align: 'center', id: localId() })
    }
    return toAdd
  }

  const insertFilesAtBlockIndex = (files, insertIndex) => {
    setBlocks((prev) => {
      const toAdd = mediaBlocksFromFiles(files, prev)
      if (toAdd.length === 0) return prev
      setError('')
      const safeIndex = Math.max(0, Math.min(insertIndex, prev.length))
      return [...prev.slice(0, safeIndex), ...toAdd, ...prev.slice(safeIndex)]
    })
  }

  const removeBlock = (id) => {
    setBlocks((prev) => {
      const block = prev.find((b) => b.id === id)
      if (block?.preview) URL.revokeObjectURL(block.preview)
      if (block?.legacy) setRemoveLegacyImage(true)
      const filtered = prev.filter((b) => b.id !== id)
      return filtered.length === 0 ? [{ type: 'text', content: '', id: localId() }] : filtered
    })
  }


  const updateText = (id, content) => {
    setBlocks((prev) => prev.map((b) => b.id === id ? { ...b, content } : b))
  }

  const updateMediaWidth = (id, width) => {
    setBlocks((prev) => prev.map((b) => b.id === id ? { ...b, width } : b))
  }

  const updateMediaAlign = (id, align) => {
    setBlocks((prev) => prev.map((b) => b.id === id ? { ...b, align } : b))
  }

  const updateMediaStatus = (id, status, extra = {}) => {
    setBlocks((prev) => prev.map((b) => b.id === id ? { ...b, status, ...extra } : b))
  }

  const insertFilesAtTextOffset = (blockId, offset, files) => {
    setError('')
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === blockId)
      if (idx < 0) return prev

      const toAdd = []
      let nextImageCount = prev.filter((b) => b.type === 'image').length
      let nextVideoCount = prev.filter((b) => b.type === 'video').length
      for (const file of files) {
        const isImage = ALLOWED_IMAGE_TYPES.includes(file.type)
        const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type)
        const err = validateFile(file, nextImageCount + (isImage ? 1 : 0), nextVideoCount + (isVideo ? 1 : 0))
        if (err) {
          setError(err)
          return prev
        }
        const type = isImage ? 'image' : 'video'
        if (type === 'image') nextImageCount += 1
        if (type === 'video') nextVideoCount += 1
        toAdd.push({ type, status: 'pending', file, name: file.name, preview: URL.createObjectURL(file), width: 75, align: 'center', id: localId() })
      }
      if (toAdd.length === 0) return prev

      const block = prev[idx]
      const content = block.content || ''
      const safeOffset = Math.max(0, Math.min(offset ?? content.length, content.length))
      const before = content.slice(0, safeOffset)
      const after = content.slice(safeOffset)
      const replacement = [
        ...(before ? [{ ...block, content: before }] : []),
        ...toAdd,
        { type: 'text', content: after, id: localId() },
      ]
      return [...prev.slice(0, idx), ...replacement, ...prev.slice(idx + 1)]
    })
  }

  const handlePaste = (e, blockId, offset) => {
    const items = Array.from(e.clipboardData?.items || [])
    const imageItem = items.find((i) => i.kind === 'file' && i.type.startsWith('image/'))
    if (!imageItem) return
    e.preventDefault()
    const file = imageItem.getAsFile()
    if (file) insertFilesAtTextOffset(blockId, offset, [file])
  }

  const insertFilesAtActiveText = (files) => {
    const target = activeTextTarget && blocks.some((b) => b.id === activeTextTarget.blockId)
      ? activeTextTarget
      : (() => {
          const firstText = blocks.find((b) => b.type === 'text')
          return firstText ? { blockId: firstText.id, offset: firstText.content?.length || 0 } : null
        })()
    if (target) {
      insertFilesAtTextOffset(target.blockId, target.offset, files)
      return
    }
    insertFilesAtBlockIndex(files, blocks.length)
  }

  const insertFilesAtCanvasPoint = (files, canvas, clientY) => {
    const nodes = Array.from(canvas.querySelectorAll('[data-editor-block-id]'))
    const targetIndex = nodes.findIndex((node) => {
      const rect = node.getBoundingClientRect()
      return clientY < rect.top + rect.height / 2
    })
    insertFilesAtBlockIndex(files, targetIndex === -1 ? blocks.length : targetIndex)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!title.trim()) { setError('제목을 입력해주세요.'); return }
    const hasContent = blocks.some((b) => (b.type === 'text' && b.content.trim()) || b.type === 'image' || b.type === 'video')
    if (!hasContent) { setError('내용을 입력하거나 사진/영상을 추가해주세요.'); return }

    setSaving(true)
    setError('')
    try {
      let postId
      if (isEditing) {
        postId = initialPost.id
      } else {
        setSavingStep('글 등록 중...')
        const placeholder = blocks.find((b) => b.type === 'text' && b.content.trim())?.content.trim() || '...'
        const created = await createCommunityPost({ title: title.trim(), content: placeholder, category })
        postId = created.id
      }

      const uploadedBlocks = []
      for (const block of blocks) {
        if (block.type === 'text') {
          uploadedBlocks.push(block)
        } else if (block.status !== 'saved' && block.file) {
          setSavingStep(`업로드 중: ${block.name}`)
          updateMediaStatus(block.id, 'uploading', { error: null })
          if (block.type === 'image') {
            const ids = await uploadPostImages(postId, [block.file])
            if (!Array.isArray(ids) || !ids[0]) throw new Error(`${block.name} 이미지 업로드 응답이 올바르지 않습니다.`)
            updateMediaStatus(block.id, 'saved', { mediaId: ids[0] })
            uploadedBlocks.push({ ...block, status: 'saved', mediaId: ids[0] })
          } else {
            const videoId = await uploadPostVideo(postId, block.file)
            if (!videoId) throw new Error(`${block.name} 영상 업로드 응답이 올바르지 않습니다.`)
            updateMediaStatus(block.id, 'saved', { mediaId: videoId })
            uploadedBlocks.push({ ...block, status: 'saved', mediaId: videoId })
          }
        } else {
          uploadedBlocks.push(block)
        }
      }

      const contentJson = JSON.stringify(
        uploadedBlocks.map((b) => {
          if (b.type === 'text') return { type: 'text', content: b.content }
          if (b.type === 'image' && b.mediaId) return { type: 'image', mediaId: b.mediaId, name: b.name, width: b.width || 'large', align: b.align || 'center' }
          if (b.type === 'video' && b.mediaId) return { type: 'video', mediaId: b.mediaId, name: b.name, width: b.width || 'large', align: b.align || 'center' }
          return null
        }).filter(Boolean)
      )

      setSavingStep('저장 중...')
      const saved = await updateCommunityPost(postId, { title: title.trim(), content: contentJson, category, removeImage: removeLegacyImage })

      uploadedBlocks.forEach((b) => { if (b.preview) URL.revokeObjectURL(b.preview) })
      onSave(saved)
    } catch (err) {
      setError(err.message || '저장 중 오류가 발생했습니다.')
      setBlocks((prev) => prev.map((b) => b.status === 'uploading' ? { ...b, status: 'failed', error: err.message || '업로드에 실패했습니다.' } : b))
    } finally {
      setSaving(false)
      setSavingStep('')
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-white/10 bg-white/80 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.12)] sm:p-5">
      <div className="flex flex-wrap gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded border border-black/15 bg-white px-3 py-2 text-sm font-semibold text-[var(--theme-body-dark)] outline-none focus:border-[var(--theme-accent)]"
        >
          {CATEGORY_OPTIONS.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={MAX_TITLE_LENGTH}
        placeholder="제목"
        readOnly={isEditing}
        className={`w-full rounded border border-black/15 px-4 py-3 text-base text-[var(--theme-body-dark)] outline-none focus:border-[var(--theme-accent)] sm:text-sm ${isEditing ? 'bg-black/5 text-[var(--theme-body-muted)]' : 'bg-white'}`}
      />

      <div className="overflow-hidden rounded border border-black/15 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-black/10 bg-black/[0.03] px-3 py-2">
          <span className="mr-1 text-xs font-black uppercase tracking-[0.2em] text-[var(--theme-body-muted)]">Editor</span>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-black/15 bg-white px-3 py-2 text-sm font-semibold text-[var(--theme-body-mid)] hover:bg-black/5">
            <ImagePlus size={14} />
            이미지
            <input type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp" className="hidden"
              onChange={(e) => { insertFilesAtActiveText(Array.from(e.target.files)); e.target.value = '' }} />
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-black/15 bg-white px-3 py-2 text-sm font-semibold text-[var(--theme-body-mid)] hover:bg-black/5">
            <Video size={14} />
            동영상
            <input type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden"
              onChange={(e) => { insertFilesAtActiveText(Array.from(e.target.files)); e.target.value = '' }} />
          </label>
          <span className="text-xs text-[var(--theme-body-muted)]">본문 칸에 드래그하거나 Ctrl+V로 바로 삽입</span>
        </div>

        <div
          className="min-h-[420px] bg-white px-4 py-5 sm:px-5"
          onDragOver={(e) => {
            if (Array.from(e.dataTransfer?.items || []).some((item) => item.kind === 'file')) {
              e.preventDefault()
            }
          }}
          onDrop={(e) => {
            const files = Array.from(e.dataTransfer?.files || [])
            if (files.length === 0) return
            e.preventDefault()
            insertFilesAtCanvasPoint(files, e.currentTarget, e.clientY)
          }}
        >
          {blocks.map((block, idx) => (
            <div key={block.id} data-editor-block-id={block.id}>
              {block.type === 'text' ? (
                <div className="relative bg-white">
                  <PlainTextEditor
                    value={block.content}
                    onChange={(content) => updateText(block.id, content)}
                    onPaste={(e, offset) => handlePaste(e, block.id, offset)}
                    onFilesAtOffset={(files, offset) => insertFilesAtTextOffset(block.id, offset, files)}
                    onCaretChange={(offset) => setActiveTextTarget({ blockId: block.id, offset })}
                    placeholder={idx === 0 ? '내용을 입력하세요. 이미지나 동영상을 이 영역 안에 바로 넣을 수 있습니다.' : '내용을 이어서 입력하세요.'}
                    minRows={idx === 0 ? 10 : 3}
                    maxLength={MAX_CONTENT_LENGTH}
                  />
                </div>
              ) : (
                <ResizableMedia
                  block={block}
                  onWidthChange={(w) => updateMediaWidth(block.id, w)}
                  onAlignChange={(a) => updateMediaAlign(block.id, a)}
                  onDelete={() => removeBlock(block.id)}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-sm font-semibold text-red-500">{error}</p>}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="min-h-11 rounded bg-[var(--theme-text)] px-5 py-2.5 text-sm font-semibold text-[var(--theme-bg)] disabled:opacity-50 sm:min-h-0"
        >
          {saving ? (savingStep || '저장 중...') : isEditing ? '수정 완료' : '글 등록'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-11 items-center justify-center gap-1 rounded border border-black/15 bg-white px-4 py-2.5 text-sm font-semibold text-[var(--theme-body-mid)] sm:min-h-0"
        >
          <X size={14} />
          취소
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

  useEffect(() => {
    if (!urlId) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setMode('list')
      setCurrentPost(null)
      setComments([])
      setCommentInput('')
      setReplyTo(null)
      setReplyInput('')
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
      const comment = await createComment(currentPost.id, replyInput.trim(), parentId)
      setComments((prev) => [...prev, comment])
      setReplyInput('')
      setReplyTo(null)
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
      setComments((prev) => prev.filter((c) => c.id !== commentId))
    } catch (err) {
      alert(err.message || '댓글 삭제 실패')
    }
  }

  const backToList = () => {
    setMode('list')
    setCurrentPost(null)
    setComments([])
    setCommentInput('')
    setReplyTo(null)
    setReplyInput('')
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
  const threadedComments = useMemo(() => {
    const roots = comments.filter((comment) => !comment.parentCommentId)
    const replies = comments.reduce((acc, comment) => {
      if (comment.parentCommentId) {
        const list = acc.get(comment.parentCommentId) || []
        list.push(comment)
        acc.set(comment.parentCommentId, list)
      }
      return acc
    }, new Map())
    return roots.flatMap((root) => [root, ...(replies.get(root.id) || [])])
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
            <h3 className="mt-2 break-words text-base font-black leading-6 text-white">{post.title}</h3>
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
                      {threadedComments.map((c) => (
                        <div
                          key={c.id}
                          id={`comment-${c.id}`}
                          className={`scroll-mt-28 flex items-start gap-3 px-4 py-3 ${c.depth > 0 ? 'ml-3 border-l-2 border-[#3b4890]/20 bg-black/[0.02] sm:ml-10' : ''}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-xs font-bold text-[var(--theme-body-dark)]">{c.authorName}</span>
                              <span className="text-[11px] text-[var(--theme-body-muted)]">{new Date(c.createdAt).toLocaleString('ko-KR')}</span>
                            </div>
                            <p className="text-size-container auto-text-comment text-[var(--theme-body-dark)] whitespace-pre-wrap break-words">{linkify(c.content)}</p>
                            {c.depth === 0 && (
                              <div className="mt-2">
                                <button
                                  type="button"
                                  onClick={() => { setReplyTo(replyTo === c.id ? null : c.id); setReplyInput('') }}
                                  className="text-xs font-bold text-[#3b4890] hover:underline"
                                >
                                  답글 달기
                                </button>
                                {replyTo === c.id && (
                                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <input
                                      type="text"
                                      value={replyInput}
                                      onChange={(e) => setReplyInput(e.target.value)}
                                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddReply(c.id) } }}
                                      placeholder="답글을 입력하세요"
                                      maxLength={MAX_COMMENT_LENGTH}
                                      className="min-h-11 flex-1 rounded border border-black/15 bg-[#fafafa] px-3 py-2 text-base outline-none focus:border-[#3b4890] focus:bg-white sm:min-h-0 sm:text-sm"
                                      disabled={commentSaving}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleAddReply(c.id)}
                                      disabled={commentSaving || !replyInput.trim()}
                                      className="min-h-11 rounded bg-[#3b4890] px-3 py-2 text-xs font-bold text-white disabled:opacity-40 sm:min-h-0"
                                    >
                                      등록
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          {c.deletable && (
                            <button
                              type="button"
                              onClick={() => handleDeleteComment(c.id)}
                              className="shrink-0 text-[var(--theme-body-muted)] hover:text-red-500 transition"
                              aria-label="댓글 삭제"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-col gap-2 border-t border-black/8 bg-white px-4 py-3 sm:flex-row sm:items-center">
                    <input
                      type="text"
                      value={commentInput}
                      onChange={(e) => setCommentInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment() } }}
                      placeholder="댓글을 입력하세요"
                      maxLength={MAX_COMMENT_LENGTH}
                      className="min-h-11 flex-1 rounded border border-black/15 bg-[#fafafa] px-3 py-2 text-base outline-none focus:border-[#3b4890] focus:bg-white sm:min-h-0 sm:text-sm"
                      disabled={commentSaving}
                    />
                    <button
                      type="button"
                      onClick={handleAddComment}
                      disabled={commentSaving || !commentInput.trim()}
                      className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded bg-[#3b4890] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#2d3a7a] disabled:opacity-40 sm:min-h-0"
                    >
                      <Send size={13} />
                      등록
                    </button>
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
