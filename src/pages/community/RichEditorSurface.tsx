import FigureToolbar from './FigureToolbar'

export default function RichEditorSurface({
  divRef,
  dropIndicator,
  selectedFigId,
  draggingFigId,
  selectedMeta,
  savedRangeRef,
  saveSelection,
  updateDropIndicator,
  insertAtRange,
  attachFigureClick,
  dragFigureIdRef,
  setDraggingFigId,
  setDropIndicator,
  setSelectedFigId,
  insertFile,
  handleFigureResize,
  handleFigureAlign,
  handleFigureDelete,
}: any) {
  return (
    <div className="relative">
      <div
        ref={divRef}
        contentEditable
        suppressContentEditableWarning
        onMouseUp={saveSelection}
        onKeyUp={saveSelection}
        onFocus={saveSelection}
        onClick={(e: any) => { if (!e.target.closest?.('figure')) setSelectedFigId(null); saveSelection() }}
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
          const movingFigId = e.dataTransfer?.getData('application/x-coms-editor-figure') || dragFigureIdRef.current
          if (movingFigId) {
            e.preventDefault()
            const fig = divRef.current?.querySelector(`[data-block-id="${movingFigId}"]`)
            if (!fig) return
            const range = updateDropIndicator(e.clientX, e.clientY)
            insertAtRange(fig, range)
            attachFigureClick(fig)
            dragFigureIdRef.current = null
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
          savedRangeRef.current = range
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
        className="min-h-[420px] w-full overflow-x-auto whitespace-pre bg-[var(--app-surface)] px-4 py-5 text-sm leading-7 text-[var(--theme-body-dark)] outline-none sm:px-5"
        {...({ placeholder: '내용을 입력하세요. 이미지, 동영상을 드래그하거나 툴바에서 삽입할 수 있습니다.' } as any)}
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
