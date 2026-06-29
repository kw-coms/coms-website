import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MEDIA_ALIGN_OPTIONS } from './postEditorUtils'

function MediaAlignControls({ value, onChange }: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-[var(--app-hairline)] bg-white/85 px-2 py-1 shadow-sm">
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


export default function FigureToolbar({ editorRef, figId, meta, onResize, onAlign, onDelete, onDeselect }: {
  editorRef: React.RefObject<HTMLElement | null>
  figId?: string | null
  meta?: { align?: string } | null
  onResize: (pct: number) => void
  onAlign: (align: string) => void
  onDelete: () => void
  onDeselect: () => void
}) {
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)

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
    const figEl = editorRef.current?.querySelector(`[data-block-id="${figId}"]`) as HTMLElement | null
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
  const hCls = 'fixed z-50 block h-3 w-3 -translate-x-1/2 -translate-y-1/2 border-2 border-blue-500 bg-[var(--app-surface)]'

  return createPortal(
    <>
      <div className="pointer-events-none fixed z-40 border-2 border-blue-500"
        style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} />
      <div ref={toolbarRef}
        className="fixed z-50 flex items-center gap-1 whitespace-nowrap rounded border border-[var(--app-hairline)] bg-white/95 px-2 py-1 shadow backdrop-blur-sm"
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
