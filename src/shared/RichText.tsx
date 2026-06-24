// Rich-text content renderer + contentEditable composer used across the home
// feature sections. Split from homeUi.ts so this file only exports components
// (keeps Fast Refresh / react-refresh happy). Behavior unchanged.
import { useCallback, useEffect, useRef } from 'react'
import { Bold, Highlighter, ImagePlus, Italic, Link, Palette, Paperclip, Type, Underline, X } from 'lucide-react'
import {
  RICH_TEXT_FONT_OPTIONS,
  isSafeRichTextUrl,
  normalizeRichTextForSubmit,
  sanitizeRichTextHtml,
} from './homeUi'

export function RichTextContent({ value, className = '', as: Component = 'div' }: any) {
  const html = sanitizeRichTextHtml(value)
  if (!html) return null
  return <Component className={className} dangerouslySetInnerHTML={{ __html: html }} />
}

function RichTextComposerButton({ label, icon, onCommand }: any) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="rich-composer-button"
      onMouseDown={(event) => {
        event.preventDefault()
        onCommand()
      }}
    >
      {icon}
    </button>
  )
}

export function RichTextComposer({
  value,
  onChange,
  editorLabel = '본문',
  placeholder = '본문을 입력하세요.',
  minHeight = '26rem',
  imageFiles = [],
  onImageFilesChange,
  fileFiles = [],
  onFileFilesChange,
}: any) {
  const editorRef = useRef(null)
  const lastHtmlRef = useRef('')
  const savedRangeRef = useRef(null)

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const safeValue = sanitizeRichTextHtml(value)
    if (safeValue !== lastHtmlRef.current && editor.innerHTML !== safeValue) {
      editor.innerHTML = safeValue
      lastHtmlRef.current = safeValue
    }
  }, [value])

  const rememberSelection = useCallback(() => {
    const selection = window.getSelection?.()
    if (!selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    if (editorRef.current?.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange()
    }
  }, [])

  const restoreSelection = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    const selection = window.getSelection?.()
    if (!selection) return
    selection.removeAllRanges()
    if (savedRangeRef.current) {
      selection.addRange(savedRangeRef.current)
    } else {
      const range = document.createRange()
      range.selectNodeContents(editor)
      range.collapse(false)
      selection.addRange(range)
    }
  }, [])

  const emitCurrentHtml = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const html = normalizeRichTextForSubmit(editor.innerHTML)
    lastHtmlRef.current = html
    onChange(html)
  }, [onChange])

  const runCommand = useCallback((command, commandValue = null) => {
    rememberSelection()
    restoreSelection()
    const applied = document.execCommand(command, false, commandValue)
    if (!applied && command === 'hiliteColor') {
      document.execCommand('backColor', false, commandValue)
    }
    rememberSelection()
    emitCurrentHtml()
  }, [emitCurrentHtml, rememberSelection, restoreSelection])

  const updateFiles = (setter, currentFiles, event) => {
    const nextFiles = Array.from(event.target.files || [])
    if (nextFiles.length > 0) setter([...(currentFiles || []), ...nextFiles])
    event.target.value = ''
  }

  const removeFileAt = (setter, currentFiles, index) => {
    setter((currentFiles || []).filter((_, fileIndex) => fileIndex !== index))
  }

  const createLink = () => {
    restoreSelection()
    const rawUrl = window.prompt('삽입할 링크 URL을 입력하세요.')
    if (!rawUrl) return
    const normalized = /^https?:\/\//i.test(rawUrl) || rawUrl.startsWith('mailto:') ? rawUrl : `https://${rawUrl}`
    if (!isSafeRichTextUrl(normalized)) return
    document.execCommand('createLink', false, normalized)
    rememberSelection()
    emitCurrentHtml()
  }

  return (
    <div className="community-compose-editor rich-composer">
      <div className="community-editor-toolbar rich-composer-toolbar" aria-label="편집 도구">
        <span className="rich-composer-toolbar-label">Editor</span>
        <div className="rich-composer-format-group" aria-label="서식">
          <RichTextComposerButton label="굵게" icon={<Bold size={14} aria-hidden="true" />} onCommand={() => runCommand('bold')} />
          <RichTextComposerButton label="기울임" icon={<Italic size={14} aria-hidden="true" />} onCommand={() => runCommand('italic')} />
          <RichTextComposerButton label="밑줄" icon={<Underline size={14} aria-hidden="true" />} onCommand={() => runCommand('underline')} />
          <RichTextComposerButton label="링크" icon={<Link size={14} aria-hidden="true" />} onCommand={createLink} />
        </div>
        <label className="rich-composer-select-label" title="글꼴">
          <Type size={14} aria-hidden="true" />
          <select
            aria-label="글꼴"
            defaultValue=""
            onMouseDown={rememberSelection}
            onChange={(event) => {
              if (event.target.value) runCommand('fontName', event.target.value)
              event.target.value = ''
            }}
          >
            <option value="">글꼴</option>
            {RICH_TEXT_FONT_OPTIONS.map((font) => (
              <option key={font.value} value={font.value}>{font.label}</option>
            ))}
          </select>
        </label>
        <label className="rich-composer-color-label" title="글자색">
          <Palette size={14} aria-hidden="true" />
          <input aria-label="글자색" type="color" defaultValue="#1d1d1f" onMouseDown={rememberSelection} onChange={(event) => runCommand('foreColor', event.target.value)} />
        </label>
        <label className="rich-composer-color-label" title="형광펜">
          <Highlighter size={14} aria-hidden="true" />
          <input aria-label="형광펜" type="color" defaultValue="#fff4a3" onMouseDown={rememberSelection} onChange={(event) => runCommand('hiliteColor', event.target.value)} />
        </label>
        {onImageFilesChange && (
          <label className="rich-composer-upload-button">
            <ImagePlus size={14} aria-hidden="true" />
            이미지
            <input
              aria-label="이미지"
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => updateFiles(onImageFilesChange, imageFiles, event)}
            />
          </label>
        )}
        {onFileFilesChange && (
          <label className="rich-composer-upload-button">
            <Paperclip size={14} aria-hidden="true" />
            첨부파일
            <input
              aria-label="첨부파일"
              type="file"
              multiple
              onChange={(event) => updateFiles(onFileFilesChange, fileFiles, event)}
            />
          </label>
        )}
        <span className="rich-composer-counts">
          {onImageFilesChange && `이미지 ${imageFiles.length}개`}
          {onImageFilesChange && onFileFilesChange ? ' · ' : ''}
          {onFileFilesChange && `첨부 ${fileFiles.length}개`}
        </span>
      </div>
      {(imageFiles.length > 0 || fileFiles.length > 0) && (
        <div className="activity-compose-attachment-list" aria-label="선택된 첨부">
          {imageFiles.map((file, index) => (
            <span key={`image-${file.name}-${file.size}-${index}`}>
              <ImagePlus size={13} aria-hidden="true" />
              {file.name}
              <button type="button" onClick={() => removeFileAt(onImageFilesChange, imageFiles, index)} aria-label={`${file.name} 이미지 제거`}>
                <X size={12} aria-hidden="true" />
              </button>
            </span>
          ))}
          {fileFiles.map((file, index) => (
            <span key={`file-${file.name}-${file.size}-${index}`}>
              <Paperclip size={13} aria-hidden="true" />
              {file.name}
              <button type="button" onClick={() => removeFileAt(onFileFilesChange, fileFiles, index)} aria-label={`${file.name} 첨부 제거`}>
                <X size={12} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div
        ref={editorRef}
        role="textbox"
        aria-label={editorLabel}
        contentEditable
        suppressContentEditableWarning
        className="rich-composer-surface"
        style={{ minHeight }}
        data-placeholder={placeholder}
        onInput={emitCurrentHtml}
        onBlur={() => {
          rememberSelection()
          emitCurrentHtml()
        }}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        onFocus={rememberSelection}
        onPaste={() => window.setTimeout(emitCurrentHtml, 0)}
      />
    </div>
  )
}
