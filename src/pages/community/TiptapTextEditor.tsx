import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, Extension, useEditor, type Editor } from '@tiptap/react'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import { Color } from '@tiptap/extension-color'
import { BackgroundColor, FontFamily, TextStyle } from '@tiptap/extension-text-style'
import { isSafeUrl } from '../../utils/sanitizeHtml'
import {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  MAX_EXTRA_IMAGES,
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MAX_VIDEOS,
  isAllowedArchiveFile,
  localId,
} from './postEditorUtils'
import { blockJsonToPmDoc, pmDocToBlockJson } from './tiptapBlockConverters'
import FigureToolbar from './FigureToolbar'
import { EmbedBlock, FileBlock, ImageBlock, PollBlock, VideoBlock } from './tiptapFigureNodes'

type EditorBlock = { type?: string; content?: unknown; [key: string]: unknown }

type EditorApiRef = {
  current: unknown
}

type SelectedFigure = {
  id: string
  meta: { align?: string }
} | null

const FIGURE_NODE_TYPES = new Set(['fileBlock', 'imageBlock', 'videoBlock', 'embedBlock', 'pollBlock'])

const EnterAsHardBreak = Extension.create({
  name: 'comsEnterAsHardBreak',
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        if (this.editor.isActive('codeBlock')) return false
        return this.editor.commands.setHardBreak()
      },
    }
  },
})

function normalizeLinkHref(value: unknown) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const href = /^https?:\/\//i.test(raw) || raw.startsWith('mailto:') ? raw : `https://${raw}`
  return isSafeUrl(href) ? href : ''
}

function selectedFigureFromEditor(editor: Editor | null): SelectedFigure {
  const selection = editor?.state.selection
  const node = (selection as unknown as { node?: { type?: { name?: string }; attrs?: Record<string, unknown> } })?.node
  if (!node?.type?.name || !FIGURE_NODE_TYPES.has(node.type.name)) return null
  const attrs = node.attrs || {}
  const id = figureIdFromAttrs(attrs)
  if (!id) return null
  return {
    id,
    meta: { align: typeof attrs.align === 'string' ? attrs.align : 'center' },
  }
}

function figureIdFromAttrs(attrs: Record<string, unknown>) {
  return String(attrs.blockId || attrs.mediaId || attrs.fileId || attrs.pollId || attrs.url || '')
}

function findFigureNodePosition(doc: ProseMirrorNode, id: string) {
  let found: number | null = null
  doc.descendants((node, pos) => {
    if (FIGURE_NODE_TYPES.has(node.type.name) && figureIdFromAttrs(node.attrs) === id) {
      found = pos
      return false
    }
    return true
  })
  return found
}

export default function TiptapTextEditor({ initialBlocks, apiRef, onError }: {
  initialBlocks: EditorBlock[]
  apiRef?: EditorApiRef | null
  onError?: (message: string) => void
}) {
  const editorContentRef = useRef<HTMLDivElement | null>(null)
  const insertFileRef = useRef<(file: File) => void>(() => undefined)
  const savedSelectionRef = useRef<{ from: number; to: number } | null>(null)
  const [selectedFigure, setSelectedFigure] = useState<SelectedFigure>(null)
  // ponytail: placeholder via isEmpty overlay — no @tiptap/extension-placeholder dep.
  // Seed from initial blocks; onTransaction keeps it live thereafter.
  const [isEmpty, setIsEmpty] = useState(() => {
    const content = blockJsonToPmDoc(initialBlocks).content
    return !content.length || (content.length === 1 && content[0].type === 'paragraph' && !content[0].content?.length)
  })
  const initialContent = useMemo(() => blockJsonToPmDoc(initialBlocks), [initialBlocks])
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        horizontalRule: false,
      }),
      TextStyle,
      Color.configure({ types: ['textStyle'] }),
      BackgroundColor.configure({ types: ['textStyle'] }),
      FontFamily.configure({ types: ['textStyle'] }),
      Underline,
      FileBlock,
      ImageBlock,
      VideoBlock,
      EmbedBlock,
      PollBlock,
      Link.configure({
        autolink: false,
        linkOnPaste: false,
        openOnClick: false,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
        isAllowedUri: (url) => isSafeUrl(url),
      }),
      EnterAsHardBreak,
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: 'min-h-[420px] w-full overflow-x-auto whitespace-pre-wrap bg-[var(--app-surface)] px-4 py-5 text-sm leading-7 text-[var(--theme-body-dark)] outline-none sm:px-5',
        'aria-label': '본문',
        'data-placeholder': '내용을 입력하세요.',
      },
      handlePaste(view, event) {
        const items = Array.from(event.clipboardData?.items || [])
        const fileItem = items.find((item) => item.kind === 'file')
        if (fileItem) {
          const file = fileItem.getAsFile()
          if (file) insertFileRef.current(file)
          return true
        }
        const text = event.clipboardData?.getData('text/plain') || ''
        if (!text) return false
        view.dispatch(view.state.tr.insertText(text))
        return true
      },
      handleDrop(_view, event) {
        const files = Array.from(event.dataTransfer?.files || [])
        if (!files.length) return false
        event.preventDefault()
        files.forEach((file) => insertFileRef.current(file))
        return true
      },
    },
    onSelectionUpdate: ({ editor }) => {
      savedSelectionRef.current = { from: editor.state.selection.from, to: editor.state.selection.to }
      setSelectedFigure(selectedFigureFromEditor(editor))
    },
    onTransaction: ({ editor }) => {
      setSelectedFigure(selectedFigureFromEditor(editor))
      setIsEmpty(editor.isEmpty)
    },
    immediatelyRender: false,
  }, [initialContent, onError])

  const currentBlocks = useCallback(() => (editor ? pmDocToBlockJson(editor.getJSON()) : []), [editor])

  const insertPmBlock = useCallback((block: EditorBlock) => {
    if (!editor) return
    const node = blockJsonToPmDoc([block]).content[0]
    if (node) editor.chain().focus().insertContent(node).run()
  }, [editor])

  const insertFile = useCallback((file: File) => {
    if (!editor) return
    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type)
    const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type)
    const isFileType = isAllowedArchiveFile(file)
    if (!isImage && !isVideo && !isFileType) { onError?.('지원하지 않는 파일 형식입니다.'); return }
    const blocks = currentBlocks()
    if (isImage && blocks.filter((block) => block.type === 'image').length >= MAX_EXTRA_IMAGES) { onError?.('이미지는 최대 5개까지 추가할 수 있습니다.'); return }
    if (isVideo && blocks.filter((block) => block.type === 'video').length >= MAX_VIDEOS) { onError?.('영상은 최대 3개까지 추가할 수 있습니다.'); return }
    if (isFileType && blocks.filter((block) => block.type === 'file').length >= MAX_FILES) { onError?.('첨부파일은 최대 5개까지 추가할 수 있습니다.'); return }
    if (isImage && file.size > MAX_IMAGE_BYTES) { onError?.('이미지는 5MB 이하만 업로드할 수 있습니다.'); return }
    if (isVideo && file.size > MAX_VIDEO_BYTES) { onError?.('영상은 100MB 이하만 업로드할 수 있습니다.'); return }
    if (isFileType && file.size > MAX_FILE_BYTES) { onError?.('첨부파일은 50MB 이하만 업로드할 수 있습니다.'); return }
    onError?.('')

    const type = isImage ? 'image' : isVideo ? 'video' : 'file'
    const id = localId()
    const preview = type !== 'file' ? URL.createObjectURL(file) : undefined
    insertPmBlock({
      type,
      id,
      status: 'pending',
      file,
      preview,
      name: file.name,
      width: 75,
      align: 'center',
    })
  }, [currentBlocks, editor, insertPmBlock, onError])

  useEffect(() => {
    insertFileRef.current = insertFile
  }, [insertFile])

  const insertExternalEmbed = useCallback((block: EditorBlock) => insertPmBlock(block), [insertPmBlock])
  const insertPoll = useCallback((block: EditorBlock) => insertPmBlock(block), [insertPmBlock])

  const updateFigureNodeAttrs = useCallback((id: string, changes: Record<string, unknown>) => {
    if (!editor) return
    editor.chain().command(({ state, tr, dispatch }) => {
      const pos = findFigureNodePosition(state.doc, id)
      if (pos === null) return false
      const node = state.doc.nodeAt(pos)
      if (!node) return false
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...changes })
      dispatch?.(tr)
      return true
    }).run()
  }, [editor])

  useEffect(() => {
    if (!apiRef) return
    apiRef.current = {
      insertFiles: (files: File[]) => files.forEach(insertFile),
      insertExternalEmbed,
      insertPoll,
      insertCodeBlock: () => editor?.chain().focus().setCodeBlock().run(),
      formatBlock: (command: string, value: unknown = null) => {
        if (!editor) return
        let chain = editor.chain().focus()
        if (savedSelectionRef.current) chain = chain.setTextSelection(savedSelectionRef.current)
        if (command === 'bold') chain.toggleBold().run()
        else if (command === 'italic') chain.toggleItalic().run()
        else if (command === 'underline') chain.toggleUnderline().run()
        else if (command === 'foreColor') chain.setColor(String(value || '')).run()
        else if (command === 'hiliteColor') chain.setBackgroundColor(String(value || '')).run()
        else if (command === 'fontName') chain.setFontFamily(String(value || '')).run()
        else if (command === 'createLink') {
          const href = normalizeLinkHref(value)
          if (!href) {
            chain.unsetLink().run()
            return
          }
          chain.extendMarkRange('link').setLink({ href }).run()
        }
      },
      saveSelection: () => {
        if (!editor) return
        savedSelectionRef.current = { from: editor.state.selection.from, to: editor.state.selection.to }
      },
      getBlocks: currentBlocks,
      updateFigureMeta: (id: string, changes: Record<string, unknown>) => updateFigureNodeAttrs(id, changes),
    }
  }, [apiRef, currentBlocks, editor, insertExternalEmbed, insertFile, insertPoll, onError, updateFigureNodeAttrs])

  const updateSelectedFigureAttrs = (changes: Record<string, unknown>) => {
    if (!editor || !selectedFigure) return
    editor.chain().focus().command(({ state, tr, dispatch }) => {
      const selection = state.selection
      const node = (selection as unknown as { node?: { type?: { name?: string }; attrs?: Record<string, unknown> } })?.node
      if (!node?.type?.name || !FIGURE_NODE_TYPES.has(node.type.name)) return false
      tr.setNodeMarkup(selection.from, undefined, { ...node.attrs, ...changes })
      dispatch?.(tr)
      return true
    }).run()
    setSelectedFigure((current) => (current ? { ...current, meta: { ...current.meta, ...changes } } : current))
  }

  const handleFigureDelete = () => {
    editor?.chain().focus().deleteSelection().run()
    setSelectedFigure(null)
  }

  return (
    <div className="relative">
      <EditorContent editor={editor} innerRef={editorContentRef} />
      {isEmpty && (
        <div className="pointer-events-none absolute left-4 top-5 text-sm text-[var(--theme-body-muted)] sm:left-5">
          내용을 입력하세요.
        </div>
      )}
      {selectedFigure && (
        <FigureToolbar
          editorRef={editorContentRef}
          figId={selectedFigure.id}
          meta={selectedFigure.meta}
          onResize={(width) => updateSelectedFigureAttrs({ width })}
          onAlign={(align) => updateSelectedFigureAttrs({ align })}
          onDelete={handleFigureDelete}
          onDeselect={() => setSelectedFigure(null)}
        />
      )}
    </div>
  )
}
