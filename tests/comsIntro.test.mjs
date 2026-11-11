import './setupDom.mjs'
import assert from 'node:assert/strict'
import { act, createElement as h, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { setPerfPreference } from '../src/utils/perfMode.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.sessionStorage = window.sessionStorage
globalThis.CustomEvent = window.CustomEvent
const media = new window.EventTarget()
media.matches = false
window.matchMedia = () => media
const timers = new Map()
let nextTimer = 0
window.setTimeout = (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id }
window.clearTimeout = (id) => timers.delete(id)
let nextModule = 0

async function mount(Intro, props = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => { root.render(h(StrictMode, null, h(Intro, props))) })
  return { host, unmount: async () => { await act(async () => root.unmount()); host.remove() } }
}
async function freshIntro() {
  return (await import(`../src/components/common/ComsIntro.tsx?case=${++nextModule}`)).default
}

for (const mode of ['reduce', 'lite', 'played']) {
  window.sessionStorage.clear()
  media.matches = mode === 'reduce'
  setPerfPreference(mode === 'lite' ? 'lite' : 'full')
  if (mode === 'played') window.sessionStorage.setItem('coms.intro.played:v1', '1')
  const view = await mount(await freshIntro())
  assert.equal(view.host.querySelector('[data-coms-intro]'), null, `${mode} never mounts an overlay`)
  assert.equal(timers.size, 0)
  assert.notEqual(document.body.style.overflow, 'hidden')
  await view.unmount()
}

for (const input of ['timeout', 'button', 'keyboard', 'wheel', 'touch', 'card', 'reduce', 'lite']) {
  window.sessionStorage.clear()
  media.matches = false
  setPerfPreference('full')
  const Intro = await freshIntro()
  document.body.style.overflow = 'auto'
  const view = await mount(Intro)
  const intro = view.host.querySelector('[data-coms-intro]')
  assert.ok(intro, `StrictMode mounts the ${input} case`)
  assert.equal(intro.querySelector('button').textContent, 'skip ›')
  assert.equal(intro.querySelector('.coms-intro-title').textContent, "COM's")
  assert.equal(intro.querySelector('canvas'), null, 'the title stays DOM text')
  assert.equal(window.sessionStorage.getItem('coms.intro.played:v1'), '1')
  assert.equal(document.body.style.overflow, 'hidden')
  assert.equal(timers.size, 1, 'StrictMode leaves only one deadline')
  const timer = [...timers.values()][0]
  assert.ok(timer.delay <= 1800)
  let screenOn = 0
  const onScreenOn = () => { screenOn++ }
  window.addEventListener('coms:screen-on', onScreenOn)
  await act(async () => {
    if (input === 'timeout') timer.callback()
    else if (input === 'button') intro.querySelector('button').click()
    else if (input === 'card') intro.querySelector('.coms-intro-title').click()
    else if (input === 'reduce') { media.matches = true; media.dispatchEvent(new window.Event('change')) }
    else if (input === 'lite') setPerfPreference('lite')
    else window.dispatchEvent(new window.Event({ keyboard: 'keydown', wheel: 'wheel', touch: 'touchstart' }[input]))
  })
  assert.equal(view.host.querySelector('[data-coms-intro]'), null, `${input} dismisses immediately`)
  assert.equal(screenOn, 1, 'the opening and performance watchdog receive one handover')
  assert.equal(document.body.style.overflow, 'auto', 'the original scroll policy is restored')
  assert.equal(timers.size, 0, 'dismissal releases timers and listeners')
  window.removeEventListener('coms:screen-on', onScreenOn)
  await view.unmount()
  media.matches = false
  setPerfPreference('full')
  const returned = await mount(Intro)
  assert.equal(returned.host.querySelector('[data-coms-intro]'), null, 'SPA returns do not replay')
  await returned.unmount()
}

window.sessionStorage.clear()
const disabled = await mount(await freshIntro(), { introStyle: 'off' })
assert.equal(Boolean(disabled.host.querySelector('[data-coms-intro]')), false, 'off skips the overlay')
assert.equal(timers.size, 0)
await disabled.unmount()

for (const alreadyPlayed of [false, true]) {
  window.sessionStorage.clear()
  if (alreadyPlayed) window.sessionStorage.setItem('coms.intro.played:v1', '1')
  let completed = 0
  const preview = await mount(await freshIntro(), { preview: true, onComplete: () => completed++ })
  assert.ok(preview.host.querySelector('[data-coms-intro]'), 'preview can replay a previously viewed intro')
  assert.equal(window.sessionStorage.getItem('coms.intro.played:v1'), alreadyPlayed ? '1' : null, 'preview does not consume a normal visit')
  await act(async () => { preview.host.querySelector('button').click() })
  assert.equal(completed, 1, 'preview completion is handed to the parent exactly once')
  assert.equal(preview.host.querySelector('[data-coms-intro]'), null)
  await preview.unmount()
}

// A cached renderer can mount its effect before the controller's passive effects.
const realGetContext = window.HTMLCanvasElement.prototype.getContext
window.HTMLCanvasElement.prototype.getContext = () => null
await import('../src/components/common/LegacyIntroCanvas.tsx')
const LegacyIntro = await freshIntro()
for (let replay = 0; replay < 2; replay++) {
  let completed = 0
  const legacy = await mount(LegacyIntro, { introStyle: 'legacy', preview: true, onComplete: () => completed++ })
  await act(async () => { await new Promise((resolve) => setImmediate(resolve)) })
  assert.equal(Boolean(legacy.host.querySelector('[data-coms-intro]')), false, 'a missing canvas never leaves an overlay, including cached previews')
  assert.equal(completed, 1)
  assert.equal(timers.size, 0)
  await legacy.unmount()
}
window.HTMLCanvasElement.prototype.getContext = realGetContext

// A blocked session store still has the module flag for returns within the SPA.
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw new Error('blocked') } })
const Intro = await freshIntro()
const blocked = await mount(Intro)
await act(async () => blocked.host.querySelector('button').click())
await blocked.unmount()
const returned = await mount(Intro)
assert.equal(returned.host.querySelector('[data-coms-intro]'), null)
await returned.unmount()
console.log('intro lifecycle contract passed')
