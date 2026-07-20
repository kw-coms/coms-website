import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { apiUrl } from '../../services/apiClient'
import { figureInlineStyle, mediaWidthPercent, styleTextToObject } from './postEditorUtils'

function safeMediaSrc(value: unknown) {
  const url = String(value || '')
  if (!url) return ''
  if (/^(blob:|data:)/i.test(url)) return url
  return url.startsWith('/') ? apiUrl(url) : url
}

export default function TiptapMediaBlockView({ node, selected }: NodeViewProps) {
  const isImage = node.type.name === 'imageBlock'
  const blockId = String(node.attrs.blockId || node.attrs.mediaId || '')
  const width = mediaWidthPercent(node.attrs.width || 75)
  const align = String(node.attrs.align || 'center')
  const src = safeMediaSrc(node.attrs.preview || node.attrs.src || node.attrs.url)
  return (
    <NodeViewWrapper
      as="figure"
      className={`community-editor-figure ${selected ? 'ring-2 ring-[var(--app-brand)]/30' : ''}`}
      data-block-id={blockId}
      data-type={isImage ? 'image' : 'video'}
      data-align={align}
      contentEditable={false}
      draggable="true"
      style={styleTextToObject(figureInlineStyle(width, align))}
    >
      {isImage ? (
        <img
          src={src}
          alt=""
          draggable={false}
          className="community-inline-media-image"
          style={{ pointerEvents: 'none' }}
        />
      ) : (
        <video
          src={src}
          controls
          preload="metadata"
          draggable={false}
          style={{ display: 'block', width: '100%', height: 'auto' }}
        />
      )}
    </NodeViewWrapper>
  )
}
