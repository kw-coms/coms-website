import type { Analysis, McuPinState, PartVisualState, Scene, SimFrame, SimInput, SimWarning } from './types';
import { analyze } from './analyze';
import { PARTS } from './parts';
import { isSafeId, validateScene } from './scene';
import { ledBrightness, solveCircuit, type SolveResult, newTransientState } from './solver';
import { Mcu, MCU_HZ, UNO_PIN_MAP } from './mcu';
import { BehavioralDevices } from './behavioral';
import { Instruments } from './instruments';

const EMPTY_SCENE: Scene = { version: 1, parts: [], wires: [], code: '' };
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const MOTOR_TAU_MS = 30; // rotor inertia: smooths the 490 Hz analogWrite PWM into a steady speed
type PinStates = Record<string, McuPinState>;
type ExternalDrives = Record<string, { volts: number }>;

/** Deterministic AVR stepping; the injectable clock controls the DC solve budget. */
export class SimulationEngine {
  scene: Scene = EMPTY_SCENE;
  analysis: Analysis = analyze(EMPTY_SCENE);
  mcu = new Mcu(text => this.onSerial(text));
  onSerial: (text: string) => void = () => {};
  inputs: Record<string, Record<string, number | boolean>> = Object.create(null);
  private unoId: string | undefined;
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
  private wiredParts = new Set<string>();
  private dhtPins = new Set<string>();
  private pixelPins = new Set<string>();
  private transient = newTransientState();
  private motorDv = new Map<string, { target: number; dv: number; timeMs: number }>();
  private behavior = new BehavioralDevices();
  private instruments = new Instruments();
  private keypadCache = new Map<string, SolveResult>();
  private keypadCacheEnabled = false;
  private v2 = false;
  private dynamic = false;
  private solving = false;
  private analogStepMs = .25;
  private analogTimeMs = 0;
  private lastAnalogPins: PinStates | undefined;
  private recentWarnings = new Map<string, { until: number; warning: SimWarning }>();
  private readonly legacyKinds = new Set([
    'arduino-uno', 'breadboard-half', 'breadboard-full', 'breadboard-mini', 'led', 'rgb-led',
    'resistor', 'pushbutton', 'slide-switch', 'potentiometer', 'photoresistor', 'buzzer',
    'servo', 'hc-sr04', 'lcd1602-i2c', 'multimeter', 'dht11', 'joystick', 'seven-segment',
    'neopixel-strip', 'neopixel-ring', 'l9110s', 'dc-motor',
  ]);

  get nextSolveDelay(): number {
    return Math.max(0, this.lastSolve + this.solveInterval - this.now());
  }

  constructor(private now: () => number = () => performance.now()) {
    this.mcu.onPinModeChange = () => {
      this.dirty = true;
      if (this.v2 && !this.solving) this.onElectricalEdge();
    };
    this.mcu.onPinChange = (pin, level) => {
      // GPIO peers need edge-accurate input without performing MNA at CPU speed.
      for (const peer of this.linkedInputs.get(pin) ?? []) {
        const [port, bit] = UNO_PIN_MAP[peer]!;
        const direction = this.mcu.cpu.data[this.mcu.ports[port].portConfig.DDR]!;
        if (!(direction & (1 << bit))) this.mcu.setVoltage(peer, level * 5);
      }
      this.dirty = true;
      if (this.v2 && !this.solving) this.onElectricalEdge();
    };
  }

  private voltage(id: string, pin: string): number {
    return this.solution?.netVolts[this.analysis.pinToNet[`${id}:${pin}`]!] ?? 0;
  }

  private powered(id: string, positive: string): boolean {
    const ground = this.analysis.nets.find(net => net.id === this.analysis.pinToNet[`${id}:GND`]);
    const grounded = ground?.pins.some(ref =>
      ref.pinId.startsWith('GND') && ref.partId === this.unoId,
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
        if (part.id === this.unoId && ref.pinId.startsWith('GND')) return true;
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
    const next = structuredClone(validateScene(scene));
    const unchanged = JSON.stringify(next.parts) === JSON.stringify(this.scene.parts)
      && JSON.stringify(next.wires) === JSON.stringify(this.scene.wires);
    this.scene = next;
    // Editing source must not reset protocol transactions or the running circuit.
    if (unchanged) return this.analysis;
    this.v2 = this.scene.parts.some(part => !this.legacyKinds.has(part.kind));
    // A standalone UNO/keypad circuit has no time-dependent or edge-triggered device state.
    this.keypadCacheEnabled = this.scene.parts.length === 2
      && this.scene.parts.some(part => part.kind === 'arduino-uno')
      && this.scene.parts.some(part => part.kind === 'keypad-4x4');
    this.dynamic = this.scene.parts.some(part => [
      'capacitor-ceramic', 'capacitor-electrolytic', 'inductor', 'timer-555',
      'function-generator', 'oscilloscope', 'logic-analyzer', 'light-bulb',
    ].includes(part.kind));
    this.transient = newTransientState();
    this.motorDv.clear();
    this.behavior.reset();
    this.instruments.reset();
    this.analogStepMs = .25;
    this.analogTimeMs = this.mcu.cpu.cycles / 16000;
    this.lastAnalogPins = undefined;
    this.recentWarnings.clear();
    this.keypadCache.clear();
    this.unoId = this.scene.parts.find(part => part.kind === 'arduino-uno')?.id;
    this.mcu.clearEcho();
    this.analysis = analyze(this.scene);
    this.linkedInputs.clear();
    this.wiredParts.clear();
    for (const net of this.analysis.nets) {
      if (new Set(net.pins.map(pin => pin.partId)).size > 1) {
        for (const pin of net.pins) this.wiredParts.add(pin.partId);
      }
    }
    for (const net of this.analysis.nets) {
      const pins = net.pins.filter(ref => ref.partId === this.unoId && UNO_PIN_MAP[ref.pinId]).map(ref => ref.pinId);
      for (const pin of pins) this.linkedInputs.set(pin, pins.filter(peer => peer !== pin));
    }
    // Part ids and input keys come from imported scenes: null-prototype tables keep a hostile id
    // such as `__proto__` an ordinary key, never a write into Object.prototype.
    const previous = this.inputs;
    this.inputs = Object.create(null) as typeof this.inputs;
    for (const part of this.scene.parts) {
      const values = Object.create(null) as Record<string, number | boolean>;
      for (const input of PARTS[part.kind].inputs ?? []) {
        const old = previous[part.id]?.[input.key];
        values[input.key] = typeof old === 'number' && input.type === 'range'
          ? clamp(old, input.min ?? 0, input.max ?? 1)
          : typeof old === 'boolean' && input.type === 'momentary' ? old : input.default;
      }
      this.inputs[part.id] = values;
    }
    this.dirty = true;
    this.solution = undefined;
    this.configureDevices();
    return this.analysis;
  }

  private unoPin(partId: string, pin: string): string | undefined {
    const netId = this.analysis.pinToNet[`${partId}:${pin}`];
    const findPin = (id: string | undefined) => this.analysis.nets.find(net => net.id === id)?.pins.find(ref =>
      ref.partId === this.unoId && UNO_PIN_MAP[ref.pinId],
    )?.pinId;
    const direct = findPin(netId);
    if (direct) return direct;
    // Signal discovery only: retain separate nets for the electrical solver.
    // One small series resistor is allowed; supply pull-ups are not data links.
    const isRail = (id: string | undefined) => this.analysis.nets.find(net => net.id === id)?.pins.some(ref =>
      ref.partId === this.unoId && ['5V', '3V3', 'IOREF', 'GND.1', 'GND.2', 'GND.3'].includes(ref.pinId),
    );
    if (!netId || isRail(netId)) return undefined;
    for (const part of this.scene.parts) {
      if (part.kind !== 'resistor' || Number(part.props.ohms ?? 220) > 1000) continue;
      const a = this.analysis.pinToNet[`${part.id}:1`];
      const b = this.analysis.pinToNet[`${part.id}:2`];
      const other = a === netId ? b : b === netId ? a : undefined;
      if (!other || isRail(other)) continue;
      const connected = findPin(other);
      if (connected) return connected;
    }
    return undefined;
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
      if ((part.kind === 'neopixel-strip' || part.kind === 'neopixel-ring') && this.powered(part.id, '5V')) {
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
    if (this.hex) this.mcu.reset(Uint16Array.from(this.mcu.cpu.progMem));
    else this.mcu.reset();
    this.afterReset();
  }

  private afterReset(): void {
    this.transient = newTransientState();
    this.behavior.reset();
    this.instruments.reset();
    this.analogStepMs = .25;
    this.analogTimeMs = this.mcu.cpu.cycles / 16000;
    this.lastAnalogPins = undefined;
    this.recentWarnings.clear();
    this.keypadCache.clear();
    this.solution = undefined;
    this.dirty = true;
    this.elapsedReal = 0;
    this.elapsedCycles = 0;
    this.lastSignature = '';
    this.lastSolve = -Infinity;
    this.configureDevices();
  }

  setInput(input: SimInput): void {
    const part = isSafeId(input.partId) ? this.scene.parts.find(candidate => candidate.id === input.partId) : undefined;
    const definition = part && PARTS[part.kind].inputs?.find(candidate => candidate.key === input.key);
    const values = part && Object.hasOwn(this.inputs, part.id) ? this.inputs[part.id] : undefined;
    if (!part || !definition || !values) throw new Error('존재하지 않는 부품 입력입니다.');
    const valid = definition.type === 'momentary'
      ? typeof input.value === 'boolean'
      : typeof input.value === 'number' && Number.isFinite(input.value);
    if (!valid) throw new Error('입력값 형식이 올바르지 않습니다.');
    values[definition.key] = typeof input.value === 'number'
      ? clamp(input.value, definition.min ?? 0, definition.max ?? 1)
      : input.value;
    this.keypadCache.clear();
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
        if (part.id === this.unoId && pins[ref.pinId]?.mode === 'output') found.push(ref.pinId);
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

  /** Stateful devices advance only here, never as a side effect of reading a frame. */
  private onElectricalEdge(): void {
    const elapsed = this.mcu.cpu.cycles / 16000 - this.analogTimeMs;
    if (this.dynamic && elapsed > 0 && this.lastAnalogPins) this.solveV2(elapsed, this.lastAnalogPins);
    this.solveV2(0);
  }

  private solveV2(dtMs: number, heldPins?: PinStates): void {
    if (this.solving) return;
    this.solving = true;
    try {
      const pins = heldPins ?? this.mcu.pins();
      const instantaneous: PinStates = Object.fromEntries(Object.entries(pins).map(([id, state]) => [id, { ...state, duty: state.level }]));
      const timeMs = this.mcu.cpu.cycles / MCU_HZ * 1000;
      const cacheKey = this.keypadCacheEnabled && dtMs === 0
        ? Object.entries(pins).map(([id, state]) => `${id}:${state.mode}:${state.level}`).join('|')
        : undefined;
      const cached = cacheKey === undefined ? undefined : this.keypadCache.get(cacheKey);
      if (cached) {
        this.solution = cached;
        this.transient.previous = cached.netVolts;
        this.opticalCurrents = cached.currents;
        for (const [id, state] of Object.entries(pins)) {
          if (this.unoId && state.mode !== 'output' && !this.echoPins.has(id) && !this.mcu.dhtBusy(id)) {
            this.mcu.setVoltage(id, this.voltage(this.unoId, id));
          }
        }
        this.analogTimeMs = timeMs;
        this.lastAnalogPins = instantaneous;
        this.dirty = false;
        return;
      }
      const old = this.solution?.netVolts ?? {};
      const oldCaps = dtMs > 0 ? { ...this.transient.capacitors } : undefined;
      const oldCoils = dtMs > 0 ? { ...this.transient.inductors } : undefined;
      let behavior = this.behavior.tick(this.scene, this.analysis, old, this.inputs, timeMs);
      this.solution = solveCircuit(this.scene, this.analysis, instantaneous, this.inputs, behavior.drives,
        { timeMs, dtMs, state: this.transient, links: behavior.links });
      const edgeWarnings = this.solution.warnings.filter(warning => warning.id.startsWith('relay-turnoff-spike:'));
      // Allow one propagation per gate (including gates chained inside one IC), plus supply startup.
      const settleBudget = 2 + this.scene.parts.reduce((count, part) => count +
        (part.kind === 'logic-7404' ? 6 : part.kind.startsWith('logic-74') ? 4
          : ['shift-register-595', 'l293d', 'timer-555', 'keypad-4x4', 'pir',
            'ir-receiver', 'lcd1602-parallel', 'seven-segment-4digit'].includes(part.kind) ? 1 : 0), 0);
      let settled = false;
      for (let iteration = 0; iteration < settleBudget; iteration++) {
        const next = this.behavior.tick(this.scene, this.analysis, this.solution.netVolts, this.inputs, timeMs);
        const changed = JSON.stringify(next.drives) !== JSON.stringify(behavior.drives)
          || JSON.stringify(next.links) !== JSON.stringify(behavior.links);
        behavior = next;
        if (!changed) { settled = true; break; }
        this.solution = solveCircuit(this.scene, this.analysis, instantaneous, this.inputs, behavior.drives,
          { timeMs, dtMs: 0, state: this.transient, links: behavior.links });
      }
      if (!settled) this.solution.warnings.push({
        id: 'behavior-nonconvergent', level: 'warn',
        message: '회로의 동작 출력이 수렴하지 않았습니다. 연결을 확인해 주세요.',
      });
      for (const part of this.scene.parts.filter(part => part.kind === 'dc-motor')) {
        const motor = this.solution.parts[part.id]?.motor;
        if (!motor) continue;
        const target = motor.direction * motor.rpm / 200 * 5; // inverse of the solver's rpm mapping (sign kept)
        this.motorDv.set(part.id, { target, dv: this.motorAt(part.id, timeMs) ?? target, timeMs });
      }
      for (const [id, visual] of Object.entries(behavior.visuals)) {
        this.solution.parts[id] = { ...this.solution.parts[id], ...visual };
      }
      this.solution.warnings.push(...behavior.warnings, ...edgeWarnings);
      for (const warning of this.solution.warnings) {
        if (warning.id.startsWith('relay-turnoff-spike:')) this.recentWarnings.set(warning.id, { until: timeMs + 1000, warning });
      }
      for (const [id, entry] of this.recentWarnings) {
        if (entry.until < timeMs) this.recentWarnings.delete(id);
        else this.solution.warnings.push(entry.warning);
      }
      if (oldCaps && dtMs > 0) {
        let error = 0;
        for (const part of this.scene.parts) {
          const previous = oldCaps[part.id], current = this.transient.capacitors[part.id];
          if (!previous || !current) continue;
          const capacitance = Number(part.props.capacitance ?? 100)
            * (part.kind === 'capacitor-ceramic' ? 1e-9 : 1e-6);
          // Embedded backward-Euler / trapezoid defect estimates local voltage error.
          const defect = Math.abs(current.amps - previous.amps) * dtMs / 2000 / capacitance;
          error = Math.max(error, defect / (.001 + .002 * Math.abs(current.volts)));
        }
        for (const part of this.scene.parts) {
          const previous = oldCoils?.[part.id], current = this.transient.inductors[part.id];
          if (!previous || !current) continue;
          const inductance = Number(part.props.millihenries ?? 10) / 1000;
          const defect = Math.abs(current.volts - previous.volts) * dtMs / 2000 / inductance;
          error = Math.max(error, defect / (.00001 + .002 * Math.abs(current.amps)));
        }
        const factor = error > 0 ? Math.max(.25, Math.min(2, .8 / Math.sqrt(error))) : 2;
        this.analogStepMs = Math.max(.001, Math.min(1, dtMs * factor));
      }
      this.opticalCurrents = this.solution.currents;
      this.instruments.sample(this.scene, this.analysis, this.solution.netVolts, timeMs);
      this.configureDevices();
      for (const [id, state] of Object.entries(pins)) {
        if (this.unoId && state.mode !== 'output' && !this.echoPins.has(id) && !this.mcu.dhtBusy(id)) {
          this.mcu.setVoltage(id, this.voltage(this.unoId, id));
        }
      }
      this.analogTimeMs = timeMs;
      this.lastAnalogPins = instantaneous;
      this.dirty = !settled;
      if (cacheKey !== undefined && settled) {
        if (this.keypadCache.size >= 64) this.keypadCache.clear();
        this.keypadCache.set(cacheKey, this.solution);
      }
    } finally { this.solving = false; }
  }

  private dynamicStepMs(): number {
    let limit = 1;
    for (const part of this.scene.parts) {
      if (part.kind === 'function-generator') limit = Math.min(limit, 1000 / Number(part.props.frequencyHz ?? 1000) / 80);

      if (part.kind === 'oscilloscope' || part.kind === 'logic-analyzer') limit = Math.min(limit, Number(part.props.timeDiv ?? 1) * 10 / 512);
    }
    return Math.max(.001, Math.min(limit, this.analogStepMs));
  }

  private solve(): void {
    if (this.v2) {
      if (this.dirty || !this.solution) this.solveV2(0);
      return;
    }
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
    for (const part of this.scene.parts.filter(part => part.id === this.unoId)) {
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
    if (this.v2) {
      const end = this.mcu.cpu.cycles + Math.floor(cycles);
      while (this.mcu.cpu.cycles < end) {
        const beforeStep = this.mcu.cpu.cycles;
        const event = this.behavior.nextEventMs(beforeStep / 16000);
        const nextEventCycles = event === undefined ? Infinity : Math.max(1, Math.ceil(event * 16000 - beforeStep));
        const count = Math.min(end - beforeStep, nextEventCycles,
          this.dynamic ? Math.max(16, Math.floor(this.dynamicStepMs() * 16000)) : Infinity);
        if (this.unoId) this.mcu.step(count);
        else this.mcu.cpu.cycles += count;
        const elapsed = (this.mcu.cpu.cycles - beforeStep) / 16000;
        if (elapsed <= 0) break; // debugger paused before an instruction
        if (this.dynamic || event !== undefined || this.dirty) this.solveV2(Math.max(0, this.mcu.cpu.cycles / 16000 - this.analogTimeMs));
      }
    } else this.mcu.step(Math.floor(cycles));
    const frame = this.frame();
    this.elapsedCycles += this.mcu.cpu.cycles - before;
    this.elapsedReal += performance.now() - started;
    frame.realtimeRatio = this.elapsedReal > 0 ? this.elapsedCycles / MCU_HZ / (this.elapsedReal / 1000) : 0;
    return frame;
  }

  /** A DC motor's inertia low-passes PWM (instantaneous drive would flicker rpm 0/full at every analogWrite edge); the held target decays toward the latest solve even when no new edge triggers one. */
  private motorAt(id: string, timeMs: number): number | undefined {
    const m = this.motorDv.get(id);
    return m && m.dv + (m.target - m.dv) * (1 - Math.exp(-Math.max(0, timeMs - m.timeMs) / MOTOR_TAU_MS));
  }

  frame(realtimeRatio?: number): SimFrame {
    this.solve();
    const solution = this.solution!;
    const pins = this.mcu.pins();
    const parts: Record<string, PartVisualState> = {};
    for (const part of this.scene.parts) {
      const state: PartVisualState = { ...solution.parts[part.id] };
      const activity = (pin: string) => pins[this.unoPin(part.id, pin) ?? ''];
      const dv = part.kind === 'dc-motor' ? this.motorAt(part.id, this.mcu.cpu.cycles / MCU_HZ * 1000) : undefined;
      if (dv !== undefined) state.motor = { rpm: Math.round(200 * Math.min(1, Math.abs(dv) / 5)), direction: dv > .1 ? 1 : dv < -.1 ? -1 : 0 };
      if (part.kind === 'led') state.led = { brightness: ledBrightness(this.opticalCurrents[part.id] ?? 0) };
      if (part.kind === 'rgb-led') state.rgb = {
        r: ledBrightness(this.opticalCurrents[`${part.id}:R`] ?? 0),
        g: ledBrightness(this.opticalCurrents[`${part.id}:G`] ?? 0),
        b: ledBrightness(this.opticalCurrents[`${part.id}:B`] ?? 0),
      };
      if (part.kind === 'arduino-uno') state.led = { brightness: part.id === this.unoId ? pins.D13?.duty ?? 0 : 0 };
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
      if ((part.kind === 'neopixel-strip' || part.kind === 'neopixel-ring')) {
        const colors = this.mcu.pixelColors(this.unoPin(part.id, 'DIN') ?? '');
        state.pixels = { colors: colors.length
          ? colors.map(color => [...color])
          : Array.from({ length: Number(part.props.count ?? 8) }, () => [0, 0, 0]) };
      }
      if (part.kind === 'multimeter' && (part.props.mode === 'V' || part.props.mode === 'mA' || !part.props.mode)) {
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
      ...(this.v2 ? this.instruments.traces() : {}),
      debug: this.mcu.debugger.state(this.mcu.cpu),
      warnings: [...new Map([...this.analysis.warnings.filter(warning => !warning.id.startsWith('unconnected:') || (warning.partId && this.wiredParts.has(warning.partId))), ...solution.warnings.filter(warning => !warning.id.startsWith('floating:') || (pins[warning.id.slice(9)]?.mode === 'input' && this.mcu.readPins.has(warning.id.slice(9))))].map(warning => [warning.id, warning])).values()],
    };
  }
}
export { SimulationEngine as Engine };
