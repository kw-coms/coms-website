import assert from 'node:assert/strict'
import { groupCounts, interestBars, attendancePercent } from '../src/pages/study/groups/studyGroupHelpers.ts'

assert.deepEqual(groupCounts([{ status: 'ACTIVE' }, { status: 'RECRUITING' }, { status: 'ACTIVE' }, { status: 'PROPOSED' }]), { PROPOSED: 1, RECRUITING: 1, ACTIVE: 2, ENDED: 0 })
assert.deepEqual(interestBars({ MON_EVENING: 2, TUE_EVENING: 0, FRI_NIGHT: 1 }, 3), [
  { key: 'MON_EVENING', count: 2, width: 67 },
  { key: 'FRI_NIGHT', count: 1, width: 33 },
  { key: 'TUE_EVENING', count: 0, width: 0 },
])
assert.equal(attendancePercent({ attended: 0, eligible: 0 }), 0)
assert.equal(attendancePercent({ attended: 2, eligible: 3 }), 67)
