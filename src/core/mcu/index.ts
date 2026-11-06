import { CPU, avrInstruction, AVRIOPort, portBConfig, portCConfig, portDConfig, PinState, AVRTimer, timer0Config, timer1Config, timer2Config, AVRUSART, usart0Config, AVRADC, adcConfig, AVRTWI, twiConfig } from 'avr8js';
import type { McuPinState } from '../types';
import { Lcd1602 } from './lcd';
import { loadIntelHex as parseIntelHex } from './hex';

export const MCU_HZ = 16_000_000;
const map: Record<string, ['B' | 'C' | 'D', number]> = {};
for (let i = 0; i <= 7; i++) map[`D${i}`] = ['D', i];
for (let i = 8; i <= 13; i++) map[`D${i}`] = ['B', i - 8];
for (let i = 0; i <= 5; i++) map[`A${i}`] = ['C', i];
export const UNO_PIN_MAP = map;

/** Single strict parser shared with other AVR helpers; copy gives CPU an ArrayBuffer-backed program. */
export function loadIntelHex(hex: string): Uint16Array<ArrayBuffer> {
  return Uint16Array.from(parseIntelHex(hex));
}

export class Mcu {
  cpu!: CPU;
  ports!: Record<'B' | 'C' | 'D', AVRIOPort>;
  adc!: AVRADC;
  usart!: AVRUSART;
  twi!: AVRTWI;
  lcd = new Lcd1602();
  onSerial: (text: string) => void;
  onPinChange?: (pin: string, level: 0 | 1) => void;
  private serialQueue: number[] = [];
  private serialScheduled = false;
  private echoActive = new Set<string>();
  private lcdEnabled = false;
  private selected = false;
  private history = new Map<string, { cycle: number; level: 0 | 1 }[]>();
  private lastInput = new Map<string, boolean>();
  private echoGeneration = 0;
  private echoConfig: { trig: string; echo: string; distanceCm: number; rise: number | null } | null = null;
  constructor(onSerial: (text: string) => void = () => {}) { this.onSerial = onSerial; this.reset(); }
  reset(program: Uint16Array<ArrayBuffer> = new Uint16Array(16384)): void {
    this.cpu = new CPU(program);
    this.ports = { B: new AVRIOPort(this.cpu, portBConfig), C: new AVRIOPort(this.cpu, portCConfig), D: new AVRIOPort(this.cpu, portDConfig) };
    new AVRTimer(this.cpu, timer0Config); new AVRTimer(this.cpu, timer1Config); new AVRTimer(this.cpu, timer2Config);
    this.usart = new AVRUSART(this.cpu, usart0Config, MCU_HZ);
    this.usart.onByteTransmit = byte => this.onSerial(String.fromCharCode(byte));
    this.adc = new AVRADC(this.cpu, adcConfig); this.adc.avcc = 5;
    this.twi = new AVRTWI(this.cpu, twiConfig, MCU_HZ);
    this.lcd = new Lcd1602(this.lcd.address);
    this.twi.eventHandler = {
      start: () => this.twi.completeStart(), stop: () => { this.selected = false; this.twi.completeStop(); },
      connectToSlave: (address) => { this.selected = this.lcdEnabled && address === this.lcd.address; this.twi.completeConnect(this.selected); },
      writeByte: byte => { if (this.selected) this.lcd.write(byte); this.twi.completeWrite(this.selected); },
      readByte: () => this.twi.completeRead(0xff),
    };
    this.history.clear(); this.lastInput.clear(); this.echoActive.clear(); this.serialQueue = []; this.serialScheduled = false; this.selected = false; this.echoGeneration++; this.echoConfig = null;
    for (const [name, [port, bit]] of Object.entries(map)) {
      this.ports[port].addListener((value, old) => {
        if (!((value ^ old) & (1 << bit))) return;
        const level = (value & (1 << bit)) ? 1 : 0;
        const events = this.history.get(name) ?? [];
        events.push({ cycle: this.cpu.cycles, level });
        const cutoff = this.cpu.cycles - MCU_HZ / 50;
        while (events.length > 2 && events[1]!.cycle < cutoff) events.shift();
        this.history.set(name, events);
        if (this.ports[port].pinState(bit) <= PinState.High) {
          this.onPinChange?.(name, level);
          if (this.echoConfig?.trig === name) this.onTrigger(level);
        }
      });
    }
  }
  loadHex(hex: string): void { this.reset(loadIntelHex(hex)); }
  step(cycles: number): void {
    this.scheduleSerial();
    const target = this.cpu.cycles + cycles;
    while (this.cpu.cycles < target) { avrInstruction(this.cpu); this.cpu.tick(); }
  }
  pins(): Record<string, McuPinState> {
    const result: Record<string, McuPinState> = {};
    const cutoff = Math.max(0, this.cpu.cycles - MCU_HZ / 50);
    for (const [name, [port, bit]] of Object.entries(map)) {
      const state = this.ports[port].pinState(bit);
      const mode = state === PinState.Input ? 'input' : state === PinState.InputPullUp ? 'input_pullup' : 'output';
      const level: 0 | 1 = mode === 'output' ? (state === PinState.High ? 1 : 0) : ((this.cpu.readData(this.ports[port].portConfig.PIN) & (1 << bit)) ? 1 : 0);
      const events = (this.history.get(name) ?? []).filter(e => e.cycle >= cutoff);
      const all = [{ cycle: cutoff, level: (this.history.get(name) ?? []).filter(e => e.cycle < cutoff).at(-1)?.level ?? 0 }, ...events, { cycle: this.cpu.cycles, level }];
      let high = 0; for (let i = 0; i < all.length - 1; i++) if (all[i]!.level) high += all[i + 1]!.cycle - all[i]!.cycle;
      const rising = events.filter(e => e.level === 1);
      const freq = rising.length >= 2 ? MCU_HZ * (rising.length - 1) / (rising.at(-1)!.cycle - rising[0]!.cycle) : 0;
      result[name] = { mode, level, duty: mode === 'output' ? Math.max(0, Math.min(1, high / Math.max(1, this.cpu.cycles - cutoff))) : level, freq: mode === 'output' ? freq : 0 };
    }
    return result;
  }
  setVoltage(pin: string, volts: number): void {
    const entry = map[pin]; if (!entry || this.echoActive.has(pin)) return;
    const previous = this.lastInput.get(pin) ?? false;
    const high = volts > 3 ? true : volts < 1.5 ? false : previous;
    this.lastInput.set(pin, high); this.ports[entry[0]].setPin(entry[1], high);
    if (pin.startsWith('A')) this.setADC(Number(pin.slice(1)), volts);
  }
  setADC(channel: number, volts: number): void { if (channel >= 0 && channel <= 5) this.adc.channelValues[channel] = Math.max(0, Math.min(5, volts)); }
  writeSerial(text: string): void { for (const char of text) this.serialQueue.push(char.charCodeAt(0) & 255); this.scheduleSerial(); }
  private scheduleSerial(): void {
    if (this.serialScheduled || !this.serialQueue.length || !this.usart.rxEnable) return;
    this.serialScheduled = true;
    const delay = Math.max(1, Math.round(MCU_HZ * 10 / Math.max(1, this.usart.baudRate)));
    this.cpu.addClockEvent(() => {
      this.serialScheduled = false;
      const byte = this.serialQueue.shift();
      if (byte !== undefined) this.usart.writeByte(byte, true);
      this.scheduleSerial();
    }, delay);
  }
  setLcdAddress(address: number | null): void { this.lcdEnabled = address !== null; if (address !== null) this.lcd.address = address; }
  triggerEcho(trig: string, echo: string, distanceCm: number): void {
    const old = this.echoConfig;
    if (old?.trig === trig && old.echo === echo && old.distanceCm === distanceCm) return;
    this.clearEcho();
    this.echoConfig = { trig, echo, distanceCm, rise: null };
  }
  clearEcho(): void {
    const old = this.echoConfig;
    this.echoConfig = null;
    this.echoGeneration++;
    if (old && this.echoActive.has(old.echo)) this.setEchoPin(old.echo, false);
  }
  private onTrigger(level: 0 | 1): void {
    const config = this.echoConfig; if (!config) return;
    if (level) config.rise = this.cpu.cycles;
    else if (config.rise !== null && this.cpu.cycles - config.rise >= 160) {
      const echo = map[config.echo]; if (!echo) return;
      const width = Math.round(Math.max(2, Math.min(400, config.distanceCm)) * 58e-6 * MCU_HZ);
      const generation = this.echoGeneration;
      this.cpu.addClockEvent(() => { if (generation === this.echoGeneration) this.setEchoPin(config.echo, true); }, 3200);
      this.cpu.addClockEvent(() => { if (generation === this.echoGeneration) this.setEchoPin(config.echo, false); }, 3200 + width);
      config.rise = null;
    }
  }
  isEchoActive(pin: string): boolean { return this.echoActive.has(pin); }
  private setEchoPin(pin: string, high: boolean): void {
    const entry = map[pin]; if (!entry) return;
    if (high) this.echoActive.add(pin); else this.echoActive.delete(pin);
    this.ports[entry[0]].setPin(entry[1], high);
  }
  servoAngle(pin: string): number {
    const events = this.history.get(pin) ?? [];
    for (let i = events.length - 1; i > 0; i--) if (events[i]!.level === 0 && events[i - 1]!.level === 1) {
      const width = (events[i]!.cycle - events[i - 1]!.cycle) / MCU_HZ * 1e6;
      return Math.max(0, Math.min(180, (width - 544) * 180 / (2400 - 544)));
    }
    return 0;
  }
}
