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
  | 'dc-motor';

export type PartCategory = '보드' | '기본' | '입력' | '출력' | '센서' | '디스플레이' | '측정';

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
  key: 'pressed' | 'position' | 'lux' | 'distanceCm' | 'temperature' | 'humidity' | 'x' | 'y';
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

export interface Scene {
  version: 1;
  title?: string;
  parts: PartInstance[];
  wires: Wire[];
  code: string;
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
  meter?: { reading: string; mode: 'V' | 'mA' };
  hcsr04?: { pinging: boolean };
  sevenSeg?: { segments: boolean[] }; // a,b,c,d,e,f,g,dp
  pixels?: { colors: [number, number, number][] }; // 0..255 per channel, one per LED
  motor?: { rpm: number; direction: -1 | 0 | 1 };
  dht?: { busy: boolean };
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
  setInput(input: SimInput): void;
  writeSerial(text: string): void;
  onFrame(cb: (frame: SimFrame) => void): () => void; // ~60 Hz while running, once after setScene
  onSerial(cb: (text: string) => void): () => void;
  onState?(cb: (state: 'idle' | 'running' | 'paused', error?: string) => void): () => void;
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
  | { ok: true; hex: string; warnings: CompilerMessage[]; sizeBytes?: number }
  | { ok: false; errors: CompilerMessage[]; reason?: 'compile' | 'rejected' | 'timeout' | 'busy' | 'rate-limited' };

// ---------- core helpers exported from src/core/index.ts (lane A implements) ----------
// export const PARTS: Record<PartKind, PartDef>
// export function pinWorldPos(part: PartInstance, pinId: string): Vec3
// export function analyze(scene: Scene): Analysis
// export function createSimulator(): Simulator
// export function resistorBands(ohms: number): { colors: string[]; names: string[] } // 4-band hex colors + Korean names
// export function encodeShare(scene: Scene): Promise<string>; export function decodeShare(hash: string): Promise<Scene>
// export function validateScene(x: unknown): Scene // throws Error with a Korean message
// export const EXAMPLES: { id: string; title: string; chapter?: string; scene: Scene }[]
