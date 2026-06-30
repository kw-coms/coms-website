import { sanitizeEditorHtml, textToEditorHtml, localId } from './postEditorUtils'

type EditorBlock = { type?: string; content?: unknown; [key: string]: unknown }

function stripTrailingBreaks(value: string) {
  return value.replace(/(<br\s*\/?>\s*)+$/gi, '')
}

function normalizeTiptapParagraphsWithoutDom(value: string) {
  const raw = String(value || '')
  const paragraphs = raw.match(/<p(?:\s[^>]*)?>[\s\S]*?<\/p>/gi)
  if (!paragraphs) return raw
  return stripTrailingBreaks(paragraphs.map((paragraph) => (
    paragraph
      .replace(/^<p(?:\s[^>]*)?>/i, '')
      .replace(/<\/p>$/i, '')
  )).join('<br>'))
}

export function isTextOnlyEditorBlocks(blocks: EditorBlock[] = []) {
  return blocks.every((block) => !block.type || block.type === 'text')
}

export function isTiptapSupportedEditorBlocks(blocks: EditorBlock[] = []) {
  const supported = new Set(['text', 'file', 'image', 'video', 'externalEmbed', 'poll'])
  return blocks.every((block) => !block.type || supported.has(block.type))
}

export function textBlocksToTiptapHtml(blocks: EditorBlock[] = []) {
  const html = blocks
    .filter((block) => !block.type || block.type === 'text')
    .map((block) => textToEditorHtml(String(block.content || '')))
    .filter(Boolean)
    .join('<br>')
  return html ? `<p>${html}</p>` : ''
}

export function tiptapHtmlToEditorHtml(value: string) {
  const raw = String(value || '')
  if (typeof document === 'undefined') return normalizeTiptapParagraphsWithoutDom(raw)

  const template = document.createElement('template')
  template.innerHTML = raw
  const parts: string[] = []

  for (const node of Array.from(template.content.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent || '')
      continue
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue

    const element = node as Element
    if (element.tagName.toLowerCase() === 'p') {
      parts.push(element.innerHTML)
      parts.push('<br>')
    } else {
      parts.push(element.outerHTML)
    }
  }

  return stripTrailingBreaks(parts.join(''))
}

export function sanitizeTiptapTextHtml(value: string) {
  return sanitizeEditorHtml(tiptapHtmlToEditorHtml(value))
}

export function tiptapTextHtmlToBlocks(value: string) {
  const content = sanitizeTiptapTextHtml(value)
  return content ? [{ type: 'text', content, id: localId() }] : []
}
