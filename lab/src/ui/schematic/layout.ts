// Automatic schematic layout: columns by distance from the Arduino, symbols with pins on their left/right edges,
// nets drawn as orthogonal trunks in the channel between columns (power nets and far pins use labelled stubs).
import type { Analysis, PartInstance, PartDef } from '../../core/types';

export const BOX_W = 112, ROW_GAP = 26, COL_GAP = 120, PIN_DY = 17;
const POWER = /^(GND|5V|3V3|3\.3V|VIN|AREF|IOREF)/;

export interface SymPin { id: string; label: string; side: 'L' | 'R'; x: number; y: number }
export interface Sym { part: PartInstance; title: string; x: number; y: number; w: number; h: number; col: number; pins: SymPin[]; glyph?: string }
export interface Seg { d: string; key: string }
export interface Label { x: number; y: number; text: string; dir: 1 | -1; ground?: boolean }
export interface Layout { syms: Sym[]; wires: Seg[]; dots: [number, number][]; labels: Label[]; width: number; height: number }

const isBoard = (k: string) => k.startsWith('breadboard');
const GLYPH: Record<string, string> = {
  resistor: 'res', 'capacitor-ceramic': 'cap', 'capacitor-electrolytic': 'cap', diode: 'diode', zener: 'diode', led: 'diode', inductor: 'ind',
  'battery-9v': 'bat', 'battery-aa-pack': 'bat', 'coin-cell-3v': 'bat',
};

export function layoutSchematic(parts: PartInstance[], defs: Record<string, PartDef | undefined>, an: Analysis): Layout {
  const comps = parts.filter((p) => !isBoard(p.kind) && defs[p.kind]);
  // nets restricted to component pins
  const nets = an.nets.map((n) => ({ id: n.id, name: n.name, pins: n.pins.filter((r) => comps.some((c) => c.id === r.partId) && defs[comps.find((c) => c.id === r.partId)!.kind]!.pins.some((d) => d.id === r.pinId && d.role !== 'hole')) }))
    .filter((n) => n.pins.length >= 2 || (n.pins.length === 1 && n.name && POWER.test(n.name)));
  const isPower = (n: { name?: string }) => !!n.name && POWER.test(n.name);
  const used = new Set(nets.flatMap((n) => n.pins.map((r) => `${r.partId}:${r.pinId}`)));
  // depth by BFS over signal nets from the board
  const depth = new Map<string, number>();
  const root = comps.find((c) => c.kind === 'arduino-uno');
  const adj = new Map<string, Set<string>>();
  for (const n of nets) {
    if (isPower(n)) continue;
    const ids = [...new Set(n.pins.map((r) => r.partId))];
    for (const a of ids) for (const b of ids) if (a !== b) (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
  }
  const q: string[] = [];
  if (root) { depth.set(root.id, 0); q.push(root.id); }
  for (let i = 0; i < q.length; i++) for (const n of adj.get(q[i]!) ?? []) if (!depth.has(n)) { depth.set(n, depth.get(q[i]!)! + 1); q.push(n); }
  for (const c of comps) if (!depth.has(c.id)) { // islands (e.g. battery loops): their own columns after the connected ones
    depth.set(c.id, (root ? 1 : 0)); q.push(c.id);
    for (let i = q.indexOf(c.id); i < q.length; i++) for (const n of adj.get(q[i]!) ?? []) if (!depth.has(n)) { depth.set(n, depth.get(q[i]!)! + 1); q.push(n); }
  }
  const syms = new Map<string, Sym>();
  for (const c of comps) {
    const d = defs[c.kind]!;
    let pins = d.pins.filter((p) => p.role !== 'hole');
    if (c.kind === 'arduino-uno') pins = pins.filter((p) => used.has(`${c.id}:${p.id}`));
    const glyph = GLYPH[c.kind];
    const two = pins.length === 2;
    const nl = c.kind === 'arduino-uno' ? 0 : two ? 1 : Math.ceil(pins.length / 2);
    const left = pins.slice(0, nl), right = pins.slice(nl);
    const rows = Math.max(left.length, right.length, 1);
    const h = glyph && two ? 40 : Math.max(46, rows * PIN_DY + 28);
    const w = c.kind === 'arduino-uno' ? 130 : BOX_W;
    const sp: SymPin[] = [];
    const place = (list: typeof pins, side: 'L' | 'R') => list.forEach((p, i) => sp.push({ id: p.id, label: p.label, side, x: side === 'L' ? 0 : w, y: glyph && two ? h / 2 : 22 + (i * (h - 30)) / Math.max(1, list.length - 1 || 1) * (list.length > 1 ? 1 : 0) + (list.length > 1 ? 0 : (h - 44) / 2) }));
    place(left, 'L'); place(right, 'R');
    syms.set(c.id, { part: c, title: d.title, x: 0, y: 0, w, h, col: depth.get(c.id) ?? 0, pins: sp, glyph: two ? glyph : undefined });
  }
  // columns, ordered by barycenter of already placed neighbours
  const cols = new Map<number, Sym[]>();
  for (const s of syms.values()) (cols.get(s.col) ?? cols.set(s.col, []).get(s.col)!).push(s);
  const colIdx = [...cols.keys()].sort((a, b) => a - b);
  const pinY = new Map<string, number>();
  let height = 0;
  colIdx.forEach((ci, k) => {
    const list = cols.get(ci)!;
    const bary = (s: Sym) => {
      const ys: number[] = [];
      for (const n of nets) {
        if (isPower(n) || !n.pins.some((r) => r.partId === s.part.id)) continue;
        for (const r of n.pins) { const y = pinY.get(`${r.partId}:${r.pinId}`); if (y !== undefined && r.partId !== s.part.id) ys.push(y); }
      }
      return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 1e9;
    };
    list.sort((a, b) => bary(a) - bary(b));
    let y = 20;
    for (const s of list) {
      s.col = k; s.x = 30 + k * (BOX_W + COL_GAP + 18); s.y = y;
      y += s.h + ROW_GAP;
      for (const p of s.pins) pinY.set(`${s.part.id}:${p.id}`, s.y + p.y);
    }
    height = Math.max(height, y);
  });
  const all = [...syms.values()];
  const pinOf = new Map<string, { s: Sym; p: SymPin; x: number; y: number }>();
  for (const s of all) for (const p of s.pins) pinOf.set(`${s.part.id}:${p.id}`, { s, p, x: s.x + p.x, y: s.y + p.y });
  // routing
  const wires: Seg[] = [], dots: [number, number][] = [], labels: Label[] = [];
  const lanes = new Map<number, number>();
  const chanX = (ch: number) => 30 + ch * (BOX_W + COL_GAP + 18) + BOX_W + (COL_GAP + 18) / 2 - 4; // channel ch lies right of column ch
  for (const n of nets) {
    const ps = n.pins.map((r) => pinOf.get(`${r.partId}:${r.pinId}`)).filter((x): x is NonNullable<typeof x> => !!x);
    if (!ps.length) continue;
    const stub = (p: (typeof ps)[number], text: string) => labels.push({ x: p.x, y: p.y, text, dir: p.p.side === 'L' ? -1 : 1, ground: n.name === 'GND' });
    if (isPower(n)) { ps.forEach((p) => stub(p, n.name!)); continue; }
    const chOf = (p: (typeof ps)[number]) => (p.p.side === 'R' ? p.s.col : p.s.col - 1);
    const count = new Map<number, number>();
    ps.forEach((p) => count.set(chOf(p), (count.get(chOf(p)) ?? 0) + 1));
    const [best] = [...count.entries()].sort((a, b) => b[1] - a[1])[0]!;
    const inCh = ps.filter((p) => chOf(p) === best);
    const rest = ps.filter((p) => chOf(p) !== best);
    const name = n.name ?? `net ${n.id.replace(/\D/g, '')}`;
    rest.forEach((p) => stub(p, name));
    if (inCh.length < 2) { inCh.forEach((p) => stub(p, name)); continue; }
    const lane = lanes.get(best) ?? 0;
    lanes.set(best, lane + 1);
    const tx = chanX(best) + ((lane % 7) - 3) * 7;
    const ys = inCh.map((p) => p.y);
    const y0 = Math.min(...ys), y1 = Math.max(...ys);
    wires.push({ key: `${n.id}-t`, d: `M${tx} ${y0}V${y1}` });
    inCh.forEach((p, i) => {
      wires.push({ key: `${n.id}-${i}`, d: `M${p.x} ${p.y}H${tx}` });
      if (p.y > y0 && p.y < y1) dots.push([tx, p.y]);
    });
    if (inCh.length > 2) dots.push(...inCh.filter((p) => p.y === y0 || p.y === y1).map((p): [number, number] => [tx, p.y]));
  }
  const width = 60 + colIdx.length * (BOX_W + COL_GAP + 18);
  return { syms: all, wires, dots, labels, width, height: height + 20 };
}
