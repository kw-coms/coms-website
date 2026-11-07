import {
  CPU, avrInstruction, AVRIOPort, portBConfig, portCConfig, portDConfig,
  PinState, AVRTimer, timer0Config, timer1Config, timer2Config, AVRUSART,
  usart0Config, AVRADC, adcConfig, AVRTWI, twiConfig, ADCMuxInputType,
} from 'avr8js';
import type { McuPinState } from '../types';
import { Lcd1602 } from './lcd';
import { loadIntelHex as parseIntelHex } from './hex';
import { DHT11Protocol, WS2812Protocol } from './protocols';
import { installUnoEeprom, UnoEepromMemoryBackend } from './eeprom';
import { AvrDebugger } from './debugger';

export const MCU_HZ = 16_000_000;
// Bound once: calling avr8js through the import binding in the stepping loop is a property lookup per
// instruction under vitest's module transform (3x slower there; the browser bundle is unaffected).
const execute = avrInstruction;
const map: Record<string, ['B' | 'C' | 'D', number]> = {};
for (let i = 0; i <= 7; i++) map[`D${i}`] = ['D', i];
for (let i = 8; i <= 13; i++) map[`D${i}`] = ['B', i - 8];
for (let i = 0; i <= 5; i++) map[`A${i}`] = ['C', i];
export const UNO_PIN_MAP = map;
const PORT_PINS: Record<'B' | 'C' | 'D', string[]> = { B: [], C: [], D: [] };
for (const [name, [port]] of Object.entries(map)) PORT_PINS[port].push(name);

/** Single strict parser shared with other AVR helpers; copy gives CPU an ArrayBuffer-backed program. */
export function loadIntelHex(hex: string): Uint16Array<ArrayBuffer> {
  return Uint16Array.from(parseIntelHex(hex));
}

export class Mcu {
  readonly debugger = new AvrDebugger();
  cpu!: CPU;
  ports!: Record<'B' | 'C' | 'D', AVRIOPort>;
  adc!: AVRADC;
  usart!: AVRUSART;
  twi!: AVRTWI;
  readonly eeprom = new UnoEepromMemoryBackend();
  lcd = new Lcd1602();
  onSerial: (text: string) => void;
  onPinChange?: (pin: string, level: 0 | 1) => void;
  onPinModeChange?: (pin: string, mode: McuPinState['mode']) => void;
  private serialQueue: number[] = [];
  private serialScheduled = false;
  private echoActive = new Set<string>();
  private lcds = new Map<number, Lcd1602>();
  private selectedLcd: Lcd1602 | null = null;
  private history = new Map<string, { cycle: number; level: 0 | 1 }[]>();
  private lastInput = new Map<string, boolean>();
  private echoGeneration = 0;
  private echoConfigs: { trig: string; echo: string; distanceCm: number; rise: number | null }[] = [];
  private dht = new Map<string, DHT11Protocol>();
  private dhtSamples = new Map<string, () => { temperature: number; humidity: number }>();
  private pixels = new Map<string, WS2812Protocol>();
  /** Pins the sketch has actually read (digitalRead → PINx access, analogRead → ADC mux); used to gate floating-input warnings. */
  readPins = new Set<string>();
  constructor(onSerial: (text: string) => void = () => { }) {
    this.onSerial = onSerial;
    this.reset();
  }
  reset(program: Uint16Array<ArrayBuffer> = new Uint16Array(16384)): void {
    this.debugger.resetRuntime();
    this.cpu = new CPU(program, 2048);
    installUnoEeprom(this.cpu, this.eeprom);
    this.ports = { B: new AVRIOPort(this.cpu, portBConfig), C: new AVRIOPort(this.cpu, portCConfig), D: new AVRIOPort(this.cpu, portDConfig) };
    new AVRTimer(this.cpu, timer0Config);
    new AVRTimer(this.cpu, timer1Config);
    new AVRTimer(this.cpu, timer2Config);
    this.usart = new AVRUSART(this.cpu, usart0Config, MCU_HZ);
    this.usart.onByteTransmit = byte => this.onSerial(String.fromCharCode(byte));
    this.adc = new AVRADC(this.cpu, adcConfig);
    this.adc.avcc = 5;
    this.readPins = new Set();
    const adcRead = this.adc.onADCRead;
    this.adc.onADCRead = input => {
      if (input.type === ADCMuxInputType.SingleEnded) this.readPins.add(`A${input.channel}`);
      adcRead(input);
    };
    // ponytail: PINx is a whole-port register, so a read marks every pin of that port; bit-level needs instruction decode.
    for (const port of ['B', 'C', 'D'] as const) {
      const pinAddr = this.ports[port].portConfig.PIN;
      const names = PORT_PINS[port];
      let marked = false;
      // Sketches poll PINx in tight loops (digitalRead): mark the port's pins once, then just read.
      this.cpu.readHooks[pinAddr] = addr => {
        if (!marked) {
          for (const name of names) this.readPins.add(name);
          marked = true;
        }
        return this.cpu.data[addr]!;
      };
    }
    this.twi = new AVRTWI(this.cpu, twiConfig, MCU_HZ);
    this.lcd = new Lcd1602(this.lcd.address);
    this.lcds = new Map([...this.lcds.keys()].map(address => [address, new Lcd1602(address)]));
    if (this.lcds.has(this.lcd.address)) this.lcd = this.lcds.get(this.lcd.address)!;
    this.twi.eventHandler = {
      start: () => this.twi.completeStart(),
      stop: () => {
        this.selectedLcd = null;
        this.twi.completeStop();
      },
      connectToSlave: address => {
        this.selectedLcd = this.lcds.get(address) ?? null;
        this.twi.completeConnect(!!this.selectedLcd);
      },
      writeByte: byte => {
        this.selectedLcd?.write(byte);
        this.twi.completeWrite(!!this.selectedLcd);
      },
      readByte: () => this.twi.completeRead(0xff),
    };
    this.history.clear();
    this.lastInput.clear();
    this.echoActive.clear();
    this.serialQueue = [];
    this.serialScheduled = false;
    this.selectedLcd = null;
    this.echoGeneration++;
    this.echoConfigs = [];
    for (const protocol of this.dht.values()) protocol.reset();
    this.dht.clear();
    this.dhtSamples.clear();
    this.pixels.clear();
    for (const [port, configuration] of [['B', portBConfig], ['C', portCConfig], ['D', portDConfig]] as const) {
      const original = this.cpu.writeHooks[configuration.DDR]!;
      this.cpu.writeHooks[configuration.DDR] = (value, oldValue, address, mask) => {
        const result = original(value, oldValue, address, mask);
        const released = oldValue & ~value;
        const asserted = value & ~oldValue;
        if ((released || asserted) && this.onPinModeChange) {
          for (const [name, [mappedPort, bit]] of Object.entries(map)) {
            if (mappedPort !== port || !((released | asserted) & (1 << bit))) continue;
            const mode = value & (1 << bit) ? 'output'
              : this.cpu.data[configuration.PORT]! & (1 << bit) ? 'input_pullup' : 'input';
            this.onPinModeChange(name, mode);
          }
        }
        if (released || asserted) {
          for (const [name, [mappedPort, bit]] of Object.entries(map)) {
            if (mappedPort !== port) continue;
            const protocol = this.dht.get(name);
            if (!protocol) continue;
            const bitMask = 1 << bit;
            if (released & bitMask) protocol.onDataChange(1, this.cpu.cycles, true);
            if ((asserted & bitMask) && !(this.cpu.data[configuration.PORT]! & bitMask)) {
              protocol.onDataChange(0, this.cpu.cycles);
            }
          }
        }
        return result;
      };
    }
    for (const port of ['B', 'C', 'D'] as const) {
      const names = Object.entries(map).filter(([, [mappedPort]]) => mappedPort === port);
      this.ports[port].addListener((value, old) => {
        const changed = value ^ old;
        if (!changed) return;
        for (const [name, [, bit]] of names) {
          if (!(changed & (1 << bit))) continue;
          const level = (value & (1 << bit)) ? 1 : 0;
          const events = this.history.get(name) ?? [];
          events.push({ cycle: this.cpu.cycles, level });
          const cutoff = this.cpu.cycles - MCU_HZ / 50;
          while (events.length > 2 && events[1]!.cycle < cutoff) events.shift();
          this.history.set(name, events);
          if (this.ports[port].pinState(bit) <= PinState.High) {
            this.dht.get(name)?.onDataChange(level, this.cpu.cycles);
            this.pixels.get(name)?.onDataChange(level, this.cpu.cycles);
            this.onPinChange?.(name, level);
            if (this.echoConfigs.some(config => config.trig === name)) this.onTrigger(name, level);
          }
        }
      });
    }
  }
  loadHex(hex: string): void { this.debugger.unload(); this.reset(loadIntelHex(hex)); }
  step(cycles: number): void {
    this.scheduleSerial();
    const target = this.cpu.cycles + cycles;
    const cpu = this.cpu;
    if (this.debugger.active) {
      while (cpu.cycles < target && this.debugger.before(cpu)) {
        const opcode = cpu.progMem[cpu.pc]!;
        const spBefore = cpu.SP;
        execute(cpu);
        cpu.tick();
        this.debugger.after(opcode, spBefore, cpu.SP);
      }
    } else while (cpu.cycles < target) {
      execute(cpu);
      cpu.tick();
    }
    this.advanceProtocols();
  }
  configureDht(pin: string, sample: (() => { temperature: number; humidity: number }) | null): void {
    if (!sample || !map[pin]) {
      this.dht.get(pin)?.reset();
      this.dht.delete(pin);
      this.dhtSamples.delete(pin);
      return;
    }
    this.dhtSamples.set(pin, sample);
    if (this.dht.has(pin)) return;
    const [port, bit] = map[pin]!;
    const drive = (level: 0 | 1) => this.ports[port].setPin(bit, level === 1);
    drive(1);
    this.dht.set(pin, new DHT11Protocol(
      (callback, delay) => this.cpu.addClockEvent(callback, delay),
      drive,
      () => this.dhtSamples.get(pin)!(),
    ));
  }
  dhtBusy(pin: string): boolean { return this.dht.get(pin)?.busy ?? false; }
  configurePixels(pin: string, count: number | null): void {
    if (count === null || !map[pin]) {
      this.pixels.delete(pin);
      return;
    }
    if (this.pixels.get(pin)?.colors.length !== count) this.pixels.set(pin, new WS2812Protocol(count));
  }
  pixelColors(pin: string): [number, number, number][] { return this.pixels.get(pin)?.colors ?? []; }
  advanceProtocols(): void {
    for (const protocol of this.pixels.values()) protocol.advance(this.cpu.cycles);
  }
  pins(): Record<string, McuPinState> {
    const result: Record<string, McuPinState> = {};
    const cutoff = Math.max(0, this.cpu.cycles - MCU_HZ / 50);
    for (const [name, [port, bit]] of Object.entries(map)) {
      const state = this.ports[port].pinState(bit);
      const mode = state === PinState.Input ? 'input' : state === PinState.InputPullUp ? 'input_pullup' : 'output';
      const level: 0 | 1 = mode === 'output' ? (state === PinState.High ? 1 : 0) : ((this.cpu.data[this.ports[port].portConfig.PIN]! & (1 << bit)) ? 1 : 0);
      const events = this.history.get(name);
      let previousLevel: 0 | 1 = 0;
      let previousCycle = cutoff;
      let highCycles = 0;
      let rises = 0;
      let firstRise = 0;
      let lastRise = 0;
      if (events) {
        for (const event of events) {
          if (event.cycle < cutoff) {
            previousLevel = event.level;
            continue;
          }
          if (previousLevel) highCycles += event.cycle - previousCycle;
          if (event.level === 1) {
            if (!rises) firstRise = event.cycle;
            lastRise = event.cycle;
            rises++;
          }
          previousLevel = event.level;
          previousCycle = event.cycle;
        }
      }
      if (previousLevel) highCycles += this.cpu.cycles - previousCycle;
      const freq = rises >= 2 ? MCU_HZ * (rises - 1) / (lastRise - firstRise) : 0;
      result[name] = {
        mode,
        level,
        duty: mode === 'output' ? Math.max(0, Math.min(1, highCycles / Math.max(1, this.cpu.cycles - cutoff))) : level,
        freq: mode === 'output' ? freq : 0,
      };
    }
    return result;
  }
  setVoltage(pin: string, volts: number): void {
    const entry = map[pin];
    if (!entry || this.echoActive.has(pin)) return;
    const previous = this.lastInput.get(pin) ?? false;
    const high = volts > 3 ? true : volts < 1.5 ? false : previous;
    this.lastInput.set(pin, high);
    this.ports[entry[0]].setPin(entry[1], high);
    if (pin.startsWith('A')) this.setADC(Number(pin.slice(1)), volts);
  }
  setADC(channel: number, volts: number): void {
    if (channel >= 0 && channel <= 5) {
      this.adc.channelValues[channel] = Math.max(0, Math.min(5, volts));
    }
  }
  writeSerial(text: string): void {
    for (const char of text) this.serialQueue.push(char.charCodeAt(0) & 255);
    this.scheduleSerial();
  }
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
  setLcdAddress(address: number | null): void {
    this.configureLcdDevices(address === null ? [] : [address]);
  }
  configureLcdDevices(addresses: number[]): void {
    const previous = this.lcds;
    this.lcds = new Map(addresses.map(address => [address, previous.get(address) ?? new Lcd1602(address)]));
    if (addresses.length) this.lcd = this.lcds.get(addresses[0]!)!;
  }
  lcdState(address: number): Lcd1602['state'] | undefined {
    return this.lcds.get(address)?.state;
  }
  triggerEcho(trig: string, echo: string, distanceCm: number): void {
    this.configureEchoDevices([{ trig, echo, distanceCm }]);
  }
  configureEchoDevices(configs: { trig: string; echo: string; distanceCm: number }[]): void {
    if (configs.length === this.echoConfigs.length && configs.every((config, index) => {
      const previous = this.echoConfigs[index]!;
      return config.trig === previous.trig && config.echo === previous.echo && config.distanceCm === previous.distanceCm;
    })) return;
    this.clearEcho();
    this.echoConfigs = configs.map(config => ({ ...config, rise: null }));
  }
  clearEcho(): void {
    const activePins = [...this.echoActive];
    this.echoConfigs = [];
    this.echoGeneration++;
    for (const pin of activePins) this.setEchoPin(pin, false);
  }
  private onTrigger(trig: string, level: 0 | 1): void {
    for (const config of this.echoConfigs) {
      if (config.trig === trig) this.triggerConfiguredEcho(config, level);
    }
  }
  private triggerConfiguredEcho(config: { trig: string; echo: string; distanceCm: number; rise: number | null }, level: 0 | 1): void {
    if (level) config.rise = this.cpu.cycles;
    else if (config.rise !== null && this.cpu.cycles - config.rise >= 160) {
      const echo = map[config.echo];
      if (!echo) return;
      const width = Math.round(Math.max(2, Math.min(400, config.distanceCm)) * 58e-6 * MCU_HZ);
      const generation = this.echoGeneration;
      this.cpu.addClockEvent(() => {
        if (generation === this.echoGeneration) this.setEchoPin(config.echo, true);
      }, 3200);
      this.cpu.addClockEvent(() => {
        if (generation === this.echoGeneration) this.setEchoPin(config.echo, false);
      }, 3200 + width);
      config.rise = null;
    }
  }
  isEchoActive(pin: string): boolean { return this.echoActive.has(pin); }
  private setEchoPin(pin: string, high: boolean): void {
    const entry = map[pin];
    if (!entry) return;
    if (high) this.echoActive.add(pin);
    else this.echoActive.delete(pin);
    this.ports[entry[0]].setPin(entry[1], high);
  }
  servoAngle(pin: string): number {
    const events = this.history.get(pin) ?? [];
    for (let index = events.length - 1; index > 0; index--) {
      if (events[index]!.level !== 0 || events[index - 1]!.level !== 1) continue;
      const width = (events[index]!.cycle - events[index - 1]!.cycle) / MCU_HZ * 1e6;
      return Math.max(0, Math.min(180, (width - 544) * 180 / (2400 - 544)));
    }
    return 0;
  }
}
