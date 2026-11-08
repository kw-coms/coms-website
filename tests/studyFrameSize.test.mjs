import assert from 'node:assert/strict'
import { applyFrameSize, FRAME_MAX, FRAME_MIN } from '../src/pages/study/studyDemos.ts'

// A fake frame: border 2px (offsetHeight - clientHeight), currently `height` tall.
const win = {}
const frame = (height = 100) => ({ contentWindow: win, offsetHeight: height, clientHeight: height - 2, style: { height: '' } })
const msg = (data, source = win) => ({ data, source })
const size = (h, over = {}) => ({ __demo: 3, type: 'size', h, ...over })

// a report from the frame sets the border-box height: content + border
let f = frame()
assert.equal(applyFrameSize(f, msg(size(200)), 3), true)
assert.equal(f.style.height, '202px')

// other frames, forged ids and other message types are ignored
f = frame()
assert.equal(applyFrameSize(f, msg(size(200), {}), 3), false)
assert.equal(applyFrameSize(f, msg(size(200), null), 3), false)
assert.equal(applyFrameSize(f, msg(size(200, { __demo: 4 })), 3), false)
assert.equal(applyFrameSize(f, msg(size(200, { type: 'log' })), 3), false)
assert.equal(applyFrameSize(f, msg(null), 3), false)
assert.equal(applyFrameSize(f, msg('size'), 3), false)
assert.equal(f.style.height, '')

// h must be a finite number
for (const h of [NaN, Infinity, -Infinity, '200', null, undefined, {}]) {
  assert.equal(applyFrameSize(f, msg(size(h)), 3), false, String(h))
}
assert.equal(f.style.height, '')

// clamped to FRAME_MIN..FRAME_MAX
f = frame(); applyFrameSize(f, msg(size(5)), 3); assert.equal(f.style.height, `${FRAME_MIN}px`)
f = frame(); applyFrameSize(f, msg(size(99999)), 3); assert.equal(f.style.height, `${FRAME_MAX}px`)
assert.deepEqual([FRAME_MIN, FRAME_MAX], [64, 640])

// a change of 1px or less leaves the frame alone (no ramp), but the report still counts as handled
f = frame(102)
assert.equal(applyFrameSize(f, msg(size(100)), 3), true)
assert.equal(f.style.height, '')
f = frame(100)
assert.equal(applyFrameSize(f, msg(size(99)), 3), true)
assert.equal(f.style.height, '')
f = frame(100)
applyFrameSize(f, msg(size(120)), 3)
assert.equal(f.style.height, '122px')

// content that always outgrows its frame (100vh + margin) is cut off after a burst of resizes
f = frame(100)
let applied = 0
for (let i = 0; i < 20; i++) {
  const before = f.style.height
  applyFrameSize(f, msg(size(f.offsetHeight + 24)), 3)
  if (f.style.height !== before) { applied++; f.offsetHeight = parseInt(f.style.height); f.clientHeight = f.offsetHeight - 2 }
}
assert.equal(applied, 4)

console.log('studyFrameSize ok')
