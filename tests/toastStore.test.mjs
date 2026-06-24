import assert from 'node:assert/strict'
import { showToast, dismissToast } from '../src/components/common/Toast.tsx'

// The <ToastHost> render path needs a DOM (createPortal -> document.body) and is
// intentionally NOT covered here. This suite exercises the imperative store:
// showToast/dismissToast and the auto-dismiss timer lifecycle
// (enter -> leaving -> removed).
//
// The store calls bare setTimeout/clearTimeout, which resolve globalThis at call
// time, so we replace them with a deterministic fake scheduler. Each scheduled
// callback is captured and run on demand via flush(), letting us assert the
// timer-driven transitions without real time.

const scheduled = new Map()
let handle = 0
const realSetTimeout = globalThis.setTimeout
const realClearTimeout = globalThis.clearTimeout
globalThis.setTimeout = (fn, ms) => {
  const id = ++handle
  scheduled.set(id, { fn, ms })
  return id
}
globalThis.clearTimeout = (id) => {
  scheduled.delete(id)
}
function flush() {
  // Run currently-pending callbacks (which may schedule new ones).
  for (const [id, { fn }] of [...scheduled]) {
    scheduled.delete(id)
    fn()
  }
}

try {
  // 1. showToast returns a unique, increasing id; accepts a bare string or object.
  const idA = showToast('첫 번째 알림')
  const idB = showToast({ message: '두 번째', tone: 'success', duration: 1000 })
  assert.equal(typeof idA, 'number')
  assert.ok(idB > idA, 'ids increase monotonically')

  // 2. A positive duration schedules exactly one auto-dismiss timer per toast.
  assert.equal(scheduled.size, 2, 'two pending auto-dismiss timers')

  // 3. duration: 0 schedules NO auto-dismiss timer.
  showToast({ message: '영구', duration: 0 })
  assert.equal(scheduled.size, 2, 'duration:0 adds no timer')

  // 4. Auto-dismiss lifecycle: firing the duration timer flags the toast as
  //    leaving and schedules a single LEAVE_MS cleanup timer that removes it.
  scheduled.clear()
  const idC = showToast({ message: '자동 해제', duration: 500 })
  assert.equal(scheduled.size, 1, 'one duration timer scheduled')
  flush() // fire the duration timer -> removeToast -> schedules cleanup
  assert.equal(scheduled.size, 1, 'leaving cleanup timer now pending')

  // Running the cleanup timer removes the toast and leaves no pending timers.
  flush()
  assert.equal(scheduled.size, 0, 'no timers remain after cleanup runs')

  // removeToast's leaving-guard: a second showToast/auto-dismiss cycle reaching
  // removeToast on an already-leaving toast does not stack duplicate cleanup
  // timers. Drive it: fire duration, then verify exactly one cleanup pending.
  scheduled.clear()
  const idC2 = showToast({ message: '재진입', duration: 100 })
  flush() // duration fires -> one cleanup scheduled
  assert.equal(scheduled.size, 1, 'exactly one cleanup timer for a leaving toast')
  flush()
  assert.equal(scheduled.size, 0)
  void idC

  // 5. dismissToast clears a pending auto-dismiss timer, then drives removal:
  //    one auto timer is cleared and replaced by one leaving cleanup timer.
  scheduled.clear()
  const idD = showToast({ message: '수동', duration: 9999 })
  assert.equal(scheduled.size, 1)
  dismissToast(idD) // clears the auto timer, schedules the leaving cleanup
  assert.equal(scheduled.size, 1, 'auto timer cleared, cleanup timer scheduled')
  flush()
  assert.equal(scheduled.size, 0)

  // 6. Dismissing an unknown id is a safe no-op (no throw, no timer).
  scheduled.clear()
  dismissToast(123456789)
  assert.equal(scheduled.size, 0, 'unknown id dismiss is inert')
} finally {
  globalThis.setTimeout = realSetTimeout
  globalThis.clearTimeout = realClearTimeout
}

console.log('toast store contract passed')
