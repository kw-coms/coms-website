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

// shrinking by 1px or less is ignored (no jitter); growth, even by 1px, is always applied so a frame is never shorter than its content
f = frame(102)
assert.equal(applyFrameSize(f, msg(size(100)), 3), true)
assert.equal(f.style.height, '')
f = frame(103)
applyFrameSize(f, msg(size(100)), 3) // next 102, 1px shorter
assert.equal(f.style.height, '')
f = frame(100)
applyFrameSize(f, msg(size(99)), 3) // next 101, 1px taller
assert.equal(f.style.height, '101px')
f = frame(100)
applyFrameSize(f, msg(size(120)), 3)
assert.equal(f.style.height, '122px')

// every report is applied: a burst of quick edits ends at the last height (nothing throttled, nothing stale)
f = frame(100)
for (const h of [150, 90, 400, 120, 300, 210]) applyFrameSize(f, msg(size(h, { k: 'a' })), 3)
assert.equal(f.style.height, '212px')

// the real frame: content = its viewport + 24 (100vh + margins); it reports only when the content changes
function simulate(f, k, reports = 20) {
  let last = -1, applied = 0
  for (let i = 0; i < reports; i++) {
    const h = f.clientHeight + 24
    if (h === last) break // the page's hook sends nothing when the height did not change: the loop has ended
    last = h
    const before = f.style.height
    applyFrameSize(f, msg(size(h, { k })), 3)
    if (f.style.height !== before) { applied++; f.offsetHeight = parseInt(f.style.height); f.clientHeight = f.offsetHeight - 2 }
  }
  return applied
}
f = frame(100)
assert.equal(simulate(f, 'doc1'), 1) // grew once; the report that followed grew by the same amount, so it is not applied
assert.equal(f.style.height, '124px')

// a new document (another k) starts clean: the same frame, a fresh page, normal growth is applied again
applyFrameSize(f, msg(size(500, { k: 'doc2' })), 3)
assert.equal(f.style.height, '502px')
// ...and the old document's feedback state does not carry over: doc2's first report after a growth is not mistaken for feedback
f.offsetHeight = 502; f.clientHeight = 500
applyFrameSize(f, msg(size(500 + 378, { k: 'doc3' })), 3) // prev from another doc, grew from another doc
assert.equal(f.style.height, `${FRAME_MAX}px`)

// growth that is not the frame following itself (different amount) is applied
f = frame(100)
applyFrameSize(f, msg(size(200, { k: 'x' })), 3) // grew 102
applyFrameSize(f, msg(size(450, { k: 'x' })), 3) // content grew 250, not 102
assert.equal(f.style.height, '452px')

console.log('studyFrameSize ok')
