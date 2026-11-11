import './setupDom.mjs'

import assert from 'node:assert/strict'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../src/contexts/useAuth.ts'
import AskWidget from '../src/components/ask/AskWidget.tsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.MutationObserver = window.MutationObserver
globalThis.getComputedStyle = window.getComputedStyle
window.HTMLElement.prototype.scrollIntoView = () => {}
window.requestAnimationFrame = (callback) => setTimeout(callback, 0)
window.cancelAnimationFrame = clearTimeout
globalThis.requestAnimationFrame = window.requestAnimationFrame
globalThis.cancelAnimationFrame = window.cancelAnimationFrame

let mailCalls = 0
let askEnabled = false
globalThis.fetch = async (url, options = {}) => {
  if (String(url).endsWith('/api/site-settings')) return Response.json({ askEnabled })
  if (String(url).endsWith('/api/ask') && options.method === 'POST') {
    mailCalls++
    return new Response(null, { status: 204 })
  }
  throw new Error(`Unexpected request: ${url}`)
}

const host = document.createElement('div')
document.body.append(host)
const root = createRoot(host)
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const guest = { user: null, loading: false }
const memberLogin = { user: { studentId: '2024000001', name: '회원A', email: 'a@example.com' }, loading: false }
const memberMe = { user: { id: 11, studentId: '2024000001', name: '회원A', email: 'a@example.com' }, loading: false }
const memberB = { user: { id: 12, studentId: '2024000002', name: '회원B', email: 'b@example.com' }, loading: false }
async function render(auth) {
  await act(async () => {
    root.render(h(MemoryRouter, null, h(QueryClientProvider, { client: queryClient }, h(AuthContext.Provider, { value: auth }, h(AskWidget)))))
    await new Promise(setImmediate)
  })
}
async function click(button) { await act(async () => button.click()) }
const findButton = (name) => [...host.querySelectorAll('button')].find((button) => button.textContent.trim() === name)
const dialog = () => host.querySelector('[role="dialog"][aria-labelledby="coms-ask-title"]')

await render(guest)
const launcher = host.querySelector('.coms-ask-trigger')
assert.ok(launcher, 'FAQ launcher remains available with email contact disabled')
assert.equal(launcher.getAttribute('aria-label'), '질문하기')
launcher.focus()
assert.equal(document.activeElement === launcher, true)
await click(launcher)
assert.match(dialog().textContent, /COM's 질문하기/)
assert.equal(host.querySelectorAll('.coms-ask-faq button').length, 3)
assert.equal(findButton('다른 질문 보내기').disabled, true)
await click(findButton('회비와 동아리방이 궁금해요'))
assert.match(dialog().textContent, /2만원.*복지관 403호/)
assert.equal(dialog().querySelector('a[href="/recruit"]')?.textContent, '지원 안내 보기')
assert.equal(mailCalls, 0, 'FAQ selections never send mail')
await click(findButton('자주 묻는 질문으로'))
assert.equal(host.querySelectorAll('.coms-ask-faq button').length, 3)
await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
assert.equal(Boolean(dialog()), false, 'Escape closes the FAQ dialog')
assert.equal(document.activeElement === launcher, true, 'Escape restores focus to the launcher')
const tour = document.createElement('div')
tour.className = 'coms-tour'
document.body.append(tour)
await click(launcher)
assert.equal(dialog(), null, 'tour spotlight cannot open a nested chat dialog')
tour.remove()

askEnabled = true
await act(async () => { await queryClient.invalidateQueries({ queryKey: ['site-settings', 'public'] }) })
await render(memberLogin)
await click(host.querySelector('.coms-ask-trigger'))
await click(findButton('다른 질문 보내기'))
const question = host.querySelector('#coms-ask-question')
assert.ok(question, 'email handoff opens the editable question stage')
const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
await act(async () => { setter.call(question, '회원A의 아직 보내지 않은 질문'); question.dispatchEvent(new window.Event('input', { bubbles: true })) })
await click(findButton('자주 묻는 질문으로'))
await click(findButton('다른 질문 보내기'))
assert.equal(host.querySelector('#coms-ask-question').value, '회원A의 아직 보내지 않은 질문', 'FAQ back/return keeps the contact draft')
await render(memberMe)
assert.equal(host.querySelector('#coms-ask-question')?.value, '회원A의 아직 보내지 않은 질문', 'same studentId preserves the unsent draft')
await click(findButton('다음'))
const email = host.querySelector('#coms-ask-email')
const emailSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
await act(async () => { emailSetter.call(email, 'private@example.com'); email.dispatchEvent(new window.Event('input', { bubbles: true })) })
assert.equal(host.querySelector('#coms-ask-email').value, 'private@example.com')
await render(memberB)
assert.equal(Boolean(host.querySelector('#coms-ask-question')), false, 'another member cannot see A draft')
assert.equal(Boolean(host.querySelector('#coms-ask-email')), false, 'another member cannot see A reply address')
assert.equal(host.querySelectorAll('.coms-ask-faq button').length, 3)
assert.equal(mailCalls, 0)

await act(async () => root.unmount())
host.remove()
queryClient.clear()
console.log('ask widget FAQ and identity tests passed')
