import './setupDom.mjs'

import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from '../src/contexts/useAuth.ts'

registerHooks({ load(url, context, nextLoad) {
  if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true }
  return nextLoad(url, context)
} })
const { default: WorkDetailPage } = await import('../src/pages/WorkDetailPage.tsx')
const { default: CompanionServicesSection } = await import('../src/components/home/CompanionServicesSection.tsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }
globalThis.MutationObserver ??= class { observe() {} disconnect() {} }
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
window.scrollTo = () => {}

const memberA = { id: 11, studentId: '2024000001', name: '회원A', role: 'USER' }
const loginMemberA = { studentId: '2024000001', name: '회원A', role: 'USER' }
const memberB = { id: 12, studentId: '2024000002', name: '회원B', role: 'USER' }
let viewer = 'guest'
let pendingLike = null
const detailReads = []
const listReads = []
globalThis.fetch = async (url, options = {}) => {
  const path = String(url)
  if (path.endsWith('/api/club-projects')) {
    listReads.push(viewer)
    return Response.json([{ id: 7, category: 'WEBSITE', title: 'A가 편집하던 작품', description: '공개 소개', madeBy: '회원A', canEdit: viewer === 'A', linkUrl: 'https://example.com/', files: [], images: [] }])
  }
  if (path.endsWith('/api/club-projects/categories')) return Response.json([{ key: 'WEBSITE', name: '웹사이트' }])
  if (path.endsWith('/api/club-projects/link-status')) return Response.json([])
  if (path.endsWith('/api/club-projects/7')) {
    detailReads.push(viewer)
    return Response.json({ id: 7, title: `${viewer} 작품`, description: '공개 설명', viewCount: 3, likeCount: 1, commentCount: 1, likedByMe: viewer === 'A', images: [], files: [] })
  }
  if (path.endsWith('/api/club-projects/7/comments')) {
    return Response.json([{ id: 4, parentCommentId: null, authorName: '회원A', content: '공개 댓글', createdAt: '2026-11-11T12:00:00', updatedAt: '2026-11-11T12:00:00', editable: viewer === 'A', deletable: viewer === 'A' }])
  }
  if (path.endsWith('/api/club-projects/7/like') && options.method === 'PUT') {
    return new Promise((resolve) => { pendingLike = resolve })
  }
  throw new Error(`Unexpected request: ${path}`)
}

async function mount(auth, serverViewer, path = '/apps/7') {
  viewer = serverViewer
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const render = async (value, nextViewer) => {
    viewer = nextViewer
    await act(async () => {
      root.render(h(MemoryRouter, { initialEntries: [path] },
        h(AuthContext.Provider, { value },
          h(Routes, null, h(Route, { path: path === '/apps' ? '/apps' : '/apps/:workId', element: h(path === '/apps' ? CompanionServicesSection : WorkDetailPage) })),
        ),
      ))
      await new Promise(setImmediate)
    })
  }
  await render(auth, serverViewer)
  return { host, update: render, unmount: async () => { await act(async () => root.unmount()); host.remove() } }
}

// The public list must also discard A's editor and canEdit flags when the viewer changes.
for (const next of [{ user: null, viewer: 'guest' }, { user: memberB, viewer: 'B' }]) {
  listReads.length = 0
  const page = await mount({ loading: false, user: loginMemberA }, 'A', '/apps')
  const edit = [...page.host.querySelectorAll('button')].find((button) => button.textContent === '작품 수정')
  assert.ok(edit)
  await act(async () => edit.click())
  const title = page.host.querySelector('form[aria-label="작품 수정"] input[required]')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  await act(async () => { setter.call(title, 'A 비공개 초안'); title.dispatchEvent(new window.Event('input', { bubbles: true })) })
  assert.equal(title.value, 'A 비공개 초안')
  await page.update({ loading: false, user: memberA }, 'A')
  assert.deepEqual(listReads, ['A'], 'login to /me for the same member does not reload the list')
  assert.equal(page.host.querySelector('form[aria-label="작품 수정"] input[required]').value, 'A 비공개 초안')
  await page.update({ loading: false, user: next.user }, next.viewer)
  assert.equal(Boolean(page.host.querySelector('form[aria-label="작품 수정"]')), false, 'the next viewer cannot read A editor')
  assert.doesNotMatch(page.host.textContent, /A 비공개 초안/)
  assert.equal([...page.host.querySelectorAll('button')].some((button) => button.textContent === '작품 수정'), false, 'stale canEdit is cleared')
  assert.deepEqual(listReads, ['A', next.viewer], 'the list refetches for the new viewer')
  await page.unmount()
}

// Wait for auth before the only detail GET: the endpoint counts each request as a view.
{
  detailReads.length = 0
  const page = await mount({ loading: true, user: null }, 'guest')
  assert.deepEqual(detailReads, [], 'no premature guest view while authentication is unresolved')
  await page.update({ loading: false, user: loginMemberA }, 'A')
  assert.deepEqual(detailReads, ['A'], 'one member-specific detail read')
  assert.match(page.host.textContent, /A 작품/)
  await act(async () => [...page.host.querySelectorAll('button')].find((button) => button.textContent === '수정').click())
  const draft = page.host.querySelector('form[aria-label="댓글 수정"] textarea')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  await act(async () => { setter.call(draft, '로그인 직후 초안'); draft.dispatchEvent(new window.Event('input', { bubbles: true })) })
  await page.update({ loading: false, user: memberA }, 'A')
  assert.deepEqual(detailReads, ['A'], 'login-shaped to /me-shaped user must not count another view')
  assert.equal(page.host.querySelector('form[aria-label="댓글 수정"] textarea').value, '로그인 직후 초안', 'same member keeps an unsaved draft')
  await page.unmount()
}

{
  detailReads.length = 0
  const page = await mount({ loading: false, user: null }, 'guest')
  await page.update({ loading: false, user: loginMemberA }, 'A')
  assert.deepEqual(detailReads, ['guest', 'A'], 'login response without numeric id must not share guest state')
  assert.match(page.host.textContent, /A 작품/)
  await page.unmount()
}

// Switching account in the same route must remove unfinished private text and stale permissions.
{
  detailReads.length = 0
  const page = await mount({ loading: false, user: memberA }, 'A')
  const edit = [...page.host.querySelectorAll('button')].find((button) => button.textContent === '수정')
  assert.ok(edit, 'A can edit their comment')
  await act(async () => edit.click())
  const draft = page.host.querySelector('form[aria-label="댓글 수정"] textarea')
  assert.ok(draft)
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  await act(async () => { setter.call(draft, 'A 개인 초안'); draft.dispatchEvent(new window.Event('input', { bubbles: true })) })
  assert.equal(draft.value, 'A 개인 초안')
  await act(async () => page.host.querySelector('form[aria-label="댓글 수정"]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })))
  assert.equal(page.host.querySelector('form[aria-label="댓글 수정"] textarea').value, 'A 개인 초안', 'a failed write keeps the same viewer draft')
  await page.update({ loading: false, user: null }, 'guest')
  assert.equal(page.host.querySelector('form[aria-label="댓글 수정"]'), null, 'guest cannot see A draft editor')
  assert.doesNotMatch(page.host.textContent, /A 개인 초안/)
  assert.deepEqual(detailReads, ['A', 'guest'], 'guest-specific state is fetched after identity change')
  await page.unmount()
}

{
  detailReads.length = 0
  const page = await mount({ loading: false, user: memberA }, 'A')
  const edit = [...page.host.querySelectorAll('button')].find((button) => button.textContent === '수정')
  await act(async () => edit.click())
  await act(async () => [...page.host.querySelectorAll('button')].find((button) => button.textContent === '추천 취소').click())
  assert.ok(pendingLike, 'A has a pending write')
  await page.update({ loading: false, user: memberB }, 'B')
  assert.equal(page.host.querySelector('form[aria-label="댓글 수정"]'), null, 'B does not inherit A editor')
  assert.doesNotMatch(page.host.textContent, /추천 취소/, 'B does not inherit A like state')
  assert.equal([...page.host.querySelectorAll('button')].some((button) => button.textContent === '수정'), false, 'B cannot edit A comment')
  assert.deepEqual(detailReads, ['A', 'B'])
  await act(async () => pendingLike(Response.json({ viewCount: 3, likeCount: 0, commentCount: 1, likedByMe: false })))
  assert.match(page.host.textContent, /B 작품/, 'A pending response cannot overwrite B detail')
  await page.unmount()
}

console.log('work viewer identity tests passed')
