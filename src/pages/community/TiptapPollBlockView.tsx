import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { pollOptionLabel } from './postEditorUtils'

export default function TiptapPollBlockView({ node, selected }: NodeViewProps) {
  const question = String(node.attrs.question || '투표')
  const options = Array.isArray(node.attrs.options) ? node.attrs.options : []
  const blockId = String(node.attrs.blockId || node.attrs.pollId || '')
  return (
    <NodeViewWrapper
      as="figure"
      className={`community-editor-figure ${selected ? 'ring-2 ring-[var(--app-brand)]/30' : ''}`}
      data-block-id={blockId}
      data-type="poll"
      contentEditable={false}
      draggable="true"
      style={{
        display: 'block',
        maxWidth: '100%',
        margin: '0.5rem 0',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitUserDrag: 'element',
        cursor: 'grab',
      }}
    >
      <div style={{ border: '1px solid rgba(59,72,144,0.18)', borderRadius: 8, background: '#f7f9ff', padding: 12, pointerEvents: 'none' }}>
        <strong>{question}</strong>
        <div style={{ marginTop: 8, fontSize: 12, color: '#5b6478' }}>
          {options.map(pollOptionLabel).join(' · ')}
        </div>
      </div>
    </NodeViewWrapper>
  )
}
