# ENGINE v2 verification — 2026-11-07

Scope: Lane A engine/compiler/headless fixes. No commits, Docker rebuilds, or new dependencies.
All 65 catalog kinds are defined (21 original + 44 new), with 13 new starters.

## Verification

- PASS: `npx tsc --noEmit` (solution configuration; references only).
- PASS: `npx vitest run`: **53 files, 467 passed, 12 skipped**. All 17 original + 13 v2 starter fixture tests execute; none skip. The 12 existing skips are live Blockly compilation tests whose compiler server is unavailable in this sandbox.
- PASS: `npm run test:realtime`: **2 files, 34 passed, 0 skipped**. All 30 starters meet measured ≥1× through `run.report()`, including analog-only starters. Engine/example timing assertions run only in this dedicated serial command, also wired into CI. The ±15% ratio comparison is preserved there.
- PASS: `cd compiler && node --test "test/*.test.mjs"`: **265 passed, 10 skipped, 0 failed** (275 total). Existing network/socket integration tests skip because the sandbox rejects TCP/Unix listeners with EPERM; no tests were weakened or newly skipped.
- PASS: `git diff --check`.
- Additional check: `npx tsc -p tsconfig.app.json --noEmit` reports **six existing errors** at `src/ui/blocks/generate.ts:589` (`B.id` / `B.name`). This file is owned by the other lane and was not edited. The solution-level command above does not typecheck referenced projects.
- No lint script is configured in `lab/package.json`.
- NOT_RUN: real AVR compilation, Docker rebuild, browser/3D/manual/device acceptance, and an actual 2-vCPU CI host. Existing checked-in HEX is used for all 30 starters; the running dev compiler is still the old build.
- Existing hostile-input duration guards in `scene.test.ts` and `ui/blocks/generate.test.ts` remain untouched in the other lane's prohibited files; these are not engine throughput acceptance tests.

## Lane A regression evidence

- Inductor winding resistance: pre-fix 100 ms load voltage **3.3311 V**, expected **2.4988 V**; at one time constant **1.7492 V**, expected **1.5795 V**. Both pass after storing terminal voltage minus winding I·R. Capacitors have no ESR property/separate series stamp; the analogous double-counting path is absent.
- Behavioral convergence: pre-fix six-inverter chain returned `[1,0,1,0,0,0]`; now `[1,0,1,0,1,0]`. Odd ring returns with a Korean warning and remains dirty.
- Realtime: the stronger gate caught keypad-password at **0.79×**. A bounded exact-state cache for standalone UNO + keypad circuits lifts final measured throughput to **1.97×**. `engine-keypad-cache.test.ts` fails before the optimization and verifies reuse, correct input reads, and invalidation on key/reset/topology changes. No speed threshold was lowered.
- Compiler: non-debug flags, reverse-address cap ordering, boolean truncation, and inherited-attribute regressions failed before correction. Debug response contract is `DebugInfo & { truncated: boolean }`.
- AVR globals: five new cases failed before the fix. Four-byte `double` and exact signed/unsigned 64-bit scalar/array values now pass, including values beyond JavaScript Number precision and undersized-buffer rejection.
- Schematic and exports: five new tests cover placement, no symbol overlap, exact pin routing, determinism, exact `.ino` text/filename, Korean BOM names, grouping, quote escaping and UTF-8 BOM bytes. No product change was required for these modules.
- Cloud scope: SPEC-v2 §4 moved verbatim to `SPEC-v2-cloud.md`, marked next phase / separate PR / sensitive backend + DB schema / two cross-model reviews.

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

Final serial local run, 2026-11-07. Actual CI hardware was not exercised.

| Starter | Simulated ms | Wall ms | Ratio |
|---|---:|---:|---:|
| builtin-blink | 2300 | 457.4 | 5.03x |
| external-blink | 2300 | 444.9 | 5.17x |
| button-led | 300 | 164.1 | 1.83x |
| serial-hello | 1200 | 286.1 | 4.19x |
| pot-led | 800 | 184.2 | 4.34x |
| night-light | 400 | 94.6 | 4.23x |
| rgb-cycle | 1200 | 257.1 | 4.67x |
| servo-sweep | 5500 | 1448.0 | 3.80x |
| melody | 1200 | 250.9 | 4.78x |
| ultrasonic | 1800 | 354.3 | 5.08x |
| lcd-counter | 2300 | 454.7 | 5.06x |
| distance-alarm | 750 | 273.8 | 2.74x |
| dht-lcd | 3400 | 673.7 | 5.05x |
| joystick-direction | 1700 | 346.4 | 4.91x |
| seven-count | 9200 | 1814.4 | 5.07x |
| neopixel-rainbow | 600 | 189.2 | 3.17x |
| motor-direction | 4200 | 914.2 | 4.59x |
| transistor-motor | 1200 | 259.7 | 4.62x |
| relay-lamp | 1500 | 652.0 | 2.30x |
| shift-register-eight | 350 | 84.5 | 4.14x |
| timer-555-blink | 3500 | 369.4 | 9.47x |
| rc-oscilloscope | 200 | 6.1 | 32.56x |
| regulator-7805 | 100 | 0.2 | 473.84x |
| tmp36-thermometer | 600 | 119.8 | 5.01x |
| pir-alarm | 100 | 21.2 | 4.73x |
| keypad-password | 320 | 162.4 | 1.97x |
| ir-remote-led | 940 | 227.1 | 4.14x |
| four-digit-counter | 300 | 106.3 | 2.82x |
| l293d-direction | 1300 | 269.5 | 4.82x |
| logic-truth-table | 100 | 15.0 | 6.66x |

| Analog circuit (extended run) | Simulated ms | Wall ms | Measured / frame ratio |
|---|---:|---:|---:|
| timer-555-blink | 2000 | 225.9 | 8.86x / 9.00x |
| rc-oscilloscope | 2000 | 46.1 | 43.34x / 43.78x |

## Deliberate model limits

- Educational lumped models: fixed-temperature junction parameters; level-1 MOS; no semiconductor parasitic capacitance, thermal runaway or breakdown damage. Legacy LED piecewise-linear model remains.
- Motors use electrical resistance and voltage-based RPM/direction; bulb uses a single thermal state. Relay transfer is instantaneous at a coil threshold, with topology/turn-off flyback warnings rather than destructive arc simulation. IC propagation and regulator thermal dynamics are omitted.
- Adaptive next-step control uses embedded BE/trapezoid C/L error estimates, bounded 1 microsecond–1 millisecond steps plus waveform/instrument limits. It does not roll back already executed AVR instructions. Extreme fast circuits are resolution-limited and actual throughput is reported, not fabricated.
- Scope display is uniformly resampled with interpolation, bounded to 512 points; this is not an unlimited bandwidth instrument.
- Compile-response debug payload now requires boolean `truncated`; standalone simulator `DebugInfo` remains compatible with existing fixture inputs.

## Changed files (Lane A only)

- `.github/workflows/ci.yml`
- `lab/compiler/DEBUG.md`
- `lab/compiler/compile.mjs`
- `lab/compiler/debug-info.mjs`
- `lab/compiler/test/compile.test.mjs`
- `lab/compiler/test/debug-info.test.mjs`
- `lab/compiler/test/handler.test.mjs`
- `lab/docs/SPEC-v2-cloud.md`
- `lab/docs/SPEC-v2.md`
- `lab/docs/core-v2-verification.md`
- `lab/package.json`
- `lab/src/core/engine-keypad-cache.test.ts`
- `lab/src/core/engine-settling.test.ts`
- `lab/src/core/engine-v2-realtime.test.ts`
- `lab/src/core/engine.ts`
- `lab/src/core/examples.e2e.test.ts`
- `lab/src/core/mcu/debugger.test.ts`
- `lab/src/core/mcu/debugger.ts`
- `lab/src/core/solver-v2.test.ts`
- `lab/src/core/solver.ts`
- `lab/src/core/types.ts`
- `lab/src/ui/exports.test.ts`
- `lab/src/ui/schematic/layout.test.ts`
