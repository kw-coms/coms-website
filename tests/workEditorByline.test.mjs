import './setupDom.mjs'

import assert from 'node:assert/strict'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import WorkEditor from '../src/components/home/WorkEditor.tsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const calls = []
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), ...options })
  if (String(url).endsWith('/api/club-projects') && options.method === 'POST') return Response.json({ id: 7 }, { status: 201 })
  if (String(url).endsWith('/api/club-projects/7') && options.method === 'PATCH') return Response.json({ id: 7 })
  throw new Error(`Unexpected request: ${url}`)
}

const host = document.createElement('div')
document.body.append(host)
const root = createRoot(host)
let saves = 0
await act(async () => root.render(h(WorkEditor, {
  categories: [{ key: 'WEBSITE', name: '웹사이트' }],
  onSaved: async () => { if (++saves === 1) throw new Error('목록 갱신 실패') },
  onCancel: () => {},
})))
assert.equal(host.querySelector('#work-made-by').placeholder, '작품에 표시할 이름', 'create copy does not promise a manager an account-name default')

async function setInput(id, value) {
  const input = host.querySelector(id)
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  await act(async () => { setter.call(input, value); input.dispatchEvent(new window.Event('input', { bubbles: true })) })
}
async function submit() {
  await act(async () => {
    host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
    await new Promise(setImmediate)
  })
}

await setInput('input[required]', '공동 작품')
await setInput('#work-made-by', '팀A')
await submit()
assert.equal(calls.length, 1)
assert.equal(calls[0].body.get('madeBy'), '팀A')
assert.match(host.textContent, /목록 갱신 실패/, 'a failed post-save refresh keeps the editor and its draft')
assert.equal(host.querySelector('#work-made-by').placeholder, '비우면 제작자 표시를 지워요')

await setInput('#work-made-by', '')
await submit()
assert.equal(calls.length, 2)
assert.equal(calls[1].method, 'PATCH', 'retry updates the already-created work')
assert.equal(calls[1].body.get('madeBy'), '', 'clearing a creator on retry is an explicit update')

await act(async () => root.unmount())
host.remove()
console.log('work editor byline retry tests passed')
