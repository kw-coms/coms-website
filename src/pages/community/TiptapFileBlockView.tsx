import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'

export default function TiptapFileBlockView({ node, selected }: NodeViewProps) {
  const name = String(node.attrs.name || '파일')
  const blockId = String(node.attrs.blockId || node.attrs.fileId || '')
  return (
    <NodeViewWrapper
      as="figure"
      className={`community-editor-figure ${selected ? 'ring-2 ring-[var(--app-brand)]/30' : ''}`}
      data-block-id={blockId}
      data-type="file"
      contentEditable={false}
      draggable="true"
      style={{
        display: 'inline-block',
        verticalAlign: 'top',
        margin: '0.15rem 0.2rem',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitUserDrag: 'element',
        cursor: 'grab',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          border: '1px solid rgba(0,0,0,0.1)',
          borderRadius: 4,
          background: 'rgba(0,0,0,0.03)',
          padding: '6px 10px',
          fontSize: 13,
          fontWeight: 600,
          pointerEvents: 'none',
        }}
      >
        📎 {name}
      </span>
    </NodeViewWrapper>
  )
}
