// Canvas drawing of the oscilloscope / logic analyzer screens, shared by the 3D instrument models and the side panels.
import { CAPACITY } from '../../core/instruments';
import type { LogicTrace, ScopeTrace } from '../../core/types';

export interface ScopeSettings {
  /** ms per division the acquisition was asked for. The part's `timeDiv` prop, never UI-only state; the screen itself follows the trace (scopeSpanMs). */
  timePerDiv: number;
  voltsPerDiv: [number, number];
  trigger: number; // volts, rising edge on CH1; the part's `trigger` prop
  run: boolean;
  cursors: boolean;
  c1: number; // cursor positions, 0..1 of the screen width
  c2: number;
}
export const DEFAULT_SCOPE: ScopeSettings = { timePerDiv: 1, voltsPerDiv: [1, 1], trigger: 1, run: true, cursors: false, c1: 0.3, c2: 0.7 };
// below 0.1 ms/div the acquisition grid (1 µs minimum step, core/instruments.ts) cannot follow
export const TIME_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
export const VOLT_STEPS = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10];
export const CH_COLORS = ['#ffd21f', '#3fe0ff'];

/** Display settings of one scope: acquisition settings come from the part's props (so the simulator follows them), the rest from the UI state. */
export function scopeSettings(props: Record<string, number | string | boolean>, ui?: Partial<ScopeSettings>): ScopeSettings {
  const timeDiv = Number(props.timeDiv ?? DEFAULT_SCOPE.timePerDiv), trigger = Number(props.trigger ?? 2.5);
  return { ...DEFAULT_SCOPE, ...ui, timePerDiv: Number.isFinite(timeDiv) ? timeDiv : DEFAULT_SCOPE.timePerDiv, trigger: Number.isFinite(trigger) ? trigger : 2.5 };
}
/** Time the 10-division screen really covers, from the trace's own sample spacing (a trace taken at an older setting keeps its own span). */
export const scopeSpanMs = (t: ScopeTrace) => t.dtMs * (CAPACITY - 1);

/** Snapshots kept while an instrument is stopped (RUN/STOP). */
export const frozen = new Map<string, ScopeTrace | LogicTrace>();

export interface Palette {
  bg: string;
  grid: string;
  text: string;
}
export const SCREEN: Palette = { bg: '#0b1410', grid: 'rgba(120,255,170,0.18)', text: '#b5ffd0' };

export interface Window {
  start: number;
  count: number;
}
/** Sample window for the chosen time base; starts at the last rising CH1 trigger crossing that still fills the screen. */
export function scopeWindow(t: ScopeTrace, s: ScopeSettings): Window {
  const ch = t.channels[0] ?? [];
  const need = Math.max(2, CAPACITY - 1);
  const len = ch.length;
  let start = Math.max(0, len - need);
  for (let i = len - need; i >= 1; i--) {
    if (ch[i - 1]! < s.trigger && ch[i]! >= s.trigger) { start = i; break; }
  }
  return { start, count: Math.min(need, len - start) };
}

/** Cursor readout from real sample timestamps: a cursor at screen fraction f sits at sample round(f * span / dt) of the window. */
export function scopeCursors(t: ScopeTrace, s: ScopeSettings): { dtMs: number; dv: number | null } {
  const w = scopeWindow(t, s);
  const index = (f: number) => Math.round((f * scopeSpanMs(t)) / Math.max(1e-9, t.dtMs));
  const [i1, i2] = [index(s.c1), index(s.c2)];
  const at = (i: number) => (i < w.count ? t.channels[0]?.[w.start + i] : undefined);
  const [v1, v2] = [at(i1), at(i2)];
  return { dtMs: Math.abs(i2 - i1) * t.dtMs, dv: v1 === undefined || v2 === undefined ? null : Math.abs(v2 - v1) };
}

export interface ScopeMeasure {
  vpp: number[];
  freq: number;
}
export function measureScope(t: ScopeTrace, s: ScopeSettings): ScopeMeasure {
  const w = scopeWindow(t, s);
  const vpp = t.channels.map((c) => {
    const seg = c.slice(w.start, w.start + w.count);
    return seg.length ? Math.max(...seg) - Math.min(...seg) : 0;
  });
  const ch = t.channels[0] ?? [];
  const mid = (Math.max(...ch.slice(w.start, w.start + w.count), 0) + Math.min(...ch.slice(w.start, w.start + w.count), 0)) / 2;
  const edges: number[] = [];
  for (let i = w.start + 1; i < w.start + w.count; i++) if (ch[i - 1]! < mid && ch[i]! >= mid) edges.push(i);
  const freq = edges.length > 1 ? 1000 / (((edges[edges.length - 1]! - edges[0]!) / (edges.length - 1)) * t.dtMs) : 0;
  return { vpp, freq };
}

export function drawScope(c: CanvasRenderingContext2D, W: number, H: number, trace: ScopeTrace | undefined, s: ScopeSettings, pal: Palette = SCREEN, small = false) {
  c.fillStyle = pal.bg;
  c.fillRect(0, 0, W, H);
  const gx = W / 10, gy = H / 8;
  c.strokeStyle = pal.grid;
  c.lineWidth = small ? 1 : 1;
  c.beginPath();
  for (let i = 0; i <= 10; i++) { c.moveTo(i * gx, 0); c.lineTo(i * gx, H); }
  for (let j = 0; j <= 8; j++) { c.moveTo(0, j * gy); c.lineTo(W, j * gy); }
  c.stroke();
  c.strokeStyle = pal.grid.replace('0.18', '0.4');
  c.beginPath(); c.moveTo(0, H / 2); c.lineTo(W, H / 2); c.moveTo(W / 2, 0); c.lineTo(W / 2, H); c.stroke();
  if (!trace || !trace.channels.length) {
    c.fillStyle = pal.text; c.textAlign = 'center'; c.font = `${small ? 13 : 14}px sans-serif`;
    c.fillText('신호 없음 · 프로브를 연결하고 실행하세요', W / 2, H / 2 - 8);
    return;
  }
  const w = scopeWindow(trace, s);
  trace.channels.slice(0, 2).forEach((ch, k) => {
    c.strokeStyle = CH_COLORS[k]!;
    c.lineWidth = small ? 1.5 : 2;
    c.beginPath();
    const vd = s.voltsPerDiv[k] ?? 1;
    for (let i = 0; i < w.count; i++) {
      const x = ((i * trace.dtMs) / scopeSpanMs(trace)) * W; // sample timestamps, so a part-filled buffer is not stretched
      const y = H / 2 - ((ch[w.start + i] ?? 0) / vd) * gy;
      i ? c.lineTo(x, Math.max(-4, Math.min(H + 4, y))) : c.moveTo(x, y);
    }
    c.stroke();
  });
  // trigger marker (CH1 volts)
  const ty = H / 2 - (s.trigger / (s.voltsPerDiv[0] || 1)) * gy;
  c.fillStyle = CH_COLORS[0]!;
  c.beginPath(); c.moveTo(0, ty - 5); c.lineTo(9, ty); c.lineTo(0, ty + 5); c.fill();
  if (s.cursors) {
    c.strokeStyle = '#ff9d3f'; c.setLineDash([5, 4]); c.lineWidth = 1;
    for (const f of [s.c1, s.c2]) { c.beginPath(); c.moveTo(f * W, 0); c.lineTo(f * W, H); c.stroke(); }
    c.setLineDash([]);
  }
  c.fillStyle = pal.text; c.font = `${small ? 12 : 13}px sans-serif`; c.textAlign = 'left';
  c.fillText(`${fmtT(+(scopeSpanMs(trace) / 10).toPrecision(3))}/div`, 6, H - 7);
  c.textAlign = 'right';
  c.fillText(trace.triggered ? '트리거됨' : '자동', W - 6, H - 7);
}

export const fmtT = (ms: number) => (ms >= 1000 ? `${ms / 1000}s` : ms >= 1 ? `${ms}ms` : `${Math.round(ms * 1000)}µs`);
export const fmtV = (v: number) => (Math.abs(v) < 1 ? `${Math.round(v * 1000)}mV` : `${+v.toFixed(2)}V`);

export const LOGIC_COLORS = ['#ffd21f', '#3fe0ff', '#7dff7a', '#ff7ad8', '#ff9d3f', '#b693ff', '#ff5f5f', '#d0d6da'];

export interface LogicSettings {
  spanMs: number; // visible time span
  run: boolean;
}
export const DEFAULT_LOGIC: LogicSettings = { spanMs: 20, run: true };
export const SPAN_STEPS = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

export function drawLogic(c: CanvasRenderingContext2D, W: number, H: number, trace: LogicTrace | undefined, s: LogicSettings, pal: Palette = SCREEN, small = false) {
  c.fillStyle = pal.bg;
  c.fillRect(0, 0, W, H);
  const rows = 8, rh = H / rows;
  c.strokeStyle = pal.grid;
  c.beginPath();
  for (let i = 0; i <= 10; i++) { c.moveTo((i * W) / 10, 0); c.lineTo((i * W) / 10, H); }
  c.stroke();
  c.font = `${small ? 10 : 11}px sans-serif`; c.textAlign = 'left';
  if (!trace || !trace.channels.length) {
    c.fillStyle = pal.text; c.textAlign = 'center'; c.font = '13px sans-serif';
    c.fillText('신호 없음 · 채널 D0~D7을 연결하고 실행하세요', W / 2, H / 2);
    return;
  }
  const need = Math.max(2, Math.round(s.spanMs / Math.max(1e-6, trace.dtMs)));
  const len = trace.channels[0]?.length ?? 0;
  const start = Math.max(0, len - need);
  const count = len - start;
  trace.channels.slice(0, 8).forEach((ch, k) => {
    const y0 = k * rh + 4, y1 = (k + 1) * rh - 4;
    c.strokeStyle = LOGIC_COLORS[k]!;
    c.lineWidth = 1.6;
    c.beginPath();
    let prev = -1;
    for (let i = 0; i < count; i++) {
      const x = (i / Math.max(1, count - 1)) * W;
      const v = ch[start + i] ? 1 : 0;
      const y = v ? y0 : y1;
      if (i === 0) c.moveTo(x, y);
      else { if (v !== prev) c.lineTo(x, prev ? y0 : y1); c.lineTo(x, y); }
      prev = v;
    }
    c.stroke();
    // edge markers
    c.fillStyle = LOGIC_COLORS[k]!;
    for (let i = 1; i < count; i++) {
      const a = ch[start + i - 1] ? 1 : 0, b = ch[start + i] ? 1 : 0;
      if (a !== b) { const x = (i / Math.max(1, count - 1)) * W; c.fillRect(x - 0.5, y0 - 3, 1.6, 3); }
    }
    c.fillStyle = pal.text;
    c.fillText(`D${k}`, 4, (k + 0.5) * rh + 4);
  });
}

/** Frequency / duty of one logic channel over the visible span, for the readout. */
export function logicStats(trace: LogicTrace | undefined, ch: number, s: LogicSettings): { freq: number; duty: number; edges: number } {
  const data = trace?.channels[ch];
  if (!trace || !data) return { freq: 0, duty: 0, edges: 0 };
  const need = Math.max(2, Math.round(s.spanMs / Math.max(1e-6, trace.dtMs)));
  const seg = data.slice(Math.max(0, data.length - need));
  const rises: number[] = [];
  let high = 0;
  for (let i = 0; i < seg.length; i++) {
    if (seg[i]) high++;
    if (i && !seg[i - 1] && seg[i]) rises.push(i);
  }
  const edges = seg.reduce<number>((a, v, i) => a + (i && v !== seg[i - 1] ? 1 : 0), 0);
  const freq = rises.length > 1 ? 1000 / (((rises[rises.length - 1]! - rises[0]!) / (rises.length - 1)) * trace.dtMs) : 0;
  return { freq, duty: seg.length ? high / seg.length : 0, edges };
}
