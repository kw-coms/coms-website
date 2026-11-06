import type { Analysis, Scene, SimFrame, SimInput, Simulator } from './types';
import { SimulationEngine } from './engine';
import { MCU_HZ } from './mcu';

/** The worker host and main-thread fallback share the same lifecycle. */
export class LocalSimulator implements Simulator {
  private engine = new SimulationEngine();
  private frames = new Set<(frame: SimFrame) => void>();
  private serial = new Set<(text: string) => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inputTimer: ReturnType<typeof setTimeout> | undefined;
  private speed = 1;
  private disposed = false;
  private started = 0;
  private simulatedAtStart = 0;
  private _state: Simulator['state'] = 'idle';

  get state(): Simulator['state'] {
    return this._state;
  }

  constructor() {
    this.engine.onSerial = text => {
      for (const listener of this.serial) listener(text);
    };
  }

  private emit(frame = this.engine.frame()): void {
    for (const listener of this.frames) listener(frame);
  }

  private resetClock(): void {
    this.started = performance.now();
    this.simulatedAtStart = this.engine.mcu.cpu.cycles;
  }

  setScene(scene: Scene): Analysis {
    const result = this.engine.setScene(scene);
    this.emit();
    return result;
  }

  loadHex(hex: string): void {
    this.engine.loadHex(hex);
    this.resetClock();
    this.emit();
  }

  start(): void {
    if (this.disposed || this._state === 'running') return;
    this._state = 'running';
    this.resetClock();
    const tick = (): void => {
      if (this._state !== 'running') return;
      const started = performance.now();
      const frame = this.engine.step(Math.round(MCU_HZ / 60 * this.speed));
      const elapsedSeconds = (performance.now() - this.started) / 1000;
      frame.realtimeRatio = elapsedSeconds > 0
        ? (this.engine.mcu.cpu.cycles - this.simulatedAtStart) / MCU_HZ / elapsedSeconds
        : 0;
      this.emit(frame);
      this.timer = setTimeout(tick, Math.max(0, 1000 / 60 - (performance.now() - started)));
    };
    this.timer = setTimeout(tick, 0);
  }

  pause(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    if (this._state === 'running') this._state = 'paused';
  }

  stop(): void {
    this.pause();
    this._state = 'idle';
    this.engine.reset();
    this.emit();
  }

  reset(): void {
    this.engine.reset();
    this.resetClock();
    this.emit();
  }

  setSpeed(value: number): void {
    if (!Number.isFinite(value)) throw new Error('속도가 올바르지 않습니다.');
    this.speed = Math.max(0.25, Math.min(2, value));
  }

  setInput(input: SimInput): void {
    this.engine.setInput(input);
    if (this.state !== 'running') {
      if (this.inputTimer !== undefined) clearTimeout(this.inputTimer);
      this.inputTimer = setTimeout(() => {
        this.inputTimer = undefined;
        if (!this.disposed) this.emit();
      }, Math.max(18, this.engine.nextSolveDelay + 1));
    }
  }

  writeSerial(text: string): void {
    this.engine.writeSerial(text);
  }

  onFrame(listener: (frame: SimFrame) => void): () => void {
    this.frames.add(listener);
    return () => { this.frames.delete(listener); };
  }

  onSerial(listener: (text: string) => void): () => void {
    this.serial.add(listener);
    return () => { this.serial.delete(listener); };
  }

  dispose(): void {
    this.pause();
    if (this.inputTimer !== undefined) clearTimeout(this.inputTimer);
    this.inputTimer = undefined;
    this.disposed = true;
    this._state = 'idle';
    this.frames.clear();
    this.serial.clear();
  }
}
