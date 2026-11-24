import assert from 'node:assert/strict'
import { test } from 'node:test'
import { eventDatePatch } from '../src/pages/admin/activityTimelineForm.ts'

test('changing the date moves the term with it', () => {
  assert.deepEqual(eventDatePatch('2026-10-05', '2026 1학기'), { eventDate: '2026-10-05', timelineTerm: '2026 2학기' })
  assert.deepEqual(eventDatePatch('2026-03-02', '2026 2학기'), { eventDate: '2026-03-02', timelineTerm: '2026 1학기' })
  assert.deepEqual(eventDatePatch('2027-01-10', ''), { eventDate: '2027-01-10', timelineTerm: '2026 겨울방학' })
})

test('clearing the date keeps the current term', () => {
  assert.deepEqual(eventDatePatch('', '2026 1학기'), { eventDate: '', timelineTerm: '2026 1학기' })
})
