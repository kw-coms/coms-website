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
