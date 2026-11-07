import { analyze, createSimulator } from '../core';
import type { Scene, SimFrame, Simulator } from '../core/types';
import type { CheckerStep, Comparison, ExpectedValue, Mission, MissionResult } from './types';

const MAX_RUN_MS = 30_000;
const MAX_WALL_MS = 45_000;
const MAX_SERIAL = 4096;
const MAX_STEPS = 100;
const MAX_TOTAL_MS = 60_000;

function readPath(frame: SimFrame, partId: string, path: string): unknown {
  if (!/^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+){0,3}$/.test(path)) return undefined;
  return path.split('.').reduce<unknown>((value, key) =>
    value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined,
  frame.parts[partId]);
}

function compare(actual: unknown, op: Comparison, value: ExpectedValue, max?: number): boolean {
  if (op === 'eq') return actual === value;
  if (typeof actual !== 'number' || typeof value !== 'number' || !Number.isFinite(actual)) return false;
  if (op === 'gte') return actual >= value;
  if (op === 'lte') return actual <= value;
  return typeof max === 'number' && actual >= value && actual <= max;
}

function transitions(frames: SimFrame[], step: Extract<CheckerStep, { kind: 'expectTransitions' }>): boolean {
  const edges: { timeMs: number; high: boolean }[] = [];
  let previous: boolean | undefined;
  for (const frame of frames) {
    const value = readPath(frame, step.partId, step.path);
    if (typeof value !== 'number' || !Number.isFinite(value)) return false;
    const high = value >= step.threshold;
    if (previous !== undefined && high !== previous) edges.push({ timeMs: frame.timeMs, high });
    previous = high;
  }
  if (edges.length < step.minTransitions) return false;
  if (step.intervalMs === undefined && step.highMs === undefined && step.lowMs === undefined) return true;
  if (edges.length < 2) return false;
  const tolerance = step.tolerance ?? 0.2;
  if (!(tolerance >= 0 && tolerance < 1)) return false;
  const intervals = edges.slice(1).map((edge, i) => ({ duration: edge.timeMs - edges[i]!.timeMs, prior: edges[i]! }));
  const inRange = (actual: number, expected: number) => expected > 0 && actual >= expected * (1 - tolerance) && actual <= expected * (1 + tolerance);
  if (step.intervalMs !== undefined && !intervals.every(item => inRange(item.duration, step.intervalMs!))) return false;
  for (const [high, duration] of [[true, step.highMs], [false, step.lowMs]] as const) {
    if (duration === undefined) continue;
    const matching = intervals.filter(item => item.prior.high === high);
    if (!matching.length || !matching.every(item => inRange(item.duration, duration))) return false;
  }
  return true;
}

function serialNumberMatches(serial: string, prefix: string, min: number, max: number): boolean {
  if (!prefix || !Number.isFinite(min) || !Number.isFinite(max) || min > max) return false;
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  const complete = serial.slice(0, serial.lastIndexOf('\n') + 1);
  return complete.split('\n').some(line => {
    const clean = line.replace(/\r$/, '');
    if (!clean.startsWith(prefix)) return false;
    const token = clean.slice(prefix.length).trim();
    return decimal.test(token) && Number.isFinite(Number(token)) && Number(token) >= min && Number(token) <= max;
  });
}

/** Run the declarative checker using only the public simulator and analyzer APIs. */
export async function checkMission(
  mission: Mission,
  scene: Scene,
  hex?: string,
  options: { simulatorFactory?: () => Simulator; analyzer?: typeof analyze; signal?: AbortSignal; wallTimeoutMs?: number } = {},
): Promise<MissionResult> {
  const fail = (step: number, message: string): MissionResult => ({ passed: false, step, message });
  if (options.signal?.aborted) return fail(0, '검사가 취소되었습니다.');
  if (!mission.checker.some(step => step.kind === 'run') || !mission.checker.some(step => step.kind.startsWith('expect')))
    return fail(0, '실행과 판정 조건이 필요합니다.');
  if (mission.checker.length > MAX_STEPS || mission.checker.reduce((ms, step) => ms + (step.kind === 'run' ? step.ms : 0), 0) > MAX_TOTAL_MS)
    return fail(0, '검사 단계나 시간이 너무 깁니다.');
  const kinds = new Set(scene.parts.map(part => part.kind));
  for (const kind of mission.requiredParts) if (!kinds.has(kind)) return fail(0, `필수 부품이 없습니다: ${kind}`);
  const allowed = new Set(mission.allowedParts);
  for (const kind of kinds) if (!allowed.has(kind)) return fail(0, `허용되지 않은 부품입니다: ${kind}`);
  if (kinds.has('arduino-uno') && !hex) return fail(0, '컴파일된 코드가 필요합니다.');
  let simulator: Simulator | undefined;
  let latest: SimFrame | undefined;
  let runFrames: SimFrame[] = [];
  let runSerial = '';
  let stateError: string | undefined;
  const waiters = new Set<() => void>();
  const wake = () => { for (const waiter of waiters) waiter(); };
  let offFrame: (() => void) | undefined;
  let offSerial: (() => void) | undefined;
  let offState: (() => void) | undefined;
  const deadline = Date.now() + Math.min(options.wallTimeoutMs ?? MAX_WALL_MS, MAX_WALL_MS);
  try {
    const analysis = (options.analyzer ?? analyze)(scene);
    if (analysis.warnings.some(warning => warning.level === 'error')) return fail(0, '회로 오류를 해결해 주세요.');
    simulator = (options.simulatorFactory ?? createSimulator)();
    offFrame = simulator.onFrame(frame => {
      latest = frame;
      if (frame.warnings.some(warning => warning.level === 'error')) stateError = '시뮬레이션 오류를 해결해 주세요.';
      runFrames.push(frame); if (runFrames.length > 2000) runFrames.shift(); wake();
    });
    offSerial = simulator.onSerial(text => { runSerial = (runSerial + text).slice(-MAX_SERIAL); wake(); });
    offState = simulator.onState?.((_state, error) => { if (error) { stateError = error; wake(); } });
    simulator.setScene(scene);
    if (hex) simulator.loadHex(hex);
    simulator.start();
    for (let i = 0; i < mission.checker.length; i++) {
      if (options.signal?.aborted) return fail(i + 1, '검사가 취소되었습니다.');
      const step = mission.checker[i]!;
      if (step.kind === 'setInput') { simulator.setInput({ partId: step.partId, key: step.key, value: step.value }); continue; }
      if (step.kind === 'run') {
        if (!(step.ms > 0 && step.ms <= MAX_RUN_MS)) return fail(i + 1, '실행 시간이 올바르지 않습니다.');
        const base = latest?.timeMs ?? 0;
        runFrames = latest ? [latest] : [];
        runSerial = '';
        while (!latest || latest.timeMs < base + step.ms) {
          if (stateError) return fail(i + 1, stateError);
          if (options.signal?.aborted) return fail(i + 1, '검사가 취소되었습니다.');
          const remaining = deadline - Date.now();
          if (remaining <= 0) return fail(i + 1, '시뮬레이션 시간이 초과되었습니다.');
          await new Promise<void>(resolve => {
            const timer = setTimeout(done, Math.min(remaining, 100));
            const onAbort = () => done();
            function done() { clearTimeout(timer); options.signal?.removeEventListener('abort', onAbort); waiters.delete(done); resolve(); }
            waiters.add(done);
            options.signal?.addEventListener('abort', onAbort, { once: true });
          });
        }
        if (stateError) return fail(i + 1, stateError);
        continue;
      }
      if (stateError) return fail(i + 1, stateError);
      if (!latest) return fail(i + 1, '시뮬레이션 프레임이 없습니다.');
      let passed = false;
      if (step.kind === 'expectPart') passed = compare(readPath(latest, step.partId, step.path), step.op, step.value, step.max);
      else if (step.kind === 'expectPin') passed = compare(latest.pins[step.pin]?.[step.field], step.op, step.value, step.max);
      else if (step.kind === 'expectSerial') passed = runSerial.includes(step.includes);
      else if (step.kind === 'expectSerialNumber') passed = serialNumberMatches(runSerial, step.prefix, step.min, step.max);
      else if (step.kind === 'expectTransitions') passed = transitions(runFrames, step);
      if (!passed) return fail(i + 1, `${i + 1}번째 조건을 만족하지 못했습니다.`);
    }
    return { passed: true, step: mission.checker.length, message: '미션을 완료했습니다.' };
  } catch (error) {
    return fail(0, error instanceof Error ? error.message : '검사를 실행하지 못했습니다.');
  } finally {
    offFrame?.(); offSerial?.(); offState?.(); simulator?.dispose();
  }
}
