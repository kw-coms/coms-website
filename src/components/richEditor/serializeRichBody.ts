import { textContentForSearch } from '../../pages/community/postEditorUtils'

/** Serializes rich blocks with saved media ids; pending uploads are excluded. */
export function serializeRichBody(blocks) {
  const list = Array.isArray(blocks) ? blocks : []
  const serialized = list
    .map((b) => {
      if (b.type === 'text') return { type: 'text', content: b.content }
      if ((b.type === 'image' || b.type === 'video') && Number.isSafeInteger(b.mediaId) && b.mediaId > 0) {
        return { type: b.type, mediaId: b.mediaId, name: b.name, width: b.width || 75, align: b.align || 'center' }
      }
      if (b.type === 'file' && Number.isSafeInteger(b.fileId) && b.fileId > 0) {
        return { type: 'file', fileId: b.fileId, name: b.name }
      }
      if (b.type === 'externalEmbed') {
        if (b.kind === 'link') {
          // Link cards carry OG metadata and never an iframe/embedUrl; persist only the
          // safe fields so a round-trip keeps the card intact (backend re-validates https).
          return {
            type: 'externalEmbed',
            provider: b.provider,
            kind: 'link',
            url: b.url,
            title: b.title,
            description: b.description || '',
            image: b.image || '',
            siteName: b.siteName || '',
            width: b.width || 75,
            align: b.align || 'center',
          }
        }
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
    (b) => (b.type === 'text' && textContentForSearch(b.content).trim()) || b.type === 'externalEmbed' || b.type === 'image' || b.type === 'video' || b.type === 'file',
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
