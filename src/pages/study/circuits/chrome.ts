// The part of every circuit figure that exists before any script runs. content/arduino.html carries this markup
// (bar, stage box, controls, status line, live region, caption hint) for each <figure class="circuit">, so the
// static figure already has its final height; the runtime (index.ts) only fills it in. Regenerate the markup with
//   node --import tsx scripts/gen-circuit-chrome.mjs
// after changing anything here (tests/circuits.test.mjs fails while the page is out of date).
import type { CircuitDef, SimKind } from './definitions'
import * as sim from './sim'

export const IDLE: Record<SimKind, string> = {
  blink: '▶ 시뮬레이션을 누르면 스케치처럼 D8이 0.5초마다 HIGH/LOW로 바뀌고 LED가 깜빡입니다.',
  button: '▶ 시뮬레이션을 누른 뒤 그림 속 버튼을 눌러 보세요. (마우스/터치로 누르고 있기, 또는 포커스 후 Space/Enter)',
  pot: '▶ 시뮬레이션을 누른 뒤 가변저항 손잡이를 돌리거나 슬라이더를 움직여 보세요.',
  ultrasonic: '▶ 시뮬레이션을 누른 뒤 슬라이더로 물체의 거리를 바꿔 보세요.',
  servo: '▶ 시뮬레이션을 누른 뒤 슬라이더로 각도를 바꿔 보세요.',
  buzzer: '▶ 시뮬레이션을 누르면 도레미파솔이 연주되는 동안 소리 파동이 표시됩니다. (실제 소리는 나지 않아요)',
  alarm: '▶ 시뮬레이션을 누른 뒤 슬라이더로 물체의 거리를 바꿔 보세요. 최종 스케치와 같은 구간·간격으로 동작합니다.',
  cds: '▶ 시뮬레이션을 누른 뒤 슬라이더로 주변 밝기를 바꿔 보세요. 야간등 스케치처럼 analogRead가 300 아래로 내려가면 LED가 켜집니다.',
  rgb: '▶ 시뮬레이션을 누른 뒤 R·G·B 슬라이더(analogWrite 값)를 움직이거나, 스케치의 색 순환을 재생해 보세요.',
  lcd: '▶ 시뮬레이션을 누르면 LCD에 글자가 나타납니다. 가변저항 손잡이나 슬라이더로 둘째 줄의 A0 값을 바꿔 보세요.',
  dht: '▶ 시뮬레이션을 누른 뒤 슬라이더로 온도·습도를 바꿔 보세요. 스케치처럼 2초마다 한 번 읽어 시리얼에 출력합니다.',
  'dht-lcd': '▶ 시뮬레이션을 누른 뒤 슬라이더로 온도·습도를 바꿔 보세요. 2초마다 읽어 LCD와 시리얼에 함께 표시합니다.',
  joystick: '▶ 시뮬레이션을 누른 뒤 그림 속 스틱을 끌거나 슬라이더를 움직여 보세요. 스틱 누르기 버튼은 SW(D7)입니다.',
  motor: '▶ 시뮬레이션을 누른 뒤 슬라이더로 setMotor 속도(−255~255)를 바꾸거나, 스케치의 loop()를 재생해 보세요.',
}

export const HINT = '위 표의 줄에 마우스를 올리거나 포커스하면 그림에서 해당 선과 부품이 강조됩니다. 키보드는 Tab으로 표에 들어가 위·아래 방향키로 줄을 옮깁니다.'

export interface RangeSpec { label: string; min: number; max: number; value: number; unit: string }
const r = (label: string, min: number, max: number, value: number, unit = ''): RangeSpec => ({ label, min, max, value, unit })
/** The sliders of each simulation, in the order the runtime binds them. */
export const RANGES: Partial<Record<SimKind, RangeSpec[]>> = {
  pot: [r('가변저항 값 (analogRead)', 0, 1023, 512)],
  lcd: [r('가변저항 값 (A0)', 0, 1023, 512)],
  cds: [r('주변 밝기', 0, 100, 70, '%')],
  rgb: [r('R (D9)', 0, 255, 255), r('G (D10)', 0, 255, 0), r('B (D11)', 0, 255, 0)],
  dht: [r('온도', 0, 50, 24, '°C'), r('습도', 20, 80, 45, '%')],
  'dht-lcd': [r('온도', 0, 50, 24, '°C'), r('습도', 20, 80, 45, '%')],
  joystick: [r('X축 (A0)', 0, 1023, 512), r('Y축 (A1)', 0, 1023, 512)],
  motor: [r('속도 setMotor(speed)', -255, 255, 0)],
  ultrasonic: [r('물체까지 거리', 2, 200, 40, 'cm')],
  alarm: [r('물체까지 거리', 2, 200, 60, 'cm')],
  servo: [r('각도', 0, 180, 90, '°')],
}
/** The toggle buttons after the sliders. */
export const MODES: Partial<Record<SimKind, string[]>> = {
  rgb: ['색 섞기 스케치 재생', '무지개 스케치 재생'],
  dht: ['읽기 실패 만들기 (NaN)'],
  'dht-lcd': ['읽기 실패 만들기 (NaN)'],
  joystick: ['스틱 누르기 (SW)'],
  motor: ['loop() 스케치 재생'],
}

/* ---------- what the status line prints while a simulation runs ---------- */
export const DHT_WAIT = 'delay(2000) 중… 첫 측정까지 2초'
export const DHT_FAIL = 'DHT read failed  (isnan 검사에 걸려 return)'
const onOff = (on: boolean) => (on ? '켜짐' : '꺼짐')
export const say = {
  blink: (on: boolean) => `digitalWrite(8, ${on ? 'HIGH' : 'LOW'}) → D8 = ${on ? '5V' : '0V'}, LED ${onOff(on)}  (delay(${sim.BLINK_MS})마다 반복)`,
  button: (pressed: boolean) =>
    `D2 = ${sim.buttonRead(pressed)} (${pressed ? '눌림 → GND와 연결' : '안 눌림, 내부 풀업이 HIGH로 당김'}) → digitalWrite(8, ${pressed ? 'HIGH' : 'LOW'}), LED ${onOff(pressed)}`,
  pot: (raw: number) => {
    const p = sim.potReadout(raw)
    return `analogRead(A0) = ${p.raw} (약 ${p.volts.toFixed(2)}V) → map → analogWrite(9, ${p.duty}) : LED 밝기 ${Math.round((p.duty / 255) * 100)}%`
  },
  lcd: (raw: number) => `lcd.print("${sim.LCD_HELLO}") 첫 줄 / 둘째 줄: "A0 = ${raw}" (analogRead(A0) = ${raw}, 0.2초마다 갱신)`,
  cds: (light: number, on: boolean) => {
    const raw = sim.cdsRaw(light)
    return `light = ${raw}  LED ${on ? 'ON' : 'OFF'}   (CDS 약 ${sim.cdsKohm(light).toFixed(1)}kΩ, A0 약 ${((raw * 5) / 1023).toFixed(2)}V, 켜는 값 ${sim.DARK_ON} / 끄는 값 ${sim.DARK_OFF})`
  },
  rgb: (r: number, g: number, b: number) => `analogWrite(9, ${r}) · analogWrite(10, ${g}) · analogWrite(11, ${b}) → ${sim.colorName(r, g, b) ?? `rgb(${r}, ${g}, ${b})`}`,
  dht: (t: number, h: number) => sim.dhtSerial(t, h),
  dhtLcd: (t: number, h: number) => `Serial: ${sim.dhtSerialShort(t, h)}`,
  motor: (speed: number) => {
    const p = sim.motorPins(speed)
    const pwm = Math.max(p.ia, p.ib)
    const what = speed === 0 ? '정지' : pwm < sim.STALL_PWM ? `PWM ${pwm}는 너무 낮아 웅 소리만 나고 돌지 않음` : `${speed > 0 ? '정방향' : '역방향'}, 속도 ${Math.round((pwm / 255) * 100)}%`
    return `setMotor(${speed}) → analogWrite(5, ${p.ia}) · analogWrite(6, ${p.ib}) : ${what}`
  },
  ultrasonic: (cm: number) => {
    const us = sim.echoMicros(cm)
    return `Echo가 HIGH였던 시간 = ${us}µs → ${us} × 0.034 / 2 = ${sim.cmFromMicros(us).toFixed(1)}cm`
  },
  alarm: (cm: number) => {
    const zone = sim.alarmZone(cm)
    return zone === 'quiet'
      ? `거리 ${cm}cm: ${sim.FAR_CM}cm보다 멀다 → 조용 (부저·LED 꺼짐)`
      : zone === 'alarm'
        ? `거리 ${cm}cm: ${sim.NEAR_CM}cm 이내 → 경보! 부저가 계속 울리고 LED가 켜짐`
        : `거리 ${cm}cm: 삑 간격 ${sim.beepInterval(cm)}ms (map(${cm}, ${sim.NEAR_CM}, ${sim.FAR_CM}, ${sim.MIN_INTERVAL}, ${sim.MAX_INTERVAL}))`
  },
  servo: (deg: number) => `myServo.write(${deg}) → 서보 혼이 ${deg}°로 이동`,
  buzzer: (n: { note: number; sounding: boolean } | null) => (n
    ? n.sounding
      ? `tone(8, ${sim.NOTES[n.note]}, ${sim.TONE_MS}) → ${sim.NOTE_NAMES[n.note]} (${sim.NOTES[n.note]}Hz)`
      : `delay(${sim.NOTE_STEP_MS}) 중: 소리가 끝나고 다음 음을 기다림`
    : `noTone(8) 후 delay(${sim.REST_MS}): 쉬는 중`),
}

const span = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
const bools = [false, true]
const EDGE = [0, 9, 10, 99, 100, 254, 255] // every digit count a 0..255 value can have, plus the named colours' 255
const JOY = [0, 9, 10, 99, 100, 299, 300, 512, 700, 701, 999, 1000, 1023]
/** Every text the status line can show while each simulation runs (numbers sampled wherever their digit count changes). */
export const statusTexts: Record<SimKind, () => string[]> = {
  blink: () => bools.map(say.blink),
  button: () => bools.map(say.button),
  pot: () => span(0, 1023).map(say.pot),
  lcd: () => span(0, 1023).map(say.lcd),
  cds: () => span(0, 100).flatMap((l) => bools.map((on) => say.cds(l, on))),
  rgb: () => [...EDGE.flatMap((a) => EDGE.flatMap((b) => EDGE.map((c) => say.rgb(a, b, c)))), ...sim.COLORS.map(([a, b, c]) => say.rgb(a, b, c))],
  dht: () => [DHT_WAIT, DHT_FAIL, ...span(0, 50).flatMap((t) => span(20, 80).map((h) => say.dht(t, h)))],
  'dht-lcd': () => [DHT_WAIT, DHT_FAIL, ...span(0, 50).flatMap((t) => span(20, 80).map((h) => say.dhtLcd(t, h)))],
  joystick: () => JOY.flatMap((x) => JOY.flatMap((y) => bools.map((p) => sim.joyLine(x, y, p)))),
  motor: () => span(-255, 255).map(say.motor),
  ultrasonic: () => span(2, 200).map(say.ultrasonic),
  alarm: () => span(2, 200).map(say.alarm),
  servo: () => span(0, 180).map(say.servo),
  buzzer: () => [null, ...sim.NOTES.flatMap((_n, note) => bools.map((sounding) => ({ note, sounding })))].map(say.buzzer),
}

/** Display width in monospace columns: Hangul takes two. */
const cols = (s: string) => [...s].reduce((n, ch) => n + (/[ᄀ-ᇿ㄰-㆏가-힣]/.test(ch) ? 2 : 1), 0)
/**
 * The texts the status line reserves room for: the idle instruction plus the widest running text of each of the
 * widest message templates (texts that differ only in their numbers share a template). The line is as tall as the
 * tallest of these at the current width and font, whatever it shows.
 */
export function reservedTexts(kind: SimKind, templates = 4): string[] {
  const widest = new Map<string, string>()
  for (const t of statusTexts[kind]()) {
    const key = t.replace(/[\d.-]+/g, '0')
    const cur = widest.get(key)
    if (cur == null || cols(t) > cols(cur)) widest.set(key, t)
  }
  return [IDLE[kind], ...[...widest.values()].sort((a, b) => cols(b) - cols(a)).slice(0, templates)]
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const btn = (cls: string, text: string, attrs = '') => `<button type="button" class="cb ${cls}"${attrs} disabled>${esc(text)}</button>`

/** The markup between <figure class="circuit" ...> and its <figcaption>. */
export function chromeHtml(def: CircuitDef): string {
  const stepper = `<div class="circuit-stepper" role="group" aria-label="조립 순서" hidden>${btn('cb-prev', '◀', ' aria-label="이전 단계"')}<span class="circuit-progress" role="status" aria-live="polite"></span>${btn('cb-next', '▶', ' aria-label="다음 단계"')}${btn('cb-all', '전체 보기')}</div>`
  const ranges = (RANGES[def.sim] ?? []).map((s) =>
    `<label class="circuit-range"><span class="circuit-range-label">${esc(s.label)}</span><input type="range" min="${s.min}" max="${s.max}" step="1" value="${s.value}" disabled><output class="circuit-range-out">${s.value}${esc(s.unit)}</output></label>`)
  const modes = (MODES[def.sim] ?? []).map((m) => btn('cb-mode', m, ' aria-pressed="false"'))
  const sizes = reservedTexts(def.sim).map((t) => `<span class="circuit-status-size" aria-hidden="true">${esc(t)}</span>`)
  return [
    `<div class="circuit-bar" role="group" aria-label="회로 그림 조작">${btn('cb-play', '▶ 시뮬레이션', ' aria-pressed="false"')}${btn('cb-view', '평면으로 보기')}${btn('cb-steps', '조립 순서 보기')}${stepper}</div>`,
    `<div class="circuit-stage"><div class="circuit-plane" style="--w: ${def.size[0]}; --h: ${def.size[1]}"></div></div>`,
    `<div class="circuit-ctl">${ranges.join('')}${modes.join('')}</div>`,
    `<p class="circuit-status-box">${sizes.join('')}<span class="circuit-status">${esc(IDLE[def.sim])}</span></p>`,
    '<div class="circuit-live" role="status" aria-live="polite"></div>',
  ].join('\n')
}

/** Appended to the figure's caption: how the wiring table above drives the drawing. */
export const hintHtml = (def: CircuitDef) => `<span class="circuit-hint" id="circuit-hint-${def.id}">${esc(HINT)}</span>`
