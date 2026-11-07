# COM's Circuit Lab v2 — Tinkercad-parity spec

User request (2026-11-07): "띵커캐드처럼 직접 도구(부품)를 추가하고 저항도 추가하는 기능… 띵커캐드 아두이노 찾아보고 와봐… 거기에 너가 더 추가해주고".
Reference: Tinkercad Circuits component library (tinkercad.com/help/circuits/list-of-all-circuit-components) and official guide (blocks / blocks+text / text code, debugger with breakpoints, starters, .ino export, component list).
Rule: ship complete, no demo stage. Korean UI. Everything stays CSP-clean (no external fetches) and runs on low-end PCs (quality tiers + realtime engine ≥ 1× on a 2-vCPU CI runner).

## 1. New parts (PartKind, all simulated, all with 3D meshes)
Power: battery-9v, battery-aa-pack (cells 1–4), coin-cell-3v, power-supply (0–30 V, current limit, CC/CV indicator).
Passive & controls: capacitor-ceramic, capacitor-electrolytic (polarized; reverse/over-voltage warning), diode (1N4007), zener (Vz prop), inductor, dip-switch-4, keypad-4x4, tilt-switch, breadboard-mini (170 holes).
Sensors: tmp36, pir, flex-sensor, force-sensor, soil-moisture, gas-sensor (MQ-2 style analog+digital), ir-receiver (+ on-screen IR remote sending NEC codes).
Outputs & displays: light-bulb, vibration-motor, gearmotor, neopixel-ring (12/16/24), seven-segment-4digit (multiplexed, common cathode/anode), lcd1602-parallel (HD44780 4/8-bit).
Semiconductors & ICs: npn (2N2222), pnp (2N2907), nmos (IRLZ44N logic-level), tip120 (Darlington), relay-spdt (5 V coil, flyback warning), l293d, shift-register-595, logic-7400 (NAND), logic-7408 (AND), logic-7432 (OR), logic-7486 (XOR), logic-7404 (NOT), timer-555, regulator-7805, optocoupler-4n35.
Instruments: oscilloscope (2 ch, time/div, volts/div, trigger), function-generator (sine/square/triangle/sawtooth, freq, amplitude, offset, duty), logic-analyzer (8 ch, extra beyond Tinkercad), multimeter gains Ω mode (only on unpowered parts) and continuity beep.

## 2. Engine v2 (src/core)
- Transient MNA with Newton–Raphson: companion models for C/L (trapezoidal with backward-Euler startup), Shockley diode/zener with limiting, BJT Ebers–Moll (simplified), MOSFET level-1 (square law), Darlington as two BJTs; sources with internal resistance; current-limited supply.
- Coupling with avr8js: the analog solve advances in steps synchronised to the MCU clock; event-driven re-solve on pin edges; fixed small step only while dynamic elements (C, L, 555, function generator, PWM into RC) are active; adaptive step with error control; must keep every example ≥ 1× realtime on the CI runner.
- Digital/behavioural models: 74HC logic (input thresholds from node voltages, outputs as sources with R_out, propagation ignored), 74HC595 (SER/SRCLK/RCLK/OE/MR, QH' chaining), L293D (enables + 4 half-bridges, separate motor supply), 555 (comparators at 1/3 & 2/3 Vcc, SR latch, discharge transistor — astable/monostable work), 7805 (dropout ~2 V, thermal ignored), relay (coil current threshold, contact transfer, flyback spike → warn without diode), optocoupler (CTR), IR receiver (NEC demodulated output), keypad (matrix connections per pressed key), DIP/tilt switches, sensors as resistances/voltages from inputs, TMP36 (10 mV/°C + 0.5 V), PIR (digital high with retrigger delay).
- Instruments: oscilloscope/logic-analyzer probes sample net voltages/levels into ring buffers in SimFrame (decimated for the UI); function generator is a time-varying source.
- Warnings (Korean): electrolytic reversed/over-voltage, transistor without base resistor, relay coil without flyback diode, regulator dropout, battery short, LED/pin over-current (existing), floating CMOS inputs on logic ICs, power supply in current limit.
- Scene v2 (backward compatible: v1 scenes load and upgrade): optional `blocks` (Blockly JSON), `codeMode` ('blocks' | 'blocks+text' | 'text'), `notes` (3D sticky notes), `mission` id.
- Debugger: compile service returns line table + globals (from the ELF built with -g); engine supports line breakpoints, step over/into/out (line-level), pause/continue, and reading globals; UI shows the current line and variable values.

## 3. Code: Blocks (Blockly) + Blocks+Text + Text
Tinkercad-like blocks for Arduino: output (digitalWrite, analogWrite, tone/noTone, servo write, NeoPixel set/show, LCD print/clear/cursor, 7-seg digit), input (digitalRead, analogRead, pulseIn/ultrasonic distance, DHT temp/humidity, IR code received, keypad key), control (wait, repeat, while, if/else, for, every N ms), math, text, variables, serial print/read, custom functions. Generates readable C++ live (Blocks+Text). Switching to Text is one-way with a confirmation, like Tinkercad.

## 4. Beyond Tinkercad (our additions)
- Club cloud: save circuits to the member's account, list "내 회로", share with the club gallery (공개/비공개), fork others' circuits. (Backend: Spring + Flyway table; sensitive → two cross-model reviews.)
- Missions: guided tasks aligned with the 아두이노 기초 study (e.g. 신호등, 버튼 카운터, 거리 경보기) with automatic checking by running the circuit headlessly and asserting behaviour.
- Logic analyzer instrument; auto-generated 2D schematic view; Korean part info popups (what it is, pins, typical wiring, common mistakes); .ino export and BOM CSV; sticky notes.
- Readability: default camera framing so parts are big enough to grab; magnetic pin snapping feedback; part labels toggle.
