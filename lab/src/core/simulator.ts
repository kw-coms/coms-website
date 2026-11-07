import type { Analysis, DebugInfo, Scene, SimFrame, SimInput, Simulator } from './types';
import { analyze } from './analyze';
import { validateScene } from './scene';
import { loadIntelHex } from './mcu';
import { PARTS } from './parts';
import { LocalSimulator } from './local-simulator';

export type Command =
  | { method: 'setScene'; value: Scene }
  | { method: 'loadHex' | 'writeSerial'; value: string }
  | { method: 'setInput'; value: SimInput }
  | { method: 'setSpeed'; value: number }
  | { method: 'debugLoad'; value: DebugInfo }
  | { method: 'debugBreakpoints'; value: number[] }
  | { method: 'debugContinue' | 'debugStepInto' | 'debugStepOver' | 'debugStepOut' }
  | { method: 'start' | 'pause' | 'stop' | 'reset' | 'dispose' };

export type Event =
  | { type: 'frame'; value: SimFrame }
  | { type: 'serial'; value: string }
  | { type: 'error'; value: string };

export { LocalSimulator } from './local-simulator';

class WorkerSimulator implements Simulator {
  private worker!: Worker;
  private frames = new Set<(frame: SimFrame) => void>();
  private serial = new Set<(text: string) => void>();
  private states = new Set<(state: Simulator['state'], error?: string) => void>();
  private _state: Simulator['state'] = 'idle';
  private failed = false;
  private disposed = false;
  private hex: string | undefined;
  private debugInfo?: DebugInfo;
  private debugLines: number[] = [];
  private speed = 1;
  private inputs = new Map<string, SimInput>();
  private scene: Scene = { version: 1, parts: [], wires: [], code: '' };
  private lastFrame: SimFrame = {
    timeMs: 0, realtimeRatio: 0, pins: {}, parts: {}, netVolts: {}, warnings: [],
  };

  get state(): Simulator['state'] {
    return this._state;
  }

  readonly debug = {
    load: (info: DebugInfo): void => { this.debugInfo = info; this.send({ method: 'debugLoad', value: info }); },
    setBreakpoints: (lines: number[]): void => { this.debugLines = [...lines]; this.send({ method: 'debugBreakpoints', value: lines }); },
    continue: (): void => { this.send({ method: 'debugContinue' }); this.transition('running'); },
    stepInto: (): void => { this.send({ method: 'debugStepInto' }); this.transition('running'); },
    stepOver: (): void => { this.send({ method: 'debugStepOver' }); this.transition('running'); },
    stepOut: (): void => { this.send({ method: 'debugStepOut' }); this.transition('running'); },
  };

  constructor() {
    this.createWorker();
  }

  private transition(state: Simulator['state'], error?: string): void {
    if (this._state === state && !error) return;
    this._state = state;
    for (const listener of this.states) listener(state, error);
  }

  private createWorker(): void {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onerror = event => {
      event.preventDefault();
      this.fail(event.message || '워커 실행 오류');
    };
    this.worker.onmessageerror = () => this.fail('워커 메시지를 읽을 수 없습니다.');
    this.worker.onmessage = (event: MessageEvent<Event>) => {
      const message = event.data;
      if (message.type === 'frame') {
        this.lastFrame = message.value;
        for (const listener of this.frames) listener(message.value);
        if (message.value.debug?.paused) this.transition('paused');
      } else if (message.type === 'serial') {
        for (const listener of this.serial) listener(message.value);
      } else {
        this.fail(message.value);
      }
    };
  }

  private fail(message: string): void {
    if (this.failed || this.disposed) return;
    this.failed = true;
    this.worker.terminate();
    const error = `시뮬레이션 오류: ${message}`;
    this.transition('idle', error);
    const frame: SimFrame = {
      ...this.lastFrame,
      warnings: [...this.lastFrame.warnings, {
        id: 'worker-error', level: 'error', message: error,
      }],
    };
    for (const listener of this.frames) listener(frame);
  }

  private send(command: Command): void {
    if (this.failed) return;
    try {
      this.worker.postMessage(command);
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  setScene(scene: Scene): Analysis {
    const valid = validateScene(scene);
    const result = analyze(valid);
    this.send({ method: 'setScene', value: valid });
    this.scene = structuredClone(valid);
    this.inputs = new Map([...this.inputs].filter(([, value]) => {
      const part = valid.parts.find(candidate => candidate.id === value.partId);
      return !!part && !!PARTS[part.kind].inputs?.some(input => input.key === value.key);
    }));
    return result;
  }

  loadHex(hex: string): void {
    loadIntelHex(hex);
    this.send({ method: 'loadHex', value: hex });
    this.hex = hex;
  }

  start(): void {
    if (this.disposed) return;
    if (this.failed) {
      this.failed = false;
      try {
        this.createWorker();
        this.send({ method: 'setScene', value: this.scene });
        if (this.hex) this.send({ method: 'loadHex', value: this.hex });
        if (this.debugInfo) this.send({ method: 'debugLoad', value: this.debugInfo });
        if (this.debugLines.length) this.send({ method: 'debugBreakpoints', value: this.debugLines });
        this.send({ method: 'setSpeed', value: this.speed });
        for (const value of this.inputs.values()) this.send({ method: 'setInput', value });
      } catch (error) {
        this.fail(error instanceof Error ? error.message : String(error));
        return;
      }
    }
    this.send({ method: 'start' });
    if (!this.failed) this.transition('running');
  }

  pause(): void {
    if (this._state === 'running') this.transition('paused');
    this.send({ method: 'pause' });
  }

  stop(): void {
    this.transition('idle');
    this.send({ method: 'stop' });
  }

  reset(): void {
    this.send({ method: 'reset' });
  }

  setSpeed(value: number): void {
    if (!Number.isFinite(value)) throw new Error('속도가 올바르지 않습니다.');
    this.speed = Math.max(0.25, Math.min(2, value));
    this.send({ method: 'setSpeed', value: this.speed });
  }

  setInput(value: SimInput): void {
    const part = this.scene.parts.find(candidate => candidate.id === value.partId);
    const definition = part && PARTS[part.kind].inputs?.find(input => input.key === value.key);
    if (!definition) throw new Error('존재하지 않는 부품 입력입니다.');
    const invalidType = definition.type === 'momentary'
      ? typeof value.value !== 'boolean'
      : typeof value.value !== 'number' || !Number.isFinite(value.value);
    if (invalidType) throw new Error('입력값 형식이 올바르지 않습니다.');
    this.send({ method: 'setInput', value });
    this.inputs.set(`${value.partId}:${value.key}`, value);
  }

  writeSerial(value: string): void {
    this.send({ method: 'writeSerial', value });
  }

  onFrame(listener: (frame: SimFrame) => void): () => void {
    this.frames.add(listener);
    return () => { this.frames.delete(listener); };
  }

  onSerial(listener: (text: string) => void): () => void {
    this.serial.add(listener);
    return () => { this.serial.delete(listener); };
  }

  onState(listener: (state: Simulator['state'], error?: string) => void): () => void {
    this.states.add(listener);
    return () => { this.states.delete(listener); };
  }

  dispose(): void {
    this.worker.terminate();
    this.disposed = true;
    this.transition('idle');
    this.frames.clear();
    this.serial.clear();
    this.states.clear();
  }
}

export function createSimulator(): Simulator {
  if (typeof Worker === 'undefined') return new LocalSimulator();
  try {
    return new WorkerSimulator();
  } catch {
    return new LocalSimulator();
  }
}
