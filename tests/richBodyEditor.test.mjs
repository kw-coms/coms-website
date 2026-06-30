import assert from 'node:assert/strict'

import {
  serializeRichBody,
  richBodyPlainText,
} from '../src/components/richEditor/serializeRichBody.ts'
import {
  isRichBodyContent,
  richBodyToPlainText,
} from '../src/components/richEditor/renderRichBody.tsx'
import {
  externalBlockFromUrl,
  EDITOR_SANITIZE_OPTIONS,
  safeYoutubeEmbedSrc,
} from '../src/pages/community/postEditorUtils.ts'
import { renderPostBlocks } from '../src/pages/community/PostBlocks.tsx'
import { isTiptapSupportedEditorBlocks, tiptapHtmlToEditorHtml } from '../src/pages/community/tiptapTextEditorHtml.ts'
import { SANITIZE_PROFILES } from '../src/utils/sanitizeHtml.ts'

// --- serialize: text + externalEmbed blocks round-trip through JSON ---
const blocks = [
  { type: 'text', content: '공지 본문입니다', id: 'a' },
  {
    type: 'externalEmbed',
    provider: 'youtube',
    kind: 'youtube',
    url: 'https://www.youtube.com/watch?v=abc123',
    embedUrl: 'https://www.youtube.com/embed/abc123',
    title: '소개 영상',
    thumbnailUrl: 'https://img.youtube.com/vi/abc123/0.jpg',
    width: 80,
    align: 'center',
    id: 'b',
  },
]

const serialized = serializeRichBody(blocks)
assert.equal(typeof serialized, 'string')

const parsed = JSON.parse(serialized)
assert.equal(parsed.length, 2)
assert.equal(parsed[0].type, 'text')
assert.equal(parsed[0].content, '공지 본문입니다')
assert.equal(parsed[1].type, 'externalEmbed')
assert.equal(parsed[1].kind, 'youtube')
assert.equal(parsed[1].embedUrl, 'https://www.youtube.com/embed/abc123')
assert.equal(parsed[1].width, 80)
assert.equal(parsed[1].align, 'center')

// upload/poll blocks are intentionally dropped from the URL-only variant
const withMedia = serializeRichBody([
  { type: 'text', content: '본문', id: 'x' },
  { type: 'image', status: 'pending', name: 'a.png', id: 'i' },
  { type: 'poll', question: '점심?', options: [], id: 'p' },
])
const withMediaParsed = JSON.parse(withMedia)
assert.deepEqual(withMediaParsed.map((b) => b.type), ['text'])

// empty / whitespace-only content serializes to '' so validation can reject it
assert.equal(serializeRichBody([{ type: 'text', content: '   ', id: 'e' }]), '')
assert.equal(serializeRichBody([]), '')
// but an externalEmbed alone counts as meaningful content
assert.notEqual(
  serializeRichBody([{ type: 'externalEmbed', kind: 'youtube', embedUrl: 'x', id: 'q' }]),
  '',
)

// plain-text extraction of editor blocks
assert.equal(
  richBodyPlainText([
    { type: 'text', content: '첫 줄', id: '1' },
    { type: 'externalEmbed', kind: 'youtube', embedUrl: 'x', id: '2' },
    { type: 'text', content: '둘째 줄', id: '3' },
  ]),
  '첫 줄\n둘째 줄',
)

// --- render-side detection: rich JSON vs legacy plain text ---
assert.equal(isRichBodyContent(serialized), true)
assert.equal(isRichBodyContent(JSON.stringify([{ type: 'text', content: 'x' }])), true)

// legacy plain text is NOT treated as rich (backward compat)
assert.equal(isRichBodyContent('옛날 공지 내용입니다.'), false)
assert.equal(isRichBodyContent('[공지] 대괄호로 시작하는 평문'), false)
assert.equal(isRichBodyContent(''), false)
assert.equal(isRichBodyContent(null), false)
assert.equal(isRichBodyContent(undefined), false)

// --- search text: rich content yields readable text, legacy passes through ---
assert.equal(richBodyToPlainText(serialized), '공지 본문입니다')
assert.equal(richBodyToPlainText('옛날 공지 내용입니다.'), '옛날 공지 내용입니다.')
assert.equal(richBodyToPlainText('[공지] 대괄호 평문'), '[공지] 대괄호 평문')
assert.equal(richBodyToPlainText(''), '')

// --- externalBlockFromUrl: generic https URL now yields a link-preview block ---
const linkBlock = externalBlockFromUrl('https://example.com/some/article')
assert.equal(linkBlock.type, 'externalEmbed')
assert.equal(linkBlock.kind, 'link')
assert.equal(linkBlock.provider, 'external')
assert.equal(linkBlock.url, 'https://example.com/some/article')
assert.equal(linkBlock.siteName, 'example.com')
assert.equal(linkBlock.title, 'example.com')
assert.equal(linkBlock.embedUrl, undefined)

// supplied meta is carried onto the link block
const linkWithMeta = externalBlockFromUrl('https://blog.example.org/post', {
  title: '글 제목',
  description: '요약',
  image: 'https://blog.example.org/cover.png',
  siteName: 'Example Blog',
})
assert.equal(linkWithMeta.kind, 'link')
assert.equal(linkWithMeta.title, '글 제목')
assert.equal(linkWithMeta.description, '요약')
assert.equal(linkWithMeta.image, 'https://blog.example.org/cover.png')
assert.equal(linkWithMeta.siteName, 'Example Blog')

// youtube / direct image / direct video URLs are unchanged (backward compat)
assert.equal(externalBlockFromUrl('https://www.youtube.com/watch?v=abcdef123').kind, 'youtube')
assert.equal(externalBlockFromUrl('https://cdn.example.com/a.png').kind, 'image')
assert.equal(externalBlockFromUrl('https://cdn.example.com/a.mp4').kind, 'video')

// non-https still rejected
assert.throws(() => externalBlockFromUrl('http://example.com'))
assert.throws(() => externalBlockFromUrl('not a url'))

// --- serialize round-trip keeps the link kind and only safe fields ---
const linkSerialized = serializeRichBody([
  {
    type: 'externalEmbed',
    provider: 'external',
    kind: 'link',
    url: 'https://example.com/x',
    title: 'T',
    description: 'D',
    image: 'https://example.com/i.png',
    siteName: 'example.com',
    embedUrl: 'https://evil.example.com/embed/x', // must be dropped
    width: 60,
    align: 'left',
    id: 'L',
  },
])
const linkParsed = JSON.parse(linkSerialized)
assert.equal(linkParsed.length, 1)
assert.equal(linkParsed[0].kind, 'link')
assert.equal(linkParsed[0].url, 'https://example.com/x')
assert.equal(linkParsed[0].description, 'D')
assert.equal(linkParsed[0].image, 'https://example.com/i.png')
assert.equal(linkParsed[0].siteName, 'example.com')
assert.equal(linkParsed[0].width, 60)
assert.equal(linkParsed[0].align, 'left')
assert.equal(linkParsed[0].embedUrl, undefined) // no iframe smuggling through serialize

// --- render allowlist: only canonical youtube embed URLs pass ---
assert.equal(safeYoutubeEmbedSrc('https://www.youtube.com/embed/abc123'), 'https://www.youtube.com/embed/abc123')
assert.equal(safeYoutubeEmbedSrc('https://www.youtube-nocookie.com/embed/abc123?rel=0'), 'https://www.youtube-nocookie.com/embed/abc123?rel=0')
assert.equal(safeYoutubeEmbedSrc('https://evil.example.com/embed/abc123'), '')
assert.equal(safeYoutubeEmbedSrc('https://www.youtube.com/watch?v=abc123'), '')
assert.equal(safeYoutubeEmbedSrc('javascript:alert(1)'), '')
assert.equal(safeYoutubeEmbedSrc('https://www.youtube.com.evil.com/embed/abc123'), '')
assert.equal(safeYoutubeEmbedSrc(''), '')

// --- TipTap P0 text/mark compatibility ---
const tiptapInlineHtml = '<p><strong>굵게</strong> <em>기울임</em> <u>밑줄</u> <a href="https://example.com/post">링크</a> <span style="color:#123456;background-color:#fff3a3">색상</span></p><p>둘째 줄</p>'
const legacyInlineHtml = '<strong>굵게</strong> <em>기울임</em> <u>밑줄</u> <a href="https://example.com/post">링크</a> <span style="color:#123456;background-color:#fff3a3">색상</span><br>둘째 줄'
assert.equal(tiptapHtmlToEditorHtml(tiptapInlineHtml), legacyInlineHtml)

for (const tag of ['a', 'strong', 'em', 'u', 'span']) {
  assert.ok(EDITOR_SANITIZE_OPTIONS.allowedTags.includes(tag), `editor sanitizer must allow <${tag}>`)
  assert.ok(SANITIZE_PROFILES.richText.allowedTags.includes(tag), `richText sanitizer must allow <${tag}>`)
}
for (const attr of ['href', 'rel', 'target', 'style']) {
  assert.ok(EDITOR_SANITIZE_OPTIONS.allowedAttributes.includes(attr), `editor sanitizer must allow ${attr}`)
  assert.ok(SANITIZE_PROFILES.richText.allowedAttributes.includes(attr), `richText sanitizer must allow ${attr}`)
}
for (const style of ['color', 'background-color']) {
  assert.ok(EDITOR_SANITIZE_OPTIONS.allowedStyles.has(style), `editor sanitizer must allow ${style}`)
  assert.ok(SANITIZE_PROFILES.richText.allowedStyles.has(style), `richText sanitizer must allow ${style}`)
}

function flattenReactChildren(value) {
  if (Array.isArray(value)) return value.flatMap(flattenReactChildren)
  return value ? [value] : []
}

function renderedTextHtml(content) {
  const rendered = renderPostBlocks({ content: JSON.stringify([{ type: 'text', content }]) })
  const textNode = flattenReactChildren(rendered.props.children)
    .find((node) => node?.props?.dangerouslySetInnerHTML)
  return textNode?.props?.dangerouslySetInnerHTML?.__html
}

assert.equal(renderedTextHtml(tiptapHtmlToEditorHtml(tiptapInlineHtml)), renderedTextHtml(legacyInlineHtml))

assert.equal(isTiptapSupportedEditorBlocks([{ type: 'image' }, { type: 'video' }, { type: 'file' }, { type: 'externalEmbed' }, { type: 'poll' }]), true)
assert.equal(isTiptapSupportedEditorBlocks([{ type: 'unknownBlock' }]), false)

console.log('rich body editor contract passed')
