import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import { Color } from '@tiptap/extension-color'
import { BackgroundColor, FontFamily, TextStyle } from '@tiptap/extension-text-style'
import { isSafeUrl } from '../src/utils/sanitizeHtml.ts'
import { EmbedBlock, FileBlock, ImageBlock, PollBlock, VideoBlock } from '../src/pages/community/tiptapFigureNodes.tsx'
import {
  blockJsonToPmDoc,
  pmDocToBlockJson,
} from '../src/pages/community/tiptapBlockConverters.ts'
import { EDITOR_SANITIZE_OPTIONS } from '../src/pages/community/postEditorUtils.ts'

const realPostBlockFixtures = JSON.parse(
  readFileSync(new URL('./fixtures/communityRealPostBlocks.json', import.meta.url), 'utf8'),
)

function assertRoundTrip(name, blocks) {
  assert.deepEqual(pmDocToBlockJson(blockJsonToPmDoc(blocks)), blocks, name)
}

function createHeadlessCommunityEditor(blocks) {
  return new Editor({
    element: null,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        horizontalRule: false,
      }),
      TextStyle,
      Color.configure({ types: ['textStyle'] }),
      BackgroundColor.configure({ types: ['textStyle'] }),
      FontFamily.configure({ types: ['textStyle'] }),
      Underline,
      FileBlock,
      ImageBlock,
      VideoBlock,
      EmbedBlock,
      PollBlock,
      Link.configure({
        autolink: false,
        linkOnPaste: false,
        openOnClick: false,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
        isAllowedUri: (url) => isSafeUrl(url),
      }),
    ],
    content: blockJsonToPmDoc(blocks),
  })
}

const plainTextBlocks = [
  { type: 'text', content: '공지 본문입니다' },
]

assert.deepEqual(blockJsonToPmDoc(plainTextBlocks), {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '공지 본문입니다' },
      ],
    },
  ],
})
assert.deepEqual(pmDocToBlockJson(blockJsonToPmDoc(plainTextBlocks)), plainTextBlocks)

const lineBreakBlocks = [
  { type: 'text', content: '첫 줄<br>둘째 줄<br>셋째 줄' },
]

assert.deepEqual(blockJsonToPmDoc(lineBreakBlocks), {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '첫 줄' },
        { type: 'hardBreak' },
        { type: 'text', text: '둘째 줄' },
        { type: 'hardBreak' },
        { type: 'text', text: '셋째 줄' },
      ],
    },
  ],
})
assert.deepEqual(pmDocToBlockJson(blockJsonToPmDoc(lineBreakBlocks)), lineBreakBlocks)

const markedTextBlocks = [
  {
    type: 'text',
    content: '<strong>굵게</strong> <em>기울임</em> <u>밑줄</u> <a href="https://example.com/post" target="_blank" rel="noopener noreferrer">링크</a> <span style="color: #123456; background-color: #fff3a3">색상</span>',
  },
]

assert.deepEqual(blockJsonToPmDoc(markedTextBlocks), {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '굵게', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' ' },
        { type: 'text', text: '기울임', marks: [{ type: 'italic' }] },
        { type: 'text', text: ' ' },
        { type: 'text', text: '밑줄', marks: [{ type: 'underline' }] },
        { type: 'text', text: ' ' },
        {
          type: 'text',
          text: '링크',
          marks: [{ type: 'link', attrs: { href: 'https://example.com/post', target: '_blank', rel: 'noopener noreferrer' } }],
        },
        { type: 'text', text: ' ' },
        {
          type: 'text',
          text: '색상',
          marks: [{ type: 'textStyle', attrs: { color: '#123456', backgroundColor: '#fff3a3' } }],
        },
      ],
    },
  ],
})
assert.deepEqual(pmDocToBlockJson(blockJsonToPmDoc(markedTextBlocks)), markedTextBlocks)

const escapedTextBlocks = [
  { type: 'text', content: '1 &lt; 2 &amp;&amp; 3 &gt; 2' },
]

assert.deepEqual(blockJsonToPmDoc(escapedTextBlocks), {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '1 < 2 && 3 > 2' },
      ],
    },
  ],
})
assert.deepEqual(pmDocToBlockJson(blockJsonToPmDoc(escapedTextBlocks)), escapedTextBlocks)

const codeTextBlocks = [
  { type: 'text', content: '<pre><code class="language-js">const ok = 1 &amp;&amp; 2;</code></pre>' },
]

assert.deepEqual(blockJsonToPmDoc(codeTextBlocks), {
  type: 'doc',
  content: [
    {
      type: 'codeBlock',
      attrs: { language: 'js' },
      content: [
        { type: 'text', text: 'const ok = 1 && 2;' },
      ],
    },
  ],
})
assert.deepEqual(pmDocToBlockJson(blockJsonToPmDoc(codeTextBlocks)), codeTextBlocks)

const fileBlocks = [
  { type: 'text', content: '첨부 확인' },
  { type: 'file', fileId: 42, name: '과제.zip' },
]

assert.deepEqual(blockJsonToPmDoc(fileBlocks), {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '첨부 확인' },
      ],
    },
    {
      type: 'fileBlock',
      attrs: {
        presentFields: ['fileId', 'name'],
        fileId: 42,
        name: '과제.zip',
      },
    },
  ],
})
assert.deepEqual(pmDocToBlockJson(blockJsonToPmDoc(fileBlocks)), fileBlocks)

const imageBlocks = [
  { type: 'text', content: '사진' },
  { type: 'image', mediaId: 7, name: '활동.png', width: 55, align: 'left' },
]

assert.deepEqual(blockJsonToPmDoc(imageBlocks), {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '사진' },
      ],
    },
    {
      type: 'imageBlock',
      attrs: {
        presentFields: ['mediaId', 'name', 'width', 'align'],
        mediaId: 7,
        name: '활동.png',
        width: 55,
        align: 'left',
      },
    },
  ],
})
assert.deepEqual(pmDocToBlockJson(blockJsonToPmDoc(imageBlocks)), imageBlocks)

const videoBlocks = [
  { type: 'video', mediaId: 8, name: '발표.mp4', width: 75, align: 'center' },
]

assert.deepEqual(blockJsonToPmDoc(videoBlocks), {
  type: 'doc',
  content: [
    {
      type: 'videoBlock',
      attrs: {
        presentFields: ['mediaId', 'name', 'width', 'align'],
        mediaId: 8,
        name: '발표.mp4',
        width: 75,
        align: 'center',
      },
    },
  ],
})
assert.deepEqual(pmDocToBlockJson(blockJsonToPmDoc(videoBlocks)), videoBlocks)

const embedBlocks = [
  {
    type: 'externalEmbed',
    provider: 'youtube',
    kind: 'youtube',
    url: 'https://www.youtube.com/watch?v=abcdef123',
    embedUrl: 'https://www.youtube.com/embed/abcdef123',
    title: '소개 영상',
    thumbnailUrl: 'https://img.youtube.com/vi/abcdef123/0.jpg',
    width: 75,
    align: 'center',
  },
  {
    type: 'externalEmbed',
    provider: 'external',
    kind: 'link',
    url: 'https://example.com/post',
    title: 'example.com',
    width: 60,
    align: 'right',
  },
]

assert.deepEqual(blockJsonToPmDoc(embedBlocks), {
  type: 'doc',
  content: [
    {
      type: 'embedBlock',
      attrs: {
        presentFields: ['provider', 'kind', 'url', 'embedUrl', 'title', 'thumbnailUrl', 'width', 'align'],
        provider: 'youtube',
        kind: 'youtube',
        url: 'https://www.youtube.com/watch?v=abcdef123',
        embedUrl: 'https://www.youtube.com/embed/abcdef123',
        title: '소개 영상',
        thumbnailUrl: 'https://img.youtube.com/vi/abcdef123/0.jpg',
        width: 75,
        align: 'center',
      },
    },
    {
      type: 'embedBlock',
      attrs: {
        presentFields: ['provider', 'kind', 'url', 'title', 'width', 'align'],
        provider: 'external',
        kind: 'link',
        url: 'https://example.com/post',
        title: 'example.com',
        width: 60,
        align: 'right',
      },
    },
  ],
})
assert.deepEqual(pmDocToBlockJson(blockJsonToPmDoc(embedBlocks)), embedBlocks)

const pollBlocks = [
  {
    type: 'poll',
    pollId: 'poll-abc',
    question: '점심 메뉴?',
    options: [
      { label: '김밥', imageUrl: '' },
      { label: '라면', imageUrl: 'https://example.com/ramen.png' },
    ],
    closesAt: '2026-07-01T12:00',
  },
]

assert.deepEqual(blockJsonToPmDoc(pollBlocks), {
  type: 'doc',
  content: [
    {
      type: 'pollBlock',
      attrs: {
        presentFields: ['pollId', 'question', 'options', 'closesAt'],
        pollId: 'poll-abc',
        question: '점심 메뉴?',
        options: [
          { label: '김밥', imageUrl: '' },
          { label: '라면', imageUrl: 'https://example.com/ramen.png' },
        ],
        closesAt: '2026-07-01T12:00',
      },
    },
  ],
})
assert.deepEqual(pmDocToBlockJson(blockJsonToPmDoc(pollBlocks)), pollBlocks)

const legacyImageBlocks = [
  { type: 'text', content: '기존 대표 이미지 포함' },
  {
    type: 'image',
    status: 'saved',
    legacy: true,
    name: 'legacy-cover.png',
    url: '/api/community/posts/123/image',
    width: 'large',
    align: 'center',
  },
]
assertRoundTrip('legacy image blocks preserve status/url/legacy metadata', legacyImageBlocks)

const numericPollBlocks = [
  {
    type: 'poll',
    pollId: 101,
    question: '다음 세미나 시간?',
    options: [
      { label: '오후 2시', imageUrl: '' },
      { label: '오후 4시', imageUrl: 'https://example.com/slot.png' },
    ],
    closesAt: null,
    closedAt: null,
  },
]
assertRoundTrip('poll blocks preserve numeric pollId and null close timestamps', numericPollBlocks)

const externalEmbedWithAllOptionalFields = [
  {
    type: 'externalEmbed',
    provider: 'external',
    kind: 'link',
    url: 'https://example.com/article',
    embedUrl: 'https://example.com/embed/article',
    title: 'Example article',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    description: '요약 설명',
    image: 'https://example.com/cover.jpg',
    siteName: 'Example',
    width: 60,
    align: 'left',
  },
]
assertRoundTrip('externalEmbed blocks preserve every optional field when present', externalEmbedWithAllOptionalFields)

const externalEmbedWithNullableOptionalFields = [
  {
    type: 'externalEmbed',
    provider: 'external',
    kind: 'link',
    url: 'https://example.com/minimal',
    embedUrl: null,
    title: null,
    thumbnailUrl: null,
    description: null,
    image: null,
    siteName: null,
    width: 75,
    align: 'center',
  },
]
assertRoundTrip('externalEmbed blocks preserve nullable optional fields when present', externalEmbedWithNullableOptionalFields)

const externalEmbedWithAbsentOptionalFields = [
  {
    type: 'externalEmbed',
    provider: 'external',
    kind: 'image',
    url: 'https://cdn.example.com/photo.webp',
    width: 100,
    align: 'right',
  },
]
assertRoundTrip('externalEmbed blocks preserve shape when optional fields are absent', externalEmbedWithAbsentOptionalFields)

const mixedMarkedTextAndCodeBlocks = [
  {
    type: 'text',
    content: '<strong>굵게</strong> <strong><em>중첩</em></strong> <code>const x = 1;</code><br><pre><code class="language-ts">const y: number = 2;</code></pre>',
  },
]
assertRoundTrip('text blocks preserve nested marks, inline code, and code blocks together', mixedMarkedTextAndCodeBlocks)

const interleavedBlocks = [
  { type: 'text', content: '<strong>시작</strong> 본문' },
  { type: 'image', mediaId: 77, name: '활동.png', width: 55, align: 'left' },
  {
    type: 'externalEmbed',
    provider: 'external',
    kind: 'link',
    url: 'https://example.com/notice',
    embedUrl: null,
    title: '공지 링크',
    thumbnailUrl: null,
    description: '미리보기 설명',
    image: null,
    siteName: 'example.com',
    width: 65,
    align: 'center',
  },
  {
    type: 'poll',
    pollId: 202,
    question: '뒤풀이 장소?',
    options: [{ label: '학생회관', imageUrl: '' }, { label: '정문 앞', imageUrl: '' }],
    closesAt: null,
    closedAt: null,
  },
  { type: 'video', mediaId: 88, name: '발표.mp4', width: 75, align: 'right' },
  { type: 'file', fileId: 99, name: '자료.zip' },
  { type: 'text', content: '<code>마무리</code><pre><code class="language-js">console.log("done")</code></pre>' },
]
assertRoundTrip('posts with 6+ interleaved block types preserve exact block JSON', interleavedBlocks)

// Converter-generated text HTML is intentionally a strict subset of
// EDITOR_SANITIZE_OPTIONS, so the save path does not need a second sanitizer pass.
const converterTextHtmlContract = {
  tags: ['a', 'br', 'code', 'em', 'pre', 'span', 'strong', 'u'],
  attrs: ['class', 'href', 'rel', 'style', 'target'],
  styles: ['background-color', 'color', 'font-family'],
}
for (const tag of converterTextHtmlContract.tags) {
  assert.ok(EDITOR_SANITIZE_OPTIONS.allowedTags.includes(tag), `converter tag <${tag}> must be editor-sanitizer allowed`)
}
for (const attr of converterTextHtmlContract.attrs) {
  assert.ok(EDITOR_SANITIZE_OPTIONS.allowedAttributes.includes(attr), `converter attr ${attr} must be editor-sanitizer allowed`)
}
for (const style of converterTextHtmlContract.styles) {
  assert.ok(EDITOR_SANITIZE_OPTIONS.allowedStyles.has(style), `converter style ${style} must be editor-sanitizer allowed`)
}

const sanitizerSubsetBlocks = pmDocToBlockJson({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '굵게', marks: [{ type: 'bold' }] },
        { type: 'hardBreak' },
        { type: 'text', text: '기울임', marks: [{ type: 'italic' }] },
        { type: 'text', text: '밑줄', marks: [{ type: 'underline' }] },
        { type: 'text', text: '코드', marks: [{ type: 'code' }] },
        {
          type: 'text',
          text: '링크',
          marks: [{ type: 'link', attrs: { href: 'https://example.com', target: '_blank', rel: 'noopener noreferrer' } }],
        },
        {
          type: 'text',
          text: '색상',
          marks: [{ type: 'textStyle', attrs: { color: '#123456', backgroundColor: '#fff3a3', fontFamily: 'Pretendard' } }],
        },
      ],
    },
    {
      type: 'codeBlock',
      attrs: { language: 'js' },
      content: [{ type: 'text', text: 'const ok = true;' }],
    },
  ],
})
assert.deepEqual(sanitizerSubsetBlocks, [
  {
    type: 'text',
    content: '<strong>굵게</strong><br><em>기울임</em><u>밑줄</u><code>코드</code><a href="https://example.com" target="_blank" rel="noopener noreferrer">링크</a><span style="color: #123456; background-color: #fff3a3; font-family: Pretendard">색상</span><pre><code class="language-js">const ok = true;</code></pre>',
  },
])

assert.ok(realPostBlockFixtures.length >= 10 && realPostBlockFixtures.length <= 20)
for (const fixture of realPostBlockFixtures) {
  assertRoundTrip(`production community post ${fixture.postId} round-trips saved block JSON`, fixture.blocks)
}

const editorWarnings = []
const originalWarn = console.warn
console.warn = (...args) => {
  editorWarnings.push(args.join(' '))
}
try {
  for (const fixture of realPostBlockFixtures) {
    const editor = createHeadlessCommunityEditor(fixture.blocks)
    try {
      assert.deepEqual(
        pmDocToBlockJson(editor.getJSON()),
        fixture.blocks,
        `headless TipTap editor.getJSON() preserves production post ${fixture.postId}`,
      )
    } finally {
      editor.destroy()
    }
  }
} finally {
  console.warn = originalWarn
}
assert.deepEqual(
  editorWarnings.filter((warning) => !warning.includes('Duplicate extension names')),
  [],
)

const pendingFile = { name: 'new.png', size: 100, type: 'image/png' }
assert.deepEqual(
  pmDocToBlockJson({
    type: 'doc',
    content: [
      {
        type: 'imageBlock',
        attrs: {
          blockId: 'blk-pending',
          status: 'pending',
          file: pendingFile,
          preview: 'blob:preview',
          name: 'new.png',
          width: 75,
          align: 'center',
        },
      },
    ],
  }),
  [
    {
      type: 'image',
      id: 'blk-pending',
      status: 'pending',
      file: pendingFile,
      preview: 'blob:preview',
      name: 'new.png',
      width: 75,
      align: 'center',
    },
  ],
)

// A live editor's editor.getJSON() serializes EVERY node attr, including defaults,
// unlike blockJsonToPmDoc which only sets present attrs. A saved, non-legacy image must
// not gain a phantom legacy:null or name:null when round-tripped through that path.
assert.deepEqual(
  pmDocToBlockJson({
    type: 'doc',
    content: [
      {
        type: 'imageBlock',
        attrs: { blockId: null, mediaId: 7, status: 'saved', file: null, name: null, url: null, preview: null, width: 75, align: 'center', legacy: null },
      },
    ],
  }),
  [
    { type: 'image', mediaId: 7, status: 'saved', width: 75, align: 'center' },
  ],
)

assert.throws(
  () => pmDocToBlockJson({ type: 'doc', content: [{ type: 'unknownBlock' }] }),
  /Unsupported node type for P1 converter: unknownBlock/,
)

// Legacy plain-text posts store raw \n. ProseMirror forbids newlines inside text
// nodes, so the converter must map them to hardBreaks or the editor silently
// drops every line break when such a post is edited.
const legacyNewlineBlocks = [
  { type: 'text', content: '첫 줄\n둘째 줄\n\n넷째 줄' },
]

assert.deepEqual(blockJsonToPmDoc(legacyNewlineBlocks), {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '첫 줄' },
        { type: 'hardBreak' },
        { type: 'text', text: '둘째 줄' },
        { type: 'hardBreak' },
        { type: 'hardBreak' },
        { type: 'text', text: '넷째 줄' },
      ],
    },
  ],
})

assert.deepEqual(pmDocToBlockJson(blockJsonToPmDoc(legacyNewlineBlocks)), [
  { type: 'text', content: '첫 줄<br>둘째 줄<br><br>넷째 줄' },
])

{
  const editor = createHeadlessCommunityEditor(legacyNewlineBlocks)
  assert.deepEqual(pmDocToBlockJson(editor.getJSON()), [
    { type: 'text', content: '첫 줄<br>둘째 줄<br><br>넷째 줄' },
  ], 'real editor round trip keeps legacy newlines')
  editor.destroy()
}

console.log('tiptap block converter golden tests passed')
