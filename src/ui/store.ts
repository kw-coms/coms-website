import { useSyncExternalStore } from 'react';
import type {
  Analysis, CompilerMessage, PartInstance, PartKind, PinRef, RotY, Scene, SimFrame, SimWarning, Vec3, Wire, WireColor,
} from '../core/types';
import { EXAMPLES, PARTS, analyze } from './core';
import { commit, initHistory, redo as redoH, undo as undoH, type History } from './history';
import { getItem, setItem } from './storage';

export type Selection = { kind: 'part' | 'wire'; id: string } | null;
export type SnapView = { ok: Vec3[]; bad: Vec3[] };
export type Theme = 'light' | 'dark';
export type DockTab = 'code' | 'serial' | 'plotter';
export type SideTab = 'props' | 'warnings' | 'bom';
export type MobileTab = 'view' | 'parts' | 'props' | 'code' | 'serial' | 'plotter';
export interface HoverInfo {
  ref: PinRef;
  netId?: string;
}
export interface CompileState {
  status: 'idle' | 'compiling' | 'ok' | 'error';
  message?: string;
  errors?: CompilerMessage[];
  compiledCode?: string;
}
type Doc = Omit<Scene, 'code'>;

export interface State {
  hist: History<Doc>;
  code: string;
  analysis: Analysis;
  selection: Selection;
  wireStart: PinRef | null;
  hover: HoverInfo | null;
  draft: { part: PartInstance; hideId?: string; snap: SnapView } | null;
  inputs: Record<string, Record<string, number | boolean>>;
  simState: 'idle' | 'running' | 'paused';
  speed: number;
  view: 'persp' | 'top';
  labels: boolean;
  theme: Theme;
  dockTab: DockTab;
  sideTab: SideTab;
  mobileTab: MobileTab;
  compile: CompileState;
  toast: string | null;
  simWarnings: SimWarning[];
  tutorial: boolean;
  examplesOpen: boolean;
  cameraResetTick: number;
}

const BLANK_CODE = `void setup() {\n  pinMode(13, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(13, HIGH);\n  delay(500);\n  digitalWrite(13, LOW);\n  delay(500);\n}\n`;
export const SAVE_KEY = 'coms-lab:scene:v1';
export const THEME_KEY = 'coms-lab:theme';
export const TUTORIAL_KEY = 'coms-lab:tutorial-done';

const toScene = (doc: Doc, code: string): Scene => ({ ...doc, version: 1, code });
const empty: Doc = { version: 1, parts: [], wires: [] } as unknown as Doc;

function initialTheme(): Theme {
  const saved = getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function startDoc(): { doc: Doc; code: string } {
  const raw = getItem(SAVE_KEY);
  if (raw) {
    try {
      const s = JSON.parse(raw) as Scene;
      if (s && s.version === 1 && Array.isArray(s.parts)) return { doc: { version: 1, title: s.title, parts: s.parts, wires: s.wires ?? [] } as Doc, code: s.code ?? BLANK_CODE };
    } catch {
      /* ignore corrupt autosave */
    }
  }
  const ex = EXAMPLES[0];
  if (ex) return { doc: { version: 1, title: ex.scene.title, parts: ex.scene.parts, wires: ex.scene.wires } as Doc, code: ex.scene.code };
  return { doc: empty, code: BLANK_CODE };
}

const first = startDoc();
let state: State = {
  hist: initHistory(first.doc),
  code: first.code,
  analysis: analyze(toScene(first.doc, first.code)),
  selection: null,
  wireStart: null,
  hover: null,
  draft: null,
  inputs: {},
  simState: 'idle',
  speed: 1,
  view: 'persp',
  labels: false,
  theme: initialTheme(),
  dockTab: 'code',
  sideTab: 'props',
  mobileTab: 'view',
  compile: { status: 'idle' },
  toast: null,
  simWarnings: [],
  tutorial: getItem(TUTORIAL_KEY) !== '1',
  examplesOpen: false,
  cameraResetTick: 0,
};

const listeners = new Set<() => void>();
export const getState = () => state;
export const subscribe = (cb: () => void) => (listeners.add(cb), () => listeners.delete(cb));
export function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state));
}

export const scene = (s: State = state): Scene => toScene(s.hist.present, s.code);
export const parts = (s: State = state) => s.hist.present.parts;
export const wires = (s: State = state) => s.hist.present.wires;
export const getPart = (id: string, s: State = state) => s.hist.present.parts.find((p) => p.id === id);

// ---------- document mutations (all go through history) ----------
function setDoc(doc: Doc, selection?: Selection) {
  const hist = commit(state.hist, doc);
  if (hist === state.hist) return;
  const analysis = analyze(toScene(doc, state.code));
  set({ hist, analysis, selection: selection === undefined ? validSel(state.selection, doc) : selection });
}
const validSel = (sel: Selection, doc: Doc): Selection =>
  !sel ? null : (sel.kind === 'part' ? doc.parts : doc.wires).some((x) => x.id === sel.id) ? sel : null;

function restoreHist(hist: History<Doc>) {
  set({ hist, analysis: analyze(toScene(hist.present, state.code)), selection: validSel(state.selection, hist.present), wireStart: null, draft: null });
}
export const undo = () => restoreHist(undoH(state.hist));
export const redo = () => restoreHist(redoH(state.hist));
export const canUndo = (s: State) => s.hist.past.length > 0;
export const canRedo = (s: State) => s.hist.future.length > 0;

export function setCode(code: string) {
  set({ code });
}

function nextId(prefix: string, taken: { id: string }[]): string {
  const ids = new Set(taken.map((t) => t.id));
  for (let i = 1; ; i++) if (!ids.has(`${prefix}${i}`)) return `${prefix}${i}`;
}
export const defaultProps = (kind: PartKind) =>
  Object.fromEntries((PARTS[kind]?.props ?? []).map((p) => [p.key, p.default])) as PartInstance['props'];

export function addPart(kind: PartKind, pos: Vec3, rotY: RotY = 0, props?: PartInstance['props']): string {
  const id = nextId(`${kind.replace(/[^a-z0-9]/g, '')}-`, parts());
  const part: PartInstance = { id, kind, pos, rotY, props: { ...defaultProps(kind), ...props } };
  setDoc({ ...state.hist.present, parts: [...parts(), part] }, { kind: 'part', id });
  return id;
}
/** Replace several parts at once (move/rotate), one history step. */
export function updateParts(next: PartInstance[], extra?: Partial<Doc>) {
  const map = new Map(next.map((p) => [p.id, p]));
  setDoc({ ...state.hist.present, ...extra, parts: parts().map((p) => map.get(p.id) ?? p) });
}
export function setProp(partId: string, key: string, value: number | string | boolean) {
  const p = getPart(partId);
  if (p) updateParts([{ ...p, props: { ...p.props, [key]: value } }]);
}
export function deleteSelection() {
  const sel = state.selection;
  if (!sel) return;
  const doc = state.hist.present;
  if (sel.kind === 'part')
    setDoc({ ...doc, parts: doc.parts.filter((p) => p.id !== sel.id), wires: doc.wires.filter((w) => w.from.partId !== sel.id && w.to.partId !== sel.id) }, null);
  else setDoc({ ...doc, wires: doc.wires.filter((w) => w.id !== sel.id) }, null);
}
export function rotateSelection() {
  const sel = state.selection;
  const p = sel?.kind === 'part' ? getPart(sel.id) : undefined;
  if (p) updateParts([{ ...p, rotY: (((p.rotY + 90) % 360) as RotY) }]);
}
export function duplicateSelection() {
  const sel = state.selection;
  const p = sel?.kind === 'part' ? getPart(sel.id) : undefined;
  if (!p) return;
  addPart(p.kind, [p.pos[0] + 12.7, p.pos[1], p.pos[2] + 12.7], p.rotY, { ...p.props });
}
let clipboard: PartInstance | null = null;
export function copySelection() {
  const sel = state.selection;
  const p = sel?.kind === 'part' ? getPart(sel.id) : undefined;
  if (p) clipboard = p;
}
export function paste() {
  if (clipboard) addPart(clipboard.kind, [clipboard.pos[0] + 12.7, clipboard.pos[1], clipboard.pos[2] + 12.7], clipboard.rotY, { ...clipboard.props });
}

const PALETTE: WireColor[] = ['blue', 'green', 'yellow', 'orange', 'purple', 'white', 'gray'];
export const WIRE_COLORS: { id: WireColor; hex: string; label: string }[] = [
  { id: 'red', hex: '#e53935', label: '빨강' },
  { id: 'black', hex: '#2b2b2b', label: '검정' },
  { id: 'blue', hex: '#1e6fe8', label: '파랑' },
  { id: 'green', hex: '#2fa84f', label: '초록' },
  { id: 'yellow', hex: '#f2c200', label: '노랑' },
  { id: 'orange', hex: '#f57c00', label: '주황' },
  { id: 'white', hex: '#eceff1', label: '흰색' },
  { id: 'purple', hex: '#8e44ad', label: '보라' },
  { id: 'gray', hex: '#8a949c', label: '회색' },
];
export const wireHex = (c: WireColor) => WIRE_COLORS.find((w) => w.id === c)?.hex ?? '#888';

function autoWireColor(a: PinRef, b: PinRef): WireColor {
  const net = (r: PinRef) => state.analysis.nets.find((n) => n.id === state.analysis.pinToNet[`${r.partId}:${r.pinId}`]);
  const names = [net(a)?.name, net(b)?.name, a.pinId, b.pinId];
  if (names.some((n) => n === '5V' || n === 'VIN' || n === '3V3')) return 'red';
  if (names.some((n) => n === 'GND' || (n ?? '').startsWith('GND'))) return 'black';
  return PALETTE[wires().length % PALETTE.length]!;
}
export function addWire(from: PinRef, to: PinRef) {
  if (from.partId === to.partId && from.pinId === to.pinId) return;
  const id = nextId('w', wires());
  const w: Wire = { id, from, to, color: autoWireColor(from, to) };
  setDoc({ ...state.hist.present, wires: [...wires(), w] }, { kind: 'wire', id });
}
export function updateWire(id: string, patch: Partial<Wire>) {
  setDoc({ ...state.hist.present, wires: wires().map((w) => (w.id === id ? { ...w, ...patch } : w)) });
}

export function loadScene(s: Scene, opts: { keepSim?: boolean } = {}) {
  const doc: Doc = { version: 1, title: s.title, parts: s.parts, wires: s.wires } as Doc;
  set({
    hist: initHistory(doc), code: s.code, analysis: analyze(s), selection: null, wireStart: null, draft: null, inputs: {},
    compile: { status: 'idle' }, simWarnings: [], cameraResetTick: state.cameraResetTick + 1,
  });
  void opts;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(message: string, ms = 4000) {
  set({ toast: message });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => set({ toast: null }), ms);
}

export function setInput(partId: string, key: string, value: number | boolean) {
  set({ inputs: { ...state.inputs, [partId]: { ...state.inputs[partId], [key]: value } } });
}
export function inputValue(s: State, partId: string, key: string, fallback: number | boolean): number | boolean {
  return s.inputs[partId]?.[key] ?? fallback;
}

// ---------- autosave ----------
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let lastSaved: unknown[] = [];
subscribe(() => {
  const cur = [state.hist.present, state.code];
  if (cur[0] === lastSaved[0] && cur[1] === lastSaved[1]) return;
  lastSaved = cur;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => setItem(SAVE_KEY, JSON.stringify(scene())), 600);
});

export type { SimFrame };

// ---------- live (non-history) edits finished by one history step, e.g. dragging wire bends ----------
export function liveWire(id: string, patch: Partial<Wire>) {
  const doc = state.hist.present;
  set({ hist: { ...state.hist, present: { ...doc, wires: doc.wires.map((w) => (w.id === id ? { ...w, ...patch } : w)) } } });
}
export const liveStart = () => state.hist.present;
export function liveEnd(start: Doc) {
  const final = state.hist.present;
  const base = { ...state.hist, present: start };
  const hist = commit(base, final);
  set({ hist, analysis: analyze(toScene(final, state.code)) });
}
