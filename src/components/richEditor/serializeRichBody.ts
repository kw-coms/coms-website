import { textContentForSearch } from '../../pages/community/postEditorUtils'

/**
 * Serializes editor blocks for the URL-only rich-body variant used by
 * notices and resources. Only text and externalEmbed blocks are persisted;
 * uploaded image/video/file and poll blocks are not reachable in that variant
 * because they require community-scoped backend endpoints.
 *
 * Returns a JSON string of blocks, or '' when there is no meaningful content.
 */
export function serializeRichBody(blocks) {
  const list = Array.isArray(blocks) ? blocks : []
  const serialized = list
    .map((b) => {
      if (b.type === 'text') return { type: 'text', content: b.content }
      if (b.type === 'externalEmbed') {
        return {
          type: 'externalEmbed',
          provider: b.provider,
          kind: b.kind,
          url: b.url,
          embedUrl: b.embedUrl,
          title: b.title,
          thumbnailUrl: b.thumbnailUrl,
          width: b.width || 75,
          align: b.align || 'center',
        }
      }
      return null
    })
    .filter(Boolean)

  const hasMeaning = serialized.some(
    (b) => (b.type === 'text' && textContentForSearch(b.content).trim()) || b.type === 'externalEmbed',
  )
  if (!hasMeaning) return ''
  return JSON.stringify(serialized)
}

/**
 * Plain-text representation of editor blocks, used for legacy/empty validation
 * and for any context that needs a non-rich preview.
 */
export function richBodyPlainText(blocks) {
  const list = Array.isArray(blocks) ? blocks : []
  return list
    .filter((b) => b.type === 'text')
    .map((b) => textContentForSearch(b.content))
    .join('\n')
    .trim()
}
