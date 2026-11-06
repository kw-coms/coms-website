import {
  CPU, avrInstruction, AVRIOPort, AVRTimer, AVRUSART, AVRADC, AVRTWI,
  PinState, portBConfig, portCConfig, portDConfig, timer0Config, timer1Config,
  timer2Config, usart0Config, adcConfig, twiConfig,
} from 'avr8js';
import type { McuPinState } from '../types';
import { PinActivity } from './activity';
import { loadIntelHex } from './hex';

const MCU_HZ = 16_000_000;
type PortName = 'B' | 'C' | 'D';

export const UNO_PIN_MAP: Record<string, [PortName, number]> = Object.fromEntries([
  ...Array.from({ length: 8 }, (_, index) => [`D${index}`, ['D', index]]),
  ...Array.from({ length: 6 }, (_, index) => [`D${index + 8}`, ['B', index]]),
  ...Array.from({ length: 6 }, (_, index) => [`A${index}`, ['C', index]]),
]) as Record<string, [PortName, number]>;

/** Lightweight AVR adapter retained for existing standalone callers. */
export class AvrMcu {
  cpu!: CPU;
  ports!: Record<PortName, AVRIOPort>;
  timers!: AVRTimer[];
  usart!: AVRUSART;
  adc!: AVRADC;
  twi!: AVRTWI;
  readonly activity = new PinActivity();
  onSerial?: (text: string) => void;
  onPinChange?: (pin: string, level: 0 | 1, cycle: number) => void;
  onPinModeChange?: (pin: string, mode: McuPinState['mode'], cycle: number) => void;
  private modes = new Map<string, McuPinState['mode']>();
  private program: Uint16Array<ArrayBufferLike> = new Uint16Array(16384).fill(0xffff);

  constructor() {
    this.reset();
  }

  loadHex(hex: string): void {
    this.program = loadIntelHex(hex);
    this.reset();
  }

  reset(): void {
    this.cpu = new CPU(this.program, 2048);
    this.activity.reset();
    this.modes.clear();
    this.ports = {
      B: new AVRIOPort(this.cpu, portBConfig),
      C: new AVRIOPort(this.cpu, portCConfig),
      D: new AVRIOPort(this.cpu, portDConfig),
    };
    this.timers = [
      new AVRTimer(this.cpu, timer0Config),
      new AVRTimer(this.cpu, timer1Config),
      new AVRTimer(this.cpu, timer2Config),
    ];
    this.usart = new AVRUSART(this.cpu, usart0Config, MCU_HZ);
    this.adc = new AVRADC(this.cpu, adcConfig);
    this.adc.avcc = 5;
    this.twi = new AVRTWI(this.cpu, twiConfig, MCU_HZ);
    this.usart.onByteTransmit = byte => this.onSerial?.(String.fromCharCode(byte));

    for (const [pin, [port, bit]] of Object.entries(UNO_PIN_MAP)) {
      this.ports[port].addListener((value, previous) => {
        const state = this.ports[port].pinState(bit);
        const mode = state === PinState.Input
          ? 'input'
          : state === PinState.InputPullUp ? 'input_pullup' : 'output';
        if (this.modes.get(pin) !== mode) {
          this.modes.set(pin, mode);
          this.onPinModeChange?.(pin, mode, this.cpu.cycles);
        }
        const level = ((value >> bit) & 1) as 0 | 1;
        if (level !== ((previous >> bit) & 1)) {
          this.activity.record(pin, level, this.cpu.cycles);
          this.onPinChange?.(pin, level, this.cpu.cycles);
        }
      });
    }
  }

  step(cycles: number): void {
    const end = this.cpu.cycles + Math.max(0, Math.floor(cycles));
    while (this.cpu.cycles < end) {
      avrInstruction(this.cpu);
      this.cpu.tick();
    }
  }

  getPins(): Record<string, McuPinState> {
    const result: Record<string, McuPinState> = {};
    for (const [pin, [port, bit]] of Object.entries(UNO_PIN_MAP)) {
      const state = this.ports[port].pinState(bit);
      const mode = state === PinState.Input
        ? 'input'
        : state === PinState.InputPullUp ? 'input_pullup' : 'output';
      const level = (state === PinState.High || state === PinState.InputPullUp ? 1 : 0) as 0 | 1;
      result[pin] = { mode, level, ...this.activity.get(pin, this.cpu.cycles) };
    }
    return result;
  }

  setInput(pin: string, level: 0 | 1 | boolean): void {
    const mapping = UNO_PIN_MAP[pin];
    if (mapping) this.ports[mapping[0]].setPin(mapping[1], Boolean(level));
  }

  setAnalog(pin: string, volts: number): void {
    const channel = Number(pin.slice(1));
    if (pin[0] === 'A' && channel >= 0 && channel < 6) {
      this.adc.channelValues[channel] = Math.max(0, Math.min(5, volts));
    }
  }

  writeSerial(text: string): void {
    for (const char of text) this.usart.writeByte(char.charCodeAt(0), true);
  }

  get cycles(): number {
    return this.cpu.cycles;
  }
}
