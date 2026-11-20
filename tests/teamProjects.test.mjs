import assert from 'node:assert/strict'
import {
  ddayLabel, formatWhen, milestoneDday, milestonePhase, milestoneWhen, nextMilestone, submissionStatus, toWriteValue,
} from '../src/features/teamProjects/teamProjects.ts'

// A Date at a given Korea wall-clock time, whatever zone this process runs in.
const seoul = (text) => new Date(`${text}+09:00`)
const ms = (id, startsAt, dueAt, allDay = false) => ({ id, title: String(id), description: '', startsAt, dueAt, allDay, submittable: false, position: id })

assert.equal(formatWhen('2026-11-22T23:59:00'), '11/22(일) 23:59')
assert.equal(formatWhen('2026-12-06T00:00:00'), '12/6(일) 00:00', 'a midnight time is still shown')
assert.equal(formatWhen('2026-12-06T00:00:00', true), '12/6(일)', 'all-day shows the date only')
assert.equal(formatWhen(null), '')
assert.equal(milestoneWhen(ms(1, '2026-12-08T00:00:00', '2026-12-21T00:00:00', true)), '12/8(화) ~ 12/21(월)')
assert.equal(milestoneWhen(ms(1, null, null)), '일정 미정')

// Same answers whatever the viewer's zone: 23:30 on the 22nd in Seoul is still the 22nd.
const lateEvening = seoul('2026-11-22T23:30:00')
const topic = ms(1, null, '2026-11-22T23:59:00')
assert.equal(milestoneDday(topic, lateEvening), 'D-DAY')
assert.equal(milestoneDday(topic, seoul('2026-11-19T00:00:00')), 'D-3')
assert.equal(milestoneDday(topic, seoul('2026-11-24T10:00:00')), 'D+2')
assert.deepEqual([0, 7, -2].map(ddayLabel), ['D-DAY', 'D-7', 'D+2'])

// An all-day due date runs to the end of that day.
const allDayDue = ms(2, null, '2026-11-29T00:00:00', true)
assert.equal(milestonePhase(allDayDue, seoul('2026-11-29T23:59:59')), 'upcoming')
assert.equal(milestonePhase(allDayDue, seoul('2026-11-30T00:00:00')), 'past')
assert.equal(milestoneDday(allDayDue, seoul('2026-11-29T20:00:00')), 'D-DAY')
// A timed due is over right after the minute.
assert.equal(milestonePhase(topic, seoul('2026-11-22T23:59:00')), 'upcoming')
assert.equal(milestonePhase(topic, seoul('2026-11-23T00:00:00')), 'past')

// Periods: upcoming before the start, active start..end (inclusive of an all-day end), past after.
const exam = ms(3, '2026-12-08T00:00:00', '2026-12-21T00:00:00', true)
assert.equal(milestonePhase(exam, seoul('2026-12-07T23:59:59')), 'upcoming')
assert.equal(milestoneDday(exam, seoul('2026-12-01T12:00:00')), '시작 D-7')
assert.equal(milestonePhase(exam, seoul('2026-12-08T00:00:00')), 'active')
assert.equal(milestoneDday(exam, seoul('2026-12-08T09:00:00')), '종료 D-13')
assert.equal(milestonePhase(exam, seoul('2026-12-21T23:59:59')), 'active', 'the all-day end date is still inside the period')
assert.equal(milestoneDday(exam, seoul('2026-12-21T23:00:00')), '종료 D-DAY')
assert.equal(milestonePhase(exam, seoul('2026-12-22T00:00:00')), 'past')
assert.equal(milestonePhase(ms(4, null, null), seoul('2026-11-22T10:00:00')), 'undated')
assert.equal(milestoneDday(ms(4, null, null), seoul('2026-11-22T10:00:00')), null)

const plan = ms(5, null, '2026-11-29T23:59:00')
assert.equal(nextMilestone([plan, topic, exam], seoul('2026-11-22T10:00:00'))?.id, 1, 'earliest unfinished item, whatever the list order')
assert.equal(nextMilestone([plan, exam], seoul('2026-12-01T10:00:00'))?.id, 3, 'a period that has not begun is ordered by its start')
assert.equal(nextMilestone([plan, exam], seoul('2026-12-10T12:00:00'))?.id, 3, 'an ongoing period is the next item')
assert.equal(nextMilestone([topic], seoul('2027-01-01T00:00:00')), null)

// 제출 전 until the due time passes, then 미제출.
const submittable = { ...topic, submittable: true }
assert.equal(submissionStatus(undefined, submittable, seoul('2026-11-22T12:00:00')), 'PENDING')
assert.equal(submissionStatus(undefined, submittable, seoul('2026-11-23T00:00:00')), 'MISSING')
assert.equal(submissionStatus(undefined, { ...submittable, dueAt: null }, seoul('2030-01-01T00:00:00')), 'PENDING', 'no due date, never overdue')
assert.equal(submissionStatus({ late: true }, submittable, seoul('2026-11-22T12:00:00')), 'LATE')
assert.equal(submissionStatus({ late: false }, submittable, seoul('2026-11-22T12:00:00')), 'SUBMITTED')

assert.equal(toWriteValue('2026-12-08', true), '2026-12-08T00:00')
assert.equal(toWriteValue('2026-12-08T18:00', false), '2026-12-08T18:00')
assert.equal(toWriteValue('', true), null)
console.log('teamProjects: Seoul-time date, all-day, period, D-day and status checks passed')
