import './setupDom.mjs'
import assert from 'node:assert/strict'
import { act, createElement as h, Fragment, StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { setPerfPreference } from '../src/utils/perfMode.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.sessionStorage = window.sessionStorage
globalThis.CustomEvent = window.CustomEvent
const media = new window.EventTarget()
media.matches = false
window.matchMedia = () => media

for (const initial of ['off', 'lite', 'route']) {
  window.sessionStorage.clear()
  setPerfPreference(initial === 'lite' ? 'lite' : 'full')
  const { IntroPlayback } = await import(`../src/components/common/ComsIntro.tsx?parent-${initial}`)
  assert.equal(typeof IntroPlayback, 'function', 'automatic and manual playback need a stable composition boundary')
  function Controls() {
    const [style, setStyle] = useState(initial === 'off' ? 'off' : 'cinematic')
    const [preview, setPreview] = useState(false)
    const [home, setHome] = useState(initial !== 'route')
    return h(Fragment, null,
      h('button', { onClick: () => { setPerfPreference('full'); setStyle('cinematic') } }, 'Enable'),
      h('button', { onClick: () => setPreview(true) }, 'Preview'),
      h('button', { onClick: () => setHome(true) }, 'Home'),
      h(IntroPlayback, { home, introStyle: style, preview, onComplete: () => setPreview(false) }))
  }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => root.render(h(StrictMode, null, h(Controls))))
  assert.equal(Boolean(host.querySelector('[data-coms-intro]')), false)
  await act(async () => host.querySelector('button').click())
  await act(async () => host.querySelectorAll('button')[1].click())
  assert.ok(host.querySelector('[data-coms-intro]'), `${initial}: explicit preview starts`)
  if (initial === 'route') {
    await act(async () => host.querySelectorAll('button')[2].click())
    assert.equal(host.querySelectorAll('[data-coms-intro]').length, 1, 'a route change into home during preview cannot add a second intro')
  }
  await act(async () => host.querySelector('.coms-intro-skip').click())
  assert.equal(Boolean(host.querySelector('[data-coms-intro]')), false, `${initial}: preview completion must not start a second intro`)
  assert.equal(window.sessionStorage.getItem('coms.intro.played:v1'), null, 'preview does not consume a new visit')
  await act(async () => root.unmount())
  host.remove()
}
console.log('intro playback composition contracts passed')
