import { describe, expect, it } from 'vitest';
import type { Analysis, Scene, SimFrame, SimInput, Simulator } from '../core/types';
import { checkMission } from './runner';
import type { Mission } from './types';

const scene: Scene = { version: 2, parts: [], wires: [], code: '' };
const mission: Mission = {
  id: 'synthetic', title: '합성', story: '', goal: '', hints: [], requiredParts: [], allowedParts: [],
  starterScene: scene, referenceScene: scene, checker: [{ kind: 'run', ms: 1 }, { kind: 'expectSerial', includes: 'ok' }],
};

function fake(frames: SimFrame[], serialAt = -1, stateErrorAt = -1, serialEvents: Record<number, string[]> = {}) {
  const frameListeners = new Set<(frame: SimFrame) => void>();
  const serialListeners = new Set<(text: string) => void>();
  const stateListeners = new Set<(state: Simulator['state'], error?: string) => void>();
  const inputs: SimInput[] = [];
  let disposed = false;
  const simulator: Simulator = {
    state: 'idle',
    setScene: () => ({ nets: [], pinToNet: {}, insertions: {}, warnings: [] } as Analysis),
    loadHex: () => {},
    start: () => { frames.forEach((frame, i) => setTimeout(() => {
      if (disposed) return;
      for (const callback of frameListeners) callback(frame);
      if (i === serialAt) for (const callback of serialListeners) callback('25.0 C\n');
      for (const chunk of serialEvents[i] ?? []) for (const callback of serialListeners) callback(chunk);
      if (i === stateErrorAt) for (const callback of stateListeners) callback('idle', '고장');
    }, i + 1)); },
    pause: () => {}, stop: () => {}, reset: () => {}, setSpeed: () => {},
    setInput: value => { inputs.push(value); }, writeSerial: () => {},
    onFrame: callback => { frameListeners.add(callback); return () => { frameListeners.delete(callback); }; },
    onSerial: callback => { serialListeners.add(callback); return () => { serialListeners.delete(callback); }; },
    onState: callback => { stateListeners.add(callback); return () => { stateListeners.delete(callback); }; },
    dispose: () => { disposed = true; },
  };
  return { simulator, inputs, get disposed() { return disposed; } };
}

function frame(timeMs: number, brightness: number): SimFrame {
  return { timeMs, realtimeRatio: 1, pins: {
    D13: { mode: 'output', level: brightness ? 1 : 0, duty: brightness, freq: 1 },
  }, parts: { led1: { led: { brightness } } }, netVolts: {}, warnings: [] };
}

describe('mission checker', () => {
  it('checks observed output, pin, serial, transitions and input steps', async () => {
    const harness = fake([frame(0, 0), frame(100, 1), frame(200, 0), frame(300, 1)], 3);
    const result = await checkMission({ ...mission, checker: [
      { kind: 'setInput', partId: 'button', key: 'pressed', value: true },
      { kind: 'run', ms: 300 },
      { kind: 'expectTransitions', partId: 'led1', path: 'led.brightness', threshold: 0.5, minTransitions: 3, intervalMs: 100, tolerance: 0.2 },
      { kind: 'expectPart', partId: 'led1', path: 'led.brightness', op: 'gte', value: 0.5 },
      { kind: 'expectPin', pin: 'D13', field: 'level', op: 'eq', value: 1 },
      { kind: 'expectSerial', includes: '25.0 C' },
    ] }, scene, undefined, { simulatorFactory: () => harness.simulator });
    expect(result.passed).toBe(true);
    expect(harness.inputs).toEqual([{ partId: 'button', key: 'pressed', value: true }]);
    expect(harness.disposed).toBe(true);
  });

  it('rejects wrong interval and missing output', async () => {
    const harness = fake([frame(0, 0), frame(100, 1), frame(260, 0), frame(300, 1)]);
    const result = await checkMission({ ...mission, checker: [
      { kind: 'run', ms: 300 },
      { kind: 'expectTransitions', partId: 'led1', path: 'led.brightness', threshold: 0.5, minTransitions: 3, intervalMs: 100, tolerance: 0.2 },
    ] }, scene, undefined, { simulatorFactory: () => harness.simulator });
    expect(result).toMatchObject({ passed: false, step: 2 });
    expect(harness.disposed).toBe(true);
  });

  it('times out and disposes when no frames arrive', async () => {
    const harness = fake([]);
    const result = await checkMission({ ...mission, checker: [{ kind: 'run', ms: 100 }, { kind: 'expectSerial', includes: 'ok' }] }, scene, undefined,
      { simulatorFactory: () => harness.simulator, wallTimeoutMs: 5 });
    expect(result.passed).toBe(false);
    expect(harness.disposed).toBe(true);
  });

  it('checks required parts and compiled firmware before starting', async () => {
    const requiresUno = { ...mission, requiredParts: ['arduino-uno' as const], allowedParts: ['arduino-uno' as const] };
    expect((await checkMission(requiresUno, scene)).passed).toBe(false);
    const uno: Scene = { ...scene, parts: [{ id: 'uno', kind: 'arduino-uno', pos: [0, 0, 0], rotY: 0, props: {} }] };
    expect((await checkMission(requiresUno, uno)).message).toMatch(/컴파일/);
  });

  it('does not accept missing samples or a single edge for interval timing', async () => {
    const absent = fake([frame(0, 0), { ...frame(100, 1), parts: {} }, frame(200, 0)]);
    const checker = [{ kind: 'run' as const, ms: 200 }, { kind: 'expectTransitions' as const, partId: 'led1', path: 'led.brightness', threshold: 0.5, minTransitions: 1, intervalMs: 100 }];
    expect((await checkMission({ ...mission, checker }, scene, undefined, { simulatorFactory: () => absent.simulator })).passed).toBe(false);
    const oneEdge = fake([frame(0, 0), frame(100, 1), frame(200, 1)]);
    expect((await checkMission({ ...mission, checker }, scene, undefined, { simulatorFactory: () => oneEdge.simulator })).passed).toBe(false);
  });

  it('does not reuse serial text from a prior run', async () => {
    const harness = fake([frame(0, 0), frame(100, 0), frame(200, 0)], 1);
    const result = await checkMission({ ...mission, checker: [
      { kind: 'run', ms: 100 }, { kind: 'expectSerial', includes: '25.0 C' },
      { kind: 'run', ms: 100 }, { kind: 'expectSerial', includes: '25.0 C' },
    ] }, scene, undefined, { simulatorFactory: () => harness.simulator });
    expect(result).toMatchObject({ passed: false, step: 4 });
  });

  it('fails on frame warning or state error at the time target', async () => {
    const warning = fake([frame(0, 0), { ...frame(100, 1), warnings: [{ id: 'error', level: 'error', message: '고장' }] }]);
    expect((await checkMission({ ...mission, checker: [{ kind: 'run', ms: 100 }] }, scene, undefined,
      { simulatorFactory: () => warning.simulator })).passed).toBe(false);
    const state = fake([frame(0, 0), frame(100, 1)], -1, 1);
    expect((await checkMission({ ...mission, checker: [{ kind: 'run', ms: 100 }] }, scene, undefined,
      { simulatorFactory: () => state.simulator })).passed).toBe(false);
  });

  it('handles abort, analyzer/factory/setup failures and disposes acquired simulator', async () => {
    const abort = new AbortController(); abort.abort();
    let created = false;
    expect((await checkMission(mission, scene, undefined, { signal: abort.signal, simulatorFactory: () => { created = true; return fake([]).simulator; } })).passed).toBe(false);
    expect(created).toBe(false);
    expect((await checkMission(mission, scene, undefined, { analyzer: () => { throw Error('analysis failed'); } })).passed).toBe(false);
    expect((await checkMission(mission, scene, undefined, { simulatorFactory: () => { throw Error('factory failed'); } })).passed).toBe(false);
    const harness = fake([]);
    harness.simulator.setScene = () => { throw Error('setup failed'); };
    expect((await checkMission(mission, scene, undefined, { simulatorFactory: () => harness.simulator })).passed).toBe(false);
    expect(harness.disposed).toBe(true);
  });

  it('bounds total simulated duration before starting', async () => {
    const result = await checkMission({ ...mission, checker: [{ kind: 'run', ms: 30_000 }, { kind: 'run', ms: 30_000 }, { kind: 'run', ms: 1 }] }, scene);
    expect(result).toMatchObject({ passed: false, step: 0 });
  });

  it('parses a bounded number from newline-terminated serial chunks', async () => {
    const harness = fake([frame(0, 0), frame(100, 0)], -1, -1, { 1: ['TEMP:', '24.8', '\r\n'] });
    const result = await checkMission({ ...mission, checker: [
      { kind: 'run', ms: 100 }, { kind: 'expectSerialNumber', prefix: 'TEMP:', min: 23, max: 27 },
    ] }, scene, undefined, { simulatorFactory: () => harness.simulator });
    expect(result.passed).toBe(true);
  });

  it('rejects stale, incomplete, invalid and out-of-range serial numbers', async () => {
    const cases: { events: Record<number, string[]>; steps: { kind: 'run'; ms: number }[]; expectedStep: number }[] = [
      { events: { 1: ['TEMP:24.8\n'] }, steps: [{ kind: 'run' as const, ms: 100 }, { kind: 'run' as const, ms: 100 }], expectedStep: 3 },
      { events: { 2: ['TEMP:24.8'] }, steps: [{ kind: 'run' as const, ms: 200 }], expectedStep: 2 },
      { events: { 2: ['TEMP:NaN\n'] }, steps: [{ kind: 'run' as const, ms: 200 }], expectedStep: 2 },
      { events: { 2: ['TEMP:29.1\n'] }, steps: [{ kind: 'run' as const, ms: 200 }], expectedStep: 2 },
    ];
    for (const item of cases) {
      const harness = fake([frame(0, 0), frame(100, 0), frame(200, 0)], -1, -1, item.events);
      const result = await checkMission({ ...mission, checker: [...item.steps,
        { kind: 'expectSerialNumber', prefix: 'TEMP:', min: 23, max: 27 },
      ] }, scene, undefined, { simulatorFactory: () => harness.simulator });
      expect(result).toMatchObject({ passed: false, step: item.expectedStep });
    }
  });

  it('rejects a checker with no executable assertion', async () => {
    expect((await checkMission({ ...mission, checker: [] }, scene)).passed).toBe(false);
    expect((await checkMission({ ...mission, checker: [{ kind: 'run', ms: 10 }] }, scene)).passed).toBe(false);
  });

  it('checks separate high and low state durations', async () => {
    const samples = [frame(0, 0), frame(100, 1), frame(1100, 0), frame(2400, 1), frame(3400, 0), frame(4700, 1)];
    const spec = { kind: 'expectTransitions' as const, partId: 'led1', path: 'led.brightness', threshold: 0.5,
      minTransitions: 5, highMs: 1000, lowMs: 1300, tolerance: 0.2 };
    const good = fake(samples);
    expect((await checkMission({ ...mission, checker: [{ kind: 'run', ms: 4700 }, spec] }, scene, undefined,
      { simulatorFactory: () => good.simulator })).passed).toBe(true);
    const bad = fake([frame(0, 0), frame(100, 1), frame(700, 0), frame(2000, 1), frame(2600, 0), frame(3900, 1)]);
    expect((await checkMission({ ...mission, checker: [{ kind: 'run', ms: 3900 }, spec] }, scene, undefined,
      { simulatorFactory: () => bad.simulator })).passed).toBe(false);
  });
});
