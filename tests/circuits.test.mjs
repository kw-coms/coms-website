import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { CIRCUITS } from '../src/pages/study/circuits/definitions.ts'
import { nets, pointOf } from '../src/pages/study/circuits/netlist.ts'
import { buildScene } from '../src/pages/study/circuits/scene.ts'
import * as sim from '../src/pages/study/circuits/sim.ts'

const html = readFileSync(new URL('../src/pages/study/content/arduino.html', import.meta.url), 'utf8')
const def = (id) => CIRCUITS.find((c) => c.id === id)

// ---- every figure in the lesson has a definition and the step list matches the wiring table above it
const mounts = [...html.matchAll(/<figure class="circuit" data-circuit="([\w-]+)"/g)]
assert.deepEqual(mounts.map((m) => m[1]).sort(), CIRCUITS.map((c) => c.id).sort(), 'every definition has exactly one mount point')
for (const m of mounts) {
  const before = html.slice(0, m.index)
  const table = before.slice(before.lastIndexOf('<table class="ref">'))
  assert.ok(table.trimEnd().endsWith('</table></div>'), `${m[1]}: the figure follows its wiring table directly`)
  const dataRows = (table.match(/<tr><td/g) || []).length
  const d = def(m[1])
  assert.equal(d.steps.length, dataRows, `${m[1]}: one step per table row`)
  const wires = d.steps.flatMap((s) => s.wires || [])
  assert.deepEqual([...wires].sort((a, b) => a - b), d.wires.map((_, i) => i), `${m[1]}: each wire belongs to exactly one step`)
  const parts = new Set(d.steps.flatMap((s) => s.parts || []))
  d.parts.forEach((p) => assert.ok(parts.has(p.id), `${m[1]}: part ${p.id} is introduced by a step`))
}

// ---- the drawing builds, and every terminal resolves to a point inside the scene
for (const d of CIRCUITS) {
  const svg = buildScene(d, 't', 'x')
  assert.ok(svg.startsWith('<svg') && !svg.includes('__'), `${d.id}: unresolved gradient id`)
  for (const w of d.wires) for (const r of [w.from, w.to]) {
    const [x, y] = pointOf(d, r)
    assert.ok(x >= 0 && y >= 0 && x <= d.size[0] && y <= d.size[1], `${d.id}: ${r} is inside the scene`)
  }
}

// ---- netlists: what each wiring table says must be one electrical node, and nothing else may be shorted
const expected = {
  'led-blink': [['uno:D8', 'res.a'], ['res.b', 'led.an'], ['led.ca', 'uno:GND']],
  'button-led': [['uno:D2', 'btn.tl', 'btn.tr'], ['btn.br', 'btn.bl', 'uno:GND', 'led.ca'], ['uno:D8', 'res.a'], ['res.b', 'led.an']],
  'pot-led': [['uno:5V', 'pot.l'], ['uno:A0', 'pot.m'], ['pot.r', 'uno:GND', 'led.ca'], ['uno:D9', 'res.a'], ['res.b', 'led.an']],
  ultrasonic: [['hc.VCC', 'uno:5V'], ['hc.Trig', 'uno:D7'], ['hc.Echo', 'uno:D6'], ['hc.GND', 'uno:GND']],
  servo: [['sv.GND', 'uno:GND'], ['sv.5V', 'uno:5V'], ['sv.SIG', 'uno:D9']],
  buzzer: [['bz.plus', 'uno:D8'], ['bz.minus', 'uno:GND']],
  alarm: [
    ['hc.VCC', 'uno:5V', 'bbr:T+:1'],
    ['hc.Trig', 'uno:D7'],
    ['hc.Echo', 'uno:D6'],
    ['hc.GND', 'bz.minus', 'led.ca', 'uno:GND'],
    ['bz.plus', 'uno:D8'],
    ['uno:D4', 'res.a'],
    ['res.b', 'led.an'],
  ],
}
for (const d of CIRCUITS) {
  const same = nets(d)
  const groups = expected[d.id]
  assert.ok(groups, `${d.id}: expected nets are listed`)
  groups.forEach((g) => g.slice(1).forEach((t) => assert.ok(same(g[0], t), `${d.id}: ${g[0]} should connect to ${t}`)))
  groups.forEach((a, i) => groups.slice(i + 1).forEach((b) => assert.ok(!same(a[0], b[0]), `${d.id}: ${a[0]} must not be shorted to ${b[0]}`)))
}
// INPUT_PULLUP button: open until pressed, then D2 sits on GND
assert.ok(!nets(def('button-led'), false)('uno:D2', 'uno:GND'))
assert.ok(nets(def('button-led'), true)('uno:D2', 'uno:GND'))

// ---- simulation numbers (copied from the sketches / the page's formulas)
assert.deepEqual([0, 499, 500, 999, 1000, 1500].map(sim.blinkOn), [true, true, false, false, true, false])
assert.equal(sim.buttonRead(true), 'LOW')
assert.equal(sim.buttonRead(false), 'HIGH')
assert.deepEqual(sim.potReadout(1023), { raw: 1023, volts: 5, duty: 255 })
assert.equal(sim.potReadout(256).duty, 63) // map(256, 0, 1023, 0, 255) truncates 63.8
assert.equal(sim.potReadout(0).duty, 0)
assert.equal(sim.rawFromKnob(-135), 0)
assert.equal(sim.rawFromKnob(135), 1023)
assert.equal(sim.echoMicros(10), 588) // 10 cm * 2 / 0.034
assert.ok(Math.abs(sim.cmFromMicros(580) - 9.86) < 0.01) // the page's quiz: 580 us -> about 9.9 cm
assert.equal(sim.melodyAt(0).note, 0)
assert.equal(sim.melodyAt(299).sounding, true)
assert.equal(sim.melodyAt(300).sounding, false)
assert.equal(sim.melodyAt(sim.NOTES.length * sim.NOTE_STEP_MS), null) // rest after the fifth note
assert.equal(sim.beepInterval(10), 80)
assert.equal(sim.beepInterval(100), 800)
assert.equal(sim.beepInterval(55), 80 + Math.trunc((45 * 720) / 90))
assert.deepEqual([null, -1, 101, 100, 50, 10, 5].map(sim.alarmZone), ['quiet', 'quiet', 'quiet', 'beep', 'beep', 'alarm', 'alarm'])

// replay the final sketch: far = silent, near = steady, middle = short beeps spaced by the map() interval
const run = (cm, from, to) => {
  const tick = sim.createAlarm()
  const out = []
  for (let t = from; t <= to; t += 10) out.push([t, tick(cm, t).buzzer])
  return out
}
assert.ok(run(150, 0, 2000).every(([, on]) => !on), 'beyond 100 cm: quiet')
assert.ok(run(5, 0, 2000).slice(1).every(([, on]) => on), 'within 10 cm: continuous alarm')
const beeps = run(10.5, 0, 3000).filter(([, on]) => on)
assert.ok(beeps.length > 0 && beeps.length < 120, 'middle zone beeps, not continuous')
const starts = []
run(55, 0, 6000).reduce((prev, [t, on]) => { if (on && !prev) starts.push(t); return on }, false)
const gaps = starts.slice(1).map((t, i) => t - starts[i])
assert.ok(gaps.every((g) => g >= sim.beepInterval(55) && g <= sim.beepInterval(55) + 130), `beep spacing follows map(): ${gaps}`)

console.log('circuits.test.mjs ok')
