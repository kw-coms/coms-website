import './setupDom.mjs'
import assert from 'node:assert/strict'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import PageHeading from '../src/components/PageHeading.tsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const observers = []
globalThis.IntersectionObserver = class {
  targets = []
  stopped = []
  constructor(callback) { this.callback = callback; observers.push(this) }
  observe(target) { this.targets.push(target) }
  unobserve(target) { this.stopped.push(target) }
  disconnect() { this.disconnected = true }
}

for (const [path, title, crumb] of [
  ['/activities', '배움이 매주 쌓이고, 서로에게 남습니다.', '활동'],
  ['/notices/3', '공지 수정', '공지사항'],
  ['/gatherings/7', '알고리즘 스터디', '모임 신청'],
  ['/monthly-calendar', '동아리 일정 캘린더', '일정 캘린더'],
  ['/sponsors', '함께해 주시는 분들', '후원자'],
  ['/unknown', '페이지를 찾을 수 없어요', '페이지를 찾을 수 없음'],
]) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const tree = (text) => h(MemoryRouter, { initialEntries: [path] }, h(PageHeading, { id: 'title' }, text))
  await act(async () => { root.render(tree(title)) })
  const heading = host.querySelector('h1')
  assert.equal(host.querySelectorAll('h1').length, 1)
  assert.equal(heading.textContent, title, 'the existing accessible title stays real text')
  assert.equal(heading.id, 'title', 'label references survive the shared wrapper')
  assert.equal(host.querySelector('.cine-hud').textContent, `COM'S / ${crumb}`)
  const observer = observers.at(-1)
  assert.deepEqual(observer.targets, [heading])
  observer.callback([{ target: heading, isIntersecting: false }])
  assert.equal(heading.classList.contains('is-revealed'), false)
  observer.callback([{ target: heading, isIntersecting: true }])
  assert.equal(heading.classList.contains('is-revealed'), true)
  assert.deepEqual(observer.stopped, [heading], 'a visible title is only revealed once')
  await act(async () => { root.render(tree(`${title} · 수정`)) })
  assert.equal(host.querySelectorAll('h1').length, 1)
  assert.equal(heading.textContent, `${title} · 수정`, 'dynamic titles still update')
  assert.equal(heading.classList.contains('is-revealed'), true, 'editing never hides a revealed title')
  await act(async () => { root.unmount() })
  assert.equal(observer.disconnected, true)
  host.remove()
}
delete globalThis.IntersectionObserver
console.log('page heading contract passed')
