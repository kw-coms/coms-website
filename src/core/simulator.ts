import type { Analysis, Scene, SimFrame, SimInput, Simulator } from './types';
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
  | { method: 'start' | 'pause' | 'stop' | 'reset' | 'dispose' };

export type Event =
  | { type: 'frame'; value: SimFrame }
  | { type: 'serial'; value: string }
  | { type: 'error'; value: string };

export { LocalSimulator } from './local-simulator';

class WorkerSimulator implements Simulator {
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private frames = new Set<(frame: SimFrame) => void>();
  private serial = new Set<(text: string) => void>();
  private _state: Simulator['state'] = 'idle';
  private scene: Scene = { version: 1, parts: [], wires: [], code: '' };
  private lastFrame: SimFrame = {
    timeMs: 0, realtimeRatio: 0, pins: {}, parts: {}, netVolts: {}, warnings: [],
  };

  get state(): Simulator['state'] {
    return this._state;
  }

  constructor() {
    this.worker.onerror = event => {
      event.preventDefault();
      this.fail(event.message || '워커 실행 오류');
    };
    this.worker.onmessage = (event: MessageEvent<Event>) => {
      const message = event.data;
      if (message.type === 'frame') {
        this.lastFrame = message.value;
        for (const listener of this.frames) listener(message.value);
      } else if (message.type === 'serial') {
        for (const listener of this.serial) listener(message.value);
      } else {
        this.fail(message.value);
      }
    };
  }

  private fail(message: string): void {
    this._state = 'paused';
    const frame: SimFrame = {
      ...this.lastFrame,
      warnings: [...this.lastFrame.warnings, {
        id: 'worker-error', level: 'error', message: `시뮬레이션 오류: ${message}`,
      }],
    };
    for (const listener of this.frames) listener(frame);
  }

  private send(command: Command): void {
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
    return result;
  }

  loadHex(hex: string): void {
    loadIntelHex(hex);
    this.send({ method: 'loadHex', value: hex });
  }

  start(): void {
    this._state = 'running';
    this.send({ method: 'start' });
  }

  pause(): void {
    if (this._state === 'running') this._state = 'paused';
    this.send({ method: 'pause' });
  }

  stop(): void {
    this._state = 'idle';
    this.send({ method: 'stop' });
  }

  reset(): void {
    this.send({ method: 'reset' });
  }

  setSpeed(value: number): void {
    if (!Number.isFinite(value)) throw new Error('속도가 올바르지 않습니다.');
    this.send({ method: 'setSpeed', value: Math.max(0.25, Math.min(2, value)) });
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

  dispose(): void {
    this.worker.terminate();
    this._state = 'idle';
    this.frames.clear();
    this.serial.clear();
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
