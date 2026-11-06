import type { SimFrame, SimInput, SimWarning, Wire } from '../core/types';
import { createSimulator } from './core';
import { compileSketch, CompileUnreachable } from './compileClient';
import { clearSerial, pushSerial } from './serial';
import { getState, scene, set, setInput as storeSetInput, subscribe, toast } from './store';

export const sim = createSimulator();
export const frameRef: { current: SimFrame | null } = { current: null };
const frameSubs = new Set<(f: SimFrame) => void>();
export const onSimFrame = (cb: (f: SimFrame) => void) => (frameSubs.add(cb), () => frameSubs.delete(cb));

let lastWarn = '';
let lastWarnAt = 0;
sim.onFrame((f) => {
  frameRef.current = f;
  frameSubs.forEach((cb) => cb(f));
  const now = performance.now();
  if (now - lastWarnAt > 250) {
    lastWarnAt = now;
    // warnings from an idle simulator (unused-pin noise) are not shown
    const warnings = sim.state === 'idle' ? [] : f.warnings;
    const key = warnings.map((w) => w.id).join('|');
    if (key !== lastWarn) {
      lastWarn = key;
      set({ simWarnings: warnings as SimWarning[] });
    }
  }
});
sim.onSerial(pushSerial);

/** The simulator failed (worker crash / bad command): leave the running state, say why in Korean, allow running again. */
let lastFailure = '';
function simFailed(raw: string) {
  const message = raw.startsWith('시뮬레이션 오류') ? raw : `시뮬레이션 오류: ${raw}`;
  if (message === lastFailure) return;
  lastFailure = message;
  // forget the compiled program so the next 실행 recompiles and reloads instead of resuming the broken run
  set({ simState: 'idle', compile: { status: 'idle' } });
  toast(message, 8000);
}
// Preferred: the core's state events. Fallback: the 'worker-error' warning the worker proxy injects into frames.
sim.onState?.((state, error) => {
  if (error) simFailed(error);
  else set({ simState: state });
});
sim.onFrame((f) => {
  const e = f.warnings.find((w) => w.id === 'worker-error');
  if (e) { if (sim.state !== 'idle') sim.stop(); simFailed(e.message); }
});

// keep the simulator's circuit in step with the document
let prev: unknown[] = [];
/** Bend points are purely visual: dragging them must not rebuild the simulated circuit. */
const sameCircuit = (a: Wire[], b: Wire[]) =>
  a === b || (a.length === b.length && a.every((w, i) => { const v = b[i]!; return w.id === v.id && w.from === v.from && w.to === v.to; }));
const syncScene = () => {
  const s = getState();
  const doc = s.hist.present;
  if (prev[0] === doc && prev[1] === s.code) return;
  const old = prev[0] as typeof doc | undefined;
  const bendsOnly = !!old && old.parts === doc.parts && prev[1] === s.code && sameCircuit(old.wires, doc.wires);
  prev = [doc, s.code];
  if (bendsOnly) return;
  try {
    sim.setScene(scene(s));
  } catch (e) {
    toast(`시뮬레이터에 회로를 전달하지 못했어요: ${e instanceof Error ? e.message : String(e)}`);
  }
};
subscribe(syncScene);
syncScene();

export function setSimInput(partId: string, key: SimInput['key'], value: number | boolean) {
  storeSetInput(partId, key, value);
  sim.setInput({ partId, key, value });
}

const syncState = () => set({ simState: sim.state });
let abort: AbortController | null = null;

export async function run() {
  const s = getState();
  if (s.compile.status === 'compiling') return;
  if (sim.state === 'paused' && s.compile.compiledCode === s.code) {
    sim.start();
    return syncState();
  }
  if (sim.state === 'running' && s.compile.compiledCode === s.code) return;
  lastFailure = '';
  abort = new AbortController();
  set({ compile: { status: 'compiling' } });
  const code = s.code;
  try {
    const r = await compileSketch(code, abort.signal);
    // decision: do not silently recompile (compile is rate limited and the user may still be typing); ask for a new run
    if (getState().code !== code) {
      set({ compile: { status: 'idle' } });
      toast('코드가 바뀌었어요. 다시 실행해 주세요.');
      return;
    }
    if (!r.ok) {
      const msg = r.reason === 'busy' ? '컴파일 서버가 바빠요. 잠시 후 다시 시도해 주세요.'
        : r.reason === 'rate-limited' ? '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.'
        : r.reason === 'timeout' ? '컴파일 시간이 너무 오래 걸려요. 코드를 줄여 보세요.'
        : r.reason === 'rejected' ? '허용되지 않는 코드가 있어요. #include 목록을 확인해 보세요.'
        : `컴파일 오류 ${r.errors.length}개`;
      set({ compile: { status: 'error', message: msg, errors: r.errors }, sideTab: 'code', sideOpen: true, sheetOpen: true });
      return;
    }
    clearSerial();
    sim.loadHex(r.hex);
    sim.start();
    set({ compile: { status: 'ok', compiledCode: code, errors: [] } });
    syncState();
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') set({ compile: { status: 'idle' } });
    else set({ compile: { status: 'error', message: e instanceof CompileUnreachable ? e.message : '컴파일 중 알 수 없는 오류가 났어요.' } });
    if (!(e instanceof DOMException)) toast(getState().compile.message ?? '');
  } finally {
    abort = null;
  }
}
export const cancelCompile = () => abort?.abort();
export function pause() {
  sim.pause();
  syncState();
}
export function stop() {
  cancelCompile();
  sim.stop();
  set({ inputs: {}, simWarnings: [] });
  lastWarn = '';
  syncState();
}
export function reset() {
  clearSerial();
  sim.reset();
  syncState();
}
export function setSpeed(v: number) {
  sim.setSpeed(v);
  set({ speed: v });
}
