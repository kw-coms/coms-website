import './setupDom.mjs'
import { registerHooks } from 'node:module'
import assert from 'node:assert/strict'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from '../src/contexts/useAuth.ts'
import { ConfirmHost } from '../src/components/common/ConfirmDialog.tsx'
import { legacyEvent, summary, adminSummary } from './hackathonFixture.mjs'

registerHooks({ load(url, context, next) { return url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context) } })
const { default: Hackathon } = await import('../src/pages/Hackathon.tsx')
const { default: AdminHackathon } = await import('../src/pages/admin/AdminHackathon.tsx')
globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0)
globalThis.cancelAnimationFrame = clearTimeout
let open = true
let responseStatus = 201
const submitted = []
const adminReviews = []
let clipboardText = ''
const deleted = []
let deleteFails = false
globalThis.fetch = async (url, options = {}) => {
  if (String(url).includes('/api/admin/hackathon/events/1/reviews/') && options.method === 'DELETE') {
    const id = Number(String(url).split('/').at(-1))
    deleted.push(id)
    if (deleteFails) return Response.json({ message: '삭제 실패' }, { status: 500 })
    adminReviews.splice(adminReviews.findIndex((review) => review.id === id), 1)
    return new Response(null, { status: 204 })
  }
  if (String(url).endsWith('/api/admin/hackathon/events')) return Response.json([adminSummary(legacyEvent)])
  if (String(url).endsWith('/api/admin/hackathon/events/1')) return Response.json({ ...legacyEvent, open, status: open ? 'REVIEWING' : 'DONE' })
  if (String(url).endsWith('/api/admin/hackathon/events/1/reviews')) return Response.json(adminReviews)
  if (String(url).endsWith('/api/admin/hackathon/events/1/settings')) { open = JSON.parse(options.body).open; return Response.json({ open }) }
  if (String(url).includes('/api/admin/hackathon/events/1/chair-reviews/')) {
    const review = { ...JSON.parse(options.body), id: 2, projectId: 'wargether', chair: true, generation: null, name: '회장' }
    adminReviews.push(review)
    return Response.json(review)
  }
  if (String(url).endsWith('/api/hackathon/events')) return Response.json([summary(legacyEvent)])
  if (String(url).endsWith('/api/hackathon/events/1')) return Response.json({ ...legacyEvent, open, status: open ? 'REVIEWING' : 'DONE' })
  assert.ok(String(url).endsWith('/api/hackathon/events/1/reviews'), 'guest flow only asks for public API')
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
    root.render(h(MemoryRouter, { initialEntries: ['/hackathon/1'] }, h(QueryClientProvider, { client: queryClient }, h(AuthContext.Provider, { value: { user: null } }, h(Routes, null, h(Route, { path: '/hackathon/:eventId', element: h(Hackathon, { key }) }))))))
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
assert.match(host.querySelector('[role="alert"]').textContent, /자동 복사가 지원되지 않습니다.*https:\/\/coms.kw.ac.kr\/hackathon\/1\/share/)
assert.equal(host.querySelector('[role="alert"] a').getAttribute('href'), '/hackathon/1/share', 'shared entry refreshes old service workers before evaluation')
Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { clipboardText = text } } })
await act(async () => { [...host.querySelectorAll('button')].find((button) => button.textContent.includes('평가 링크 복사')).click() })
assert.equal(clipboardText, 'https://coms.kw.ac.kr/hackathon/1/share')
assert.equal(host.querySelector('[role="alert"]'), null)
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
assert.match(host.textContent, /평가가 마감되었습니다/)
assert.equal(host.querySelectorAll('form').length, 0, 'closing evaluation removes the review form but keeps the projects')
assert.equal(host.querySelectorAll('article.hackathon-project').length, 3)

adminReviews.push({ ...submitted[0], id: 1, chair: false })
Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { clipboardText = text } } })
const previousClient = queryClient
queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
await act(async () => {
  root.render(h(MemoryRouter, null, h(QueryClientProvider, { client: queryClient }, h(AdminHackathon), h(ConfirmHost))))
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
const deleteAlumni = () => host.querySelector('button[aria-label="42기 홍길동 평가 삭제"]')
assert.ok(deleteAlumni(), 'chair can delete an individual alumni evaluation')
await act(async () => deleteAlumni().click())
assert.match(document.querySelector('.coms-confirm-message').textContent, /wargether.*42기 홍길동/)
assert.equal(deleted.length, 0, 'opening confirmation does not delete data')
await act(async () => document.querySelector('.coms-confirm-cancel').click())
assert.equal(deleted.length, 0, 'cancel preserves the evaluation')
deleteFails = true
await act(async () => deleteAlumni().click())
await act(async () => { document.querySelector('.coms-confirm-ok').click(); await new Promise((resolve) => setTimeout(resolve, 10)) })
assert.ok(host.querySelector('[role="alert"]'), 'failed deletion is visible')
assert.match(host.textContent, /42기 홍길동/, 'failed deletion keeps the review')
deleteFails = false
await act(async () => deleteAlumni().click())
await act(async () => { document.querySelector('.coms-confirm-ok').click(); await new Promise((resolve) => setTimeout(resolve, 10)) })
assert.deepEqual(deleted, [1, 1], 'retry uses the same review ID')
assert.equal(deleteAlumni(), null)
assert.equal(host.querySelector('tbody tr').children[2].textContent, '0명')
assert.equal(host.querySelector('tbody tr').children[3].textContent, '미집계', 'deleted scores leave the average')
const deleteChair = host.querySelector('button[aria-label="wargether 회장 평가 삭제"]')
assert.ok(deleteChair, 'chair may also clear their own submitted evaluation')
await act(async () => deleteChair.click())
await act(async () => { document.querySelector('.coms-confirm-ok').click(); await new Promise((resolve) => setTimeout(resolve, 10)) })
assert.equal(host.querySelector('tbody tr').children[4].textContent, '미집계')
assert.equal(host.querySelector('form[aria-label="chair-wargether 채점"] select').value, '', 'deleting chair scores resets the editor')
await act(async () => root.unmount())
queryClient.clear()
host.remove()
console.log('hackathon UI: guest submission, identity, duplicate retry, closure, chair scoring, private feedback and confirmed deletion passed')
