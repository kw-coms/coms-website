type PostBlock = { type?: string; content?: unknown; [key: string]: unknown }

type PmMark = {
  type: string
  attrs?: Record<string, string>
}

type PmNode = {
  type: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: PmMark[]
  content?: PmNode[]
}

export type PmDoc = {
  type: 'doc'
  content: PmNode[]
}

const BLOCK_TAGS = new Set(['div', 'p'])
const BOLD_TAGS = new Set(['b', 'strong'])
const ITALIC_TAGS = new Set(['em', 'i'])
const CODE_BLOCK_RE = /<pre\b[^>]*>\s*<code\b([^>]*)>([\s\S]*?)<\/code>\s*<\/pre>/gi
const LANGUAGE_CLASS_RE = /^language-([a-z0-9]+)$/i

function decodeHtml(value: string) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(value: string) {
  return escapeHtml(value).replace(/"/g, '&quot;')
}

function marksEqual(a: PmMark[] = [], b: PmMark[] = []) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function cloneMarks(marks: PmMark[]) {
  return marks.map((mark) => {
    const next: PmMark = { type: mark.type }
    if (mark.attrs) next.attrs = { ...mark.attrs }
    return next
  })
}

function parseTag(rawTag: string) {
  const closing = /^<\s*\//.test(rawTag)
  const selfClosing = /\/\s*>$/.test(rawTag)
  const body = rawTag.replace(/^<\s*\/?\s*/, '').replace(/\/?\s*>$/, '')
  const [rawName = ''] = body.trim().split(/\s+/, 1)
  const tagName = rawName.toLowerCase()
  const attrs: Record<string, string> = {}
  const attrText = body.slice(rawName.length)
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+)))?/g
  let match
  while ((match = attrRe.exec(attrText))) {
    attrs[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '')
  }
  return { tagName, attrs, closing, selfClosing }
}

function parseStyle(styleText: string) {
  const attrs: Record<string, string> = {}
  for (const declaration of String(styleText || '').split(';')) {
    const [rawProperty, ...rawValueParts] = declaration.split(':')
    const property = rawProperty?.trim().toLowerCase()
    const value = rawValueParts.join(':').trim()
    if (!property || !value) continue
    if (property === 'color') attrs.color = value
    if (property === 'background-color') attrs.backgroundColor = value
    if (property === 'font-family') attrs.fontFamily = value
  }
  return attrs
}

function markForOpeningTag(tagName: string, attrs: Record<string, string>): PmMark | null {
  if (BOLD_TAGS.has(tagName)) return { type: 'bold' }
  if (ITALIC_TAGS.has(tagName)) return { type: 'italic' }
  if (tagName === 'u') return { type: 'underline' }
  if (tagName === 'code') return { type: 'code' }
  if (tagName === 'a') {
    const linkAttrs: Record<string, string> = {}
    if (attrs.href) linkAttrs.href = attrs.href
    if (attrs.target) linkAttrs.target = attrs.target
    if (attrs.rel) linkAttrs.rel = attrs.rel
    return Object.keys(linkAttrs).length ? { type: 'link', attrs: linkAttrs } : null
  }
  if (tagName === 'span' || tagName === 'font') {
    const textStyleAttrs = parseStyle(attrs.style || '')
    if (attrs.color && !textStyleAttrs.color) textStyleAttrs.color = attrs.color
    if (attrs.face && !textStyleAttrs.fontFamily) textStyleAttrs.fontFamily = attrs.face
    return Object.keys(textStyleAttrs).length ? { type: 'textStyle', attrs: textStyleAttrs } : null
  }
  return null
}

function closingTagMarkType(tagName: string) {
  if (BOLD_TAGS.has(tagName)) return 'bold'
  if (ITALIC_TAGS.has(tagName)) return 'italic'
  if (tagName === 'u') return 'underline'
  if (tagName === 'code') return 'code'
  if (tagName === 'a') return 'link'
  if (tagName === 'span' || tagName === 'font') return 'textStyle'
  return ''
}

function pushHardBreak(content: PmNode[]) {
  if (content.at(-1)?.type !== 'hardBreak') content.push({ type: 'hardBreak' })
}

function pushText(content: PmNode[], text: string, activeMarks: PmMark[]) {
  if (!text) return
  const marks = cloneMarks(activeMarks)
  const previous = content.at(-1)
  if (previous?.type === 'text' && marksEqual(previous.marks || [], marks)) {
    previous.text = `${previous.text || ''}${text}`
    return
  }
  const node: PmNode = { type: 'text', text }
  if (marks.length) node.marks = marks
  content.push(node)
}

function parseInlineHtmlToPm(contentHtml: string, { trimTrailingHardBreak = true } = {}) {
  const content: PmNode[] = []
  const activeMarks: PmMark[] = []
  const tokenRe = /<\/?[^>]+>|[^<]+/g
  let match
  while ((match = tokenRe.exec(String(contentHtml || '')))) {
    const token = match[0]
    if (!token.startsWith('<')) {
      // Legacy plain-text content stores raw \n; ProseMirror forbids newlines in
      // text nodes, so map each one to a hardBreak (kept even when consecutive).
      decodeHtml(token).split('\n').forEach((part, index) => {
        if (index) content.push({ type: 'hardBreak' })
        pushText(content, part, activeMarks)
      })
      continue
    }

    const { tagName, attrs, closing, selfClosing } = parseTag(token)
    if (tagName === 'br') {
      pushHardBreak(content)
      continue
    }
    if (BLOCK_TAGS.has(tagName)) {
      if (!closing && content.length) pushHardBreak(content)
      if (closing) pushHardBreak(content)
      continue
    }

    if (closing) {
      const markType = closingTagMarkType(tagName)
      if (markType) {
        const index = activeMarks.map((mark) => mark.type).lastIndexOf(markType)
        if (index >= 0) activeMarks.splice(index, 1)
      }
      continue
    }

    const mark = markForOpeningTag(tagName, attrs)
    if (mark && !selfClosing) activeMarks.push(mark)
  }
  if (trimTrailingHardBreak) {
    while (content.at(-1)?.type === 'hardBreak') content.pop()
  }
  return content
}

function textBlockSegmentToParagraph(contentHtml: string): PmNode | null {
  const content = parseInlineHtmlToPm(contentHtml, { trimTrailingHardBreak: false })
  return content.length ? { type: 'paragraph', content } : null
}

function codeBlockFromMatch(rawCodeAttrs: string, rawCodeContent: string): PmNode {
  const codeAttrs = parseTag(`<code ${rawCodeAttrs}>`).attrs
  const className = codeAttrs.class || ''
  const language = LANGUAGE_CLASS_RE.exec(className)?.[1]
  const node: PmNode = {
    type: 'codeBlock',
    content: rawCodeContent ? [{ type: 'text', text: decodeHtml(rawCodeContent) }] : [],
  }
  if (language) node.attrs = { language }
  return node
}

function textBlockToPmNodes(block: PostBlock): PmNode[] {
  const raw = String(block.content || '')
  const nodes: PmNode[] = []
  let offset = 0
  let match
  CODE_BLOCK_RE.lastIndex = 0
  while ((match = CODE_BLOCK_RE.exec(raw))) {
    const before = raw.slice(offset, match.index)
    const paragraph = textBlockSegmentToParagraph(before)
    if (paragraph) nodes.push(paragraph)
    nodes.push(codeBlockFromMatch(match[1] || '', match[2] || ''))
    offset = match.index + match[0].length
  }
  const after = raw.slice(offset)
  const paragraph = textBlockSegmentToParagraph(after)
  if (paragraph) nodes.push(paragraph)
  if (!nodes.length) nodes.push({ type: 'paragraph', content: [] })
  return nodes
}

function optionalStringAttr(value: unknown) {
  return typeof value === 'string' && value ? value : undefined
}

function optionalNumberAttr(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function copyDefinedAttr(source: Record<string, unknown>, target: Record<string, unknown>, key: string, targetKey = key) {
  const value = source[key]
  if (value !== undefined) target[targetKey] = value
}

const FILE_BLOCK_FIELDS = ['id', 'fileId', 'file', 'name', 'status', 'url']
const MEDIA_BLOCK_FIELDS = ['id', 'mediaId', 'file', 'name', 'preview', 'status', 'url', 'width', 'align', 'legacy']
const EMBED_BLOCK_FIELDS = ['id', 'provider', 'kind', 'url', 'embedUrl', 'title', 'thumbnailUrl', 'description', 'image', 'siteName', 'width', 'align']
const POLL_BLOCK_FIELDS = ['id', 'pollId', 'question', 'options', 'closesAt', 'closedAt']

function presentBlockFields(block: PostBlock, fields: string[]) {
  return fields.filter((field) => block[field] !== undefined)
}

function setPresentFields(attrs: Record<string, unknown>, fields: string[]) {
  if (fields.length) attrs.presentFields = fields
}

function sameValue(a: unknown, b: unknown) {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b)
  return Object.is(a, b)
}

function shouldCopyAttr(attrs: Record<string, unknown>, blockKey: string, attrKey: string, defaultValue: unknown) {
  const value = attrs[attrKey]
  if (value === undefined) return false
  const presentFields = attrs.presentFields
  if (!Array.isArray(presentFields)) return value !== null
  if (presentFields.includes(blockKey)) return true
  return !sameValue(value, defaultValue)
}

function copyPreservedAttr(
  attrs: Record<string, unknown>,
  block: PostBlock,
  blockKey: string,
  attrKey = blockKey,
  defaultValue: unknown = null,
) {
  if (shouldCopyAttr(attrs, blockKey, attrKey, defaultValue)) block[blockKey] = attrs[attrKey]
}

function fileBlockToPmNode(block: PostBlock): PmNode {
  const attrs: Record<string, unknown> = {}
  const blockId = optionalStringAttr(block.id)
  const fileId = optionalNumberAttr(block.fileId)
  const name = optionalStringAttr(block.name)
  const url = optionalStringAttr(block.url)
  const status = optionalStringAttr(block.status)
  setPresentFields(attrs, presentBlockFields(block, FILE_BLOCK_FIELDS))
  if (blockId) attrs.blockId = blockId
  if (fileId !== undefined) attrs.fileId = fileId
  if (block.file) attrs.file = block.file
  if (name) attrs.name = name
  if (url) attrs.url = url
  if (status) attrs.status = status
  return Object.keys(attrs).length ? { type: 'fileBlock', attrs } : { type: 'fileBlock' }
}

function mediaBlockToPmNode(block: PostBlock, nodeType: 'imageBlock' | 'videoBlock'): PmNode {
  const attrs: Record<string, unknown> = {}
  const blockId = optionalStringAttr(block.id)
  const mediaId = optionalNumberAttr(block.mediaId)
  const name = optionalStringAttr(block.name)
  const url = optionalStringAttr(block.url)
  const preview = optionalStringAttr(block.preview)
  const status = optionalStringAttr(block.status)
  const align = optionalStringAttr(block.align)
  setPresentFields(attrs, presentBlockFields(block, MEDIA_BLOCK_FIELDS))
  if (blockId) attrs.blockId = blockId
  if (mediaId !== undefined) attrs.mediaId = mediaId
  if (block.file) attrs.file = block.file
  if (name) attrs.name = name
  if (url) attrs.url = url
  if (preview) attrs.preview = preview
  if (status) attrs.status = status
  if (block.width !== undefined) attrs.width = block.width
  if (align) attrs.align = align
  if (block.legacy !== undefined) attrs.legacy = block.legacy
  return Object.keys(attrs).length ? { type: nodeType, attrs } : { type: nodeType }
}

function embedBlockToPmNode(block: PostBlock): PmNode {
  const attrs: Record<string, unknown> = {}
  setPresentFields(attrs, presentBlockFields(block, EMBED_BLOCK_FIELDS))
  for (const key of ['id', 'provider', 'kind', 'url', 'embedUrl', 'title', 'thumbnailUrl', 'description', 'image', 'siteName', 'align']) {
    copyDefinedAttr(block, attrs, key, key === 'id' ? 'blockId' : key)
  }
  if (block.width !== undefined) attrs.width = block.width
  return Object.keys(attrs).length ? { type: 'embedBlock', attrs } : { type: 'embedBlock' }
}

function pollBlockToPmNode(block: PostBlock): PmNode {
  const attrs: Record<string, unknown> = {}
  setPresentFields(attrs, presentBlockFields(block, POLL_BLOCK_FIELDS))
  for (const key of ['id', 'pollId', 'question', 'closesAt', 'closedAt']) {
    copyDefinedAttr(block, attrs, key, key === 'id' ? 'blockId' : key)
  }
  if (Array.isArray(block.options)) attrs.options = block.options
  return Object.keys(attrs).length ? { type: 'pollBlock', attrs } : { type: 'pollBlock' }
}

function renderTextStyle(attrs: Record<string, string> = {}) {
  const styles = []
  if (attrs.color) styles.push(`color: ${attrs.color}`)
  if (attrs.backgroundColor) styles.push(`background-color: ${attrs.backgroundColor}`)
  if (attrs.fontFamily) styles.push(`font-family: ${attrs.fontFamily}`)
  return styles.length ? ` style="${escapeAttr(styles.join('; '))}"` : ''
}

function renderMark(mark: PmMark, innerHtml: string) {
  if (mark.type === 'bold') return `<strong>${innerHtml}</strong>`
  if (mark.type === 'italic') return `<em>${innerHtml}</em>`
  if (mark.type === 'underline') return `<u>${innerHtml}</u>`
  if (mark.type === 'code') return `<code>${innerHtml}</code>`
  if (mark.type === 'link') {
    const attrs = mark.attrs || {}
    const parts = []
    if (attrs.href) parts.push(`href="${escapeAttr(attrs.href)}"`)
    if (attrs.target) parts.push(`target="${escapeAttr(attrs.target)}"`)
    if (attrs.rel) parts.push(`rel="${escapeAttr(attrs.rel)}"`)
    return `<a ${parts.join(' ')}>${innerHtml}</a>`
  }
  if (mark.type === 'textStyle') return `<span${renderTextStyle(mark.attrs)}>${innerHtml}</span>`
  return innerHtml
}

function renderInlineNode(node: PmNode) {
  if (node.type === 'hardBreak') return '<br>'
  if (node.type !== 'text') throw new Error(`Unsupported inline node for P1 converter: ${node.type}`)
  let html = escapeHtml(node.text || '')
  for (let index = (node.marks || []).length - 1; index >= 0; index -= 1) {
    html = renderMark(node.marks?.[index] as PmMark, html)
  }
  return html
}

function renderParagraph(node: PmNode) {
  return (node.content || []).map(renderInlineNode).join('')
}

function renderCodeBlock(node: PmNode) {
  const language = typeof node.attrs?.language === 'string' ? node.attrs.language : ''
  const classAttr = language ? ` class="language-${escapeAttr(language)}"` : ''
  const content = (node.content || []).map((child) => {
    if (child.type !== 'text') throw new Error(`Unsupported codeBlock child for P1 converter: ${child.type}`)
    return escapeHtml(child.text || '')
  }).join('')
  return `<pre><code${classAttr}>${content}</code></pre>`
}

function fileBlockToPostBlock(node: PmNode): PostBlock {
  const attrs = node.attrs || {}
  const block: PostBlock = { type: 'file' }
  copyPreservedAttr(attrs, block, 'id', 'blockId', null)
  copyPreservedAttr(attrs, block, 'fileId', 'fileId', null)
  copyPreservedAttr(attrs, block, 'file', 'file', null)
  copyPreservedAttr(attrs, block, 'name', 'name', null)
  copyPreservedAttr(attrs, block, 'status', 'status', 'saved')
  copyPreservedAttr(attrs, block, 'url', 'url', null)
  return block
}

function mediaBlockToPostBlock(node: PmNode, type: 'image' | 'video'): PostBlock {
  const attrs = node.attrs || {}
  const block: PostBlock = { type }
  copyPreservedAttr(attrs, block, 'id', 'blockId', null)
  copyPreservedAttr(attrs, block, 'mediaId', 'mediaId', null)
  copyPreservedAttr(attrs, block, 'file', 'file', null)
  copyPreservedAttr(attrs, block, 'preview', 'preview', null)
  copyPreservedAttr(attrs, block, 'name', 'name', null)
  copyPreservedAttr(attrs, block, 'width', 'width', 75)
  copyPreservedAttr(attrs, block, 'align', 'align', 'center')
  copyPreservedAttr(attrs, block, 'status', 'status', 'saved')
  copyPreservedAttr(attrs, block, 'url', 'url', null)
  copyPreservedAttr(attrs, block, 'legacy', 'legacy', null)
  return block
}

function embedBlockToPostBlock(node: PmNode): PostBlock {
  const attrs = node.attrs || {}
  const block: PostBlock = { type: 'externalEmbed' }
  copyPreservedAttr(attrs, block, 'id', 'blockId', null)
  copyPreservedAttr(attrs, block, 'provider', 'provider', 'external')
  copyPreservedAttr(attrs, block, 'kind', 'kind', 'link')
  copyPreservedAttr(attrs, block, 'url', 'url', null)
  copyPreservedAttr(attrs, block, 'embedUrl', 'embedUrl', null)
  copyPreservedAttr(attrs, block, 'title', 'title', null)
  copyPreservedAttr(attrs, block, 'thumbnailUrl', 'thumbnailUrl', null)
  copyPreservedAttr(attrs, block, 'description', 'description', null)
  copyPreservedAttr(attrs, block, 'image', 'image', null)
  copyPreservedAttr(attrs, block, 'siteName', 'siteName', null)
  copyPreservedAttr(attrs, block, 'width', 'width', 75)
  copyPreservedAttr(attrs, block, 'align', 'align', 'center')
  return block
}

function pollBlockToPostBlock(node: PmNode): PostBlock {
  const attrs = node.attrs || {}
  const block: PostBlock = { type: 'poll' }
  copyPreservedAttr(attrs, block, 'id', 'blockId', null)
  copyPreservedAttr(attrs, block, 'pollId', 'pollId', null)
  copyPreservedAttr(attrs, block, 'question', 'question', '투표')
  copyPreservedAttr(attrs, block, 'options', 'options', [])
  copyPreservedAttr(attrs, block, 'closesAt', 'closesAt', null)
  copyPreservedAttr(attrs, block, 'closedAt', 'closedAt', null)
  return block
}

export function blockJsonToPmDoc(blocks: PostBlock[] = []): PmDoc {
  return {
    type: 'doc',
    content: blocks.flatMap((block) => {
      const type = block.type || 'text'
      if (type === 'file') return [fileBlockToPmNode(block)]
      if (type === 'image') return [mediaBlockToPmNode(block, 'imageBlock')]
      if (type === 'video') return [mediaBlockToPmNode(block, 'videoBlock')]
      if (type === 'externalEmbed') return [embedBlockToPmNode(block)]
      if (type === 'poll') return [pollBlockToPmNode(block)]
      if (type !== 'text') throw new Error(`Unsupported block type for P1 converter: ${type}`)
      return textBlockToPmNodes(block)
    }),
  }
}

export function pmDocToBlockJson(doc: PmDoc | PmNode): PostBlock[] {
  if (!doc || doc.type !== 'doc') throw new Error('Expected ProseMirror doc JSON')
  let textContent = ''
  const blocks: PostBlock[] = []
  const flushText = () => {
    if (!textContent) return
    blocks.push({ type: 'text', content: textContent })
    textContent = ''
  }
  let previousTextNodeType = ''
  for (const node of doc.content || []) {
    if (node.type === 'paragraph') {
      if (previousTextNodeType === 'paragraph') flushText()
      textContent += renderParagraph(node)
      previousTextNodeType = 'paragraph'
    } else if (node.type === 'codeBlock') {
      textContent += renderCodeBlock(node)
      previousTextNodeType = 'codeBlock'
    } else if (node.type === 'fileBlock') {
      flushText()
      previousTextNodeType = ''
      blocks.push(fileBlockToPostBlock(node))
    } else if (node.type === 'imageBlock') {
      flushText()
      previousTextNodeType = ''
      blocks.push(mediaBlockToPostBlock(node, 'image'))
    } else if (node.type === 'videoBlock') {
      flushText()
      previousTextNodeType = ''
      blocks.push(mediaBlockToPostBlock(node, 'video'))
    } else if (node.type === 'embedBlock') {
      flushText()
      previousTextNodeType = ''
      blocks.push(embedBlockToPostBlock(node))
    } else if (node.type === 'pollBlock') {
      flushText()
      previousTextNodeType = ''
      blocks.push(pollBlockToPostBlock(node))
    } else {
      throw new Error(`Unsupported node type for P1 converter: ${node.type}`)
    }
  }
  flushText()
  return blocks
}
