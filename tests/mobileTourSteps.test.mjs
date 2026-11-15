import assert from 'node:assert/strict'
import { MOBILE_TOUR_STEPS, TOUR_STEPS } from '../src/data/tourSteps.ts'

assert.equal(TOUR_STEPS.guest.length, 7, 'desktop guest guidance includes the actual question panel')
assert.equal(TOUR_STEPS.member.length, 9, 'desktop member guidance includes the actual question panel')

for (const kind of ['guest', 'member']) {
  const steps = MOBILE_TOUR_STEPS[kind]
  assert.deepEqual(steps.map((step) => step.id),
    ['menu-search', 'study-lab', 'works', 'appearance', 'questions', 'account'],
    `${kind} has one compact six-step path through the phone UI`)
  assert.equal(steps[0].surface, 'menu')
  assert.match(steps[0].targets[0], /data-tour-path="\/about"/)
  assert.equal(steps[1].surface, 'learn')
  assert.match(steps[1].targets[0], /data-tour-path="\/study"/)
  assert.equal(steps[2].surface, 'tools')
  assert.match(steps[2].targets[0], /data-tour-path="\/apps"/)
  assert.equal(steps[4].surface, 'ask')
  assert.deepEqual(steps[4].targets, ['#coms-ask-panel'])
  assert.match(steps[1].body, /배움.*스터디 자료.*회로 Lab/)
  assert.match(steps[2].body, /도구.*작품/)
  assert.match(steps[3].body, /화면 설정.*인트로.*강조/)
  assert.match(steps[4].body, /세 가지.*다른 질문/)
  assert.match(steps[5].body, /메뉴/)
}
for (const kind of ['guest', 'member']) {
  const steps = TOUR_STEPS[kind]
  assert.equal(steps.find((step) => step.id === 'questions').surface, 'ask')
  for (const step of steps.filter((step) => step.surface && step.surface !== 'ask' && step.surface !== 'account')) {
    assert.ok(step.targets.every((selector) => selector.includes('data-tour-path')), 'open menus point to real entries, not the closed group toggle')
  }
}
assert.match(MOBILE_TOUR_STEPS.guest[1].body, /로그인/)
assert.match(MOBILE_TOUR_STEPS.member[1].body, /강의 본문/)
assert.match(MOBILE_TOUR_STEPS.guest[5].body, /로그인/)
assert.match(MOBILE_TOUR_STEPS.member[5].body, /계정 설정/)

console.log('mobile tour step contracts passed')
