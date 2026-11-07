import type { Analysis, PartVisualState, Scene, SimWarning } from './types';
import { Lcd1602 } from './mcu/lcd';

type Drive = { volts: number; resistance?: number };
export interface BehaviorResult {
  drives: Record<string, Drive>;
  links: { a: string; b: string; ohms: number }[];
  outputs: Record<string, Record<string, 0 | 1>>;
  visuals: Record<string, PartVisualState>;
  warnings: SimWarning[];
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const logic = (volts: number, vcc: number): 0 | 1 => volts >= Math.max(1.5, vcc * .65) ? 1 : 0;
// Remote UI enters conventional NEC display order (address, inverse, command, inverse).
// On the wire each byte is sent least-significant bit first.
const necWireBits = (code: number) => (((code & 255) << 24) | ((code & 0xff00) << 8)
  | ((code >>> 8) & 0xff00) | (code >>> 24)) >>> 0;

/** Stateful edge-triggered peripheral models. Tick once per changed input/time sample. */
export class BehavioralDevices {
  private previous = new Map<string, Record<string, 0 | 1>>();
  private shift = new Map<string, { serial: number; latched: number }>();
  private latch555 = new Map<string, 0 | 1>();
  private pirUntil = new Map<string, number>();
  private ir = new Map<string, { code: number; started: number }>();
  private irInput = new Map<string, number>();
  private lcd = new Map<string, Lcd1602>();
  private digits = new Map<string, { on: number[][]; lastMs: number }>();

  reset(): void {
    this.previous.clear(); this.shift.clear(); this.latch555.clear();
    this.pirUntil.clear(); this.ir.clear(); this.irInput.clear(); this.lcd.clear(); this.digits.clear();
  }

  /** Next asynchronous output edge; callers can jump over quiescent time. */
  nextEventMs(timeMs: number): number | undefined {
    let next = Infinity;
    for (const expiry of this.pirUntil.values()) if (expiry > timeMs + 1e-9) next = Math.min(next, expiry);
    for (const signal of this.ir.values()) {
      const packet = necWireBits(signal.code);
      let edge = signal.started;
      const consider = () => { if (edge > timeMs + 1e-9) next = Math.min(next, edge); };
      edge += 9; consider(); edge += 4.5; consider();
      for (let bit = 0; bit < 32; bit++) {
        edge += .5625; consider();
        edge += ((packet >>> bit) & 1) ? 1.6875 : .5625; consider();
      }
      edge += .5625; consider();
    }
    return Number.isFinite(next) ? next : undefined;
  }

  tick(scene: Scene, analysis: Analysis, volts: Record<string, number>,
    inputs: Record<string, Record<string, number | boolean>>, timeMs: number): BehaviorResult {
    const result: BehaviorResult = { drives: {}, links: [], outputs: {}, visuals: {}, warnings: [] };
    const net = (id: string, pin: string) => analysis.pinToNet[`${id}:${pin}`];
    const voltage = (id: string, pin: string) => volts[net(id, pin) ?? ''] ?? 0;
    const connected = (id: string, pin: string) => (analysis.nets.find(n => n.id === net(id, pin))?.pins.length ?? 0) > 1;
    const drive = (id: string, pin: string, value: number, resistance = 40) => {
      result.drives[`${id}:${pin}`] = { volts: value, resistance };
    };
    const link = (id: string, a: string, b: string, ohms = .05) => {
      result.links.push({ a: `${id}:${a}`, b: `${id}:${b}`, ohms });
    };
    for (const part of scene.parts) {
      const id = part.id;
      const groundPin = part.kind.startsWith('logic-74') ? '7'
        : part.kind === 'shift-register-595' ? '8'
          : part.kind === 'l293d' ? '4'
            : part.kind === 'timer-555' ? '1'
              : part.kind === 'lcd1602-parallel' ? 'VSS'
                : part.kind === 'pir' || part.kind === 'ir-receiver' ? 'GND' : '';
      const ground = groundPin ? voltage(id, groundPin) : 0;
      const high = (pin: string, vcc = 5) => logic(voltage(id, pin) - ground, vcc);
      const prev = this.previous.get(id) ?? {};
      const edge = (pin: string, vcc = 5) => high(pin, vcc) === 1 && prev[pin] !== 1;
      const out: Record<string, 0 | 1> = {};
      let vcc = voltage(id, '14') - voltage(id, '7');
      if (part.kind === 'logic-7404') vcc = voltage(id, '14') - voltage(id, '7');
      if (part.kind.startsWith('logic-74') && vcc >= 2) {
        const gates: [string, string, string][] = part.kind === 'logic-7404'
          ? [['1', '', '2'], ['3', '', '4'], ['5', '', '6'], ['9', '', '8'], ['11', '', '10'], ['13', '', '12']]
          : [['1', '2', '3'], ['4', '5', '6'], ['9', '10', '8'], ['12', '13', '11']];
        for (const [a, b, y] of gates) {
          if ((!connected(id, a) || (b && !connected(id, b))) && connected(id, y)) {
            result.warnings.push({ id: `cmos-floating:${id}:${y}`, partId: id, level: 'warn', message: `${part.kind} 게이트 입력이 떠 있습니다.` });
          }
          const x = high(a, vcc), z = b ? high(b, vcc) : 0;
          const bit = part.kind === 'logic-7400' ? !(x && z)
            : part.kind === 'logic-7408' ? x && z
              : part.kind === 'logic-7432' ? x || z
                : part.kind === 'logic-7486' ? x !== z : !x;
          out[y] = bit ? 1 : 0;
          drive(id, y, out[y] ? voltage(id, '14') : voltage(id, '7'));
        }
      }
      if (part.kind === 'shift-register-595') {
        const supply = voltage(id, '16') - voltage(id, '8');
        if (supply >= 2) {
          const state = this.shift.get(id) ?? { serial: 0, latched: 0 };
          if (!high('10', supply)) state.serial = 0;
          else if (edge('11', supply)) state.serial = ((state.serial << 1) | high('14', supply)) & 255;
          if (edge('12', supply)) state.latched = state.serial;
          this.shift.set(id, state);
          const pins = ['15', '1', '2', '3', '4', '5', '6', '7'];
          for (let bit = 0; bit < 8; bit++) {
            out[pins[bit]!] = ((state.latched >> bit) & 1) as 0 | 1;
            if (!high('13', supply)) drive(id, pins[bit]!, out[pins[bit]!] ? voltage(id, '16') : voltage(id, '8'));
          }
          out['9'] = ((state.serial >> 7) & 1) as 0 | 1;
          drive(id, '9', out['9'] ? voltage(id, '16') : voltage(id, '8'));
        }
      }
      if (part.kind === 'l293d') {
        const supply = voltage(id, '16') - voltage(id, '4');
        const motorSupply = voltage(id, '8') - voltage(id, '4');
        if (supply >= 2 && motorSupply > 0) {
          for (const [enable, input, output] of [['1','2','3'], ['1','7','6'], ['9','10','11'], ['9','15','14']]) {
            if (high(enable!, supply)) {
              out[output!] = high(input!, supply);
              drive(id, output!, out[output!] ? Math.max(0, voltage(id, '8') - 1.2) : Math.min(voltage(id, '8'), voltage(id, '4') + 1.2), 2);
            }
          }
        }
      }
      if (part.kind === 'timer-555') {
        const supply = voltage(id, '8') - voltage(id, '1');
        if (supply >= 3) {
          let q = this.latch555.get(id) ?? 0;
          if (voltage(id, '4') < voltage(id, '1') + .35 * supply) q = 0;
          else if (voltage(id, '6') > voltage(id, '1') + 2 * supply / 3) q = 0;
          else if (voltage(id, '2') < voltage(id, '1') + supply / 3) q = 1;
          this.latch555.set(id, q);
          out['3'] = q;
          drive(id, '3', q ? voltage(id, '8') - .15 : voltage(id, '1') + .15, 20);
          if (!q) link(id, '7', '1', 10);
        }
      }
      if (part.kind === 'keypad-4x4') {
        const key = clamp(Math.round(Number(inputs[id]?.key ?? 0)), 0, 16);
        if (key > 0) link(id, String(1 + Math.floor((key - 1) / 4)), String(5 + (key - 1) % 4));
      }
      if (part.kind === 'pir') {
        if (inputs[id]?.motion) this.pirUntil.set(id, timeMs + 2500);
        const active = timeMs < (this.pirUntil.get(id) ?? 0);
        out.OUT = active ? 1 : 0;
        if (voltage(id, 'VCC') - voltage(id, 'GND') >= 3) drive(id, 'OUT', active ? 3.3 : 0);
      }
      if (part.kind === 'ir-receiver') {
        const code = Number(inputs[id]?.irCode ?? 0) >>> 0;
        const previousInput = this.irInput.get(id) ?? 0;
        if (code && code !== previousInput) this.ir.set(id, { code, started: timeMs });
        this.irInput.set(id, code);
        const signal = this.ir.get(id);
        let low = false;
        if (signal) {
          let us = (timeMs - signal.started) * 1000;
          const packet = necWireBits(signal.code);
          if (us < 9000) low = true;
          else {
            us -= 13500;
            if (us >= 0) for (let bit = 0; bit < 32; bit++) {
              if (us < 562.5) { low = true; break; }
              us -= 562.5 + (((packet >>> bit) & 1) ? 1687.5 : 562.5);
              if (us < 0) break;
            }
            if (us >= 0 && us < 562.5) low = true; // NEC stop mark
          }
        }
        out.OUT = low ? 0 : 1;
        if (voltage(id, 'VCC') - voltage(id, 'GND') >= 3) drive(id, 'OUT', low ? 0 : voltage(id, 'VCC'), 80);
      }
      if (part.kind === 'lcd1602-parallel') {
        const powered = voltage(id, 'VDD') - voltage(id, 'VSS') >= 3;
        if (!powered) {
          this.lcd.delete(id);
          result.visuals[id] = { lcd: { lines: [' '.repeat(16), ' '.repeat(16)], backlight: false } };
        } else {
          const lcd = this.lcd.get(id) ?? new Lcd1602();
          this.lcd.set(id, lcd);
          if (part.props.mode === '8-bit') {
            if (prev.E === 1 && high('E') === 0 && high('RW') === 0) {
              const byte = Array.from({ length: 8 }, (_, bit) => high(`D${bit}`) << bit).reduce((a, b) => a | b, 0);
              lcd.writeParallel(byte, !!high('RS'));
            }
          } else {
            const nibble = [4,5,6,7].reduce((n, bit) => n | (high(`D${bit}`) << bit), 0);
            lcd.write(nibble | (high('RS') ? 1 : 0) | (high('RW') ? 2 : 0) | (high('E') ? 4 : 0) | 8);
          }
          result.visuals[id] = { lcd: { ...lcd.state, backlight: voltage(id, 'A') - voltage(id, 'K') >= 2 } };
        }
      }
      if (part.kind === 'seven-segment-4digit') {
        const previousDigits = this.digits.get(id) ?? { on: Array.from({ length: 4 }, () => Array(8).fill(0)), lastMs: timeMs };
        const dt = clamp(timeMs - previousDigits.lastMs, 0, 20);
        previousDigits.lastMs = timeMs;
        for (let digit = 0; digit < 4; digit++) {
          for (const [index, segment] of ['a','b','c','d','e','f','g','dp'].entries()) {
            const delta = part.props.common === 'anode'
              ? voltage(id, `D${digit + 1}`) - voltage(id, segment)
              : voltage(id, segment) - voltage(id, `D${digit + 1}`);
            const on = delta >= 1.7;
            previousDigits.on[digit]![index] = clamp(previousDigits.on[digit]![index]! * Math.exp(-dt / 20) + (on ? 1 - Math.exp(-dt / 20) : 0), 0, 1);
          }
        }
        this.digits.set(id, previousDigits);
        result.visuals[id] = { digits: { segments: previousDigits.on.map(row => row.map(value => value > .15)) } };
      }
      if (Object.keys(out).length) {
        result.outputs[id] = out;
        result.visuals[id] = { ...result.visuals[id], ic: { outputs: out } };
      }
      this.previous.set(id, Object.fromEntries(Object.keys(out).concat(['11','12','10','13','4','E']).map(pin => [pin, high(pin)])));
    }
    return result;
  }
}
