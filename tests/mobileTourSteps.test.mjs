import assert from 'node:assert/strict'
import { MOBILE_TOUR_STEPS, TOUR_STEPS } from '../src/data/tourSteps.ts'

assert.equal(TOUR_STEPS.guest.length, 6, 'desktop guest tour keeps its original length')
assert.equal(TOUR_STEPS.member.length, 8, 'desktop member tour keeps its original length')

for (const kind of ['guest', 'member']) {
  const steps = MOBILE_TOUR_STEPS[kind]
  assert.deepEqual(steps.map((step) => step.id),
    ['menu-search', 'study-lab', 'works', 'appearance', 'questions', 'account'],
    `${kind} has one compact six-step path through the phone UI`)
  assert.deepEqual(steps[0].targets,
    ['[data-tour="mobile-menu"]', '[data-tour="quick-search"]'])
  assert.deepEqual(steps[1].targets, ['[data-tour="mobile-menu"]'])
  assert.deepEqual(steps[2].targets, ['[data-tour="mobile-menu"]'])
  assert.deepEqual(steps[4].targets, ['[data-tour="ask"]'])
  assert.match(steps[1].body, /배움.*스터디 자료.*회로 Lab/)
  assert.match(steps[2].body, /도구.*작품/)
  assert.match(steps[3].body, /화면 설정.*인트로.*강조/)
  assert.match(steps[4].body, /세 가지.*다른 질문/)
  assert.match(steps[5].body, /메뉴/)
}
assert.match(MOBILE_TOUR_STEPS.guest[1].body, /로그인/)
assert.match(MOBILE_TOUR_STEPS.member[1].body, /강의 본문/)
assert.match(MOBILE_TOUR_STEPS.guest[5].body, /로그인/)
assert.match(MOBILE_TOUR_STEPS.member[5].body, /계정 설정/)

console.log('mobile tour step contracts passed')
