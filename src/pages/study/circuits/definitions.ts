// One declarative description per drawn circuit: parts, jumper wires and the order they appear in the
// wiring table above the figure. Check a circuit against its table by reading `wires` top to bottom.
//
// Terminal names (also used by netlist.ts and tests/circuits.test.mjs):
//   uno:D8  uno:5V  uno:GND  uno:GND1 ...   Arduino header pins (GND = digital-side header, GND1/GND2 = power header)
//   bb:12a                                  breadboard hole, column 12, row a   (a-e and f-j are joined per column)
//   bbr:T+:3                                breadboard power rail T+/T-/B+/B-, hole 3
//   res.a  led.an  led.ca  btn.tl ...       a part's own pin (resolved to the hole/pin it sits in)
import { BB_RAIL_Y, DHT_W, bbHole, bbRail, joystick, l9110s, lcd, battery, unoPin, type Pt } from './parts'

export type Ref = string

export type PartDef =
  | { kind: 'resistor'; id: string; a: Ref; b: Ref; tenK?: boolean }
  | { kind: 'cds'; id: string; a: Ref; b: Ref }
  | { kind: 'rgb'; id: string; r: Ref; c: Ref; g: Ref; b: Ref }
  | { kind: 'lcd'; id: string; at: Pt }
  /** DHT11 module: free-standing at `at`, or plugged into the breadboard when s/v/g are given (then `at` is derived from s). */
  | { kind: 'dht'; id: string; at: Pt; s?: Ref; v?: Ref; g?: Ref }
  | { kind: 'joy'; id: string; at: Pt }
  | { kind: 'drv'; id: string; at: Pt }
  | { kind: 'motor'; id: string; at: Pt }
  | { kind: 'battery'; id: string; at: Pt }
  | { kind: 'led'; id: string; an: Ref; ca: Ref }
  | { kind: 'tact'; id: string; tl: Ref; br: Ref }
  | { kind: 'pot'; id: string; l: Ref; m: Ref; r: Ref }
  | { kind: 'buzzer'; id: string; plus: Ref | Pt; minus: Ref | Pt }
  | { kind: 'hcsr04'; id: string; at: Pt; rot: 0 | 90 | 180 | 270 }
  | { kind: 'servo'; id: string; at: Pt; rot: 0 | 90 | 180 | 270 }

export interface WireDef {
  from: Ref
  to: Ref
  color: string
  via?: Pt[]
  /** shown as a tooltip and in the proof tables */
  note: string
}

export type SimKind = 'blink' | 'button' | 'pot' | 'ultrasonic' | 'servo' | 'buzzer' | 'alarm' | 'cds' | 'rgb' | 'lcd' | 'dht' | 'dht-lcd' | 'joystick' | 'motor'

export interface CircuitDef {
  id: string
  size: Pt
  uno: Pt
  bb?: { at: Pt; hiCols?: number[] }
  parts: PartDef[]
  wires: WireDef[]
  /** One entry per data row of the wiring table above the figure, in the same order. */
  steps: Array<{ parts?: string[]; wires?: number[] }>
  sim: SimKind
  /** HC-SR04 test object: starts at `at` (distance 0), slides along `dir` by px0 + pxPerCm * cm */
  object?: { at: Pt; rot: number; dir: Pt; px0: number; pxPerCm: number }
}

const UNO_AT: Pt = [84, 40]
const BB_AT: Pt = [44, 340]

export const unoAt = (name: string) => unoPin(UNO_AT[0], UNO_AT[1], name)
export const bbAt = (at: Pt, col: number, row: string): Pt => { const h = bbHole(col, row); return [at[0] + h[0], at[1] + h[1]] }
export const railAt = (at: Pt, rail: string, i: number): Pt => { const h = bbRail(rail, i); return [at[0] + h[0], at[1] + h[1]] }

const rowY = (row: string) => BB_AT[1] + bbHole(1, row)[1]
const railY = (rail: string) => BB_AT[1] + BB_RAIL_Y[rail]

/** Power-header pins sit on the far edge of the board: climb above it, run left past the board, come down a lane. */
const around = (pin: string, rise: number, lane: number, endY: number): Pt[] => {
  const p = unoAt(pin)
  return [[p[0], UNO_AT[1] - rise], [lane, UNO_AT[1] - rise], [lane, endY]]
}

/** LED + 220 ohm resistor on the breadboard: resistor in row b, LED legs in row d (dome toward the channel). */
const ledBranch = (resCol: number, ledCol: number): PartDef[] => [
  { kind: 'resistor', id: 'res', a: `bb:${resCol}b`, b: `bb:${ledCol}b` },
  { kind: 'led', id: 'led', an: `bb:${ledCol}d`, ca: `bb:${ledCol + 1}d` },
]

const SIZE_BB: Pt = [500, 600]

export const CIRCUITS: CircuitDef[] = [
  {
    // 1-5: D8 -> 220 ohm -> LED(+) ... LED(-) -> GND
    id: 'led-blink',
    size: SIZE_BB,
    uno: UNO_AT,
    bb: { at: BB_AT, hiCols: [13, 17] },
    sim: 'blink',
    parts: ledBranch(13, 17),
    wires: [
      { from: 'uno:D8', to: 'bb:13a', color: 'orange', note: '점퍼선: D8 → 저항 한쪽 다리(13번 줄)' },
      { from: 'bb:18a', to: 'uno:GND', color: 'black', note: '점퍼선: LED 짧은 다리(−, 18번 줄) → GND' },
    ],
    steps: [{ parts: ['res'], wires: [0] }, { parts: ['led'] }, { wires: [1] }],
  },
  {
    // 2-2: button D2 <-> GND (INPUT_PULLUP), plus the 1-5 LED circuit unchanged
    id: 'button-led',
    size: SIZE_BB,
    uno: UNO_AT,
    bb: { at: BB_AT, hiCols: [6, 8, 13, 17] },
    sim: 'button',
    parts: [{ kind: 'tact', id: 'btn', tl: 'bb:6e', br: 'bb:8f' }, ...ledBranch(13, 17)],
    wires: [
      { from: 'uno:D2', to: 'bb:6a', color: 'blue', note: '점퍼선: D2 → 버튼 한쪽 변(6번 줄 위쪽)' },
      { from: 'uno:GND1', to: 'bb:8j', color: 'black', via: around('GND1', 22, 24, rowY('j')), note: '점퍼선: GND → 버튼 반대쪽 변(8번 줄 아래쪽)' },
      { from: 'uno:D8', to: 'bb:13a', color: 'orange', note: '점퍼선: D8 → 저항(1장과 같음)' },
      { from: 'bb:18a', to: 'uno:GND', color: 'black', note: '점퍼선: LED 짧은 다리(−) → GND(1장과 같음)' },
    ],
    steps: [{ parts: ['btn'], wires: [0] }, { wires: [1] }, { parts: ['res', 'led'], wires: [2, 3] }],
  },
  {
    // 4-4: pot 5V / A0 / GND, D9 -> 220 ohm -> LED -> GND
    id: 'pot-led',
    size: SIZE_BB,
    uno: UNO_AT,
    bb: { at: BB_AT, hiCols: [4, 5, 6, 14, 18] },
    sim: 'pot',
    parts: [{ kind: 'pot', id: 'pot', l: 'bb:4f', m: 'bb:5f', r: 'bb:6f' }, ...ledBranch(14, 18)],
    wires: [
      { from: 'uno:5V', to: 'bb:4j', color: 'red', via: around('5V', 32, 14, rowY('j')), note: '점퍼선: 5V → 가변저항 왼쪽 다리(4번 줄)' },
      { from: 'uno:A0', to: 'bb:5h', color: 'green', via: around('A0', 12, 34, rowY('h')), note: '점퍼선: A0 → 가변저항 가운데 다리(5번 줄)' },
      { from: 'uno:GND1', to: 'bb:6i', color: 'black', via: around('GND1', 22, 24, rowY('i')), note: '점퍼선: GND → 가변저항 오른쪽 다리(6번 줄)' },
      { from: 'uno:D9', to: 'bb:14a', color: 'yellow', note: '점퍼선: D9 → 저항 한쪽 다리(14번 줄)' },
      { from: 'bb:19a', to: 'uno:GND', color: 'black', note: '점퍼선: LED 짧은 다리(−, 19번 줄) → GND' },
    ],
    steps: [{ parts: ['pot'], wires: [0, 1, 2] }, { parts: ['res'], wires: [3] }, { parts: ['led'] }, { wires: [4] }],
  },
  {
    // 5-1: HC-SR04 straight to the board: VCC 5V, Trig D7, Echo D6, GND
    id: 'ultrasonic',
    size: [500, 650],
    uno: UNO_AT,
    sim: 'ultrasonic',
    parts: [{ kind: 'hcsr04', id: 'hc', at: [75, 370], rot: 180 }],
    wires: [
      { from: 'hc.VCC', to: 'uno:5V', color: 'red', via: [[206.5, 345], [452, 345], [452, 20], [unoAt('5V')[0], 20]], note: '점퍼선: VCC → 5V' },
      { from: 'hc.Trig', to: 'uno:D7', color: 'purple', note: '점퍼선: Trig → D7' },
      { from: 'hc.Echo', to: 'uno:D6', color: 'blue', note: '점퍼선: Echo → D6' },
      { from: 'hc.GND', to: 'uno:GND', color: 'black', note: '점퍼선: GND → GND' },
    ],
    steps: [{ parts: ['hc'], wires: [0] }, { wires: [1] }, { wires: [2] }, { wires: [3] }],
    object: { at: [187.5, 470], rot: 0, dir: [0, 1], px0: 22, pxPerCm: 0.6 },
  },
  {
    // 5-2: SG90 brown GND, red 5V, orange D9
    id: 'servo',
    size: [500, 560],
    uno: UNO_AT,
    sim: 'servo',
    parts: [{ kind: 'servo', id: 'sv', at: [219, 330], rot: 90 }],
    wires: [
      { from: 'sv.GND', to: 'uno:GND', color: 'brown', note: '갈색 선: 서보 GND → 아두이노 GND' },
      { from: 'sv.5V', to: 'uno:5V', color: 'red', via: [[247, 312], [452, 312], [452, 20], [unoAt('5V')[0], 20]], note: '빨간 선: 서보 전원 → 5V' },
      { from: 'sv.SIG', to: 'uno:D9', color: 'orange', note: '주황 선: 서보 신호 → D9' },
    ],
    steps: [{ parts: ['sv'], wires: [0] }, { wires: [1] }, { wires: [2] }],
  },
  {
    // 5-3: passive piezo + on D8, - on GND
    id: 'buzzer',
    size: [500, 470],
    uno: UNO_AT,
    sim: 'buzzer',
    parts: [{ kind: 'buzzer', id: 'bz', plus: [233, 352], minus: [271, 352] }],
    wires: [
      { from: 'bz.plus', to: 'uno:D8', color: 'orange', note: '점퍼선: 부저 + → D8' },
      { from: 'bz.minus', to: 'uno:GND', color: 'black', note: '점퍼선: 부저 − → GND' },
    ],
    steps: [{ parts: ['bz'], wires: [0] }, { wires: [1] }],
  },
  {
    // 7-1: sensor + buzzer + LED; 5V and GND shared through the top rails
    id: 'alarm',
    size: [740, 600],
    uno: UNO_AT,
    bb: { at: BB_AT, hiCols: [8, 12, 13, 17, 19] },
    sim: 'alarm',
    parts: [
      { kind: 'hcsr04', id: 'hc', at: [500, 70], rot: 90 },
      { kind: 'buzzer', id: 'bz', plus: 'bb:17e', minus: 'bb:19e' },
      ...ledBranch(8, 12),
    ],
    wires: [
      { from: 'uno:5V', to: 'bbr:T+:1', color: 'red', via: around('5V', 32, 14, railY('T+')), note: '점퍼선: 아두이노 5V → 위쪽 + 레일' },
      { from: 'hc.VCC', to: 'bbr:T+:25', color: 'red', via: [[486, 163.45], [486, railY('T+')]], note: '점퍼선: HC-SR04 VCC → + 레일(5V)' },
      { from: 'hc.Trig', to: 'uno:D7', color: 'purple', via: [[470, 176.15], [470, 312], [unoAt('D7')[0], 312]], note: '점퍼선: Trig → D7' },
      { from: 'hc.Echo', to: 'uno:D6', color: 'blue', via: [[480, 188.85], [480, 322], [unoAt('D6')[0], 322]], note: '점퍼선: Echo → D6' },
      { from: 'uno:GND1', to: 'bbr:T-:1', color: 'black', via: around('GND1', 22, 24, railY('T-')), note: '점퍼선: 아두이노 GND → 위쪽 − 레일' },
      { from: 'hc.GND', to: 'bbr:T-:25', color: 'black', via: [[496, 201.55], [496, railY('T-')]], note: '점퍼선: HC-SR04 GND → − 레일(GND)' },
      { from: 'uno:D8', to: 'bb:17a', color: 'orange', note: '점퍼선: D8 → 부저 + (17번 줄)' },
      { from: 'bb:19a', to: 'bbr:T-:16', color: 'black', note: '점퍼선: 부저 − (19번 줄) → − 레일(GND)' },
      { from: 'uno:D4', to: 'bb:8a', color: 'green', note: '점퍼선: D4 → 저항 한쪽 다리(8번 줄)' },
      { from: 'bb:13a', to: 'bbr:T-:11', color: 'black', note: '점퍼선: LED 짧은 다리(−, 13번 줄) → − 레일(GND)' },
    ],
    steps: [
      { parts: ['hc'], wires: [0, 1] },
      { wires: [2] },
      { wires: [3] },
      { wires: [4, 5] },
      { parts: ['bz'], wires: [6] },
      { wires: [7] },
      { parts: ['res', 'led'], wires: [8] },
      { wires: [9] },
    ],
    object: { at: [600, 182.5], rot: 90, dir: [1, 0], px0: 22, pxPerCm: 0.5 },
  },
]


// ---- chapter 6 (modules)
const lcdPin = (name: string) => lcd('t', LCD_AT[0], LCD_AT[1]).pins[name]
const LCD_AT: Pt = [520, 90]
/** LCD header is on the top edge: SDA/SCL climb to tracks above the Arduino and run left to A4/A5; power runs down lanes right of the breadboard. */
const lcdI2cWires = (rail: 'B' | 'T'): WireDef[] => {
  const [g, v, d, c] = ['GND', 'VCC', 'SDA', 'SCL'].map(lcdPin)
  const gy = railY(`${rail}-`)
  const vy = railY(`${rail}+`)
  const innerIsVcc = rail === 'B'
  return [
    { from: 'lcd.GND', to: `bbr:${rail}-:25`, color: 'black', via: [[g[0], 62], [innerIsVcc ? 506 : 496, 62], [innerIsVcc ? 506 : 496, gy]], note: '점퍼선: LCD GND → − 레일(GND)' },
    { from: 'lcd.VCC', to: `bbr:${rail}+:25`, color: 'red', via: [[v[0], 52], [innerIsVcc ? 496 : 506, 52], [innerIsVcc ? 496 : 506, vy]], note: '점퍼선: LCD VCC → + 레일(5V)' },
    { from: 'lcd.SDA', to: 'uno:A4', color: 'green', via: [[d[0], 34], [unoAt('A4')[0], 34]], note: '점퍼선: LCD SDA → A4' },
    { from: 'lcd.SCL', to: 'uno:A5', color: 'yellow', via: [[c[0], 26], [unoAt('A5')[0], 26]], note: '점퍼선: LCD SCL → A5' },
  ]
}

/** top-left corner of a breadboard-mounted DHT11 whose S pin sits in `hole` */
const dhtAtHole = (hole: Pt): Pt => [hole[0] - DHT_W / 2 + 12.7, hole[1] - 9]
const DHT_ON_BB = ((h) => dhtAtHole([BB_AT[0] + h[0], BB_AT[1] + h[1]]))(bbHole(6, 'e'))

CIRCUITS.push(
  {
    // 6-2: 5V - CDS - (A0) - 10k - GND, plus the 1-5 LED on D8
    id: 'cds-night',
    size: SIZE_BB,
    uno: UNO_AT,
    bb: { at: BB_AT, hiCols: [4, 6, 10, 13, 17] },
    sim: 'cds',
    parts: [
      { kind: 'cds', id: 'cds', a: 'bb:4f', b: 'bb:6f' },
      { kind: 'resistor', id: 'rd', a: 'bb:6g', b: 'bb:10g', tenK: true },
      ...ledBranch(13, 17),
    ],
    wires: [
      { from: 'uno:5V', to: 'bb:4j', color: 'red', via: around('5V', 32, 14, rowY('j')), note: '점퍼선: 5V → CDS 한쪽 다리(4번 줄)' },
      { from: 'uno:A0', to: 'bb:6h', color: 'green', via: around('A0', 12, 34, rowY('h')), note: '점퍼선: A0 → 분압점(CDS와 10kΩ이 만나는 6번 줄)' },
      { from: 'uno:GND1', to: 'bb:10i', color: 'black', via: around('GND1', 22, 24, rowY('i')), note: '점퍼선: GND → 10kΩ 저항 다른 쪽 다리(10번 줄)' },
      { from: 'uno:D8', to: 'bb:13a', color: 'orange', note: '점퍼선: D8 → 저항(1장과 같음)' },
      { from: 'bb:18a', to: 'uno:GND', color: 'black', note: '점퍼선: LED 짧은 다리(−) → GND(1장과 같음)' },
    ],
    steps: [{ parts: ['cds'], wires: [0] }, { parts: ['cds'] }, { parts: ['rd'] }, { parts: ['rd'], wires: [2] }, { wires: [1] }, { parts: ['res', 'led'], wires: [3, 4] }],
  },
  {
    // 6-3: R/G/B legs through 220 ohm to D9/D10/D11, common cathode to GND
    id: 'rgb-led',
    size: SIZE_BB,
    uno: UNO_AT,
    bb: { at: BB_AT, hiCols: [18, 19, 20, 22, 23, 24, 25] },
    sim: 'rgb',
    parts: [
      { kind: 'rgb', id: 'rgb', r: 'bb:22e', c: 'bb:23e', g: 'bb:24e', b: 'bb:25e' },
      { kind: 'resistor', id: 'rr', a: 'bb:18b', b: 'bb:22b' },
      { kind: 'resistor', id: 'rg', a: 'bb:19c', b: 'bb:24c' },
      { kind: 'resistor', id: 'rb', a: 'bb:20d', b: 'bb:25d' },
    ],
    wires: [
      { from: 'uno:D9', to: 'bb:18a', color: 'red', note: '점퍼선: D9 → 220Ω → RGB LED R(빨강) 다리' },
      { from: 'uno:D10', to: 'bb:19a', color: 'green', note: '점퍼선: D10 → 220Ω → RGB LED G(초록) 다리' },
      { from: 'uno:D11', to: 'bb:20a', color: 'blue', note: '점퍼선: D11 → 220Ω → RGB LED B(파랑) 다리' },
      { from: 'bb:23a', to: 'uno:GND', color: 'black', note: '점퍼선: RGB LED 공통(가장 긴 다리, 23번 줄) → GND' },
    ],
    steps: [{ parts: ['rgb', 'rr'], wires: [0] }, { parts: ['rg'], wires: [1] }, { parts: ['rb'], wires: [2] }, { wires: [3] }],
  },
  {
    // 6-4: I2C LCD (GND VCC A4 A5) + optional pot on A0; power shared through the bottom rails
    id: 'lcd-i2c',
    size: [740, 600],
    uno: UNO_AT,
    bb: { at: BB_AT, hiCols: [24, 25, 26] },
    sim: 'lcd',
    parts: [{ kind: 'lcd', id: 'lcd', at: LCD_AT }, { kind: 'pot', id: 'pot', l: 'bb:24f', m: 'bb:25f', r: 'bb:26f' }],
    wires: [
      lcdI2cWires('B')[0],
      { from: 'uno:GND1', to: 'bbr:B-:1', color: 'black', via: around('GND1', 22, 24, railY('B-')), note: '점퍼선: 아두이노 GND → 아래쪽 − 레일' },
      lcdI2cWires('B')[1],
      { from: 'uno:5V', to: 'bbr:B+:1', color: 'red', via: around('5V', 32, 14, railY('B+')), note: '점퍼선: 아두이노 5V → 아래쪽 + 레일' },
      lcdI2cWires('B')[2],
      lcdI2cWires('B')[3],
      { from: 'bbr:B+:20', to: 'bb:24j', color: 'red', note: '점퍼선: + 레일(5V) → 가변저항 왼쪽 다리(24번 줄)' },
      { from: 'bbr:B-:21', to: 'bb:26i', color: 'black', note: '점퍼선: − 레일(GND) → 가변저항 오른쪽 다리(26번 줄)' },
      { from: 'uno:A0', to: 'bb:25h', color: 'orange', via: [[unoAt('A0')[0], 44], [466, 44], [466, rowY('h')]], note: '점퍼선: A0 → 가변저항 가운데 다리(25번 줄)' },
    ],
    steps: [{ parts: ['lcd'], wires: [0, 1] }, { wires: [2, 3] }, { wires: [4] }, { wires: [5] }, { parts: ['pot'], wires: [6, 7, 8] }],
  },
  {
    // 6-5: DHT11 module straight to the board: S D2, VCC 5V, GND
    id: 'dht11',
    size: [500, 520],
    uno: UNO_AT,
    sim: 'dht',
    parts: [{ kind: 'dht', id: 'dht', at: [200, 380] }],
    wires: [
      { from: 'dht.S', to: 'uno:D2', color: 'green', note: '점퍼선: DHT11 S(데이터) → D2' },
      { from: 'dht.VCC', to: 'uno:5V', color: 'red', via: [[262, 350], [452, 350], [452, 20], [unoAt('5V')[0], 20]], note: '점퍼선: DHT11 VCC → 5V' },
      { from: 'dht.GND', to: 'uno:GND', color: 'black', note: '점퍼선: DHT11 GND → GND' },
    ],
    steps: [{ parts: ['dht'], wires: [0] }, { wires: [1] }, { wires: [2] }],
  },
  {
    // 6-5: DHT11 (plugged into the breadboard, D2) + I2C LCD, 5V/GND shared through the top rails
    id: 'dht11-lcd',
    size: [740, 600],
    uno: UNO_AT,
    bb: { at: BB_AT, hiCols: [6, 7, 8] },
    sim: 'dht-lcd',
    parts: [{ kind: 'dht', id: 'dht', at: DHT_ON_BB, s: 'bb:6e', v: 'bb:7e', g: 'bb:8e' }, { kind: 'lcd', id: 'lcd', at: LCD_AT }],
    wires: [
      { from: 'uno:D2', to: 'bb:6a', color: 'green', note: '점퍼선: D2 → DHT11 S(6번 줄)' },
      { from: 'bb:7a', to: 'bbr:T+:5', color: 'red', note: '점퍼선: DHT11 VCC(7번 줄) → + 레일(5V)' },
      { from: 'bb:8a', to: 'bbr:T-:7', color: 'black', note: '점퍼선: DHT11 GND(8번 줄) → − 레일(GND)' },
      { from: 'uno:5V', to: 'bbr:T+:1', color: 'red', via: around('5V', 32, 14, railY('T+')), note: '점퍼선: 아두이노 5V → 위쪽 + 레일' },
      { from: 'uno:GND1', to: 'bbr:T-:1', color: 'black', via: around('GND1', 22, 24, railY('T-')), note: '점퍼선: 아두이노 GND → 위쪽 − 레일' },
      ...lcdI2cWires('T'),
    ],
    steps: [{ parts: ['dht'], wires: [0, 1, 2] }, { parts: ['lcd'], wires: [3, 4, 5, 6, 7, 8] }],
  },
  {
    // 6-6: joystick module above the board: GND, 5V, VRx A0, VRy A1, SW D7
    id: 'joystick',
    size: [500, 500],
    uno: [84, 190],
    sim: 'joystick',
    parts: [{ kind: 'joy', id: 'joy', at: [170, 20] }],
    wires: [
      { from: 'joy.GND', to: 'uno:GND1', color: 'black', note: '점퍼선: 조이스틱 GND → GND' },
      { from: 'joy.5V', to: 'uno:5V', color: 'red', note: '점퍼선: 조이스틱 +5V → 5V' },
      { from: 'joy.VRx', to: 'uno:A0', color: 'green', note: '점퍼선: VRx → A0 (좌우)' },
      { from: 'joy.VRy', to: 'uno:A1', color: 'yellow', note: '점퍼선: VRy → A1 (상하)' },
      { from: 'joy.SW', to: 'uno:D7', color: 'purple', via: [[joystick('t', 170, 20).pins.SW[0], 168], [452, 168], [452, 470], [unoPin(84, 190, 'D7')[0], 470]], note: '점퍼선: SW(스틱 버튼) → D7' },
    ],
    steps: [{ parts: ['joy'], wires: [0] }, { wires: [1] }, { wires: [2] }, { wires: [3] }, { wires: [4] }],
  },
  {
    // 6-7: L9110S + DC motor + 4xAA, common ground through the bottom GND rail
    id: 'dc-motor',
    size: [660, 800],
    uno: UNO_AT,
    bb: { at: BB_AT, hiCols: [] },
    sim: 'motor',
    parts: [
      { kind: 'battery', id: 'bat', at: [100, 660] },
      { kind: 'drv', id: 'drv', at: [300, 620] },
      { kind: 'motor', id: 'motor', at: [440, 700] },
    ],
    wires: [
      { from: 'bat.plus', to: 'drv.VCC', color: 'red', via: [[battery('t', 100, 660).pins.plus[0] + 20, 677], [battery('t', 100, 660).pins.plus[0] + 20, 600], [l9110s('t', 300, 620).pins.VCC[0], 600]], note: '빨간 선: 건전지 (+) → 드라이버 VCC' },
      { from: 'bat.minus', to: 'bbr:B-:13', color: 'black', via: [[battery('t', 100, 660).pins.minus[0] - 20, 701], [battery('t', 100, 660).pins.minus[0] - 20, 580], [250.15, 580]], note: '검은 선: 건전지 (−) → GND 레일' },
      { from: 'drv.GND', to: 'bbr:B-:21', color: 'black', note: '점퍼선: 드라이버 GND → GND 레일' },
      { from: 'uno:GND1', to: 'bbr:B-:1', color: 'black', via: around('GND1', 22, 24, railY('B-')), note: '점퍼선: 아두이노 GND → GND 레일 (공통 접지)' },
      { from: 'uno:D5', to: 'drv.A-IA', color: 'orange', via: [[unoAt('D5')[0], 322], [470, 322], [470, 590], [l9110s('t', 300, 620).pins['A-IA'][0], 590]], note: '점퍼선: D5 → 드라이버 A-IA' },
      { from: 'uno:D6', to: 'drv.A-IB', color: 'blue', via: [[unoAt('D6')[0], 312], [480, 312], [480, 602], [l9110s('t', 300, 620).pins['A-IB'][0], 602]], note: '점퍼선: D6 → 드라이버 A-IB' },
      { from: 'drv.MA1', to: 'motor.t1', color: 'yellow', note: '모터 선: MOTOR-A 한쪽 → 모터 한쪽 단자' },
      { from: 'drv.MA2', to: 'motor.t2', color: 'brown', note: '모터 선: MOTOR-A 다른 쪽 → 모터 다른 쪽 단자' },
    ],
    steps: [{ parts: ['bat', 'drv'], wires: [0] }, { wires: [1, 2, 3] }, { wires: [4] }, { wires: [5] }, { parts: ['motor'], wires: [6, 7] }],
  },
)

export const circuitById = (id: string) => CIRCUITS.find((c) => c.id === id)
