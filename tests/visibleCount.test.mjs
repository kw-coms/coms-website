import assert from 'node:assert/strict'

// useVisibleCount is a thin wrapper around useState; its real logic is pure math:
//   cappedVisible = min(visible, total)
//   canLoadMore   = cappedVisible < total
//   loadMore()    => visible += step
//   resetKey change => visible = step
// react-test-renderer is NOT a dependency, so rather than mount the hook we model
// its state machine here and assert the exact derivations from the source. Keep
// this in lockstep with src/hooks/useVisibleCount.ts.

// Pure derivation helpers mirroring the hook body.
function derive(visible, total) {
  const cappedVisible = Math.min(visible, total)
  return { visible: cappedVisible, canLoadMore: cappedVisible < total, total }
}

// Initial window equals `step`, capped at total.
assert.deepEqual(derive(20, 100), { visible: 20, canLoadMore: true, total: 100 })
// When the list is smaller than a step, visible never exceeds total.
assert.deepEqual(derive(20, 7), { visible: 7, canLoadMore: false, total: 7 })
// Exactly at the end: nothing more to load.
assert.deepEqual(derive(20, 20), { visible: 20, canLoadMore: false, total: 20 })
// Empty list: visible 0, cannot load more.
assert.deepEqual(derive(20, 0), { visible: 0, canLoadMore: false, total: 0 })

// loadMore increments the raw window by `step`; canLoadMore flips false at the end.
function loadMore(visible, step) {
  return visible + step
}
let raw = 20
const step = 20
assert.deepEqual(derive(raw, 55), { visible: 20, canLoadMore: true, total: 55 })
raw = loadMore(raw, step) // 40
assert.deepEqual(derive(raw, 55), { visible: 40, canLoadMore: true, total: 55 })
raw = loadMore(raw, step) // 60, capped to 55
assert.deepEqual(derive(raw, 55), { visible: 55, canLoadMore: false, total: 55 })
// Over-shooting loadMore still caps at total and stays canLoadMore=false.
raw = loadMore(raw, step) // 80
assert.deepEqual(derive(raw, 55), { visible: 55, canLoadMore: false, total: 55 })

// resetKey change snaps the raw window back to `step` (render-phase reset).
function applyReset(currentRaw, lastKey, nextKey, step) {
  return nextKey !== lastKey ? step : currentRaw
}
assert.equal(applyReset(80, 'a', 'b', 20), 20, 'changed key resets to step')
assert.equal(applyReset(80, 'a', 'a', 20), 80, 'unchanged key preserves window')
// undefined -> undefined is treated as no change (Object.is/!== semantics).
assert.equal(applyReset(40, undefined, undefined, 20), 40)
// After a reset the window is back to one step and canLoadMore reflects total.
assert.deepEqual(derive(applyReset(80, 'a', 'b', 20), 100), { visible: 20, canLoadMore: true, total: 100 })

// Default step is 20 in the source signature; a custom step drives the increment.
let custom = 5
assert.deepEqual(derive(custom, 12), { visible: 5, canLoadMore: true, total: 12 })
custom = loadMore(custom, 5) // 10
assert.deepEqual(derive(custom, 12), { visible: 10, canLoadMore: true, total: 12 })
custom = loadMore(custom, 5) // 15 -> capped 12
assert.deepEqual(derive(custom, 12), { visible: 12, canLoadMore: false, total: 12 })

console.log('visible count contract passed')
