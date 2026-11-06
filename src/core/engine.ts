import type { Analysis, McuPinState, PartVisualState, Scene, SimFrame, SimInput } from './types';
import { analyze } from './analyze';
import { PARTS } from './parts';
import { validateScene } from './scene';
import { ledBrightness, solveCircuit, type SolveResult } from './solver';
import { Mcu, MCU_HZ, UNO_PIN_MAP } from './mcu';

const EMPTY_SCENE: Scene = { version: 1, parts: [], wires: [], code: '' };
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
type PinStates = Record<string, McuPinState>;
type ExternalDrives = Record<string, { volts: number }>;

/** Deterministic AVR stepping; the injectable clock controls the DC solve budget. */
export class SimulationEngine {
  scene: Scene = EMPTY_SCENE;
  analysis: Analysis = analyze(EMPTY_SCENE);
  mcu = new Mcu(text => this.onSerial(text));
  onSerial: (text: string) => void = () => {};
  inputs: Record<string, Record<string, number | boolean>> = {};
  private hex: string | undefined;
  private solution: SolveResult | undefined;
  private opticalCurrents: Record<string, number> = {};
  private solveInterval = 1000 / 60;
  private lastSolve = -Infinity;
  private lastSignature = '';
  private dirty = true;
  private elapsedReal = 0;
  private elapsedCycles = 0;
  private echoPins = new Set<string>();
  private linkedInputs = new Map<string, string[]>();
  private dhtPins = new Set<string>();
  private pixelPins = new Set<string>();

  get nextSolveDelay(): number {
    return Math.max(0, this.lastSolve + this.solveInterval - this.now());
  }

  constructor(private now: () => number = () => performance.now()) {
    this.mcu.onPinChange = (pin, level) => {
      // GPIO peers need edge-accurate input without performing MNA at CPU speed.
      for (const peer of this.linkedInputs.get(pin) ?? []) {
        const [port, bit] = UNO_PIN_MAP[peer]!;
        const direction = this.mcu.cpu.data[this.mcu.ports[port].portConfig.DDR]!;
        if (!(direction & (1 << bit))) this.mcu.setVoltage(peer, level * 5);
      }
      this.dirty = true;
    };
  }

  private voltage(id: string, pin: string): number {
    return this.solution?.netVolts[this.analysis.pinToNet[`${id}:${pin}`]!] ?? 0;
  }

  private powered(id: string, positive: string): boolean {
    const ground = this.analysis.nets.find(net => net.id === this.analysis.pinToNet[`${id}:GND`]);
    const grounded = ground?.pins.some(ref =>
      ref.pinId.startsWith('GND') && this.scene.parts.some(part => part.id === ref.partId && part.kind === 'arduino-uno'),
    );
    return this.voltage(id, positive) - this.voltage(id, 'GND') > 3.5 && !!grounded;
  }

  /** Exclude the load itself: a dangling terminal is not a ground return. */
  private groundReturn(partId: string, pin: string): boolean {
    const pending = [this.analysis.pinToNet[`${partId}:${pin}`]!];
    const seen = new Set<string>();
    while (pending.length) {
      const netId = pending.pop()!;
      if (seen.has(netId)) continue;
      seen.add(netId);
      for (const ref of this.analysis.nets.find(net => net.id === netId)?.pins ?? []) {
        const part = this.scene.parts.find(candidate => candidate.id === ref.partId)!;
        if (part.kind === 'arduino-uno' && ref.pinId.startsWith('GND')) return true;
        if (part.id === partId) continue;
        if (part.kind === 'resistor') {
          pending.push(this.analysis.pinToNet[`${part.id}:${ref.pinId === '1' ? '2' : '1'}`]!);
        }
        if (part.kind === 'pushbutton' && this.inputs[part.id]?.pressed) {
          for (const terminal of ['1', '3']) pending.push(this.analysis.pinToNet[`${part.id}:${terminal}`]!);
        }
        if (part.kind === 'slide-switch') {
          const contact = Number(this.inputs[part.id]?.position ?? 0) < 0.5 ? '1' : '3';
          if (ref.pinId === '2' || ref.pinId === contact) {
            pending.push(this.analysis.pinToNet[`${part.id}:${ref.pinId === '2' ? contact : '2'}`]!);
          }
        }
      }
    }
    return false;
  }

  setScene(scene: Scene): Analysis {
    this.scene = structuredClone(validateScene(scene));
    this.mcu.clearEcho();
    this.analysis = analyze(this.scene);
    this.linkedInputs.clear();
    const unoIds = new Set(this.scene.parts.filter(part => part.kind === 'arduino-uno').map(part => part.id));
    for (const net of this.analysis.nets) {
      const pins = net.pins.filter(ref => unoIds.has(ref.partId) && UNO_PIN_MAP[ref.pinId]).map(ref => ref.pinId);
      for (const pin of pins) this.linkedInputs.set(pin, pins.filter(peer => peer !== pin));
    }
    this.inputs = Object.fromEntries(this.scene.parts.map(part => [
      part.id, Object.fromEntries((PARTS[part.kind].inputs ?? []).map(input => [input.key, input.default])),
    ]));
    this.dirty = true;
    this.solution = undefined;
    this.configureDevices();
    return this.analysis;
  }

  private unoPin(partId: string, pin: string): string | undefined {
    const netId = this.analysis.pinToNet[`${partId}:${pin}`];
    return this.analysis.nets.find(net => net.id === netId)?.pins.find(ref =>
      UNO_PIN_MAP[ref.pinId] && this.scene.parts.some(part => part.id === ref.partId && part.kind === 'arduino-uno'),
    )?.pinId;
  }

  private configureDevices(): void {
    const lcdAddresses = this.scene.parts.filter(part => part.kind === 'lcd1602-i2c'
      && this.powered(part.id, 'VCC')
      && this.unoPin(part.id, 'SDA') === 'A4'
      && this.unoPin(part.id, 'SCL') === 'A5')
      .map(part => Number(part.props.address ?? 0x27));
    this.mcu.configureLcdDevices(lcdAddresses);
    const echoes: { trig: string; echo: string; distanceCm: number }[] = [];
    this.echoPins.clear();
    const nextDht = new Set<string>();
    const nextPixels = new Set<string>();
    for (const part of this.scene.parts) {
      if (part.kind === 'hc-sr04' && this.powered(part.id, 'VCC')) {
        const trigger = this.unoPin(part.id, 'TRIG');
        const echo = this.unoPin(part.id, 'ECHO');
        if (trigger && echo) {
          echoes.push({ trig: trigger, echo, distanceCm: Number(this.inputs[part.id]?.distanceCm ?? 100) });
          this.echoPins.add(echo);
        }
      }
      if (part.kind === 'dht11' && this.powered(part.id, 'VCC')) {
        const pin = this.unoPin(part.id, 'DATA');
        if (pin) {
          nextDht.add(pin);
          this.mcu.configureDht(pin, () => ({
            temperature: Number(this.inputs[part.id]?.temperature ?? 25),
            humidity: Number(this.inputs[part.id]?.humidity ?? 50),
          }));
        }
      }
      if (part.kind === 'neopixel-strip' && this.powered(part.id, '5V')) {
        const pin = this.unoPin(part.id, 'DIN');
        if (pin) {
          nextPixels.add(pin);
          this.mcu.configurePixels(pin, Number(part.props.count ?? 8));
        }
      }
    }
    this.mcu.configureEchoDevices(echoes);
    for (const pin of this.dhtPins) if (!nextDht.has(pin)) this.mcu.configureDht(pin, null);
    for (const pin of this.pixelPins) if (!nextPixels.has(pin)) this.mcu.configurePixels(pin, null);
    this.dhtPins = nextDht;
    this.pixelPins = nextPixels;
  }

  loadHex(hex: string): void {
    this.mcu.loadHex(hex);
    this.hex = hex;
    this.afterReset();
  }

  reset(): void {
    if (this.hex) this.mcu.loadHex(this.hex);
    else this.mcu.reset();
    this.afterReset();
  }

  private afterReset(): void {
    this.solution = undefined;
    this.dirty = true;
    this.elapsedReal = 0;
    this.elapsedCycles = 0;
    this.lastSignature = '';
    this.lastSolve = -Infinity;
    this.configureDevices();
  }

  setInput(input: SimInput): void {
    const part = this.scene.parts.find(candidate => candidate.id === input.partId);
    const definition = part && PARTS[part.kind].inputs?.find(candidate => candidate.key === input.key);
    if (!part || !definition) throw new Error('존재하지 않는 부품 입력입니다.');
    const valid = definition.type === 'momentary'
      ? typeof input.value === 'boolean'
      : typeof input.value === 'number' && Number.isFinite(input.value);
    if (!valid) throw new Error('입력값 형식이 올바르지 않습니다.');
    this.inputs[input.partId]![input.key] = typeof input.value === 'number'
      ? clamp(input.value, definition.min ?? 0, definition.max ?? 1)
      : input.value;
    this.dirty = true;
    if (input.key === 'distanceCm') this.configureDevices();
  }

  writeSerial(text: string): void {
    this.mcu.writeSerial(text);
  }

  /** Follow series resistors to find the GPIO sources/sinks of an optical channel. */
  private sources(start: string, pins: PinStates): string[] {
    const seen = new Set<string>();
    const pending = [start];
    const found: string[] = [];
    while (pending.length) {
      const netId = pending.pop()!;
      if (seen.has(netId)) continue;
      seen.add(netId);
      for (const ref of this.analysis.nets.find(net => net.id === netId)?.pins ?? []) {
        const part = this.scene.parts.find(candidate => candidate.id === ref.partId)!;
        if (part.kind === 'arduino-uno' && pins[ref.pinId]?.mode === 'output') found.push(ref.pinId);
        if (part.kind === 'resistor') {
          pending.push(this.analysis.pinToNet[`${part.id}:${ref.pinId === '1' ? '2' : '1'}`]!);
        }
      }
    }
    return found;
  }

  private opticalDrive(pins: PinStates, instantaneous: PinStates): { drive: PinStates; factors: Record<string, number> } {
    const drive = structuredClone(instantaneous);
    const factors: Record<string, number> = {};
    for (const part of this.scene.parts.filter(part => part.kind === 'led' || part.kind === 'rgb-led')) {
      for (const channel of part.kind === 'led' ? [''] : ['R', 'G', 'B']) {
        const anode = part.kind === 'led' ? 'anode' : part.props.common === 'anode' ? 'common' : channel;
        const cathode = part.kind === 'led' ? 'cathode' : part.props.common === 'anode' ? channel : 'common';
        let duty = 1;
        for (const [terminal, active] of [[anode, 1], [cathode, 0]] as const) {
          for (const pin of this.sources(this.analysis.pinToNet[`${part.id}:${terminal}`]!, pins)) {
            const state = pins[pin]!;
            if (state.freq > 0 && state.duty > 0 && state.duty < 1) {
              drive[pin] = { ...state, level: active, duty: active };
              duty = Math.min(duty, active ? state.duty : 1 - state.duty);
            }
          }
        }
        factors[channel ? `${part.id}:${channel}` : part.id] = duty;
      }
    }
    return { drive, factors };
  }

  private solve(): void {
    const pins = this.mcu.pins();
    const signature = JSON.stringify(pins);
    if (signature !== this.lastSignature) this.dirty = true;
    const now = this.now();
    if (!this.dirty || (this.solution && now - this.lastSolve < this.solveInterval)) return;

    // ADC/digital inputs see instantaneous voltages, never PWM averages.
    const instantaneous: PinStates = Object.fromEntries(Object.entries(pins).map(([id, state]) => [id, { ...state, duty: state.level }]));
    const external: ExternalDrives = {};
    for (const part of this.scene.parts.filter(part => part.kind === 'hc-sr04')) {
      external[`${part.id}:ECHO`] = { volts: this.mcu.isEchoActive(this.unoPin(part.id, 'ECHO') ?? '') ? 5 : 0 };
    }
    this.solution = solveCircuit(this.scene, this.analysis, instantaneous, this.inputs, external);
    this.opticalCurrents = this.solution.currents;
    let solveCount = 1;
    if (this.scene.parts.some(part => part.kind === 'led' || part.kind === 'rgb-led')
      && Object.values(pins).some(pin => pin.mode === 'output' && pin.freq > 0 && pin.duty > 0 && pin.duty < 1)) {
      // LED Vf applies to the on pulse, not its average voltage. Integrate current
      // after solving the on state; otherwise dim PWM incorrectly extinguishes LEDs.
      const { drive, factors } = this.opticalDrive(pins, instantaneous);
      const on = solveCircuit(this.scene, this.analysis, drive, this.inputs, external);
      solveCount++;
      this.solution.warnings.push(...on.warnings.filter(warning => warning.id.startsWith('led-overcurrent:')));
      this.opticalCurrents = { ...this.solution.currents };
      for (const [key, factor] of Object.entries(factors)) this.opticalCurrents[key] = (on.currents[key] ?? 0) * factor;
    }
    if (this.scene.parts.some(part => part.kind === 'dc-motor')) {
      const average = solveCircuit(this.scene, this.analysis, pins, this.inputs, external);
      solveCount++;
      for (const part of this.scene.parts.filter(part => part.kind === 'dc-motor')) {
        this.solution.parts[part.id] = average.parts[part.id]!;
      }
    }
    this.solveInterval = solveCount * 1000 / 60;
    this.configureDevices();
    this.lastSolve = now;
    this.dirty = false;
    this.lastSignature = signature;
    for (const part of this.scene.parts.filter(part => part.kind === 'arduino-uno')) {
      for (const [id, state] of Object.entries(pins)) {
        if (state.mode === 'output' || this.echoPins.has(id) || this.mcu.dhtBusy(id)) continue;
        this.mcu.setVoltage(id, this.voltage(part.id, id));
      }
    }
  }

  step(cycles: number): SimFrame {
    if (!Number.isFinite(cycles) || cycles < 0 || cycles > MCU_HZ * 10) throw new Error('실행 사이클 범위가 올바르지 않습니다.');
    const started = performance.now();
    const before = this.mcu.cpu.cycles;
    this.solve();
    this.mcu.step(Math.floor(cycles));
    const frame = this.frame();
    this.elapsedCycles += this.mcu.cpu.cycles - before;
    this.elapsedReal += performance.now() - started;
    frame.realtimeRatio = this.elapsedReal > 0 ? this.elapsedCycles / MCU_HZ / (this.elapsedReal / 1000) : 0;
    return frame;
  }

  frame(realtimeRatio?: number): SimFrame {
    this.solve();
    const solution = this.solution!;
    const pins = this.mcu.pins();
    const parts: Record<string, PartVisualState> = {};
    for (const part of this.scene.parts) {
      const state: PartVisualState = { ...solution.parts[part.id] };
      const activity = (pin: string) => pins[this.unoPin(part.id, pin) ?? ''];
      if (part.kind === 'led') state.led = { brightness: ledBrightness(this.opticalCurrents[part.id] ?? 0) };
      if (part.kind === 'rgb-led') state.rgb = {
        r: ledBrightness(this.opticalCurrents[`${part.id}:R`] ?? 0),
        g: ledBrightness(this.opticalCurrents[`${part.id}:G`] ?? 0),
        b: ledBrightness(this.opticalCurrents[`${part.id}:B`] ?? 0),
      };
      if (part.kind === 'arduino-uno') state.led = { brightness: pins.D13?.duty ?? 0 };
      if (part.kind === 'servo') state.servo = {
        angle: this.powered(part.id, 'V+') ? this.mcu.servoAngle(this.unoPin(part.id, 'SIG') ?? '') : 0,
      };
      if (part.kind === 'buzzer') {
        const frequency = activity('+')?.freq ?? 0;
        const returnConnected = this.groundReturn(part.id, '-');
        state.buzzer = { on: frequency > 0 && returnConnected, freq: returnConnected ? frequency : 0 };
      }
      if (part.kind === 'lcd1602-i2c') state.lcd = this.powered(part.id, 'VCC')
        ? this.mcu.lcdState(Number(part.props.address ?? 0x27)) : { lines: [' '.repeat(16), ' '.repeat(16)], backlight: false };
      if (part.kind === 'hc-sr04') state.hcsr04 = { pinging: this.mcu.isEchoActive(this.unoPin(part.id, 'ECHO') ?? '') };
      if (part.kind === 'dht11') state.dht = { busy: this.mcu.dhtBusy(this.unoPin(part.id, 'DATA') ?? '') };
      if (part.kind === 'neopixel-strip') {
        const colors = this.mcu.pixelColors(this.unoPin(part.id, 'DIN') ?? '');
        state.pixels = { colors: colors.length
          ? colors.map(color => [...color])
          : Array.from({ length: Number(part.props.count ?? 8) }, () => [0, 0, 0]) };
      }
      if (part.kind === 'multimeter') {
        const mode = part.props.mode === 'mA' ? 'mA' : 'V';
        state.meter = { mode, reading: mode === 'V'
          ? (this.voltage(part.id, 'V') - this.voltage(part.id, 'COM')).toFixed(3)
          : ((solution.currents[part.id] ?? 0) * 1000).toFixed(3) };
      }
      parts[part.id] = state;
    }
    return {
      timeMs: this.mcu.cpu.cycles / MCU_HZ * 1000,
      realtimeRatio: realtimeRatio ?? (this.elapsedReal > 0 ? this.elapsedCycles / MCU_HZ / (this.elapsedReal / 1000) : 0),
      pins, parts, netVolts: solution.netVolts,
      warnings: [...new Map([...this.analysis.warnings, ...solution.warnings.filter(warning => !warning.id.startsWith('floating:') || (pins[warning.id.slice(9)]?.mode === 'input' && this.mcu.readPins.has(warning.id.slice(9))))].map(warning => [warning.id, warning])).values()],
    };
  }
}
export { SimulationEngine as Engine };
