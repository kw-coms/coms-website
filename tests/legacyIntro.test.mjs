import './setupDom.mjs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { act, createElement as h, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import LegacyIntroCanvas from '../src/components/common/LegacyIntroCanvas.tsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.getComputedStyle = window.getComputedStyle.bind(window)

const real = {
  getContext: window.HTMLCanvasElement.prototype.getContext,
  setTimeout: window.setTimeout,
  clearTimeout: window.clearTimeout,
  Image: globalThis.Image,
  raf: globalThis.requestAnimationFrame,
  cancelRaf: globalThis.cancelAnimationFrame,
  dpr: window.devicePixelRatio,
}
const frames = new Map()
const timers = new Map()
const images = []
const rendered = []
let nextId = 0
const ctx = {
  setTransform() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
  fill() {}, fillRect() {}, fillText(text) { rendered.push(text) },
  save() {}, restore() {}, arc() {}, stroke() {}, drawImage() {},
  createRadialGradient() { return { addColorStop() {} } },
  getImageData(_x, _y, width, height) { return { data: new Uint8ClampedArray(width * height * 4) } },
}
globalThis.requestAnimationFrame = (callback) => { const id = ++nextId; frames.set(id, callback); return id }
globalThis.cancelAnimationFrame = (id) => frames.delete(id)
window.setTimeout = (callback, delay) => { const id = ++nextId; timers.set(id, { callback, delay }); return id }
window.clearTimeout = (id) => timers.delete(id)
Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 3 })
globalThis.Image = class {
  constructor() { images.push(this) }
  onload = null
  onerror = null
  src = ''
}

async function mount(onDone) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => root.render(h(StrictMode, null, h(LegacyIntroCanvas, { onDone }))))
  return {
    host,
    unmount: async () => { await act(async () => root.unmount()); host.remove() },
  }
}

async function tick(now) {
  const [id, callback] = frames.entries().next().value
  frames.delete(id)
  await act(async () => callback(now))
}

test('historic canvas completes or releases its work without owning the overlay lifecycle', async () => {
  try {
    window.HTMLCanvasElement.prototype.getContext = () => null
    let completed = 0
    const missingCanvas = await mount(() => completed++)
    assert.equal(missingCanvas.host.querySelectorAll('canvas[aria-hidden="true"]').length, 1)
    assert.equal(completed, 1, 'StrictMode cannot report a missing canvas twice')
    assert.equal(frames.size, 0)
    assert.equal(timers.size, 0)
    await missingCanvas.unmount()

    window.HTMLCanvasElement.prototype.getContext = () => ctx
    const complete = await mount(() => completed++)
    const canvas = complete.host.querySelector('canvas')
    assert.equal(canvas.width, window.innerWidth * 2, 'retina drawing is bounded to 2x')
    assert.equal(frames.size, 1, 'StrictMode leaves only one animation loop')
    assert.equal(timers.size, 1, 'StrictMode leaves only one startup watchdog')
    images.at(-1).onload()
    for (const now of [1, 1001, 1801, 2401, 3101, 3802]) await tick(now)
    assert.equal(completed, 2, 'the authored sequence hands off once')
    assert.ok(rendered.some((text) => String(text).includes("광운대 COM'S")), 'Kwangwoon lock is drawn')
    assert.ok(rendered.some((text) => String(text).includes("COM's")), 'cube finale is drawn')
    assert.equal(frames.size, 0, 'completion stops animation')
    await complete.unmount()
    assert.equal(timers.size, 0)
    assert.equal(images.at(-1).onload, null, 'image callback released')

    const interrupted = await mount(() => completed++)
    assert.equal(frames.size, 1)
    await interrupted.unmount()
    assert.equal(frames.size, 0, 'unmount stops the next frame')
    assert.equal(timers.size, 0, 'unmount clears the watchdog')
    assert.equal(images.at(-1).onload, null, 'unmount releases image callback')
    assert.equal(completed, 2, 'unmount does not hand off a cancelled sequence')
  } finally {
    window.HTMLCanvasElement.prototype.getContext = real.getContext
    window.setTimeout = real.setTimeout
    window.clearTimeout = real.clearTimeout
    globalThis.Image = real.Image
    globalThis.requestAnimationFrame = real.raf
    globalThis.cancelAnimationFrame = real.cancelRaf
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: real.dpr })
  }
})
