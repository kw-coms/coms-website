import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { IDLE, chromeHtml, hintHtml, reservedTexts, statusTexts } from '../src/pages/study/circuits/chrome.ts'
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

// ---- every figure carries its whole chrome in the page, so it has its final height before any script runs
const inFigure = '(?:(?!</figure>)[\\s\\S])*?' // never let one match run into the next figure
const chromes = [...html.matchAll(new RegExp(`<figure class="circuit" data-circuit="([\\w-]+)"[^>]*>\n(${inFigure})\n<figcaption>(${inFigure})</figcaption>`, 'g'))]
assert.equal(chromes.length, CIRCUITS.length, 'every figure has its static chrome')
for (const m of chromes) {
  const d = def(m[1])
  const regen = 'out of date: run node --import tsx scripts/gen-circuit-chrome.mjs'
  assert.equal(m[2], chromeHtml(d), `${m[1]}: static chrome ${regen}`)
  assert.ok(m[3].endsWith(` ${hintHtml(d)}`), `${m[1]}: caption hint ${regen}`)
  // the stage box takes the scene's aspect ratio from the page itself: it must be the viewBox the scene is drawn in
  const [, w, h] = /class="circuit-plane" style="--w: (\d+); --h: (\d+)"/.exec(m[2]) ?? []
  assert.deepEqual([Number(w), Number(h)], d.size, `${m[1]}: stage aspect ratio = def.size`)
  assert.ok(buildScene(d, 't', 'x').includes(` viewBox="0 0 ${d.size[0]} ${d.size[1]}" `), `${m[1]}: the scene is drawn in def.size`)
}
// the status line reserves room for its idle text and for the widest text of each running message template
for (const d of CIRCUITS) {
  const reserved = reservedTexts(d.sim)
  assert.equal(reserved[0], IDLE[d.sim])
  assert.ok(reserved.length >= 2, `${d.id}: a running text is reserved`)
}
assert.ok(reservedTexts('alarm').some((t) => t.includes('경보!')) && reservedTexts('alarm').some((t) => t.includes('조용')), 'each alarm zone is reserved')
// ...for every text a sim can print: a reserved text of the same template whose every number is at least as wide
const NUMBER = /-?\d+(?:\.\d+)?/g
const shape = (t) => ({ key: t.replace(NUMBER, '#'), lens: (t.match(NUMBER) ?? []).map((n) => n.length) })
for (const kind of new Set(CIRCUITS.map((d) => d.sim))) {
  const reserved = reservedTexts(kind).map(shape)
  for (const t of statusTexts[kind]()) {
    const { key, lens } = shape(t)
    assert.ok(reserved.some((r) => r.key === key && r.lens.every((n, i) => n >= lens[i])), `${kind}: no room reserved for "${t}"`)
  }
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
  'cds-night': [['uno:5V', 'cds.a'], ['cds.b', 'rd.a', 'uno:A0'], ['rd.b', 'uno:GND', 'led.ca'], ['uno:D8', 'res.a'], ['res.b', 'led.an']],
  'rgb-led': [['uno:D9', 'rr.a'], ['rr.b', 'rgb.r'], ['uno:D10', 'rg.a'], ['rg.b', 'rgb.g'], ['uno:D11', 'rb.a'], ['rb.b', 'rgb.b'], ['rgb.c', 'uno:GND']],
  'lcd-i2c': [['lcd.GND', 'uno:GND', 'pot.r'], ['lcd.VCC', 'uno:5V', 'pot.l'], ['lcd.SDA', 'uno:A4'], ['lcd.SCL', 'uno:A5'], ['pot.m', 'uno:A0']],
  dht11: [['dht.S', 'uno:D2'], ['dht.VCC', 'uno:5V'], ['dht.GND', 'uno:GND']],
  'dht11-lcd': [['dht.S', 'uno:D2'], ['dht.VCC', 'uno:5V', 'lcd.VCC'], ['dht.GND', 'uno:GND', 'lcd.GND'], ['lcd.SDA', 'uno:A4'], ['lcd.SCL', 'uno:A5']],
  joystick: [['joy.GND', 'uno:GND'], ['joy.5V', 'uno:5V'], ['joy.VRx', 'uno:A0'], ['joy.VRy', 'uno:A1'], ['joy.SW', 'uno:D7']],
  // the motor runs from its own battery: only the grounds are shared, never the supply
  'dc-motor': [['bat.plus', 'drv.VCC'], ['bat.minus', 'drv.GND', 'uno:GND'], ['uno:D5', 'drv.A-IA'], ['uno:D6', 'drv.A-IB'], ['drv.MA1', 'motor.t1'], ['drv.MA2', 'motor.t2']],
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

// ---- chapter 6: the figures follow the numbers printed in the sketches next to them
// plain text of the lesson: walk the markup and keep only what lies outside <...>, then decode the three entities the code blocks use
const textOf = (markup) => {
  let out = ''
  let inTag = false
  for (const ch of markup) {
    if (ch === '<') inTag = true
    else if (ch === '>' && inTag) inTag = false
    else if (!inTag) out += ch
  }
  return out.split('&lt;').join('<').split('&gt;').join('>').split('&amp;').join('&')
}
const code = textOf(html)
const printed = (snippet) => assert.ok(code.includes(snippet), `sketch text changed: ${snippet}`)
assert.ok(!nets(def('dc-motor'))('bat.plus', 'uno:5V'), 'the motor supply never touches the Arduino 5V pin')
assert.ok(!nets(def('dc-motor'))('bat.plus', 'uno:GND'))
// RGB: three separate resistors, each colour on its own PWM pin
assert.ok(def('rgb-led').parts.filter((p) => p.kind === 'resistor').length === 3)

// 6-2 night light
printed('const int DARK_ON  = 300;')
printed('const int DARK_OFF = 350;')
assert.equal(sim.DARK_ON, 300)
assert.equal(sim.DARK_OFF, 350)
assert.equal(sim.cdsRaw(100), 930) // the page: CDS 1 kohm -> about 930
assert.ok(Math.abs(sim.cdsRaw(0) - 49) <= 1) // 200 kohm
assert.ok(sim.cdsRaw(20) < sim.cdsRaw(50) && sim.cdsRaw(50) < sim.cdsRaw(80), 'brighter light -> larger analogRead')
assert.equal(sim.nightLightOn(false, 299), true)
assert.equal(sim.nightLightOn(false, 300), false)
assert.equal(sim.nightLightOn(true, 350), true) // hysteresis: stays on until above 350
assert.equal(sim.nightLightOn(true, 351), false)

// 6-3 colour table: every row of the page's table equals the simulation's
for (const [r, g, b, name] of sim.COLORS.filter((c) => c[3] !== '초록' && c[3] !== '파랑')) {
  assert.ok(html.includes(`<tr><td>${name}</td><td>${r}</td><td>${g}</td><td>${b}</td></tr>`), `colour table row ${name}`)
}
printed('delay(800);')
assert.equal(sim.COLOR_MS, 800)
assert.deepEqual(sim.colorAt(0).slice(0, 3), [255, 0, 0])
assert.deepEqual(sim.colorAt(800 * 7).slice(0, 3), [255, 80, 0])
assert.deepEqual(sim.colorAt(800 * 8).slice(0, 3), [255, 0, 0], 'the cycle wraps after eight colours')
assert.deepEqual([0, 85, 170, 84, 255].map(sim.wheel), [[255, 0, 0], [0, 255, 0], [0, 0, 255], [3, 252, 0], [255, 0, 0]])
assert.equal(sim.colorName(255, 255, 0), '노랑')
assert.equal(sim.colorName(1, 2, 3), null)

// 6-4 LCD
printed('LiquidCrystal_I2C lcd(0x27, 16, 2);')
printed('lcd.print("Hello, COM\'s!");')
assert.equal(sim.LCD_COLS, 16)
assert.equal(sim.lcdA0Line(512), 'A0 = 512        ')
assert.equal(sim.lcdA0Line(1023), 'A0 = 1023       ')
assert.equal(sim.lcdPad('x'.repeat(20)).length, 16)

// 6-5 DHT11
printed('delay(2000);')
assert.equal(sim.DHT_READ_MS, 2000)
assert.equal(sim.dhtSerial(24, 45), 'Temp: 24.0 C   Humidity: 45 %') // the page's printed output
assert.equal(sim.dhtSerialShort(24, 46), '24.0 C, 46 %')
assert.deepEqual(sim.dhtLcdLines(24, 45), ['Temp: 24.0°C    ', 'Humi: 45%      '.padEnd(16)])
assert.deepEqual(sim.dhtLcdLines(null, 45), ['Sensor error    ', ' '.repeat(16)])
printed('lcd.print("Humi: ");')

// 6-6 joystick: the page's sample output lines
printed('if (x < 300)')
printed('} else if (x > 700) {')
assert.equal(sim.joyVx(118), -77)
assert.equal(sim.joyVx(1023), 100)
assert.equal(sim.joyVx(512), 0)
assert.equal(sim.joyLine(118, 511, false), 'X=118 Y=511 vx=-77 SW=- -> LEFT')
assert.equal(sim.joyLine(514, 14, false), 'X=514 Y=14 vx=0 SW=- -> UP')
assert.equal(sim.joyLine(513, 510, true), 'X=513 Y=510 vx=0 SW=PRESSED -> CENTER')
assert.deepEqual([[512, 512], [299, 512], [700, 512], [701, 512], [512, 300], [512, 701]].map(([x, y]) => sim.joyDir(x, y)), ['CENTER', 'LEFT', 'CENTER', 'RIGHT', 'CENTER', 'DOWN'])
assert.equal(sim.joyRaw(-1), 0)
assert.equal(sim.joyRaw(1), 1023)

// 6-7 motor sketch: ramp +5 every 40 ms to 255, hold 1 s, stop 0.8 s, same reversed, hold 1 s, stop 2 s
printed('for (int s = 0; s <= 255; s += 5)')
printed('for (int s = 0; s >= -255; s -= 5)')
assert.equal(sim.MOTOR_LOOP_MS, 8960)
assert.deepEqual([0, 39, 40, 2079, 2080, 3079, 3080, 3879, 3880, 3920, 5959, 5960, 6959, 6960, 8959, 8960].map(sim.motorLoopAt), [0, 0, 5, 255, 255, 255, 0, 0, 0, -5, -255, -255, -255, 0, 0, 0])
assert.deepEqual(sim.motorPins(120), { ia: 120, ib: 0 })
assert.deepEqual(sim.motorPins(-120), { ia: 0, ib: 120 })
assert.deepEqual(sim.motorPins(999), { ia: 255, ib: 0 }, 'constrain(speed, -255, 255)')

console.log('circuits.test.mjs ok')
