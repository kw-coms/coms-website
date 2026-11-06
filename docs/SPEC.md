# COM's Circuit Lab — Spec (v0.2, 3D)

Tinkercad-Circuits-style Arduino simulator for the COM's club site, served at `https://coms.kw.ac.kr/lab/`.
User request: "띵커캐드처럼 저항 설정, 여러 선, 빵판에 끼우고, 아두이노 도구 여러 가지, 직접 코드 짜서 작동하는 게 보이게" + "Lab은 돌려볼 수 있는 3D로" + "내가 생각 못 한 좋은 기능도 알아서 추가".

## Stack
Vite + React 19 + TS (same conventions as `../coms-worldcup`, `base: "/lab/"`), three + @react-three/fiber + @react-three/drei for the 3D workspace,
CodeMirror 6 (C++), avr8js (ATmega328P @ 16 MHz), arduino-cli compile container (`compiler/`). Korean UI, light/dark.
No external assets: every 3D part is built procedurally from three.js primitives + canvas textures (CSP `script-src 'self'`).

## Module boundaries (parallel work — do not edit another lane's directory)
| Lane | Directory | Owner |
|---|---|---|
| Contract | `src/core/types.ts` | main thread (change only by agreement) |
| Core sim (headless, pure TS) | `src/core/**` (except `types.ts`) | Codex lane A |
| Compile service | `compiler/**`, `docs/DEPLOY.md` | Codex lane B |
| 3D workspace + UI | `src/scene3d/**`, `src/ui/**`, `src/App.tsx`, `src/main.tsx`, `src/styles/**`, `index.html`, `vite.config.ts` | Claude lane C |

UI talks to the sim only through the `Simulator` interface and the pure helpers declared in `types.ts`.
Until lane A lands, lane C uses a stub implementing the same interface (`src/ui/simStub.ts`), then swaps to `createSimulator()` from `src/core/index.ts`.

## Coordinates & units
World = millimetres, Y up, breadboard top surface at y = 0. Parts rotate only around Y in 90° steps.
Pin `pos` is the local position of the pin's insertion point (bottom of the leg for through-hole parts, the hole/socket for boards).
A pin is *inserted* into a breadboard hole or UNO header socket when their world XZ positions are within 0.6 mm. Pitch 2.54 mm.

## Parts (M1)
Arduino UNO R3 · breadboard (half 30 cols, full 63 cols) · jumper wire · LED (빨강/초록/파랑/노랑/흰색) · resistor (any value, E12/E24 presets, color bands from value) ·
4-leg pushbutton · slide switch · potentiometer 10k (knob) · photoresistor/CDS (light slider) · piezo buzzer (tone) · RGB LED (common cathode/anode) ·
SG90 servo (pulse width → angle) · HC-SR04 (distance slider, trig/echo timing) · LCD1602 I2C (PCF8574 @0x27, HD44780 text) · multimeter (V / mA).
M2: DHT11, joystick, 7-segment, NeoPixel strip, L9110S + DC motor, study-page "Lab에서 열기" links, club-account save.

## Electrical model
DC operating point via Modified Nodal Analysis, recomputed whenever MCU pin states or user inputs change (throttled to ≤ 60 Hz):
resistors; MCU OUTPUT pin = ideal source 0/5 V behind 25 Ω; INPUT_PULLUP = 5 V through 35 kΩ; INPUT = 1 GΩ to GND (flag floating);
5V/3V3 rails = sources behind 0.1 Ω; GND = reference; LED = piecewise-linear diode (Vf by color: red 1.8, yellow 2.0, green 2.1, blue/white 3.0 V, Rd 15 Ω) iterated to convergence;
switches = 0.05 Ω closed / open; pot = two resistors split by position; CDS = R(lux) ≈ 10k·(10/lux)^0.7 clamped 200 Ω..1 MΩ.
PWM pins: brightness uses the duty-cycle average measured from the MCU; servo angle from pulse width (544–2400 µs → 0–180°); buzzer frequency from pin toggle period.

## Warnings (Korean, shown on the part + list panel)
LED/핀 과전류 (LED > 20 mA → warn, > 30 mA → error; pin > 40 mA → error) · 저항 없는 LED · 5V–GND 단락 · 플로팅 입력 (digitalRead on a floating net) ·
LED 역방향 (info) · 출력 핀끼리 충돌 (two OUTPUT pins on one net at different levels) · 연결 안 된 부품 핀 (info).

## Features beyond the original ask (decided by us)
1. Wire colors (palette of 9) + auto color (5V/VIN red, GND black) + editable bend points.
2. Resistor color bands drawn from the value; hover shows "빨강-빨강-갈색-금 = 220Ω".
3. Multimeter part with probes (voltage, current).
4. Net highlight: hover any pin/hole → every connected point glows; pin-name tooltips.
5. Serial monitor (send + receive, 9600 baud) and serial plotter (numbers per line → live graph).
6. Compiler errors mapped to editor lines with Korean hints for common mistakes.
7. Camera: free orbit, "위에서 보기" (top orthographic, best for wiring), reset; part labels toggle.
8. Undo/redo, copy/paste, R rotate, Del delete, Esc cancel wire.
9. Example gallery aligned with the 아두이노 기초 study chapters; simulation speed ×0.25–×2, pause.
10. Autosave to localStorage, JSON export/import, share link (scene in the URL hash, no server), PNG snapshot.
11. Parts list (BOM) panel.
12. First-visit 3-step tutorial overlay; mobile = view + run + interact (editing recommended on desktop).
13. `prefers-reduced-motion` respected; full keyboard access for toolbar/panels.

## Compile API
`POST /lab/api/compile` body `{ sketch: string }` → `CompileResult` (see `types.ts`). Max 64 KB; include allowlist
(Arduino.h, Wire.h, SPI.h, Servo.h, LiquidCrystal_I2C.h, DHT.h, Adafruit_Sensor.h, Adafruit_NeoPixel.h, EEPROM.h, math.h, string.h, stdlib.h, avr/pgmspace.h);
quoted includes and any path containing `/`, `\`, `..` rejected except the listed `avr/pgmspace.h`. Details in `docs/DEPLOY.md` (lane B).
