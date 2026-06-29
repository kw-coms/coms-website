import { useEffect, useRef, useState } from 'react'
import { apiUrl } from '../../services/apiClient'
import {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  MAX_EXTRA_IMAGES,
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MAX_VIDEOS,
  domToBlocks,
  figureInlineStyle,
  isAllowedArchiveFile,
  localId,
  mediaWidthPercent,
  pollOptionLabel,
  safeExternalSrc,
  safeYoutubeEmbedSrc,
  textToEditorHtml,
} from './postEditorUtils'
import RichEditorSurface from './RichEditorSurface'

// Apple-style card chrome shared by the editor's external-embed previews so they
// match the rendered PostBlocks cards (rounded-xl + hairline + subtle shadow).
const EXTERNAL_CARD_STYLE = 'overflow:hidden;border:1px solid var(--app-hairline);border-radius:12px;background:var(--app-surface);box-shadow:0 1px 2px rgba(0,0,0,0.04);'
const EXTERNAL_CAPTION_STYLE = 'padding:8px 12px;font-size:12px;font-weight:600;color:var(--app-muted);pointer-events:none'

type EditorBlock = { type?: string; options?: unknown[]; [key: string]: unknown }

export default function RichEditor({ initialBlocks, apiRef, onError }: {
  initialBlocks: EditorBlock[]
  apiRef?: { current: unknown } | null
  onError?: (message: string) => void
}) {
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

  // Non-interactive editor preview of a link-preview card (mirrors the rendered
  // PostBlocks link card; pointer-events disabled so it behaves like other figures).
  const linkPreviewHtml = (block) => {
    const image = safeExternalSrc(block.image)
    let domain = block.siteName || ''
    if (!domain) {
      try { domain = new URL(block.url).hostname } catch { domain = '' }
    }
    const imageHtml = image
      ? `<div style="aspect-ratio:1.91/1;width:100%;overflow:hidden;background:var(--app-surface-soft);pointer-events:none"><img src="${escH(image)}" alt="" draggable="false" style="width:100%;height:100%;object-fit:cover;pointer-events:none"></div>`
      : ''
    const titleHtml = block.title ? `<p style="margin:0;font-size:14px;font-weight:700;color:var(--theme-body-dark)">${escH(block.title)}</p>` : ''
    const descHtml = block.description ? `<p style="margin:4px 0 0;font-size:12px;color:var(--app-muted)">${escH(block.description)}</p>` : ''
    const domainHtml = domain ? `<p style="margin:8px 0 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--app-subtle)">${escH(domain)}</p>` : ''
    return `${imageHtml}<div style="padding:12px 16px;pointer-events:none">${titleHtml}${descHtml}${domainHtml}</div>`
  }

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
        const align = block.align || 'center'
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
      } else if (block.type === 'externalEmbed') {
        const id = block.id || localId()
        const wPct = mediaWidthPercent(block.width)
        const align = block.align || 'center'
        figMeta.current.set(id, { ...block, width: wPct, align })
        const title = escH(block.title || (block.kind === 'youtube' ? 'YouTube 영상' : '외부 콘텐츠'))
        const youtubeSrc = safeYoutubeEmbedSrc(block.embedUrl)
        const src = block.kind === 'youtube' ? youtubeSrc : safeExternalSrc(block.url)
        const inner = block.kind === 'youtube'
          ? (youtubeSrc
            ? `<div style="aspect-ratio:16/9;width:100%;background:#000;pointer-events:none"><iframe src="${escH(youtubeSrc)}" title="${title}" style="width:100%;height:100%;border:0;pointer-events:none"></iframe></div><figcaption style="${EXTERNAL_CAPTION_STYLE}">${title}</figcaption>`
            : `<figcaption style="${EXTERNAL_CAPTION_STYLE}">${title}</figcaption>`)
          : block.kind === 'link'
            ? linkPreviewHtml(block)
            : block.kind === 'image'
              ? `<img src="${escH(src)}" alt="${title}" draggable="false" class="community-inline-media-image" style="display:block;pointer-events:none">`
              : `<video src="${escH(src)}" controls preload="metadata" draggable="false" style="display:block;width:100%;height:auto;pointer-events:none"></video>`
        html += `<figure class="community-editor-figure" contenteditable="false" data-block-id="${id}" data-type="externalEmbed" data-align="${align}" style="${figureInlineStyle(wPct, align) + EXTERNAL_CARD_STYLE}">${inner}</figure>\u200B`
      } else if (block.type === 'poll') {
        const id = block.id || localId()
        figMeta.current.set(id, { type: 'poll', pollId: block.pollId, question: block.question, options: block.options || [] })
        html += `<figure class="community-editor-figure" contenteditable="false" draggable="true" data-block-id="${id}" data-type="poll" style="display:block;max-width:100%;margin:0.5rem 0;user-select:none;-webkit-user-select:none;-webkit-user-drag:element;cursor:grab"><div style="border:1px solid rgba(59,72,144,0.18);border-radius:8px;background:#f7f9ff;padding:12px;pointer-events:none"><strong>${escH(block.question || '투표')}</strong><div style="margin-top:8px;font-size:12px;color:#5b6478">${escH((block.options || []).map(pollOptionLabel).join(' · '))}</div></div></figure>\u200B`
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

  useEffect(() => {
    const onSelChange = () => {
      const sel = document.getSelection()
      if (!sel || sel.rangeCount === 0) return
      const range = sel.getRangeAt(0)
      if (divRef.current?.contains(range.commonAncestorContainer)) {
        savedRange.current = range.cloneRange()
      }
    }
    document.addEventListener('selectionchange', onSelChange)
    return () => document.removeEventListener('selectionchange', onSelChange)
  }, [])

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

  // Wrap the current selection (or insert an empty block) in <pre><code>. The
  // code element carries no language class by default; the sanitizer only ever
  // keeps a `language-*` class, so we never emit an unconstrained class here.
  const insertCodeBlock = () => {
    const pre = document.createElement('pre')
    const code = document.createElement('code')
    const sel = window.getSelection()
    const selectedText = (savedRange.current && !savedRange.current.collapsed)
      ? savedRange.current.toString()
      : (sel && sel.rangeCount > 0 && !sel.isCollapsed ? sel.toString() : '')
    code.textContent = selectedText || '​'
    pre.appendChild(code)
    insertAtCursor(pre)
    // Place the caret inside the code element so the user can keep typing code.
    const after = document.createRange()
    after.selectNodeContents(code)
    after.collapse(false)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(after)
    savedRange.current = after.cloneRange()
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
    figMeta.current.set(id, { type, status: 'pending', file, preview, name: file.name, width: 75, align: 'center' })
    const figure = document.createElement('figure')
    figure.className = 'community-editor-figure'
    figure.contentEditable = 'false'
    figure.draggable = true
    figure.dataset.blockId = id
    figure.dataset.type = type
    figure.dataset.align = 'center'
    if (type === 'image') {
      figure.setAttribute('style', figureInlineStyle(75, 'center'))
      const img = document.createElement('img')
      img.src = preview
      img.className = 'community-inline-media-image'
      img.setAttribute('style', 'pointer-events:none')
      img.draggable = false
      figure.appendChild(img)
    } else if (type === 'video') {
      figure.setAttribute('style', figureInlineStyle(75, 'center'))
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

  const insertExternalEmbed = (block) => {
    const id = block.id || localId()
    const wPct = mediaWidthPercent(block.width || 75)
    const align = block.align || 'center'
    figMeta.current.set(id, { ...block, id, width: wPct, align })
    const figure = document.createElement('figure')
    figure.className = 'community-editor-figure'
    figure.contentEditable = 'false'
    figure.draggable = true
    figure.dataset.blockId = id
    figure.dataset.type = 'externalEmbed'
    figure.dataset.align = align
    figure.setAttribute('style', figureInlineStyle(wPct, align) + EXTERNAL_CARD_STYLE)
    const src = safeExternalSrc(block.url)
    if (block.kind === 'youtube') {
      const youtubeSrc = safeYoutubeEmbedSrc(block.embedUrl)
      if (youtubeSrc) {
        const box = document.createElement('div')
        box.setAttribute('style', 'aspect-ratio:16/9;width:100%;background:#000;pointer-events:none')
        const iframe = document.createElement('iframe')
        iframe.src = youtubeSrc
        iframe.title = block.title || 'YouTube 영상'
        iframe.setAttribute('style', 'width:100%;height:100%;border:0;pointer-events:none')
        box.appendChild(iframe)
        figure.appendChild(box)
      }
      const caption = document.createElement('figcaption')
      caption.setAttribute('style', EXTERNAL_CAPTION_STYLE)
      caption.textContent = block.title || 'YouTube 영상'
      figure.appendChild(caption)
    } else if (block.kind === 'link') {
      figure.innerHTML = linkPreviewHtml(block)
    } else if (block.kind === 'image') {
      const img = document.createElement('img')
      img.src = src
      img.alt = block.title || '외부 이미지'
      img.className = 'community-inline-media-image'
      img.draggable = false
      img.setAttribute('style', 'display:block;pointer-events:none')
      figure.appendChild(img)
    } else {
      const video = document.createElement('video')
      video.src = src
      video.controls = true
      video.preload = 'metadata'
      video.setAttribute('style', 'display:block;width:100%;height:auto;pointer-events:none')
      figure.appendChild(video)
    }
    attachFigureClick(figure)
    insertAtCursor(figure)
  }

  const insertPoll = (block) => {
    const id = block.id || localId()
    figMeta.current.set(id, { ...block, id })
    const figure = document.createElement('figure')
    figure.className = 'community-editor-figure'
    figure.contentEditable = 'false'
    figure.draggable = true
    figure.dataset.blockId = id
    figure.dataset.type = 'poll'
    figure.setAttribute('style', 'display:block;max-width:100%;margin:0.5rem 0;user-select:none;-webkit-user-select:none;-webkit-user-drag:element;cursor:grab')
    const box = document.createElement('div')
    box.setAttribute('style', 'border:1px solid rgba(59,72,144,0.18);border-radius:8px;background:#f7f9ff;padding:12px;pointer-events:none')
    const strong = document.createElement('strong')
    strong.textContent = block.question
    const options = document.createElement('div')
    options.setAttribute('style', 'margin-top:8px;font-size:12px;color:#5b6478')
    options.textContent = (block.options || []).map(pollOptionLabel).join(' · ')
    box.appendChild(strong)
    box.appendChild(options)
    figure.appendChild(box)
    attachFigureClick(figure)
    insertAtCursor(figure)
  }

  useEffect(() => {
    if (!apiRef) return
    apiRef.current = {
      insertFiles: (files) => { saveSelection(); files.forEach(insertFile) },
      insertExternalEmbed: (block) => { saveSelection(); insertExternalEmbed(block) },
      insertPoll: (block) => { saveSelection(); insertPoll(block) },
      insertCodeBlock: () => { saveSelection(); insertCodeBlock() },
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
    <RichEditorSurface
      divRef={divRef}
      dropIndicator={dropIndicator}
      selectedFigId={selectedFigId}
      draggingFigId={draggingFigId}
      selectedMeta={selectedMeta}
      savedRangeRef={savedRange}
      saveSelection={saveSelection}
      updateDropIndicator={updateDropIndicator}
      insertAtRange={insertAtRange}
      attachFigureClick={attachFigureClick}
      dragFigureIdRef={dragFigureId}
      setDraggingFigId={setDraggingFigId}
      setDropIndicator={setDropIndicator}
      setSelectedFigId={setSelectedFigId}
      insertFile={insertFile}
      handleFigureResize={handleFigureResize}
      handleFigureAlign={handleFigureAlign}
      handleFigureDelete={handleFigureDelete}
    />
  )
}
