import './setupDom.mjs'

import assert from 'node:assert/strict'
import { act, createElement as h, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../src/contexts/useAuth.ts'
import AppearanceControl from '../src/components/AppearanceControl.tsx'
import { setPerfPreference } from '../src/utils/perfMode.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const sheet = new window.EventTarget()
sheet.matches = false
const reducedMotion = new window.EventTarget()
reducedMotion.matches = false
window.matchMedia = (query) => query.includes('prefers-reduced-motion') ? reducedMotion : sheet
window.HTMLCanvasElement.prototype.getContext = () => null
window.requestAnimationFrame = (callback) => setTimeout(callback, 0)
window.cancelAnimationFrame = (id) => clearTimeout(id)
setPerfPreference('full')

const host = document.createElement('div')
document.body.append(host)
const root = createRoot(host)
let previews = 0
function Harness() {
  const [introStyle, setIntroStyle] = useState('cinematic')
  const [accentStrength, setAccentStrength] = useState('standard')
  return h(AppearanceControl, {
    accentColor: '#0071e3',
    setAccentColor: () => {},
    themeMode: 'dark',
    setThemeMode: () => {},
    introStyle,
    setIntroStyle,
    onPreviewIntro: () => { previews++ },
    accentStrength,
    setAccentStrength,
  })
}
await act(async () => root.render(h(MemoryRouter, { initialEntries: ['/activities'] },
  h(AuthContext.Provider, { value: { user: null, loading: false } }, h(Harness)),
)))

const trigger = host.querySelector('.appearance-trigger')
const open = async () => act(async () => trigger.click())
const dialog = () => host.querySelector('[role="dialog"][aria-label="화면 설정"]')
const radio = (name) => [...dialog().querySelectorAll('[role="radio"]')].find((item) => item.textContent.trim() === name)
const group = (name) => [...dialog().querySelectorAll('[role="radiogroup"]')].find((item) =>
  document.getElementById(item.getAttribute('aria-labelledby'))?.textContent === name)

await open()
assert.ok(group('인트로'), 'intro choice is exposed as a named radio group')
assert.equal(radio('현재 인트로')?.getAttribute('aria-checked'), 'true')
await act(async () => radio('예전 인트로').click())
assert.equal(radio('예전 인트로')?.getAttribute('aria-checked'), 'true', 'selection updates immediately')
assert.match(dialog().textContent, /지구.*한반도.*광운대/, 'legacy preview describes the restored sequence')
await act(async () => {
  radio('예전 인트로').focus()
  radio('예전 인트로').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
})
assert.equal(radio('끄기')?.getAttribute('aria-checked'), 'true', 'arrow keys move the intro selection')
assert.equal(document.activeElement, radio('끄기'), 'focus follows the selected radio')
await act(async () => radio('예전 인트로').click())

assert.ok(group('강조 정도'), 'accent strength is a named radio group')
await act(async () => radio('선명하게').click())
assert.equal(radio('선명하게')?.getAttribute('aria-checked'), 'true')
assert.ok(dialog().querySelector('.appearance-accent-preview'), 'a live preview is present')

await act(async () => dialog().querySelector('button[aria-label="선택한 인트로 보기"]').click())
assert.equal(previews, 1)
assert.equal(dialog(), null, 'preview closes the sheet before the overlay appears')
assert.equal(document.activeElement, trigger, 'focus returns to the appearance trigger')

await open()
await act(async () => radio('끄기').click())
assert.equal(dialog().querySelector('button[aria-label="선택한 인트로 보기"]').disabled, true)
await act(async () => radio('현재 인트로').click())
await act(async () => { reducedMotion.matches = true; reducedMotion.dispatchEvent(new window.Event('change')) })
assert.equal(dialog().querySelector('button[aria-label="선택한 인트로 보기"]').disabled, true, 'OS reduced motion suppresses preview')
await act(async () => { reducedMotion.matches = false; reducedMotion.dispatchEvent(new window.Event('change')) })
await act(async () => setPerfPreference('lite'))
assert.equal(dialog().querySelector('button[aria-label="선택한 인트로 보기"]').disabled, true, 'lite mode suppresses preview')

await act(async () => root.unmount())
host.remove()
setPerfPreference('auto')
console.log('appearance preference UI tests passed')
