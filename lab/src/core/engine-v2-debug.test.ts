import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimulationEngine } from './engine';
import { LocalSimulator, createSimulator } from './simulator';
import { wordsToHex } from './mcu/hex';
import type { DebugInfo, Scene } from './types';

const program = wordsToHex([0xd002, 0x0000, 0xcfff, 0x0000, 0x9508]);
const info: DebugInfo = { lines: [
  { addr: 0, line: 1 }, { addr: 2, line: 2 }, { addr: 4, line: 3 },
  { addr: 6, line: 4 }, { addr: 8, line: 5 },
], globals: [] };
const scene: Scene = { version: 2, parts: [], wires: [], code: '' };

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('debugger engine integration', () => {
  it('shows breakpoint state in a real frame and resumes by source line', () => {
    const engine = new SimulationEngine();
    engine.setScene(scene);
    engine.loadHex(program);
    engine.mcu.cpu.SP = 0x8ff;
    engine.mcu.debugger.load(info);
    engine.mcu.debugger.setBreakpoints([1]);
    const stopped = engine.step(1000);
    expect(stopped.debug).toMatchObject({ paused: true, line: 1, reason: 'breakpoint' });
    expect(engine.mcu.cpu.pc).toBe(0);
    engine.mcu.debugger.stepOver(engine.mcu.cpu);
    const stepped = engine.step(1000);
    expect(stepped.debug).toMatchObject({ paused: true, line: 2, reason: 'step' });
    expect(engine.mcu.cpu.pc).toBe(1);
  });

  it('retains breakpoint mapping when the engine resets the same HEX', () => {
    const engine = new SimulationEngine();
    engine.setScene(scene);
    engine.loadHex(program);
    engine.mcu.debugger.load(info);
    engine.mcu.debugger.setBreakpoints([1]);
    engine.reset();
    expect(engine.step(100).debug).toMatchObject({ paused: true, line: 1, reason: 'breakpoint' });
  });

  it('local simulator transitions to paused and continue runs the AVR', () => {
    vi.useFakeTimers();
    const sim = new LocalSimulator();
    const frames: NonNullable<ReturnType<SimulationEngine['frame']>['debug']>[] = [];
    sim.onFrame(frame => { if (frame.debug) frames.push(frame.debug); });
    sim.setScene(scene);
    sim.loadHex(program);
    sim.debug.load(info);
    sim.debug.setBreakpoints([1]);
    sim.start();
    vi.advanceTimersByTime(1);
    expect(sim.state).toBe('paused');
    expect(frames.at(-1)).toMatchObject({ paused: true, line: 1, reason: 'breakpoint' });
    sim.debug.stepOver();
    vi.advanceTimersByTime(1);
    expect(sim.state).toBe('paused');
    expect(frames.at(-1)).toMatchObject({ paused: true, line: 2, reason: 'step' });
    sim.debug.continue();
    vi.advanceTimersByTime(1);
    expect(frames.at(-1)?.paused).toBe(false);
    sim.dispose();
  });

  it('transports debug commands and restores info and breakpoints after worker recovery', () => {
    let worker: MockWorker;
    class MockWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      postMessage = vi.fn();
      terminate = vi.fn();
      constructor() { worker = this; }
    }
    vi.stubGlobal('Worker', MockWorker);
    const sim = createSimulator();
    sim.setScene(scene);
    sim.loadHex(program);
    sim.debug!.load(info);
    sim.debug!.setBreakpoints([1]);
    sim.start();
    expect(worker!.postMessage.mock.calls.map(([command]) => command.method)).toEqual([
      'setScene', 'loadHex', 'debugLoad', 'debugBreakpoints', 'start',
    ]);
    worker!.onmessage!({ data: { type: 'frame', value: {
      timeMs: 0, realtimeRatio: 0, pins: {}, parts: {}, netVolts: {}, warnings: [], debug: { paused: true, line: 1, reason: 'breakpoint' },
    } } } as MessageEvent);
    expect(sim.state).toBe('paused');
    sim.debug!.stepInto();
    expect(worker!.postMessage).toHaveBeenLastCalledWith({ method: 'debugStepInto' });
    worker!.onerror!({ message: 'lost', preventDefault: vi.fn() } as unknown as ErrorEvent);
    sim.start();
    expect(worker!.postMessage.mock.calls.map(([command]) => command.method)).toEqual([
      'setScene', 'loadHex', 'debugLoad', 'debugBreakpoints', 'setSpeed', 'start',
    ]);
    sim.dispose();
  });
});
