// How a stored post body reaches the reader, and how the editor hands it back to the server.
// setupDom first: sanitizeHtml binds DOMPurify to the global window at import time.
import './setupDom.mjs'

import assert from 'node:assert/strict'

import { linkifyHtml } from '../src/utils/linkify.tsx'
import { sanitizeHtml } from '../src/utils/sanitizeHtml.ts'
import {
  EMPTY_POST_STAND_IN,
  categoryOptionsForPost,
  creationStandIn,
  needsUpload,
  parsePostBlocks,
  plainBlockText,
  removedSavedMedia,
  sanitizeEditorHtml,
  serializePostBlocks,
  textContentForSearch,
} from '../src/pages/community/postEditorUtils.ts'

// ─── plainBlockText: an unformatted paragraph is still an HTML fragment ───────
// The editor escapes the text of every paragraph. With no tag in it, the block used to be
// rendered as plain text, so "Q&A" appeared on the page as "Q&amp;A".

assert.equal(plainBlockText('Q&amp;A 시간: a &lt; b 이면 R&amp;D 팀으로'), 'Q&A 시간: a < b 이면 R&D 팀으로')
assert.equal(plainBlockText('x &gt; 0 &quot;quoted&quot; it&#39;s'), 'x > 0 "quoted" it\'s')
assert.equal(plainBlockText('a&nbsp;b'), 'a b')
// Decoded once: text that literally reads "&lt;" is stored as "&amp;lt;".
assert.equal(plainBlockText('HTML에서 &amp;lt; 는 꺾쇠'), 'HTML에서 &lt; 는 꺾쇠')
assert.equal(plainBlockText('특수문자 없는 문장'), '특수문자 없는 문장')

// Text that was saved verbatim (before the block editor, or by another client) is left alone.
// It is recognisable because an HTML fragment cannot contain these characters unescaped.
for (const verbatim of [
  'a < b 인데 &lt; 라고도 씀',
  'x > y &amp; z',
  '첫 줄 &amp;\n둘째 줄',
  'Tom & Jerry &amp; friends',
  'AT&T',
  '100% &',
]) {
  assert.equal(plainBlockText(verbatim), verbatim, `${JSON.stringify(verbatim)} must stay verbatim`)
}
assert.equal(plainBlockText(''), '')
assert.equal(plainBlockText(null), '')

// Search text and previews follow the same reading.
assert.equal(textContentForSearch('Q&amp;A'), 'Q&A')
assert.equal(textContentForSearch('<strong>굵게</strong> &amp; 보통'), '굵게 & 보통')

// ─── sanitizeHtml keeps the code people post ─────────────────────────────────
// SAFE_FOR_TEMPLATES blanked every `${...}` / `{{...}}` / `<%...%>` out of the text.

assert.equal(
  sanitizeEditorHtml('return <code>${name}</code> + {{x}};<br>&lt;%= y %&gt;'),
  'return <code>${name}</code> + {{x}};<br>&lt;%= y %&gt;',
)
assert.equal(
  sanitizeHtml('<pre><code class="language-js">const s = `${a} and ${b}`</code></pre>', { profile: 'richText' }),
  '<pre><code class="language-js">const s = `${a} and ${b}`</code></pre>',
)
assert.equal(sanitizeHtml('<p>{{ user.name }} 님</p>', { profile: 'richText' }), '<p>{{ user.name }} 님</p>')
// …and still removes what it is there to remove.
assert.equal(sanitizeEditorHtml('${a}<img src=x onerror=alert(1)>'), '${a}')
assert.equal(sanitizeHtml('${a}<script>alert(1)</script>{{b}}', { profile: 'richText' }), '${a}{{b}}')
assert.equal(sanitizeEditorHtml('<a href="javascript:alert(1)">${x}</a>'), '<a>${x}</a>')
assert.equal(sanitizeEditorHtml('<span onclick="alert(1)" style="color:red">{{x}}</span>'), '<span style="color: red">{{x}}</span>')

// ─── linkifyHtml: addresses inside formatted text become links ───────────────

assert.equal(
  linkifyHtml('둘째 줄 https://example.com/docs 참고<br>끝.'),
  '둘째 줄 <a href="https://example.com/docs" target="_blank" rel="noopener noreferrer">https://example.com/docs</a> 참고<br>끝.',
)
// Sentence punctuation stays outside the link, as in linkify().
assert.equal(
  linkifyHtml('<strong>공지</strong>는 https://coms.kw.ac.kr/notices.'),
  '<strong>공지</strong>는 <a href="https://coms.kw.ac.kr/notices" target="_blank" rel="noopener noreferrer">https://coms.kw.ac.kr/notices</a>.',
)
// Query strings survive the round trip through the DOM serialiser.
assert.ok(linkifyHtml('<em>x</em> https://a.example/?q=1&amp;r=2 y').includes('href="https://a.example/?q=1&amp;r=2"'))
// Already a link, or code: untouched.
const linked = '<a href="https://a.example/" target="_blank" rel="noopener noreferrer">https://a.example/</a>'
assert.equal(linkifyHtml(linked), linked)
assert.equal(linkifyHtml('<code>curl https://a.example/</code>'), '<code>curl https://a.example/</code>')
assert.equal(
  linkifyHtml('<pre><code>fetch("https://a.example/")</code></pre>'),
  '<pre><code>fetch("https://a.example/")</code></pre>',
)
// Nothing that looks like a link: returned as given.
assert.equal(linkifyHtml('<strong>굵게</strong> 보통'), '<strong>굵게</strong> 보통')
assert.equal(linkifyHtml(''), '')
// It only ever adds http(s) anchors around text; it never turns text into markup.
assert.equal(
  linkifyHtml('a &lt;img src=x onerror=alert(1)&gt; https://ok.example/ b'),
  'a &lt;img src=x onerror=alert(1)&gt; <a href="https://ok.example/" target="_blank" rel="noopener noreferrer">https://ok.example/</a> b',
)

// ─── parsePostBlocks keeps a poll's deadline and closure ──────────────────────

const pollPost = {
  content: JSON.stringify([
    { type: 'text', content: '본문' },
    { type: 'poll', pollId: 'poll-1', question: '점심?', options: [{ label: 'A' }, { label: 'B' }], closesAt: '2026-10-12T09:00', closedAt: '2026-10-11T08:00:00' },
    { type: 'poll', pollId: 'poll-2', question: '저녁?', options: [{ label: 'A' }, { label: 'B' }] },
  ]),
}
const [, timedPoll, openPoll] = parsePostBlocks(pollPost)
assert.equal(timedPoll.closesAt, '2026-10-12T09:00')
assert.equal(timedPoll.closedAt, '2026-10-11T08:00:00')
assert.ok(!('closesAt' in openPoll) && !('closedAt' in openPoll), 'a poll without a deadline gains none')

// Opening a post and saving it unchanged sends the same poll back.
const roundTripped = JSON.parse(serializePostBlocks(parsePostBlocks(pollPost)))
assert.deepEqual(roundTripped[1], {
  type: 'poll', pollId: 'poll-1', question: '점심?', options: [{ label: 'A' }, { label: 'B' }], closesAt: '2026-10-12T09:00', closedAt: '2026-10-11T08:00:00',
})

// ─── serializePostBlocks ─────────────────────────────────────────────────────

const serialized = JSON.parse(serializePostBlocks([
  { type: 'text', content: 'hi', id: 'blk-1' },
  { type: 'image', mediaId: 7, name: 'a.webp', width: 50, align: 'left', status: 'saved', url: '/x', id: 'blk-2' },
  { type: 'image', file: {}, name: 'pending.png', status: 'pending', id: 'blk-3' },
  { type: 'file', fileId: 3, name: 'a.zip', status: 'saved' },
  { type: 'externalEmbed', provider: 'external', kind: 'link', url: 'https://a.example/', title: 'T', description: 'D', image: 'https://a.example/i.png', siteName: 'Example', embedUrl: 'https://evil.example/' },
  { type: 'externalEmbed', provider: 'youtube', kind: 'youtube', url: 'https://youtu.be/x', embedUrl: 'https://www.youtube.com/embed/x', title: 'V', thumbnailUrl: 'https://i.ytimg.com/x.jpg' },
  { type: 'unknown' },
]))
assert.deepEqual(serialized.map((block) => block.type), ['text', 'image', 'file', 'externalEmbed', 'externalEmbed'])
assert.deepEqual(serialized[0], { type: 'text', content: 'hi' }, 'editor-only fields are not stored')
assert.deepEqual(serialized[1], { type: 'image', mediaId: 7, name: 'a.webp', width: 50, align: 'left' })
// A link card keeps its preview (it used to come back from a save as a bare title) and never
// carries an embed address.
assert.deepEqual(serialized[3], {
  type: 'externalEmbed', provider: 'external', kind: 'link', url: 'https://a.example/', title: 'T',
  description: 'D', image: 'https://a.example/i.png', siteName: 'Example', width: 75, align: 'center',
})
assert.equal(serialized[4].embedUrl, 'https://www.youtube.com/embed/x')

assert.equal(needsUpload({ type: 'image', file: {}, status: 'pending' }), true)
assert.equal(needsUpload({ type: 'image', file: {}, status: 'saved', mediaId: 1 }), false)
assert.equal(needsUpload({ type: 'text', content: 'x' }), false)
assert.equal(needsUpload({ type: 'poll' }), false)

// ─── creationStandIn: the body a post has while its media uploads ────────────
// It must equal what the server derives from the first text block of the completed post
// (CommunityTextService.stripHtml, compared ignoring whitespace), or the post is published
// already marked as edited.

assert.equal(creationStandIn([{ type: 'text', content: '구조 분리 테스트 본문' }, { type: 'file', file: {} }]), '구조 분리 테스트 본문')
// Formatting is dropped, a line break is a newline, entities are decoded — as the server does.
assert.equal(creationStandIn([{ type: 'text', content: '<strong>첫 줄</strong><br>둘째 줄 Q&amp;A&nbsp;끝' }]), '첫 줄\n둘째 줄 Q&A 끝')
// The first text block is the one the server compares, even when media comes before it.
assert.equal(creationStandIn([{ type: 'image', file: {} }, { type: 'text', content: '사진 설명' }]), '사진 설명')
// Nothing to stand in with, or text that a plain body would have refused as markup.
assert.equal(EMPTY_POST_STAND_IN, '...')
assert.equal(creationStandIn([{ type: 'image', file: {} }]), '...')
assert.equal(creationStandIn([{ type: 'text', content: '   ' }, { type: 'text', content: '둘째 블록' }]), '...')
assert.equal(creationStandIn([{ type: 'text', content: 'if (a &lt; b) return' }]), '...')
assert.equal(creationStandIn(null), '...')
// Text that reads "&quot;" on the page is stored as "&amp;quot;". Each entity is undone once:
// undoing the ampersand first used to turn it into a quotation mark.
assert.equal(creationStandIn([{ type: 'text', content: 'HTML 에서는 &amp;quot; 와 &amp;#39; 를 씁니다 &quot;이렇게&quot;' }]), 'HTML 에서는 &quot; 와 &#39; 를 씁니다 "이렇게"')
// Tags are taken out until none is left.
assert.equal(creationStandIn([{ type: 'text', content: '<span style="color:#ff0000"><b>겹친</b> 서식</span> 문장' }]), '겹친 서식 문장')

// ─── removedSavedMedia ───────────────────────────────────────────────────────

const before = [
  { type: 'text', content: 'x' },
  { type: 'image', mediaId: 1 },
  { type: 'image', mediaId: 2 },
  { type: 'video', mediaId: 2 },
  { type: 'file', fileId: 5 },
  { type: 'image', legacy: true, url: '/api/community/posts/1/image' },
]
assert.deepEqual(removedSavedMedia(before, before), [], 'saving unchanged deletes nothing')
assert.deepEqual(
  removedSavedMedia(before, [{ type: 'image', mediaId: 2 }, { type: 'image', mediaId: 9, status: 'saved' }]),
  [{ type: 'image', id: 1 }, { type: 'video', id: 2 }, { type: 'file', id: 5 }],
  'ids are per type: image 2 stays although video 2 goes; the legacy cover has no id and is not listed',
)
assert.deepEqual(removedSavedMedia([{ type: 'image', mediaId: 1 }, { type: 'image', mediaId: 1 }], []), [{ type: 'image', id: 1 }])
assert.deepEqual(removedSavedMedia(null, null), [])

// ─── categoryOptionsForPost: a post stays on its side of the anonymous boundary ─

const all = [
  { value: 'GENERAL', label: '일반' },
  { value: 'QUESTION', label: '질문' },
  { value: 'INFO', label: '정보' },
  { value: 'ANONYMOUS', label: '익명' },
]
assert.deepEqual(categoryOptionsForPost(all, undefined), all, 'a new post may go anywhere')
assert.deepEqual(categoryOptionsForPost(all, 'QUESTION').map((item) => item.value), ['GENERAL', 'QUESTION', 'INFO'])
assert.deepEqual(categoryOptionsForPost(all, 'ANONYMOUS').map((item) => item.value), ['ANONYMOUS'])
// An editor who is not offered the anonymous board can still save an anonymous post in place.
assert.deepEqual(categoryOptionsForPost(all.slice(0, 3), 'ANONYMOUS').map((item) => item.value), ['ANONYMOUS'])

console.log('post body rendering contract passed')
