import { parsePostBlocks } from '../../pages/community/postEditorUtils'
import { richMediaUrl } from '../../services/richMediaApi'

/** Supplies the media-info shape expected by the shared community block parser. */
export function parseRichBodyBlocks(content: string) {
  let raw: unknown = []
  try { raw = JSON.parse(content || '[]') } catch { /* legacy plain text */ }
  const blocks = Array.isArray(raw) ? raw : []
  const infos = (type: string, key: string) => blocks
    .filter((block) => block?.type === type && Number.isSafeInteger(block[key]) && block[key] > 0)
    .map((block) => ({ id: block[key], originalName: block.name, url: richMediaUrl(block[key]) }))
  return parsePostBlocks({ content, imageInfos: infos('image', 'mediaId'), videoInfos: infos('video', 'mediaId'), fileInfos: infos('file', 'fileId') })
}
