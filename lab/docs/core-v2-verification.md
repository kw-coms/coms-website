# ENGINE v2 verification — 2026-11-07

Scope: `lab/src/core/**` only. No commits, compiler invocation, or dependencies added by this lane.
All 65 catalog kinds are defined (21 original + 44 new), with 13 new starters.

## Verification

- PASS: `npx vitest run src/core --no-file-parallelism`: 28 files, **234 passed, 13 skipped**.
- PASS: `npx tsc -b --noEmit` (entire current lab checkout).
- PASS: `git diff --check -- lab/src/core`.
- No lint script is configured in lab/package.json.
- NOT_RUN: real compiler / regenerated HEX for the 13 new starters; their E2E checks skip with an explicit fixture-missing reason. Original 17 compiled sketches execute real existing HEX.
- NOT_RUN: browser/3D/manual/device acceptance and an actual 2-vCPU CI host. Timings below use isolated sequential Vitest files on this host, not CI hardware certification.

## Model evidence

| Area | Evidence / acceptance |
|---|---|
| C / L | solver-v2 + semiconductor-acceptance: RC at one time constant near 5(1-exp(-1)); BE startup and monotonic RL rise toward steady state; engine frame reads leave charge unchanged |
| Diode / zener | Forward silicon drop 0.5–0.8 V at mA current; reverse 5.1 V zener regulation |
| NPN / PNP | Nonnegative saturation voltage, high-side conduction, forward-active beta within bounds, full Ebers–Moll three-terminal current Jacobian |
| TIP120 | Two internal BJT stages, base-emitter drop 1.0–1.6 V |
| NMOS | Low on-resistance and level-1 square-law saturation with small overdrives (current ratio near 4) |
| Sources / 7805 | CV/CC load, normal CV voltage-drop regression, initial regulation and dropout, series batteries ~18 V, independent floating supply loops |
| Relay / optocoupler | First DC solve transfers contacts; coil off returns contacts; numeric active-region CTR within 10%, input-off output recovery |
| Sensors / outputs | TMP36 0.75 V at 25°C and zero unpowered; flex/force monotonic resistance; powered/unpowered moisture/gas; filament heating reduces current; vibration/gearmotor polarity |
| 74HC / 595 / L293D | Gate truth tables, shift/latch/OE/MR and QH cascade, half-bridge enable/direction; real MCU PORT edges drive shift register |
| 555 | RC-coupled astable frequency within 5% of 1.44/((R1+2R2)C), including standalone engine without MCU |
| Keypad / DIP / tilt / PIR / IR | Matrix connection and DDR-only MCU scanning; switch inputs; PIR retrigger; complete NEC packet decode and repeated same-button send after release |
| Displays | Parallel LCD 4/8-bit, power/backlight gating, multiplexed common-anode/cathode differential segment voltage; NeoPixel ring reuses WS2812 decoder |
| Instruments | Uniform sample timestamps across variable steps, 512-sample bounded buffers, two channels / eight channels, rising trigger and automatic repeated acquisition |
| Meter / warnings | Unpowered Ω and continuity, open probes, directly/indirectly powered rejection; capacitor polarity/rating, base resistor, flyback orientation/turn-off, source short, CMOS inputs; original warnings retained |
| Debugger | Raw AVR calls/returns, line breakpoint lowest address, step into/over/out, IRQ depth, typed globals, bounded arrays, reset preservation; local/worker command and recovery tests |
| Scene / geometry | v1→v2 and share roundtrip, hostile JSON/size/depth/IDs/notes; mini board, DIP count/labels/spacing, L293D internal grounds, example endpoints/no overlap |

Tests: `solver-v2.test.ts`, `semiconductor-acceptance.test.ts`, `auxiliary-models.test.ts`, `behavioral.test.ts`, `electrical-warnings-v2.test.ts`, `instruments.test.ts`, `engine-v2*.test.ts`, `mcu/debugger.test.ts`, `parts/catalog-v2.test.ts`, and existing regression suites.

## Realtime measurements

| Original sketch | Simulated ms | Wall ms | Ratio |
|---|---:|---:|---:|
| builtin-blink | 2300 | 465.6 | 4.94x |
| external-blink | 2300 | 465.4 | 4.94x |
| button-led | 300 | 57.2 | 5.24x |
| serial-hello | 1200 | 247.0 | 4.86x |
| pot-led | 800 | 172.4 | 4.64x |
| night-light | 400 | 87.9 | 4.55x |
| rgb-cycle | 1200 | 250.9 | 4.78x |
| servo-sweep | 5500 | 1532.7 | 3.59x |
| melody | 1200 | 256.8 | 4.67x |
| ultrasonic | 1800 | 377.8 | 4.76x |
| lcd-counter | 2300 | 471.6 | 4.88x |
| distance-alarm | 750 | 165.9 | 4.52x |
| dht-lcd | 3400 | 686.4 | 4.95x |
| joystick-direction | 1700 | 350.1 | 4.86x |
| seven-count | 9200 | 1843.6 | 4.99x |
| neopixel-rainbow | 600 | 136.6 | 4.39x |
| motor-direction | 4200 | 909.6 | 4.62x |

| Transient circuit | Simulated ms | Wall ms | Measured / frame ratio |
|---|---:|---:|---:|
| Standalone 555 | 2000 | 232.1 | 8.62x / 8.75x |
| RC + scope | 2000 | 45.0 | 44.48x / 44.94x |

## Deliberate model limits

- Educational lumped models: fixed-temperature junction parameters; level-1 MOS; no semiconductor parasitic capacitance, thermal runaway or breakdown damage. Legacy LED piecewise-linear model remains.
- Motors use electrical resistance and voltage-based RPM/direction; bulb uses a single thermal state. Relay transfer is instantaneous at a coil threshold, with topology/turn-off flyback warnings rather than destructive arc simulation. IC propagation and regulator thermal dynamics are omitted.
- Adaptive next-step control uses embedded BE/trapezoid C/L error estimates, bounded 1 microsecond–1 millisecond steps plus waveform/instrument limits. It does not roll back already executed AVR instructions. Extreme fast circuits are resolution-limited and actual throughput is reported, not fabricated.
- Scope display is uniformly resampled with interpolation, bounded to 512 points; this is not an unlimited bandwidth instrument.
- Shared contract retains existing required shapes. Only optional nested `meter.measurementMode` and `meter.continuity` fields were added.

## Changed files

- `lab/src/core/analyze.ts`
- `lab/src/core/auxiliary-models.test.ts`
- `lab/src/core/behavioral.test.ts`
- `lab/src/core/behavioral.ts`
- `lab/src/core/electrical-warnings-v2.test.ts`
- `lab/src/core/electrical-warnings-v2.ts`
- `lab/src/core/engine-v2-debug.test.ts`
- `lab/src/core/engine-v2-protocols.test.ts`
- `lab/src/core/engine-v2-realtime.test.ts`
- `lab/src/core/engine-v2.test.ts`
- `lab/src/core/engine.ts`
- `lab/src/core/examples-v2.ts`
- `lab/src/core/examples.e2e.test.ts`
- `lab/src/core/examples.test.ts`
- `lab/src/core/examples.ts`
- `lab/src/core/instruments.test.ts`
- `lab/src/core/instruments.ts`
- `lab/src/core/local-simulator.ts`
- `lab/src/core/mcu/debugger.test.ts`
- `lab/src/core/mcu/debugger.ts`
- `lab/src/core/mcu/index.ts`
- `lab/src/core/mcu/lcd.ts`
- `lab/src/core/parts/catalog-v2.test.ts`
- `lab/src/core/parts/index.ts`
- `lab/src/core/scene.test.ts`
- `lab/src/core/scene.ts`
- `lab/src/core/semiconductor-acceptance.test.ts`
- `lab/src/core/share.ts`
- `lab/src/core/simulator.ts`
- `lab/src/core/solver-v2.test.ts`
- `lab/src/core/solver.ts`
- `lab/src/core/types.ts`
- `lab/src/core/worker.ts`
