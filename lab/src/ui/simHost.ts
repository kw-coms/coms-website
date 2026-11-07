import type { SimFrame, SimInput, SimWarning } from '../core/types';
import { createSimulator } from './core';
import { sameCircuit } from '../core/scene';
import { compileSketch, CompileUnreachable } from './compileClient';
import { createBeeper, continuityHolds } from './beep';
import { clearSerial, pushSerial } from './serial';
import { getState, onSceneLoaded, scene, set, setInput as storeSetInput, subscribe, toast } from './store';

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

// multimeter continuity beep: only while the simulation runs, unmuted, and a meter in continuity mode has a closed path
const beeper = createBeeper();
sim.onFrame((f) => beeper.set(sim.state === 'running' && !getState().beepMuted && continuityHolds(f)));
subscribe(() => { if (getState().simState !== 'running' || getState().beepMuted) beeper.set(false); });

// debugger state from frames (paused line, globals): only the store re-renders when it actually changes
let lastDebug = '';
sim.onFrame((f) => {
  const key = f.debug ? `${f.debug.paused}|${f.debug.line}|${f.debug.reason}|${JSON.stringify(f.debug.globals)}` : '';
  if (key === lastDebug) return;
  lastDebug = key;
  set({ debug: f.debug ?? null });
});

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
const syncScene = () => {
  const s = getState();
  const doc = s.hist.present;
  if (prev[0] === doc && prev[1] === s.code) return;
  const old = prev[0] as typeof doc | undefined;
  const visualOnly = !!old && prev[1] === s.code && sameCircuit(old, doc);
  prev = [doc, s.code];
  if (visualOnly) return;
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
/** The loaded program was built with debug info (breakpoints only work then). */
let compiledWithDebug = false;
/** Sketch lines that have machine code (from the last debug build); null until a debug build exists. */
let codeLines: number[] | null = null;
/** Forget the previous program's line table: breakpoints must never snap to another sketch's lines. */
function forgetProgram() {
  compiledWithDebug = false;
  codeLines = null;
  set({ debugTruncated: false });
}
onSceneLoaded(forgetProgram);
/** Snap a requested line to the next line with code (like VS Code); null when no later line has code. */
function snapLine(line: number): number | null {
  if (!codeLines) return line;
  return codeLines.find((l) => l >= line) ?? null;
}
function resnap() {
  const cur = getState().breakpoints;
  const next = [...new Set(cur.map(snapLine).filter((l): l is number => l !== null))].sort((a, b) => a - b);
  if (next.join() !== cur.join()) {
    set({ breakpoints: next });
    toast('코드가 없는 줄의 중단점은 다음 코드 줄로 옮겼어요.');
  }
}

export async function run() {
  const s = getState();
  if (s.compile.status === 'compiling') return;
  if (sim.state === 'paused' && s.compile.compiledCode === s.code && (compiledWithDebug || !s.breakpoints.length)) {
    // through the debugger: it clears its paused flag and steps over the breakpoint it stopped on (a bare start() stays frozen)
    if (sim.debug) sim.debug.continue(); else sim.start();
    return syncState();
  }
  if (sim.state === 'running' && s.compile.compiledCode === s.code && (compiledWithDebug || !s.breakpoints.length)) return;
  lastFailure = '';
  abort = new AbortController();
  set({ compile: { status: 'compiling' } });
  const code = s.code;
  try {
    const debugging = getState().breakpoints.length > 0;
    const r = await compileSketch(code, abort.signal, undefined, debugging);
    // decision: do not silently recompile (compile is rate limited and the user may still be typing); ask for a new run
    if (getState().code !== code) {
      set({ compile: { status: 'idle' } });
      toast('코드가 바뀌었어요. 다시 실행해 주세요.');
      return;
    }
    if (!r.ok) {
      const msg = r.reason === 'unauthorized' ? '로그인한 동아리원만 컴파일할 수 있어요.'
        : r.reason === 'busy' ? '컴파일 서버가 바빠요. 잠시 후 다시 시도해 주세요.'
        : r.reason === 'rate-limited' ? '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.'
        : r.reason === 'timeout' ? '컴파일 시간이 너무 오래 걸려요. 코드를 줄여 보세요.'
        : r.reason === 'rejected' ? '허용되지 않는 코드가 있어요. #include 목록을 확인해 보세요.'
        : `컴파일 오류 ${r.errors.length}개`;
      set({ compile: { status: 'error', message: msg, errors: r.reason === 'unauthorized' ? [] : r.errors, needsLogin: r.reason === 'unauthorized' }, sideTab: 'code', sideOpen: true, sheetOpen: true });
      return;
    }
    clearSerial();
    sim.loadHex(r.hex);
    compiledWithDebug = !!r.debug;
    set({ debugTruncated: r.debug?.truncated === true });
    if (!r.debug) codeLines = null;
    if (r.debug) { codeLines = [...new Set(r.debug.lines.map((l) => l.line))].sort((a, b) => a - b); resnap(); }
    if (r.debug) sim.debug?.load(r.debug);
    sim.debug?.setBreakpoints(getState().breakpoints);
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
  beeper.set(false);
  forgetProgram();
  set({ inputs: {}, simWarnings: [], debug: null });
  lastWarn = '';
  syncState();
}
export function reset() {
  clearSerial();
  sim.reset();
  syncState();
}
// ---------- debugger ----------
/** Toggle a breakpoint on a sketch line; takes effect immediately in a running debug session, else on the next 실행. */
export function toggleBreakpoint(requested: number) {
  const cur = getState().breakpoints;
  let line = requested;
  if (!cur.includes(requested)) {
    const snapped = snapLine(requested);
    if (snapped === null) return toast(`${requested}번 줄 뒤에는 실행되는 코드가 없어서 중단점을 찍을 수 없어요.`);
    if (snapped !== requested) toast(`${requested}번 줄에는 코드가 없어 ${snapped}번 줄로 옮겼어요.`);
    line = snapped;
  }
  const next = cur.includes(line) ? cur.filter((l) => l !== line) : [...cur, line].sort((a, b) => a - b);
  set({ breakpoints: next });
  sim.debug?.setBreakpoints(next);
  if (next.length && sim.state !== 'idle' && !compiledWithDebug) toast('중단점은 다시 실행할 때 적용돼요. 정지 후 실행을 눌러 주세요.');
}
export function clearBreakpoints() {
  set({ breakpoints: [] });
  sim.debug?.setBreakpoints([]);
}
export const debugContinue = () => { sim.debug?.continue(); syncState(); };
export const debugStepOver = () => sim.debug?.stepOver();
export const debugStepInto = () => sim.debug?.stepInto();
export const debugStepOut = () => sim.debug?.stepOut();

export function setSpeed(v: number) {
  sim.setSpeed(v);
  set({ speed: v });
}
