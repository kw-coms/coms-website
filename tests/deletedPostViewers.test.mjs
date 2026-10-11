// The moderators' views of a deleted post read the same stored body as the board does, so an
// unformatted paragraph has to come out the same way: the editor writes "Q&A" as "Q&amp;A", and
// these views used to print the entity as it stood.
// setupDom MUST come first: react-dom/client and DOMPurify need window/document on globalThis.
import './setupDom.mjs'
import assert from 'node:assert/strict'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import DeletedPostBody from '../src/pages/admin/DeletedPostBody.tsx'
import DeletedPostEvidence from '../src/pages/admin/DeletedPostEvidence.tsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

async function render(component, post) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(h(component, { post })) })
  const result = { text: container.textContent, html: container.innerHTML }
  await act(async () => { root.unmount() })
  container.remove()
  return result
}

const post = (blocks) => ({
  id: 1,
  title: '삭제된 글',
  content: JSON.stringify(blocks),
  imageInfos: [],
  videoInfos: [],
  fileInfos: [],
  commentInfos: [],
})

for (const [name, component] of [['DeletedPostBody', DeletedPostBody], ['DeletedPostEvidence', DeletedPostEvidence]]) {
  // An unformatted paragraph, as the block editor stores it.
  {
    const view = await render(component, post([{ type: 'text', content: 'Q&amp;A: a &lt; b &quot;인용&quot;' }]))
    assert.ok(view.text.includes('Q&A: a < b "인용"'), `${name} decodes the editor's entities`)
    assert.ok(!view.text.includes('&amp;'), `${name} does not print the entity itself`)
  }

  // Text from before the block editor (or another client) is verbatim and must stay that way.
  {
    const view = await render(component, post([{ type: 'text', content: 'if (a < b && c > d) return &amp;' }]))
    assert.ok(view.text.includes('if (a < b && c > d) return &amp;'), `${name} leaves verbatim text alone`)
  }

  // Decoded text is still text: it never becomes markup.
  {
    const view = await render(component, post([{ type: 'text', content: '&lt;img src=x onerror=alert(1)&gt;' }]))
    assert.ok(view.text.includes('<img src=x onerror=alert(1)>'), `${name} shows the tag as text`)
    assert.ok(!/<img[^>]*onerror/i.test(view.html), `${name} creates no element from it`)
  }

  // A formatted paragraph keeps going through the sanitizer.
  {
    const view = await render(component, post([{ type: 'text', content: '<b>굵게</b> Q&amp;A<script>alert(1)</script>' }]))
    assert.ok(view.text.includes('굵게 Q&A'), `${name} renders formatted text`)
    assert.ok(!view.html.includes('<script'), `${name} drops the script element`)
  }
}

console.log('deleted post viewers passed')
