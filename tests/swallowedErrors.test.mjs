import './setupDom.mjs'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext } from '../src/contexts/useAuth.ts'
import { ToastHost } from '../src/components/common/Toast.tsx'

registerHooks({ load(url, context, nextLoad) {
  if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true }
  return nextLoad(url, context)
} })
const { default: AdminAppCatalog } = await import('../src/pages/admin/AdminAppCatalog.tsx')
const { default: CompanionServicesSection } = await import('../src/components/home/CompanionServicesSection.tsx')
const { default: ActivityComposer } = await import('../src/features/activityLog/ActivityComposer.tsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }
globalThis.MutationObserver = window.MutationObserver
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
const originalSetTimeout = globalThis.setTimeout
globalThis.setTimeout = (...args) => {
  const timer = originalSetTimeout(...args)
  timer.unref?.()
  return timer
}

const category = { id: 1, key: 'WEB', name: '웹사이트' }
let fetchResponse = () => Response.json([])
globalThis.fetch = async (url, init = {}) => fetchResponse(String(url), init)
const failed = (message) => Response.json({ message }, { status: 400 })

async function flush() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => { await new Promise(setImmediate) })
  }
}

async function mount(component, auth = { user: null }, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(h(QueryClientProvider, { client }, h(AuthContext.Provider, { value: auth },
      h(MemoryRouter, null, component), h(ToastHost))))
  })
  await flush()
  return { host, client, async unmount() { await act(async () => root.unmount()); host.remove(); client.clear() } }
}

function toastText() {
  return [...document.querySelectorAll('.coms-toast-message')].map((node) => node.textContent).join(' | ')
}

function setInput(input, value) {
  assert.ok(input)
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value)
  input.dispatchEvent(new window.Event('input', { bubbles: true }))
}

// A failed optional status read must be visible while the project list remains usable.
fetchResponse = (url) => {
  if (url === '/api/club-projects') return Response.json([])
  if (url === '/api/club-projects/categories') return Response.json([category])
  if (url === '/api/club-projects/link-status') return failed('링크 상태 오류')
  throw new Error(`Unexpected ${url}`)
}
{
  const page = await mount(h(AdminAppCatalog))
  assert.match(toastText(), /링크 상태 오류/)
  assert.match(page.host.textContent, /작품 분류 관리/)
  await page.unmount()
}

// Category creation triggers a second category read; a failed reload must notify the admin.
let categoryReads = 0
fetchResponse = (url, init) => {
  if (url === '/api/club-projects') return Response.json([])
  if (url === '/api/club-projects/link-status') return Response.json([])
  if (url === '/api/club-projects/categories') return ++categoryReads === 1 ? Response.json([category]) : failed('분류 목록 오류')
  if (url === '/api/admin/club-project-categories' && init.method === 'POST') return Response.json(category)
  throw new Error(`Unexpected ${url}`)
}
{
  const page = await mount(h(AdminAppCatalog))
  const input = page.host.querySelector('input[placeholder="새 분류 이름"]')
  await act(async () => { setInput(input, '새 분류') })
  const form = input.closest('form')
  await act(async () => { form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })) })
  await flush()
  assert.equal(categoryReads, 2)
  assert.match(toastText(), /분류 목록 오류/)
  await page.unmount()
}

// The created item survives a failed list refresh after its file has uploaded.
let projectReads = 0
fetchResponse = (url, init) => {
  if (url === '/api/club-projects/categories') return Response.json([category])
  if (url === '/api/club-projects/link-status') return Response.json([])
  if (url === '/api/club-projects' && init.method === 'POST') return Response.json({ id: 44, category: 'WEB', title: '새 작품', files: [], images: [] })
  if (url === '/api/club-projects') return ++projectReads === 1 ? Response.json([]) : failed('등록 목록 오류')
  if (url === '/api/club-projects/44/files' && init.method === 'POST') return Response.json({ id: 3 })
  throw new Error(`Unexpected ${url}`)
}
{
  const page = await mount(h(AdminAppCatalog))
  await act(async () => { setInput(page.host.querySelector('form input[maxlength="120"]'), '새 작품') })
  const fileInput = page.host.querySelector('input[type="file"]')
  Object.defineProperty(fileInput, 'files', { configurable: true, value: [new window.File(['apk'], 'build.apk')] })
  await act(async () => { fileInput.dispatchEvent(new window.Event('change', { bubbles: true })) })
  await act(async () => {
    const form = [...page.host.querySelectorAll('form')].find((node) => node.textContent.includes('배포 파일'))
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
  })
  await flush()
  assert.equal(projectReads, 2)
  assert.match(toastText(), /등록 목록 오류/)
  assert.match(page.host.textContent, /새 작품/)
  await page.unmount()
}

// Public catalogue link-status failure is also visible to an authenticated viewer.
fetchResponse = (url) => {
  if (url === '/api/club-projects') return Response.json([])
  if (url === '/api/club-projects/categories') return Response.json([category])
  if (url === '/api/club-projects/link-status') return failed('공개 링크 상태 오류')
  throw new Error(`Unexpected ${url}`)
}
{
  const page = await mount(h(CompanionServicesSection), { user: { id: 7, studentId: '2026000007', role: 'USER' } })
  assert.match(toastText(), /공개 링크 상태 오류/)
  assert.match(page.host.textContent, /COM's 작품/)
  await page.unmount()
}

// Invalidation rejects after a successful create/upload. The composer must report it
// without presenting the already-created activity as a failed submission.
fetchResponse = (url, init) => {
  if (url === '/api/club-activities' && init.method === 'POST') return Response.json({ id: 77, title: '활동 글' })
  if (url === '/api/club-activities/77/files' && init.method === 'POST') return Response.json({ id: 8 })
  throw new Error(`Unexpected ${url}`)
}
{
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  let invalidationOptions
  client.invalidateQueries = async (_filters, options) => {
    invalidationOptions = options
    throw new Error('activity list unavailable')
  }
  let submitted = 0
  const props = {
    categories: [category],
    activityForm: { category: 'WEB', title: '활동 글', eventDate: '2026-11-24', description: '' },
    setActivityForm() {},
    activityImages: [], setActivityImages() {},
    activityFiles: [new window.File(['file'], 'notes.txt')], setActivityFiles() {},
    prependActivity() { submitted += 1 },
    submitError: '', setSubmitError() {},
    setActivityNotice() {}, setActivityMode() {},
  }
  const page = await mount(h(ActivityComposer, props), { user: { id: 7 } }, client)
  await act(async () => { page.host.querySelector('form[aria-label="활동 글쓰기"]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })) })
  await flush()
  assert.equal(submitted, 1)
  assert.equal(invalidationOptions?.throwOnError, true)
  assert.match(toastText(), /activity list unavailable/)
  await page.unmount()
}

console.log('swallowed error notifications passed')
