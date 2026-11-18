import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evaluationPath, refreshWorker } from '../public/hackathon-refresh.js'

test('share paths preserve their event identity without accepting arbitrary destinations', () => {
  for (const [path, target] of [
    ['/hackathon/share', '/hackathon'],
    ['/hackathon/1/share', '/hackathon/1'],
    ['/hackathon/2028/share', '/hackathon/2028'],
    ['/hackathon/0/share', null],
    ['/hackathon/01/share', null],
    ['/hackathon/-1/share', null],
    ['/hackathon/2/share/extra', null],
    ['/hackathon/https://example.com/share', null],
  ]) assert.equal(evaluationPath(path), target)
})

test('an existing registration checks for a new worker', async () => {
  let updates = 0
  const registration = { active: { state: 'activated' }, update: async () => { updates++ } }
  await refreshWorker(registration, {}, 100)
  assert.equal(updates, 1)
})

test('a newly installing worker activates before the share page redirects', async () => {
  const next = new EventTarget()
  next.state = 'installing'
  const previous = { state: 'activated' }
  const registration = { active: previous, installing: next, update: async () => {} }
  const serviceWorker = new EventTarget()
  serviceWorker.controller = previous
  const pending = refreshWorker(registration, serviceWorker, 1000)
  let finished = false
  pending.then(() => { finished = true })
  await Promise.resolve()
  assert.equal(finished, false)
  next.state = 'activated'
  next.dispatchEvent(new Event('statechange'))
  await Promise.resolve()
  assert.equal(finished, false)
  serviceWorker.controller = next
  serviceWorker.dispatchEvent(new Event('controllerchange'))
  await pending
  assert.equal(finished, true)
})

test('failed update leaves the browser on the recovery page', async () => {
  const registration = { active: { state: 'activated' }, update: async () => { throw new Error('offline') } }
  await assert.rejects(refreshWorker(registration, {}, 100), /offline/)
})

test('a stalled update has a bounded wait', async () => {
  const registration = { active: { state: 'activated' }, update: () => new Promise(() => {}) }
  await assert.rejects(refreshWorker(registration, {}, 10), /timed out/)
})
