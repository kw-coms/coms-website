import assert from 'node:assert/strict'

import {
  serializeRichBody,
  richBodyPlainText,
} from '../src/components/richEditor/serializeRichBody.ts'
import {
  isRichBodyContent,
  richBodyToPlainText,
} from '../src/components/richEditor/renderRichBody.tsx'

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

console.log('rich body editor contract passed')
