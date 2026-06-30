import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { figureInlineStyle, mediaWidthPercent, safeExternalSrc, safeYoutubeEmbedSrc } from './postEditorUtils'

const EXTERNAL_CARD_STYLE = {
  overflow: 'hidden',
  border: '1px solid var(--app-hairline)',
  borderRadius: 12,
  background: 'var(--app-surface)',
  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
}

export default function TiptapEmbedBlockView({ node, selected }: NodeViewProps) {
  const attrs = node.attrs
  const blockId = String(attrs.blockId || attrs.url || '')
  const kind = String(attrs.kind || 'link')
  const title = String(attrs.title || (kind === 'youtube' ? 'YouTube 영상' : '외부 콘텐츠'))
  const width = mediaWidthPercent(attrs.width || 75)
  const align = String(attrs.align || 'center')
  const src = kind === 'youtube' ? safeYoutubeEmbedSrc(attrs.embedUrl) : safeExternalSrc(attrs.url)
  let domain = String(attrs.siteName || '')
  if (!domain && attrs.url) {
    try { domain = new URL(String(attrs.url)).hostname } catch { domain = '' }
  }

  return (
    <NodeViewWrapper
      as="figure"
      className={`community-editor-figure ${selected ? 'ring-2 ring-[#3b4890]/30' : ''}`}
      data-block-id={blockId}
      data-type="externalEmbed"
      data-align={align}
      contentEditable={false}
      draggable="true"
      style={{ ...EXTERNAL_CARD_STYLE, ...styleTextToObject(figureInlineStyle(width, align)) }}
    >
      {kind === 'youtube' ? (
        <>
          {src && (
            <div style={{ aspectRatio: '16/9', width: '100%', background: '#000', pointerEvents: 'none' }}>
              <iframe
                src={src}
                title={title}
                style={{ width: '100%', height: '100%', border: 0, pointerEvents: 'none' }}
              />
            </div>
          )}
          <figcaption style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, color: 'var(--app-muted)', pointerEvents: 'none' }}>
            {title}
          </figcaption>
        </>
      ) : kind === 'image' ? (
        <img
          src={src}
          alt={title}
          draggable={false}
          className="community-inline-media-image"
          style={{ display: 'block', pointerEvents: 'none' }}
        />
      ) : kind === 'video' ? (
        <video
          src={src}
          controls
          preload="metadata"
          draggable={false}
          style={{ display: 'block', width: '100%', height: 'auto', pointerEvents: 'none' }}
        />
      ) : (
        <>
          {safeExternalSrc(attrs.image) && (
            <div style={{ aspectRatio: '1.91/1', width: '100%', overflow: 'hidden', background: 'var(--app-surface-soft)', pointerEvents: 'none' }}>
              <img
                src={safeExternalSrc(attrs.image)}
                alt=""
                draggable={false}
                style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
              />
            </div>
          )}
        <div style={{ padding: '12px 16px', pointerEvents: 'none' }}>
          {title && <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--theme-body-dark)' }}>{title}</p>}
          {attrs.description && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--app-muted)' }}>{String(attrs.description)}</p>}
          {domain && <p style={{ margin: '8px 0 0', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--app-subtle)' }}>{domain}</p>}
        </div>
        </>
      )}
    </NodeViewWrapper>
  )
}

function styleTextToObject(styleText: string) {
  return Object.fromEntries(
    styleText
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [property, ...valueParts] = part.split(':')
        return [property.replace(/-([a-z])/g, (_, char) => char.toUpperCase()), valueParts.join(':').trim()]
      }),
  )
}
