import './setupDom.mjs'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { TOUR_SURFACE_EVENT } from '../src/components/tour/tourState.ts'

registerHooks({ load(url, context, nextLoad) {
  if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true }
  return nextLoad(url, context)
} })
const { default: TourOverlay } = await import('../src/components/tour/TourOverlay.tsx')
globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.CustomEvent = window.CustomEvent
globalThis.MutationObserver = window.MutationObserver
globalThis.getComputedStyle = window.getComputedStyle
window.innerWidth = 390
window.innerHeight = 844
window.matchMedia = (query) => ({ matches: query.includes('1023') && window.innerWidth < 1024 })
let frameId = 0
const frames = new Map()
window.requestAnimationFrame = (callback) => { frames.set(++frameId, callback); return frameId }
window.cancelAnimationFrame = (id) => frames.delete(id)
window.scrollY = 321
const restored = []
window.scrollTo = ({ top }) => { restored.push(top); window.scrollY = top }
const scrolls = []
window.HTMLElement.prototype.scrollIntoView = function () {
  scrolls.push(this.dataset.tourPath || this.dataset.tour || this.id)
  this.dataset.top = '150'
  if (this.dataset.tour === 'appearance') window.scrollY = 1000
}
Object.defineProperties(window.HTMLElement.prototype, {
  offsetWidth: { configurable: true, get() { return this.classList.contains('coms-tour-card') ? 300 : 0 } },
  offsetHeight: { configurable: true, get() { return this.classList.contains('coms-tour-card') ? 230 : 0 } },
  scrollHeight: { configurable: true, get() { return this.classList.contains('coms-tour-card') ? 230 : 0 } },
})
window.HTMLElement.prototype.getBoundingClientRect = function () {
  const top = Number(this.dataset.top ?? 80)
  const width = Number(this.dataset.width ?? 260)
  const height = Number(this.dataset.height ?? 44)
  return { x: 20, y: top, left: 20, top, width, height, right: 20 + width, bottom: top + height }
}
const host = document.createElement('div')
host.id = 'root'
host.innerHTML = '<button id="opener">start</button><header></header><button data-tour="appearance" data-top="1800">settings</button>'
document.body.append(host)
const root = createRoot(document.createElement('div'))
const opener = host.querySelector('#opener')
opener.focus()
const surfaces = []
const show = (event) => {
  surfaces.push(event.detail)
  host.querySelector('[data-surface]')?.remove()
  if (!event.detail) return
  const panel = document.createElement('div')
  panel.dataset.surface = event.detail
  if (event.detail === 'ask') {
    panel.id = 'coms-ask-panel'
    panel.dataset.top = '520'
    panel.dataset.height = '290'
    host.append(panel)
  } else {
    panel.id = 'mobile-menu'
    panel.style.overflowY = 'auto'
    panel.dataset.height = '300'
    const group = document.createElement('section')
    group.dataset.tourGroup = event.detail === 'menu' ? 'club' : event.detail
    for (const path of ['/about', '/activities', '/study', '/lab/', '/apps', '/recruit']) {
      const row = document.createElement('button')
      row.dataset.tourPath = path
      row.dataset.top = path === '/about' ? '120' : '900'
      row.textContent = path
      group.append(row)
    }
    const account = document.createElement('button')
    account.dataset.tour = 'login'
    account.dataset.top = '1200'
    group.append(account)
    panel.append(group)
    host.querySelector('header').append(panel)
  }
}
window.addEventListener(TOUR_SURFACE_EVENT, show)
async function flush() {
  for (let i = 0; i < 6; i++) await act(async () => {
    const pending = [...frames.values()]
    frames.clear()
    pending.forEach((callback) => callback(0))
    await Promise.resolve()
  })
}
const overlay = () => document.querySelector('.coms-tour')
const card = () => document.querySelector('.coms-tour-card')
const next = () => [...card().querySelectorAll('button')].find((button) => button.textContent.includes('다음'))
let closed = 0
await act(async () => root.render(h(TourOverlay, { kind: 'guest', onClose: () => { closed++; root.render(null) } })))
await flush()
assert.equal(surfaces.at(-1), 'menu', 'phone guidance opens the real menu before measuring')
assert.equal(overlay().dataset.tourReady, 'true')
assert.equal(document.activeElement === card(), true, 'only the tour owns focus')
await act(async () => next().click())
await flush()
assert.equal(surfaces.at(-1), 'learn')
assert.ok(scrolls.includes('/study'), 'header-contained menu entries scroll inside the menu')
assert.equal(document.querySelector('.coms-tour-spot').classList.contains('is-none'), false)
await act(async () => {
  const previous = [...card().querySelectorAll('button')].find((button) => button.textContent.includes('이전'))
  previous.focus()
  previous.click()
})
await flush()
assert.equal(document.activeElement === next(), true, 'returning to step one focuses the next action instead of a disabled previous action')
await act(async () => next().click())
await flush()
// A row can have a non-zero rectangle while entirely clipped by the menu scrollport.
const study = host.querySelector('[data-tour-path="/study"]')
study.dataset.top = '900'
host.querySelector('[data-tour-path="/lab/"]').dataset.top = '900'
await act(async () => window.dispatchEvent(new window.Event('scroll')))
await flush()
assert.equal(document.querySelector('.coms-tour-spot').classList.contains('is-none'), true, 'clipped rows never produce an empty spotlight')
await act(async () => next().click())
await act(async () => next().click())
await flush()
assert.ok(scrolls.includes('appearance'), 'the footer control is scrolled into view automatically')
await act(async () => next().click())
await flush()
assert.equal(surfaces.at(-1), 'ask')
assert.ok(host.querySelector('#coms-ask-panel'))
assert.equal(document.querySelector('.coms-tour-spot').classList.contains('is-none'), false)
await act(async () => {
  window.innerWidth = 1280
  window.dispatchEvent(new window.Event('resize'))
})
await flush()
assert.equal(surfaces.at(-1), 'ask', 'a resize reconciles the current surface without changing the tour profile')
assert.equal(overlay().dataset.tourProfile, 'mobile')
await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
await flush()
assert.equal(closed, 1)
assert.equal(surfaces.at(-1), null, 'closing releases the menu and FAQ preview')
assert.equal(frames.size, 0, 'no queued preparation survives close')
assert.equal(host.hasAttribute('inert'), false)
assert.equal(document.activeElement === opener, true)
assert.equal(restored.at(-1), 321)
// Keyboard navigation can keep focus on the modal itself, including when FAQ content opens.
await act(async () => root.render(h(TourOverlay, { kind: 'guest', onClose: () => root.render(null) })))
await flush()
for (let i = 0; i < 5; i++) {
  await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
  await flush()
}
assert.equal(surfaces.at(-1), 'ask')
assert.equal(document.activeElement === card(), true, 'keyboard steps preserve valid focus on the dialog itself')
assert.equal(card().contains(document.activeElement), true, 'modal focus containment includes the dialog itself')
assert.equal(host.querySelector('#coms-ask-panel').contains(document.activeElement), false, 'the FAQ preview never owns keyboard focus')
window.removeEventListener(TOUR_SURFACE_EVENT, show)
await act(async () => root.unmount())
host.remove()
console.log('real tour surface, scrolling and cleanup contracts passed')
