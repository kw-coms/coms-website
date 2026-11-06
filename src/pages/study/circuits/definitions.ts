// One declarative description per drawn circuit: parts, jumper wires and the order they appear in the
// wiring table above the figure. Check a circuit against its table by reading `wires` top to bottom.
//
// Terminal names (also used by netlist.ts and tests/circuits.test.mjs):
//   uno:D8  uno:5V  uno:GND  uno:GND1 ...   Arduino header pins (GND = digital-side header, GND1/GND2 = power header)
//   bb:12a                                  breadboard hole, column 12, row a   (a-e and f-j are joined per column)
//   bbr:T+:3                                breadboard power rail T+/T-/B+/B-, hole 3
//   res.a  led.an  led.ca  btn.tl ...       a part's own pin (resolved to the hole/pin it sits in)
import { BB_RAIL_Y, bbHole, bbRail, unoPin, type Pt } from './parts'

export type Ref = string

export type PartDef =
  | { kind: 'resistor'; id: string; a: Ref; b: Ref }
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

export type SimKind = 'blink' | 'button' | 'pot' | 'ultrasonic' | 'servo' | 'buzzer' | 'alarm'

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
    // 6-1: sensor + buzzer + LED; 5V and GND shared through the top rails
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

export const circuitById = (id: string) => CIRCUITS.find((c) => c.id === id)

