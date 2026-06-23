import { renderPostBlocks } from '../../pages/community/PostBlocks'
import { parsePostBlocks, textContentForSearch } from '../../pages/community/postEditorUtils'

/**
 * Detects whether a stored string is serialized rich-editor content
 * (a JSON array of blocks) versus legacy plain text. Used so notices and
 * resources can keep rendering their old plain-text content unchanged while
 * new rich content renders through the shared block renderer.
 */
export function isRichBodyContent(value) {
  const raw = String(value || '').trim()
  if (!raw.startsWith('[')) return false
  try {
    return Array.isArray(JSON.parse(raw))
  } catch {
    return false
  }
}

/**
 * Renders notice/resource body content. Rich (serialized block) content is
 * rendered through the same sanitize + block pipeline the community uses;
 * legacy plain text falls back to the caller-provided plain renderer so old
 * content keeps rendering exactly as before.
 *
 * Notices/resources never carry uploaded image/video/file blocks (those need
 * community-scoped media-info resolution), so only text + externalEmbed blocks
 * appear here. Poll blocks, if ever present, render read-only with no vote
 * handlers wired.
 */
export function renderRichBody(content, renderPlain) {
  if (isRichBodyContent(content)) {
    return renderPostBlocks({ content })
  }
  return renderPlain(content)
}

/**
 * Plain-text representation of stored body content (rich or legacy) for use in
 * search filters and list previews, so serialized JSON keys never leak into
 * search matches or snippets.
 */
export function richBodyToPlainText(content) {
  if (!isRichBodyContent(content)) return String(content || '')
  return parsePostBlocks({ content })
    .filter((block) => block.type === 'text')
    .map((block) => textContentForSearch(block.content))
    .join('\n')
    .trim()
}
