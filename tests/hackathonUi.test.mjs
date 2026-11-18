import './setupDom.mjs'
import { registerHooks } from 'node:module'
import assert from 'node:assert/strict'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../src/contexts/useAuth.ts'

registerHooks({ load(url, context, next) { return url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context) } })
const { default: Hackathon } = await import('../src/pages/Hackathon.tsx')
const { default: AdminHackathon } = await import('../src/pages/admin/AdminHackathon.tsx')
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let open = true
let responseStatus = 201
const submitted = []
const adminReviews = []
let clipboardText = ''
globalThis.fetch = async (url, options = {}) => {
  if (String(url).endsWith('/api/admin/hackathon/reviews')) return Response.json(adminReviews)
  if (String(url).endsWith('/api/admin/hackathon/settings')) { open = JSON.parse(options.body).open; return Response.json({ open }) }
  if (String(url).includes('/api/admin/hackathon/chair-reviews/')) {
    const review = { ...JSON.parse(options.body), id: 2, projectId: 'wargether', chair: true, generation: null, name: '회장' }
    adminReviews.push(review)
    return Response.json(review)
  }
  if (String(url).endsWith('/api/hackathon')) return Response.json({ open })
  assert.ok(String(url).endsWith('/api/hackathon/reviews'), 'guest flow only asks for public API')
  submitted.push(JSON.parse(options.body))
  return Response.json(responseStatus === 201 ? { projectId: 'wargether' } : { message: '이미 평가를 제출했습니다.' }, { status: responseStatus })
}
const host = document.createElement('div')
document.body.append(host)
const root = createRoot(host)
let queryClient
async function render(key) {
  const previousClient = queryClient
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(h(MemoryRouter, { initialEntries: ['/hackathon'] }, h(QueryClientProvider, { client: queryClient }, h(AuthContext.Provider, { value: { user: null } }, h(Hackathon, { key })))))
    await new Promise(setImmediate)
  })
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
  previousClient?.clear()
}
const input = async (element, value) => act(async () => {
  const proto = element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value)
  element.dispatchEvent(new window.Event('input', { bubbles: true }))
})
async function identify() { await input(host.querySelector('input[inputmode="numeric"]'), '042'); await input(host.querySelector('input[autocomplete="name"]'), '홍길동') }
async function score(form) {
  for (const select of form.querySelectorAll('select')) await act(async () => { select.value = '20'; select.dispatchEvent(new window.Event('change', { bubbles: true })) })
}
await render('first')
assert.equal(host.querySelectorAll('video[preload="none"]').length, 3, 'large videos are not automatically downloaded')
assert.equal(host.querySelector('form button[type="submit"]').disabled, true)
Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('clipboard unavailable') } } })
await act(async () => { [...host.querySelectorAll('button')].find((button) => button.textContent.includes('평가 링크 복사')).click() })
assert.match(host.querySelector('[role="alert"]').textContent, /자동 복사가 지원되지 않습니다.*https:\/\/coms.kw.ac.kr\/hackathon/)
await identify()
const form = host.querySelector('form[aria-label="wargether 채점"]')
await score(form)
await input(form.querySelector('textarea'), '좋은 연결 아이디어입니다.')
assert.equal(form.querySelector('button[type="submit"]').disabled, false)
await act(async () => { form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await new Promise(setImmediate) })
assert.equal(submitted.length, 1)
assert.equal(submitted[0].generation, 42)
assert.equal(submitted[0].name, '홍길동')
assert.equal(submitted[0].themeFit, 20)
assert.equal(submitted[0].feedback, '좋은 연결 아이디어입니다.')
assert.match(host.querySelector('#wargether').textContent, /평가가 접수되었습니다/)
assert.equal(host.querySelectorAll('form').length, 2, 'other teams remain available after first evaluation')

responseStatus = 409
await render('reload')
await identify()
const duplicateForm = host.querySelector('form')
await score(duplicateForm)
await act(async () => { duplicateForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await new Promise(setImmediate) })
assert.match(host.querySelector('[role="alert"]').textContent, /이미 평가/)
assert.equal(duplicateForm.querySelector('select').value, '20', 'failed request preserves the draft')

open = false
await render('closed')
await identify()
assert.match(host.textContent, /평가가 마감되었습니다/)
assert.ok([...host.querySelectorAll('form button[type="submit"]')].every((button) => button.disabled))

adminReviews.push({ ...submitted[0], id: 1, chair: false })
Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { clipboardText = text } } })
const previousClient = queryClient
queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
await act(async () => {
  root.render(h(MemoryRouter, null, h(QueryClientProvider, { client: queryClient }, h(AdminHackathon))))
  await new Promise(setImmediate)
})
await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
previousClient.clear()
assert.match(host.textContent, /42기 홍길동/)
const chairForm = host.querySelector('form[aria-label="chair-wargether 채점"]')
await score(chairForm)
await act(async () => { chairForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await new Promise((resolve) => setTimeout(resolve, 10)) })
assert.match(host.querySelector('tbody').textContent, /100.00점/)
await act(async () => { [...host.querySelectorAll('button')].find((button) => button.textContent.includes('팀에 전달할 피드백 복사')).click() })
assert.match(clipboardText, /좋은 연결 아이디어입니다/)
assert.doesNotMatch(clipboardText, /홍길동|42기/, 'forwarded feedback excludes evaluator identity')
await act(async () => { [...host.querySelectorAll('button')].find((button) => button.textContent === '평가 다시 열기').click(); await new Promise((resolve) => setTimeout(resolve, 10)) })
assert.equal(open, true)
assert.match(host.textContent, /평가 접수 중/)
await act(async () => root.unmount())
queryClient.clear()
host.remove()
console.log('hackathon UI: guest submission, identity, receipt, duplicate retry, closure, chair scoring and private feedback copy passed')
