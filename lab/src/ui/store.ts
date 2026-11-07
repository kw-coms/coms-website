import { useSyncExternalStore } from 'react';
import type {
  Analysis, CodeMode, CompilerMessage, DebugState, Note, PartInstance, PartKind, PinRef, RotY, Scene, SimFrame, SimWarning, Vec3, Wire, WireColor,
} from '../core/types';
import { EXAMPLES, PARTS, analyze, validateScene } from './core';
import { commit, initHistory, redo as redoH, undo as undoH, type History } from './history';
import { getItem, setItem } from './storage';
import { DEFAULT_BLOCKS } from './blocks/starters';
import { sceneContext } from './blocks/context';
import { generate } from './blocks/generate';
import { detectSoftwareRendering, initialQuality, loadQualityMode, saveQualityMode, type Quality, type QualityMode } from './quality';

export type Selection = { kind: 'part' | 'wire'; id: string } | null;
export type SnapView = { ok: Vec3[]; bad: Vec3[] };
export type Theme = 'light' | 'dark';
export type SerialTab = 'serial' | 'plotter';
export type SideTab = 'parts' | 'code' | 'props' | 'warnings' | 'bom' | 'instruments' | 'missions';
export type ScopeUi = { timePerDiv: number; voltsPerDiv: [number, number]; trigger: number; run: boolean; cursors: boolean; c1: number; c2: number };
export type InstUi = { floating?: boolean; x?: number; y?: number; scope?: Partial<ScopeUi>; logic?: { spanMs?: number; run?: boolean } };
export interface CtxMenu {
  x: number;
  y: number;
  target: { kind: 'part' | 'wire'; id: string } | { kind: 'bend'; id: string; index: number };
}
export interface HoverInfo {
  ref: PinRef;
  netId?: string;
}
export interface CompileState {
  status: 'idle' | 'compiling' | 'ok' | 'error';
  message?: string;
  errors?: CompilerMessage[];
  compiledCode?: string;
  needsLogin?: boolean; // the compile was refused for lack of a session: offer the site's login
}
type Doc = Omit<Scene, 'code'>;

export interface State {
  hist: History<Doc>;
  code: string;
  analysis: Analysis;
  selection: Selection;
  /** All selected part ids when more than one part is selected (includes the primary selection). */
  multi: string[];
  marquee: { x0: number; y0: number; x1: number; y1: number } | null;
  ctx: CtxMenu | null;
  wireStart: PinRef | null;
  hover: HoverInfo | null;
  draft: { part: PartInstance; hideId?: string; snap: SnapView; extra?: PartInstance[]; hideIds?: string[] } | null;
  inputs: Record<string, Record<string, number | boolean>>;
  simState: 'idle' | 'running' | 'paused';
  speed: number;
  view: 'persp' | 'top';
  labels: boolean;
  theme: Theme;
  sideTab: SideTab;
  sideOpen: boolean;
  sideWidth: number;
  sheetOpen: boolean;
  serialTab: SerialTab;
  serialOpen: boolean;
  serialH: number;
  paletteCollapsed: boolean;
  compile: CompileState;
  toast: string | null;
  simWarnings: SimWarning[];
  tutorial: boolean;
  examplesOpen: boolean;
  cameraResetTick: number;
  qualityMode: QualityMode;
  quality: Quality;
  /** Message shown once when auto-quality fell back to low (acceleration seems off). */
  qualityNotice: string | null;
  /** The autosave could not be read; a raw backup copy was kept (see BACKUP_KEY). */
  restoreNotice: boolean;
  // ---- v2 ----
  /** Sketch lines (1-based) with a debugger breakpoint. */
  breakpoints: number[];
  /** Latest debugger state from the simulator (paused line, globals). */
  debug: DebugState | null;
  /** The last debug build could not map every sketch line (compiler reported debug.truncated). */
  debugTruncated: boolean;
  /** Per-instrument panel UI state (scope knobs, floating window position). */
  instUi: Record<string, InstUi>;
  /** Part whose Korean info popup is open. */
  info: PartKind | null;
  /** The 2D schematic view replaces the 3D stage. */
  schematic: boolean;
  /** Mission being worked on (list when null) and saved progress. */
  missionId: string | null;
  missionProgress: Record<string, MissionProgress>;
  /** Note being edited in place. */
  editingNote: string | null;
}
export interface MissionProgress {
  done: boolean;
  checks?: { id?: string; label?: string; ok: boolean; message: string }[];
  at?: number;
}

const BLANK_CODE = `void setup() {\n  pinMode(13, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(13, HIGH);\n  delay(500);\n  digitalWrite(13, LOW);\n  delay(500);\n}\n`;
export const SAVE_KEY = 'coms-lab:scene:v1';
export const THEME_KEY = 'coms-lab:theme';
export const BACKUP_KEY = 'coms-lab:scene:v1:backup';
/** Mirrors validateScene's code limit (64 KB); the editor refuses input past it. */
export const MAX_CODE_BYTES = 64 * 1024;
export const TUTORIAL_KEY = 'coms-lab:tutorial-done';

const toScene = (doc: Doc, code: string): Scene => ({ ...doc, code });
const empty: Doc = { version: 2, parts: [], wires: [] } as unknown as Doc;
/** Everything of a Scene except its code lives in the history document. */
const docOf = (s: Scene): Doc => {
  const { code: _code, ...rest } = s;
  void _code;
  return rest as Doc;
};

/**
 * In a block mode the code is always exactly what the blocks generate (ModeBar keeps it so while the tab is open).
 * A scene file or share link can say otherwise, and its hidden `code` would run instead of the blocks the user sees,
 * so every way in (load, import, autosave restore) regenerates it here.
 */
function withGeneratedCode(s: Scene, analysis: Analysis): Scene {
  if ((s.codeMode ?? 'text') === 'text') return s;
  const blocks = s.blocks ?? DEFAULT_BLOCKS;
  return { ...s, blocks, code: generate(blocks, sceneContext(s.parts, analysis).opts).code };
}

function initialTheme(): Theme {
  const saved = getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function startDoc(): { doc: Doc; code: string; restored: boolean; failed: boolean } {
  const raw = getItem(SAVE_KEY);
  let failed = false;
  if (raw) {
    try {
      const parsed = validateScene(JSON.parse(raw));
      const s = withGeneratedCode(parsed, analyze(parsed));
      return { doc: docOf(s), code: s.code, restored: true, failed: false };
    } catch {
      // keep the raw data for the user, then start from the default example
      setItem(BACKUP_KEY, raw);
      failed = true;
    }
  }
  const ex = EXAMPLES[0];
  if (ex) return { doc: docOf(validateScene(ex.scene)), code: ex.scene.code, restored: false, failed };
  return { doc: empty, code: BLANK_CODE, restored: false, failed };
}

export const PREFS_KEY = 'coms-lab:prefs';
function loadPrefs(): Record<string, unknown> {
  try {
    return JSON.parse(getItem(PREFS_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}
const prefs = loadPrefs();
const NOTICE_KEY = 'coms-lab:perf-notice';
export const MISSIONS_KEY = 'coms-lab:missions';
function loadMissionProgress(): Record<string, MissionProgress> {
  try {
    const v = JSON.parse(getItem(MISSIONS_KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
const qualityMode = loadQualityMode();
const softwareHint = qualityMode === 'auto' && detectSoftwareRendering();
const first = startDoc();
let state: State = {
  hist: initHistory(first.doc),
  code: first.code,
  analysis: analyze(toScene(first.doc, first.code)),
  selection: null,
  multi: [],
  marquee: null,
  ctx: null,
  wireStart: null,
  hover: null,
  draft: null,
  inputs: {},
  simState: 'idle',
  speed: 1,
  view: 'persp',
  labels: false,
  theme: initialTheme(),
  sideTab: 'code',
  sideOpen: prefs.sideOpen !== false,
  sideWidth: Number(prefs.sideWidth) || 400,
  sheetOpen: false,
  serialTab: 'serial',
  serialOpen: prefs.serialOpen !== false,
  serialH: Number(prefs.serialH) || 190,
  paletteCollapsed: prefs.paletteCollapsed === true,
  compile: { status: 'idle' },
  toast: null,
  simWarnings: [],
  tutorial: getItem(TUTORIAL_KEY) !== '1',
  examplesOpen: false,
  cameraResetTick: 0,
  qualityMode,
  quality: initialQuality(qualityMode, softwareHint),
  restoreNotice: first.failed,
  breakpoints: [],
  debug: null,
  debugTruncated: false,
  instUi: {},
  info: null,
  schematic: false,
  missionId: first.doc.mission ?? null,
  missionProgress: loadMissionProgress(),
  editingNote: null,
  qualityNotice: qualityMode === 'auto' && softwareHint && getItem(NOTICE_KEY) !== '1' ? '그래픽 가속이 꺼져 있는 것 같아요. 부드럽게 쓰도록 화질을 낮췄어요. 위쪽 ⋯ 메뉴의 화질에서 바꿀 수 있어요.' : null,
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

// ---------- v2 document parts: notes, code mode, blocks, mission ----------
export const notes = (s: State = state): Note[] => s.hist.present.notes ?? [];
export function addNote(pos: Vec3, text = '메모', color: Note['color'] = 'yellow'): string {
  const id = nextId('note-', notes());
  void setDoc({ ...state.hist.present, version: 2, notes: [...notes(), { id, pos, text, color }] });
  set({ editingNote: id });
  return id;
}
export function updateNote(id: string, patch: Partial<Note>) {
  void setDoc({ ...state.hist.present, notes: notes().map((n) => (n.id === id ? { ...n, ...patch, text: (patch.text ?? n.text).slice(0, 500) } : n)) });
}
export function deleteNote(id: string) {
  void setDoc({ ...state.hist.present, notes: notes().filter((n) => n.id !== id) });
  if (state.editingNote === id) set({ editingNote: null });
}
export const codeMode = (s: State = state): CodeMode => s.hist.present.codeMode ?? 'text';
/** Hooks for the Blockly lane: the document owns the blocks JSON and the editor mode. */
export function setBlocks(blocks: unknown, code?: string) {
  void setDoc({ ...state.hist.present, version: 2, blocks });
  if (code !== undefined) setCode(code);
}
export function setCodeMode(mode: CodeMode) {
  void setDoc({ ...state.hist.present, version: 2, codeMode: mode });
}
export function setInstUi(id: string, patch: Partial<InstUi>) {
  set({ instUi: { ...state.instUi, [id]: { ...state.instUi[id], ...patch } } });
}
export function setScope(id: string, patch: Partial<ScopeUi>) {
  setInstUi(id, { scope: { ...state.instUi[id]?.scope, ...patch } });
}
export function setMissionId(id: string | null) {
  set({ missionId: id });
}
export function saveMissionProgress(id: string, p: MissionProgress) {
  const missionProgress = { ...state.missionProgress, [id]: p };
  set({ missionProgress });
  setItem(MISSIONS_KEY, JSON.stringify(missionProgress));
}

// ---------- whole-document dirty state (scene + code vs the last loaded/exported baseline) ----------
const docKey = () => JSON.stringify(scene());
// A restored autosave has no baseline: it exists nowhere else, so it always counts as unsaved work.
let baseline = first.restored ? '' : docKey();
export const markClean = () => { baseline = docKey(); };
export const isDirty = () => docKey() !== baseline;

// ---------- document mutations (all go through history) ----------
/** Transactional: the candidate scene must pass the core's validateScene (limits, prop ranges, ids) before anything changes. Returns the Korean error, or null on success. */
function checkDoc(doc: Doc): string | null {
  try {
    validateScene(toScene(doc, state.code));
    return null;
  } catch (e) {
    return e instanceof Error && e.message ? e.message : '회로가 허용 범위를 넘었어요.';
  }
}
function setDoc(doc: Doc, selection?: Selection): string | null {
  const hist = commit(state.hist, doc);
  if (hist === state.hist) return null;
  const err = checkDoc(doc);
  if (err) {
    toast(`적용하지 못했어요: ${err}`);
    return err;
  }
  const analysis = analyze(toScene(doc, state.code));
  const keep = selection === undefined;
  set({
    hist, analysis, selection: keep ? validSel(state.selection, doc) : selection,
    multi: keep ? state.multi.filter((id) => doc.parts.some((p) => p.id === id)) : [],
    ...(selection ? { sideTab: 'props' as const, sideOpen: true } : {}),
  });
  return null;
}
const validSel = (sel: Selection, doc: Doc): Selection =>
  !sel ? null : (sel.kind === 'part' ? doc.parts : doc.wires).some((x) => x.id === sel.id) ? sel : null;

function restoreHist(hist: History<Doc>) {
  set({ hist, analysis: analyze(toScene(hist.present, state.code)), selection: validSel(state.selection, hist.present), multi: [], wireStart: null, draft: null });
}
export const undo = () => restoreHist(undoH(state.hist));
export const redo = () => restoreHist(redoH(state.hist));
export const canUndo = (s: State) => s.hist.past.length > 0;
export const canRedo = (s: State) => s.hist.future.length > 0;

export function setCode(code: string) {
  if (code.length * 3 > MAX_CODE_BYTES && new TextEncoder().encode(code).length > MAX_CODE_BYTES) return toast('코드는 64 KB 이하여야 해요.');
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
  return setDoc({ ...state.hist.present, parts: [...parts(), part] }, { kind: 'part', id }) ? '' : id;
}
/** Replace several parts at once (move/rotate), one history step. */
export function updateParts(next: PartInstance[], extra?: Partial<Doc>): string | null {
  const map = new Map(next.map((p) => [p.id, p]));
  return setDoc({ ...state.hist.present, ...extra, parts: parts().map((p) => map.get(p.id) ?? p) });
}
/** Returns the validation error (Korean) when the value is refused, so the Inspector can show it inline. */
export function setProp(partId: string, key: string, value: number | string | boolean): string | null {
  const p = getPart(partId);
  if (!p) return null;
  const next = { ...p, props: { ...p.props, [key]: value } };
  const err = checkDoc({ ...state.hist.present, parts: parts().map((q) => (q.id === partId ? next : q)) });
  if (err) return err;
  return updateParts([next]);
}
/** Part ids affected by selection commands: the multi-selection, else the single selected part. */
export function selectedPartIds(s: State = state): string[] {
  if (s.multi.length > 1) return s.multi;
  return s.selection?.kind === 'part' ? [s.selection.id] : [];
}
export function selectPart(id: string, additive = false, openPanel = true) {
  if (!additive) return set({ selection: { kind: 'part', id }, multi: [], ...(openPanel ? { sideTab: 'props' as const, sideOpen: true } : {}) });
  const cur = selectedPartIds();
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  set({ multi: next.length > 1 ? next : [], selection: next.length ? { kind: 'part', id: next[next.length - 1]! } : null, sideTab: 'props', sideOpen: true });
}
export function selectParts(ids: string[]) {
  set({ multi: ids.length > 1 ? ids : [], selection: ids.length ? { kind: 'part', id: ids[ids.length - 1]! } : null, ...(ids.length ? { sideTab: 'props' as const, sideOpen: true } : {}) });
}
export const clearSelection = () => set({ selection: null, multi: [] });

export function deleteSelection() {
  const ids = selectedPartIds();
  const doc = state.hist.present;
  if (ids.length) {
    const gone = new Set(ids);
    return setDoc({ ...doc, parts: doc.parts.filter((p) => !gone.has(p.id)), wires: doc.wires.filter((w) => !gone.has(w.from.partId) && !gone.has(w.to.partId)) }, null);
  }
  const sel = state.selection;
  if (sel?.kind === 'wire') setDoc({ ...doc, wires: doc.wires.filter((w) => w.id !== sel.id) }, null);
}
export function deleteWire(id: string) {
  setDoc({ ...state.hist.present, wires: wires().filter((w) => w.id !== id) }, null);
}
export function deleteBend(wireId: string, index: number) {
  const w = wires().find((q) => q.id === wireId);
  if (!w?.bends) return;
  const bends = w.bends.filter((_, i) => i !== index);
  updateWire(wireId, { bends: bends.length ? bends : undefined });
}
/** Quarter turns (CW seen from above) of a vector about the origin. */
const turn = (dx: number, dz: number, k: number): [number, number] => {
  let x = dx, z = dz;
  for (let i = 0; i < k; i++) [x, z] = [z, -x];
  return [x, z];
};
/** Rotate the selection by `quarters` × 90° (1 = clockwise, 3 or -1 = counter-clockwise, 2 = half turn). */
export function rotateSelection(quarters = 1) {
  const ids = selectedPartIds();
  if (!ids.length) return;
  const k = ((quarters % 4) + 4) % 4;
  if (!k) return;
  const list = ids.map((id) => getPart(id)).filter((p): p is PartInstance => !!p);
  const spin = (p: PartInstance) => ((p.rotY + 90 * k) % 360) as RotY;
  if (list.length === 1) {
    const b = list[0]!;
    const rotated = { ...b, rotY: spin(b) };
    // a board carries the parts inserted into it: turn them about the board origin too
    const kidIds = new Set<string>();
    if (b.kind === 'arduino-uno' || b.kind.startsWith('breadboard'))
      for (const [key, ref] of Object.entries(state.analysis.insertions)) if (ref.partId === b.id) kidIds.add(key.split(':')[0]!);
    const kids = parts().filter((p) => kidIds.has(p.id) && p.id !== b.id).map((c) => {
      const [x, z] = turn(c.pos[0] - b.pos[0], c.pos[2] - b.pos[2], k);
      return { ...c, rotY: spin(c), pos: [b.pos[0] + x, c.pos[1], b.pos[2] + z] as Vec3 };
    });
    return void updateParts([rotated, ...kids]);
  }
  // rotate a group about its centre
  const cx = list.reduce((a, p) => a + p.pos[0], 0) / list.length, cz = list.reduce((a, p) => a + p.pos[2], 0) / list.length;
  updateParts(list.map((p) => {
    const [x, z] = turn(p.pos[0] - cx, p.pos[2] - cz, k);
    return { ...p, rotY: spin(p), pos: [cx + x, p.pos[1], cz + z] as Vec3 };
  }));
}
export function duplicateSelection() {
  const list = selectedPartIds().map((id) => getPart(id)).filter((p): p is PartInstance => !!p);
  if (!list.length) return;
  const doc = state.hist.present;
  const ids = new Set(doc.parts.map((p) => p.id));
  const map = new Map<string, string>();
  const copies = list.map((p) => {
    const prefix = `${p.kind.replace(/[^a-z0-9]/g, '')}-`;
    let i = 1;
    while (ids.has(`${prefix}${i}`)) i++;
    const id = `${prefix}${i}`;
    ids.add(id);
    map.set(p.id, id);
    return { ...p, id, pos: [p.pos[0] + 12.7, p.pos[1], p.pos[2] + 12.7] as Vec3, props: { ...p.props } };
  });
  // wires fully inside the group are copied too
  let wid = wires().length;
  const taken = new Set(wires().map((w) => w.id));
  const wcopies = wires().filter((w) => map.has(w.from.partId) && map.has(w.to.partId)).map((w) => {
    while (taken.has(`w${++wid}`));
    taken.add(`w${wid}`);
    return { ...w, id: `w${wid}`, from: { ...w.from, partId: map.get(w.from.partId)! }, to: { ...w.to, partId: map.get(w.to.partId)! }, bends: w.bends?.map((b) => [b[0] + 12.7, b[1], b[2] + 12.7] as Vec3) };
  });
  if (setDoc({ ...doc, parts: [...doc.parts, ...copies], wires: [...doc.wires, ...wcopies] }, null)) return;
  selectParts(copies.map((c) => c.id));
}
let clipboard: PartInstance[] = [];
export function copySelection() {
  const list = selectedPartIds().map((id) => getPart(id)).filter((p): p is PartInstance => !!p);
  if (list.length) clipboard = list;
}
export function paste() {
  if (!clipboard.length) return;
  const doc = state.hist.present;
  const ids = new Set(doc.parts.map((p) => p.id));
  const copies = clipboard.map((p) => {
    const prefix = `${p.kind.replace(/[^a-z0-9]/g, '')}-`;
    let i = 1;
    while (ids.has(`${prefix}${i}`)) i++;
    ids.add(`${prefix}${i}`);
    return { ...p, id: `${prefix}${i}`, pos: [p.pos[0] + 12.7, p.pos[1], p.pos[2] + 12.7] as Vec3, props: { ...p.props } };
  });
  if (setDoc({ ...doc, parts: [...doc.parts, ...copies] }, null)) return;
  selectParts(copies.map((c) => c.id));
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
  void setDoc({ ...state.hist.present, wires: wires().map((w) => (w.id === id ? { ...w, ...patch } : w)) });
}

/** Called after every whole-document load, so the simulator host can drop per-program state (line tables) of the old sketch. */
const loadListeners = new Set<() => void>();
export const onSceneLoaded = (cb: () => void) => (loadListeners.add(cb), () => loadListeners.delete(cb));

export function loadScene(input: Scene, opts: { keepSim?: boolean } = {}) {
  void opts;
  const analysis = analyze(input);
  const s = withGeneratedCode(input, analysis);
  const doc = docOf(s);
  set({
    hist: initHistory(doc), code: s.code, analysis, selection: null, multi: [], wireStart: null, draft: null, inputs: {},
    compile: { status: 'idle' }, simWarnings: [], cameraResetTick: state.cameraResetTick + 1, debug: null, debugTruncated: false, instUi: {}, breakpoints: [], editingNote: null,
    // a scene that belongs to a mission opens on it; any other scene leaves the mission
    missionId: s.mission ?? null, ...(s.mission ? { sideTab: 'missions' as const, sideOpen: true } : {}),
  });
  markClean();
  loadListeners.forEach((cb) => cb());
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
let saveWarned = false;
function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  if (setItem(SAVE_KEY, JSON.stringify(scene()))) saveWarned = false;
  else if (!saveWarned) {
    saveWarned = true;
    toast('자동 저장에 실패했어요. 저장 공간이 부족하거나 막혀 있을 수 있어요. 내보내기로 파일에 저장해 두세요.', 8000);
  }
}
subscribe(() => {
  const cur = [state.hist.present, state.code];
  if (cur[0] === lastSaved[0] && cur[1] === lastSaved[1]) return;
  lastSaved = cur;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 600);
});
if (typeof window !== 'undefined') {
  // flush a pending save when the tab goes away; warn when another tab overwrote the autosave
  window.addEventListener('pagehide', () => { if (saveTimer) saveNow(); });
  window.addEventListener('storage', (e) => {
    if (e.key === SAVE_KEY) toast('다른 탭에서 작업이 바뀌었어요. 이 탭에서 계속 편집하면 그 변경을 덮어써요.', 8000);
  });
}

export type { SimFrame };

// ---------- layout preferences ----------
let prefTimer: ReturnType<typeof setTimeout> | undefined;
let lastPrefs = '';
subscribe(() => {
  const cur = JSON.stringify({ sideOpen: state.sideOpen, sideWidth: state.sideWidth, serialOpen: state.serialOpen, serialH: state.serialH, paletteCollapsed: state.paletteCollapsed });
  if (cur === lastPrefs) return;
  lastPrefs = cur;
  clearTimeout(prefTimer);
  prefTimer = setTimeout(() => setItem(PREFS_KEY, cur), 300);
});

// ---------- live (non-history) edits finished by one history step, e.g. dragging wire bends ----------
export function liveWire(id: string, patch: Partial<Wire>) {
  if (patch.bends && patch.bends.length > MAX_BENDS) return void toast(`전선 하나에는 꺾임점을 ${MAX_BENDS}개까지만 만들 수 있어요.`);
  const doc = state.hist.present;
  set({ hist: { ...state.hist, present: { ...doc, wires: doc.wires.map((w) => (w.id === id ? { ...w, ...patch } : w)) } } });
}
export function liveNote(id: string, pos: Vec3) {
  const doc = state.hist.present;
  set({ hist: { ...state.hist, present: { ...doc, notes: (doc.notes ?? []).map((n) => (n.id === id ? { ...n, pos } : n)) } } });
}
/** validateScene's per-wire bend limit. */
const MAX_BENDS = 20;
export const liveStart = () => state.hist.present;
export function liveEnd(start: Doc) {
  const final = state.hist.present;
  const base = { ...state.hist, present: start };
  const hist = commit(base, final);
  set({ hist, analysis: analyze(toScene(final, state.code)) });
}

// ---------- render quality ----------
/** User choice (auto/high/medium/low); auto starts from the detection result. */
export function setQualityMode(mode: QualityMode) {
  saveQualityMode(mode);
  set({ qualityMode: mode, quality: initialQuality(mode, mode === 'auto' && detectSoftwareRendering()) });
}
/** Runtime step from the frame-time governor (auto mode only). */
export function stepQuality(dir: 'down' | 'up') {
  if (state.qualityMode !== 'auto') return;
  const order: Quality[] = ['low', 'medium', 'high'];
  const i = order.indexOf(state.quality) + (dir === 'up' ? 1 : -1);
  if (i < 0 || i > 2) return;
  set({ quality: order[i]!, ...(dir === 'down' && i === 0 && getItem(NOTICE_KEY) !== '1' ? { qualityNotice: '화면이 느려져서 화질을 낮췄어요. ⋯ 메뉴의 화질에서 바꿀 수 있어요.' } : {}) });
}
export function dismissQualityNotice() {
  setItem(NOTICE_KEY, '1');
  set({ qualityNotice: null });
}
