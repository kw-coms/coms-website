import assert from 'node:assert/strict'
import { placeTourCard } from '../src/components/tour/tourLayout.ts'

const inside = (layout, viewport, height) => {
  assert.ok(layout.left >= viewport.left + 12)
  assert.ok(layout.left + layout.maxWidth <= viewport.left + viewport.width - 12)
  assert.ok(layout.top >= viewport.top + 12)
  assert.ok(layout.top + Math.min(height, layout.maxHeight) <= viewport.top + viewport.height - 12)
}

const phone = { left: 0, top: 0, width: 320, height: 568 }
const header = { left: 252, top: 0, width: 44, height: 44 }
const opening = placeTourCard(header, 296, 330, phone)
inside(opening, phone, 330)
assert.ok(opening.spot)
assert.ok(opening.top > 44, 'header stays visible above the card')

const ask = { left: 225, top: 504, width: 83, height: 44 }
const questions = placeTourCard(ask, 296, 420, phone, true)
inside(questions, phone, 420)
assert.ok(questions.top + questions.maxHeight <= questions.spot.top - 14,
  'the card never covers the visible question launcher')

const landscape = { left: 0, top: 0, width: 640, height: 320 }
const footer = { left: 490, top: 260, width: 100, height: 44 }
const short = placeTourCard(footer, 368, 580, landscape, true)
inside(short, landscape, 580)
assert.ok(short.maxHeight > 0 && short.maxHeight < 580,
  'long copy scrolls inside the shortened card')
assert.ok(short.top + short.maxHeight <= short.spot.top - 14)

const raisedAsk = placeTourCard({ left: 530, top: 105, width: 80, height: 44 }, 368, 580, landscape, true)
inside(raisedAsk, landscape, 580)
assert.ok(raisedAsk.left + raisedAsk.maxWidth <= raisedAsk.spot.left - 14,
  'a raised question launcher in landscape leaves room for the card beside it')

const keyboard = { left: 16, top: 195, width: 320, height: 320 }
const centered = placeTourCard(null, 368, 440, keyboard)
inside(centered, keyboard, 440)
assert.equal(centered.spot, null)

const desktop = { left: 0, top: 0, width: 1280, height: 900 }
const nav = placeTourCard({ left: 500, top: 0, width: 80, height: 44 }, 368, 300, desktop)
assert.ok(nav.top > 44, 'desktop card retains its original below-header placement')

console.log('tour layout geometry passed')
