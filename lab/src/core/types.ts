// Shared contract between the core simulator (src/core) and the 3D UI (src/scene3d, src/ui).
// See docs/SPEC.md. Units: millimetres, volts, amps, ohms, milliseconds. Y is up.
// Change only by agreement between lanes: both sides compile against this file.

export type Vec3 = [number, number, number];
export type RotY = 0 | 90 | 180 | 270;

export type PartKind =
  | 'arduino-uno'
  | 'breadboard-half'
  | 'breadboard-full'
  | 'led'
  | 'rgb-led'
  | 'resistor'
  | 'pushbutton'
  | 'slide-switch'
  | 'potentiometer'
  | 'photoresistor'
  | 'buzzer'
  | 'servo'
  | 'hc-sr04'
  | 'lcd1602-i2c'
  | 'multimeter'
  | 'dht11'
  | 'joystick'
  | 'seven-segment'
  | 'neopixel-strip'
  | 'l9110s'
  | 'dc-motor'
  // ---- v2 (docs/SPEC-v2.md) ----
  | 'battery-9v' | 'battery-aa-pack' | 'coin-cell-3v' | 'power-supply'
  | 'capacitor-ceramic' | 'capacitor-electrolytic' | 'diode' | 'zener' | 'inductor'
  | 'dip-switch-4' | 'keypad-4x4' | 'tilt-switch' | 'breadboard-mini'
  | 'tmp36' | 'pir' | 'flex-sensor' | 'force-sensor' | 'soil-moisture' | 'gas-sensor' | 'ir-receiver'
  | 'light-bulb' | 'vibration-motor' | 'gearmotor' | 'neopixel-ring' | 'seven-segment-4digit' | 'lcd1602-parallel'
  | 'npn' | 'pnp' | 'nmos' | 'tip120' | 'relay-spdt' | 'l293d' | 'shift-register-595'
  | 'logic-7400' | 'logic-7408' | 'logic-7432' | 'logic-7486' | 'logic-7404'
  | 'timer-555' | 'regulator-7805' | 'optocoupler-4n35'
  | 'oscilloscope' | 'function-generator' | 'logic-analyzer';

export type PartCategory = '보드' | '전원' | '기본' | '입력' | '출력' | '센서' | '디스플레이' | '반도체' | 'IC' | '측정';

export type PinRole = 'digital' | 'analog' | 'power' | 'gnd' | 'passive' | 'hole';

export interface PinDef {
  id: string; // stable id, e.g. 'D13', 'A0', '5V', 'GND.1', 'anode', 'a12', 'tp3'
  label: string; // shown in tooltips (Korean or the silkscreen name)
  pos: Vec3; // local insertion point
  role: PinRole;
}

export type PropValue = number | string | boolean;

export interface PropDef {
  key: string;
  label: string; // Korean
  type: 'number' | 'enum' | 'boolean';
  unit?: string; // 'Ω', 'cm', 'lux', '°'
  options?: { value: PropValue; label: string }[]; // enum (and suggested presets for number)
  min?: number;
  max?: number;
  default: PropValue;
}

export interface SimInputDef {
  key:
    | 'pressed' | 'position' | 'lux' | 'distanceCm' | 'temperature' | 'humidity' | 'x' | 'y'
    // v2
    | 'tilt' | 'motion' | 'force' | 'bend' | 'moisture' | 'gas' | 'irCode' | 'key' | 'switches';
  label: string; // Korean
  type: 'momentary' | 'range';
  min?: number;
  max?: number;
  default: number | boolean;
}

export interface PartDef {
  kind: PartKind;
  title: string; // Korean display name
  category: PartCategory;
  size: Vec3; // bounding box, for picking/placement
  pins: PinDef[]; // for breadboards: every hole
  props: PropDef[];
  /** Acquisition/display controls with no electrical effect; all other props retain the electrical update path. */
  acquisitionOnlyProps: readonly string[];
  /** Interactive inputs the user can drive while the sim runs (button press, knob, light, distance). */
  inputs?: SimInputDef[];
}

export interface PartInstance {
  id: string;
  kind: PartKind;
  pos: Vec3;
  rotY: RotY;
  props: Record<string, PropValue>;
}

export interface PinRef {
  partId: string;
  pinId: string;
}

export type WireColor = 'red' | 'black' | 'blue' | 'green' | 'yellow' | 'orange' | 'white' | 'purple' | 'gray';

export interface Wire {
  id: string;
  from: PinRef;
  to: PinRef;
  color: WireColor;
  /** Optional bend points in world space (between from and to). */
  bends?: Vec3[];
}

export interface Note {
  id: string;
  pos: Vec3;
  text: string; // ≤ 500 chars
  color?: 'yellow' | 'blue' | 'green' | 'pink';
}

export type CodeMode = 'blocks' | 'blocks+text' | 'text';

export interface Scene {
  /** 1 = original; 2 adds blocks/codeMode/notes/mission. validateScene upgrades 1 → 2. */
  version: 1 | 2;
  title?: string;
  parts: PartInstance[];
  wires: Wire[];
  code: string;
  codeMode?: CodeMode; // default 'text' for v1 scenes
  blocks?: unknown; // Blockly serialization JSON (validated size ≤ 256 KB)
  notes?: Note[];
  mission?: string; // mission id when the scene belongs to a mission
}

// ---------- static analysis (no MCU needed) ----------

export interface Net {
  id: string; // e.g. 'n7'
  name?: string; // readable name when it touches a named UNO pin: '5V', 'GND', 'D13', 'A0'
  pins: PinRef[];
}

export interface Analysis {
  nets: Net[];
  /** `${partId}:${pinId}` → net id */
  pinToNet: Record<string, string>;
  /** part pins sitting in a hole/socket: `${partId}:${pinId}` → hole PinRef */
  insertions: Record<string, PinRef>;
  warnings: SimWarning[];
}

// ---------- runtime ----------

export type PinMode = 'input' | 'input_pullup' | 'output';

export interface McuPinState {
  mode: PinMode;
  level: 0 | 1;
  /** 0..1 average high time over the last ~20 ms (PWM, servo pulses, tone). */
  duty: number;
  /** Measured toggle frequency in Hz (0 when static). */
  freq: number;
}

export interface PartVisualState {
  led?: { brightness: number }; // 0..1
  rgb?: { r: number; g: number; b: number }; // 0..1 each
  servo?: { angle: number }; // degrees 0..180
  buzzer?: { on: boolean; freq: number };
  lcd?: { lines: [string, string]; backlight: boolean; cursor?: { row: number; col: number; visible: boolean } };
  meter?: { reading: string; mode: 'V' | 'mA'; measurementMode?: 'V' | 'mA' | 'Ω' | 'continuity'; continuity?: boolean };
  hcsr04?: { pinging: boolean };
  sevenSeg?: { segments: boolean[] }; // a,b,c,d,e,f,g,dp
  pixels?: { colors: [number, number, number][] }; // 0..255 per channel, one per LED
  motor?: { rpm: number; direction: -1 | 0 | 1 };
  dht?: { busy: boolean };
  // v2
  bulb?: { brightness: number }; // 0..1
  vibration?: { on: boolean };
  relay?: { closed: boolean };
  digits?: { segments: boolean[][] }; // per digit: a..g,dp (persistence-of-vision averaged)
  supply?: { volts: number; amps: number; limiting: boolean };
  capacitor?: { volts: number; overVoltage: boolean; reversed: boolean };
  ic?: { outputs: Record<string, 0 | 1> }; // logic ICs, 595, 555 output for tooltips/LEDs
  /** Per-pin voltages for tooltips. */
  pinVolts?: Record<string, number>;
}

export interface SimWarning {
  id: string; // stable for de-duplication, e.g. 'led-overcurrent:led3'
  level: 'error' | 'warn' | 'info';
  partId?: string;
  message: string; // Korean, one sentence
}

export interface SimFrame {
  timeMs: number; // simulated time since reset
  realtimeRatio: number; // simulated/real speed actually achieved
  pins: Record<string, McuPinState>; // 'D0'..'D13', 'A0'..'A5'
  parts: Record<string, PartVisualState>; // by part id
  netVolts: Record<string, number>; // by net id
  warnings: SimWarning[];
  /** v2 instruments, by instrument part id. Samples are decimated for display. */
  scopes?: Record<string, ScopeTrace>;
  logic?: Record<string, LogicTrace>;
  /** v2 debugger state when paused at a breakpoint/step. */
  debug?: DebugState;
}

export interface ScopeTrace {
  t0Ms: number; // simulated time of the first sample
  dtMs: number; // sample spacing
  channels: number[][]; // volts per channel
  triggered: boolean;
}

export interface LogicTrace {
  t0Ms: number;
  dtMs: number;
  channels: (0 | 1)[][];
}

export interface DebugState {
  paused: boolean;
  line?: number; // 1-based sketch line
  reason?: 'breakpoint' | 'step' | 'pause';
  globals?: { name: string; value: string; type: string }[];
}

export interface SimInput {
  partId: string;
  key: SimInputDef['key'];
  value: number | boolean;
}

export interface Simulator {
  /** Rebuild nets from the scene. Safe while running. */
  setScene(scene: Scene): Analysis;
  /** Load an Intel HEX produced by the compile service and reset the MCU. */
  loadHex(hex: string): void;
  start(): void;
  pause(): void;
  stop(): void; // pause + reset outputs to idle
  reset(): void;
  setSpeed(multiplier: number): void; // 0.25..2
  /** Mission checks use simulated time for legacy electrical solve cadence. */
  setMissionMode?(): void;
  setInput(input: SimInput): void;
  writeSerial(text: string): void;
  onFrame(cb: (frame: SimFrame) => void): () => void; // ~60 Hz while running, once after setScene
  onSerial(cb: (text: string) => void): () => void;
  onState?(cb: (state: 'idle' | 'running' | 'paused', error?: string) => void): () => void;
  /** v2 debugger (present when the hex was compiled with debug info). */
  debug?: {
    load(info: DebugInfo): void;
    setBreakpoints(lines: number[]): void;
    continue(): void;
    stepOver(): void;
    stepInto(): void;
    stepOut(): void;
  };
  readonly state: 'idle' | 'running' | 'paused';
  dispose(): void;
}

// ---------- compile service ----------

export interface CompilerMessage {
  line: number; // 1-based, in the user's sketch
  column?: number;
  severity: 'error' | 'warning';
  message: string; // raw compiler text with paths stripped
  hintKo?: string; // Korean hint for common mistakes
}

export type CompileResult =
  | { ok: true; hex: string; warnings: CompilerMessage[]; sizeBytes?: number; debug?: DebugInfo }
  | { ok: false; errors: CompilerMessage[]; reason?: 'compile' | 'rejected' | 'timeout' | 'busy' | 'rate-limited' | 'unauthorized' };

export interface DebugInfo {
  /** program address (byte) → 1-based sketch line, from the ELF line table (sketch file only) */
  lines: { addr: number; line: number }[];
  /** globals defined in the sketch: SRAM address, size in bytes, C type name */
  globals: { name: string; addr: number; size: number; type: string }[];
  /** compiler could not map every sketch line; always present on a debug build, a missing value is read as false */
  truncated: boolean;
}

// ---------- core helpers exported from src/core/index.ts (lane A implements) ----------
// export const PARTS: Record<PartKind, PartDef>
// export function pinWorldPos(part: PartInstance, pinId: string): Vec3
// export function analyze(scene: Scene): Analysis
// export function createSimulator(): Simulator
// export function resistorBands(ohms: number): { colors: string[]; names: string[] } // 4-band hex colors + Korean names
// export function encodeShare(scene: Scene): Promise<string>; export function decodeShare(hash: string): Promise<Scene>
// export function validateScene(x: unknown): Scene // throws Error with a Korean message
// export const EXAMPLES: { id: string; title: string; chapter?: string; scene: Scene }[]
