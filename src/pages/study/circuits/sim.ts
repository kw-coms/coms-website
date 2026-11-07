// Scripted behaviour of the study sketches (never executes user code). Pure functions: every number
// below is copied from the sketch printed next to the matching circuit in content/arduino.html.

/** 1-5 Blink: digitalWrite(HIGH); delay(500); digitalWrite(LOW); delay(500); */
export const BLINK_MS = 500
export const blinkOn = (elapsedMs: number) => Math.floor(elapsedMs / BLINK_MS) % 2 === 0

/** 2-2 INPUT_PULLUP: pressed -> LOW -> the sketch turns the LED on. */
export const buttonRead = (pressed: boolean) => (pressed ? 'LOW' : 'HIGH')

/** 4-4: analogRead -> map(raw, 0, 1023, 0, 255) (integer maths, truncating like the Arduino long division). */
export function potReadout(raw: number) {
  const r = Math.min(1023, Math.max(0, Math.round(raw)))
  return { raw: r, volts: (r * 5) / 1023, duty: Math.trunc((r * 255) / 1023) }
}
/** Knob angle (-135 .. +135 degrees, 0 = straight up) <-> analogRead value. */
export const KNOB_RANGE = 135
export const rawFromKnob = (deg: number) => Math.round(((Math.min(KNOB_RANGE, Math.max(-KNOB_RANGE, deg)) + KNOB_RANGE) / (2 * KNOB_RANGE)) * 1023)
export const knobFromRaw = (raw: number) => (raw / 1023) * 2 * KNOB_RANGE - KNOB_RANGE

/** 5-1: Echo stays HIGH for the round trip; the page's formula is cm = us * 0.034 / 2. */
export const echoMicros = (cm: number) => Math.round((cm * 2) / 0.034)
export const cmFromMicros = (us: number) => (us * 0.034) / 2

/** 5-3: the do-re-mi-fa-sol loop (tone 300 ms, delay 400 ms per note, then 1500 ms rest). */
export const NOTES = [262, 294, 330, 349, 392]
export const NOTE_NAMES = ['도', '레', '미', '파', '솔']
export const TONE_MS = 300
export const NOTE_STEP_MS = 400
export const REST_MS = 1500
export const MELODY_MS = NOTES.length * NOTE_STEP_MS + REST_MS
export function melodyAt(elapsedMs: number): { note: number; sounding: boolean } | null {
  const t = elapsedMs % MELODY_MS
  const i = Math.floor(t / NOTE_STEP_MS)
  if (i >= NOTES.length) return null
  return { note: i, sounding: t - i * NOTE_STEP_MS < TONE_MS }
}

/** 6-3 final sketch constants. */
export const NEAR_CM = 10
export const FAR_CM = 100
export const MIN_INTERVAL = 80
export const MAX_INTERVAL = 800
export const BEEP_MS = 40
export const LOOP_DELAY_MS = 60

/** Arduino map() on integers. */
export const arduinoMap = (x: number, inMin: number, inMax: number, outMin: number, outMax: number) =>
  Math.trunc(((x - inMin) * (outMax - outMin)) / (inMax - inMin)) + outMin

export type AlarmZone = 'quiet' | 'beep' | 'alarm'
export const alarmZone = (cm: number | null): AlarmZone => (cm == null || cm < 0 || cm > FAR_CM ? 'quiet' : cm <= NEAR_CM ? 'alarm' : 'beep')
export const beepInterval = (cm: number) => arduinoMap(Math.trunc(cm), NEAR_CM, FAR_CM, MIN_INTERVAL, MAX_INTERVAL)

/**
 * Replays loop() of the final sketch against a clock: returns tick(cm, nowMs) -> {led, buzzer}.
 * Each loop pass ends with delay(60); a beep adds delay(40) while LED and tone are on.
 */
export function createAlarm() {
  let nextLoop = 0
  let lastBeep = 0
  let beepUntil = 0
  let steady = false
  return (cm: number | null, now: number) => {
    if (now >= nextLoop) {
      const zone = alarmZone(cm)
      steady = zone === 'alarm'
      nextLoop = now + LOOP_DELAY_MS
      if (zone === 'beep' && now - lastBeep >= beepInterval(cm as number)) {
        lastBeep = now
        beepUntil = now + BEEP_MS
        nextLoop = beepUntil + LOOP_DELAY_MS
      }
    }
    const on = steady || now < beepUntil
    return { led: on, buzzer: on }
  }
}

/* ---- chapter 6 (modules): numbers copied from the sketches printed in content/arduino.html ---- */

/** 6-2 night light: CDS on the 5V side, 10 kΩ to GND, analogRead at the divider. Hysteresis: on below 300, off above 350. */
export const DARK_ON = 300
export const DARK_OFF = 350
/** Light slider 0..100 -> CDS resistance 200 kΩ (dark) .. 1 kΩ (bright), logarithmic like a real CDS cell. */
export const cdsKohm = (light: number) => 200 * Math.pow(1 / 200, Math.min(100, Math.max(0, light)) / 100)
/** A0 = 1023 * 10k / (CDS + 10k) */
export const cdsRaw = (light: number) => Math.round((1023 * 10) / (cdsKohm(light) + 10))
export const nightLightOn = (on: boolean, raw: number) => (!on && raw < DARK_ON ? true : on && raw > DARK_OFF ? false : on)

/** 6-3 colour table of the page and the mixing sketch (800 ms per colour), plus the rainbow wheel() (20 ms per step). */
export const COLORS: Array<[number, number, number, string]> = [
  [255, 0, 0, '빨강'], [0, 255, 0, '초록'], [0, 0, 255, '파랑'], [255, 255, 0, '노랑'],
  [0, 255, 255, '하늘색'], [255, 0, 255, '보라'], [255, 255, 255, '흰색'], [255, 80, 0, '주황'],
]
export const COLOR_MS = 800
export const WHEEL_MS = 20
export const colorAt = (elapsedMs: number) => COLORS[Math.floor(elapsedMs / COLOR_MS) % COLORS.length]
export const colorName = (r: number, g: number, b: number) => COLORS.find((c) => c[0] === r && c[1] === g && c[2] === b)?.[3] ?? null
export function wheel(pos: number): [number, number, number] {
  if (pos < 85) return [255 - pos * 3, pos * 3, 0]
  if (pos < 170) { const p = pos - 85; return [0, 255 - p * 3, p * 3] }
  const p = pos - 170
  return [p * 3, 0, 255 - p * 3]
}
export const wheelAt = (elapsedMs: number) => wheel(Math.floor(elapsedMs / WHEEL_MS) % 256)

/** 6-4: lcd.print("Hello, COM's!") on row 0; row 1 is "A0 = <raw>" plus four blanks, redrawn every 200 ms. */
export const LCD_COLS = 16
export const lcdPad = (s: string) => s.slice(0, LCD_COLS).padEnd(LCD_COLS)
export const LCD_HELLO = "Hello, COM's!"
export const lcdA0Line = (raw: number) => lcdPad(`A0 = ${Math.round(raw)}    `)

/** 6-5: loop() starts with delay(2000); a failed read prints "DHT read failed" and "Sensor error". */
export const DHT_READ_MS = 2000
export const dhtSerial = (t: number, h: number) => `Temp: ${t.toFixed(1)} C   Humidity: ${h.toFixed(0)} %`
export const dhtSerialShort = (t: number, h: number) => `${t.toFixed(1)} C, ${h.toFixed(0)} %`
export const dhtLcdLines = (t: number | null, h: number | null): [string, string] =>
  t == null || h == null ? [lcdPad('Sensor error'), lcdPad('')] : [lcdPad(`Temp: ${t.toFixed(1)}°C  `), lcdPad(`Humi: ${h.toFixed(0)}%    `)]

/** 6-6: thresholds 300 / 700, map(x, 0, 1023, -100, 100) with Arduino integer maths. */
export const joyDir = (x: number, y: number) => (x < 300 ? 'LEFT' : x > 700 ? 'RIGHT' : y < 300 ? 'UP' : y > 700 ? 'DOWN' : 'CENTER')
export const joyVx = (x: number) => arduinoMap(x, 0, 1023, -100, 100)
export const joyLine = (x: number, y: number, pressed: boolean) =>
  `X=${x} Y=${y} vx=${joyVx(x)} SW=${pressed ? 'PRESSED' : '-'} -> ${joyDir(x, y)}`
/** stick position -1..1 <-> analogRead (up and left are small numbers) */
export const joyRaw = (v: number) => Math.round(((Math.min(1, Math.max(-1, v)) + 1) / 2) * 1023)
export const joyPos = (raw: number) => (raw / 1023) * 2 - 1

/** 6-7: setMotor(speed): positive -> analogWrite(5, speed), negative -> analogWrite(6, -speed). Small motors stall below ~80. */
export const STALL_PWM = 80
export function motorPins(speed: number) {
  const s = Math.min(255, Math.max(-255, Math.trunc(speed)))
  return s >= 0 ? { ia: s, ib: 0 } : { ia: 0, ib: -s }
}
/** Replays loop() of the motor sketch: ramp up by 5 every 40 ms, hold, stop, ramp down, hold, stop. */
export const MOTOR_LOOP_MS = 52 * 40 + 1000 + 800 + 52 * 40 + 1000 + 2000
export function motorLoopAt(elapsedMs: number): number {
  const t = elapsedMs % MOTOR_LOOP_MS
  const ramp = 52 * 40
  if (t < ramp) return 5 * Math.floor(t / 40)
  if (t < ramp + 1000) return 255
  if (t < ramp + 1800) return 0
  const u = t - (ramp + 1800)
  if (u < ramp) return 0 - 5 * Math.floor(u / 40)
  if (u < ramp + 1000) return -255
  return 0
}
