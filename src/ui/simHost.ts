import type { SimFrame, SimInput, SimWarning } from '../core/types';
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

// keep the simulator's circuit in step with the document
let prev: unknown[] = [];
const syncScene = () => {
  const s = getState();
  if (prev[0] === s.hist.present && prev[1] === s.code) return;
  prev = [s.hist.present, s.code];
  sim.setScene(scene(s));
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
  abort = new AbortController();
  set({ compile: { status: 'compiling' } });
  try {
    const r = await compileSketch(s.code, abort.signal);
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
    set({ compile: { status: 'ok', compiledCode: s.code, errors: [] } });
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
