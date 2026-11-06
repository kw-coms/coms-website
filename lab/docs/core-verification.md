# Core pass 2 verification

- Scope: src/core only; types.ts and src/core/index.ts public API unchanged. No commits, no dependencies added.
- npm test: 20 files, 122 tests PASS.
- npx tsc -b --noEmit: PASS.
- git diff --check -- src/core: PASS.
- Core TypeScript lines over 200 characters, excluding untouched types.ts: 0.
- Lint: no lint script configured. Browser/physical device acceptance: NOT_RUN.
- Independent review: both concrete findings repaired with regressions, follow-up approved.

## Checklist

| Status | Requirement | Evidence |
|---|---|---|
| Implemented | All 21 PartKind definitions and core models | geometry/solver/MCU tests and 17 real compiled sketches |
| Implemented | Real HEX execution with unchanged example logic | examples.e2e.test.ts; comment/whitespace-token guard |
| Implemented | DHT11, WS2812, HC-SR04, LCD, servo, tone | GPIO edges/DDR release/clock events; independent addressed LCDs and sonar mappings |
| Implemented | PWM optical output and motor output | on-current integration, measured duty; motor power/ground and direct rail control regressions |
| Implemented | Korean electrical warnings | resistor omission, LED/pin overcurrent, reversal, shorts, contention, floating inputs, unconnected pins, duplicate holes, direct motor wiring |
| Implemented | Multimeter V and mA | solver tests including current sign |
| Implemented | Geometry, resistor bands, breadboard connectivity | geometry/analyze tests; example insertion/overlap and resistor isolation assertions |
| Implemented | Scene and share limits | 300 parts, 600 wires, 64 KiB code; streamed decoded-share limit 32 KiB and exact-boundary tests |
| Implemented | Worker/main-thread fallback, speed, pause/resume | lifecycle tests, Worker mock and constructor-failure regression |
| Implemented | Readability and teaching sketches | all core TS reformatted; focused protocol modules; duplicate LCD decoder removed; Korean comments |
| Partial verification | Browser Worker delivery | Node tests mock browser Worker; actual browser integration belongs to UI acceptance |
| Physical/firmware limit | Long-range stock pulseIn precision | 350 cm reports 347.93 cm; disabling Timer0 overflow alone gives 350.00 cm; pulsein-timing.test.ts proves cause |

Floating inputs are conservatively identified from electrical connectivity, including unused inputs; this is not C++ digitalRead call-site instrumentation. L9110S uses the provided UNO 5V/GND supply; no external supply part was introduced. LED visual brightness saturates at nominal 13 mA, independently of physical 20/30 mA warning thresholds.

## Real-program results

All rows PASS visible output assertions and >=1.0x throughput. Timings are Node wall time including stepping, MNA, frame construction, and assertions. The test injects a deterministic 20 ms solve clock (no waiting), so the solve workload is repeatable; throughput uses performance.now(). Ultrasonic input checks use 5, 50, and 100 cm within 1 cm. Sensor waveform remains exactly 58 us/cm rather than compensating for firmware interrupt undercount.

| Example | Simulated ms | Wall ms | Realtime ratio |
|---|---:|---:|---:|
| builtin-blink | 2300 | 1191.3 | 1.93x |
| external-blink | 2300 | 1165.9 | 1.97x |
| button-led | 300 | 142.1 | 2.11x |
| serial-hello | 1200 | 619.6 | 1.94x |
| pot-led | 800 | 439.3 | 1.82x |
| night-light | 400 | 212.4 | 1.88x |
| rgb-cycle | 1200 | 607.9 | 1.97x |
| servo-sweep | 5500 | 3401.5 | 1.62x |
| melody | 1200 | 672.0 | 1.79x |
| ultrasonic | 1800 | 924.4 | 1.95x |
| lcd-counter | 2300 | 1183.8 | 1.94x |
| distance-alarm | 750 | 399.5 | 1.88x |
| dht-lcd | 3400 | 1778.5 | 1.91x |
| joystick-direction | 1700 | 913.4 | 1.86x |
| seven-count | 9200 | 4680.0 | 1.97x |
| neopixel-rainbow | 600 | 311.0 | 1.93x |
| motor-direction | 4200 | 2158.7 | 1.95x |

## Changed files

- `src/core/PASS2-PLAN.md`
- `src/core/PASS2-REPORT.md`
- `src/core/analyze.test.ts`
- `src/core/analyze.ts`
- `src/core/engine.test.ts`
- `src/core/engine.ts`
- `src/core/examples.e2e.test.ts`
- `src/core/examples.test.ts`
- `src/core/examples.ts`
- `src/core/geometry.test.ts`
- `src/core/geometry.ts`
- `src/core/local-simulator.ts`
- `src/core/mcu/activity.ts`
- `src/core/mcu/avr.test.ts`
- `src/core/mcu/avr.ts`
- `src/core/mcu/dht11.ts`
- `src/core/mcu/hcsr04.ts`
- `src/core/mcu/hex.ts`
- `src/core/mcu/index.ts`
- `src/core/mcu/lcd-protocol.ts`
- `src/core/mcu/lcd.ts`
- `src/core/mcu/mcu.test.ts`
- `src/core/mcu/protocols.test.ts`
- `src/core/mcu/protocols.ts`
- `src/core/mcu/servo.ts`
- `src/core/mcu/ws2812.ts`
- `src/core/parts/index.ts`
- `src/core/pulsein-timing.test.ts`
- `src/core/scene.test.ts`
- `src/core/scene.ts`
- `src/core/share.ts`
- `src/core/simulator.test.ts`
- `src/core/simulator.ts`
- `src/core/solver.test.ts`
- `src/core/solver.ts`
- `src/core/worker.ts`
