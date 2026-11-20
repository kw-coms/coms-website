import assert from 'node:assert/strict'
import { ddayLabel, daysUntil, formatWhen, milestonePhase, milestoneWhen, nextMilestone } from '../src/features/teamProjects/teamProjects.ts'

const at = (text) => new Date(text)
const ms = (id, startsAt, dueAt) => ({ id, title: String(id), description: '', startsAt, dueAt, submittable: false, position: id })

assert.equal(formatWhen('2026-11-22T23:59:00'), '11/22(일) 23:59')
assert.equal(formatWhen('2026-12-06T00:00:00'), '12/6(일)', 'midnight shows the date only')
assert.equal(formatWhen(null), '')
assert.equal(milestoneWhen(ms(1, '2026-12-08T00:00', '2026-12-21T00:00')), '12/8(화) ~ 12/21(월)')
assert.equal(milestoneWhen(ms(1, null, null)), '일정 미정')

const now = at('2026-11-22T10:00:00')
assert.equal(daysUntil(at('2026-11-22T23:59:00'), now), 0, 'later today is D-DAY, not D-1')
assert.equal(daysUntil(at('2026-11-29T23:59:00'), now), 7)
assert.equal(daysUntil(at('2026-11-20T01:00:00'), now), -2)
assert.deepEqual([0, 7, -2].map(ddayLabel), ['D-DAY', 'D-7', 'D+2'])

const topic = ms(1, null, '2026-11-22T23:59:00')
const plan = ms(2, null, '2026-11-29T23:59:00')
const exam = ms(3, '2026-12-08T00:00', '2026-12-21T23:59')
assert.equal(milestonePhase(topic, now), 'upcoming')
assert.equal(milestonePhase(topic, at('2026-11-23T00:00:00')), 'past')
assert.equal(milestonePhase(exam, at('2026-12-10T12:00:00')), 'active')
assert.equal(milestonePhase(ms(4, null, null), now), 'undated')
assert.equal(nextMilestone([plan, topic, exam], now)?.id, 1, 'earliest unfinished milestone, whatever the list order')
assert.equal(nextMilestone([plan, topic, exam], at('2026-12-10T12:00:00'))?.id, 3, 'an ongoing period is the next item')
assert.equal(nextMilestone([topic], at('2027-01-01T00:00:00')), null)
console.log('teamProjects: date, D-day and next-deadline checks passed')
