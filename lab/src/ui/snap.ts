import type { RotY, Vec3 } from '../core/types';

export interface SnapTarget {
  partId: string;
  pinId: string;
  pos: Vec3;
}
export interface SnapPin {
  id: string;
  pos: Vec3; // local
}
export interface SnapResult {
  /** New part XZ origin. */
  xz: [number, number];
  matches: { pinId: string; target: SnapTarget }[];
}

/** Same convention as core pinWorldPos (three.js rotation.y). */
export function rotXZ(x: number, z: number, rotY: RotY): [number, number] {
  const a = (rotY * Math.PI) / 180;
  return [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
}

const CELL = 2;
const key = (cx: number, cz: number) => `${cx},${cz}`;
export type TargetIndex = Map<string, SnapTarget[]>;

export function buildIndex(targets: SnapTarget[]): TargetIndex {
  const m: TargetIndex = new Map();
  for (const t of targets) {
    const k = key(Math.floor(t.pos[0] / CELL), Math.floor(t.pos[2] / CELL));
    const list = m.get(k);
    if (list) list.push(t);
    else m.set(k, [t]);
  }
  return m;
}

export function nearTargets(index: TargetIndex, x: number, z: number, radius: number): SnapTarget[] {
  const out: SnapTarget[] = [];
  const r = Math.ceil(radius / CELL);
  const cx = Math.floor(x / CELL);
  const cz = Math.floor(z / CELL);
  for (let i = -r; i <= r; i++)
    for (let j = -r; j <= r; j++) {
      const list = index.get(key(cx + i, cz + j));
      if (!list) continue;
      for (const t of list) if (Math.hypot(t.pos[0] - x, t.pos[2] - z) <= radius) out.push(t);
    }
  return out;
}

/**
 * Find the origin near `desired` that lands the most pins on targets (within `tol`, spec: 0.6 mm).
 * Needs every pin of 1-pin parts, otherwise at least 2 pins (or all pins when fewer).
 */
export function snapPart(
  pins: SnapPin[],
  rotY: RotY,
  desired: [number, number],
  index: TargetIndex,
  radius = 7,
  tol = 0.3,
): SnapResult | null {
  if (!pins.length) return null;
  const rp = pins.map((p) => rotXZ(p.pos[0], p.pos[2], rotY));
  let best: (SnapResult & { score: number }) | null = null;
  pins.forEach((_, ai) => {
    const [ax, az] = rp[ai]!;
    for (const t of nearTargets(index, desired[0] + ax, desired[1] + az, radius)) {
      const ox = t.pos[0] - ax;
      const oz = t.pos[2] - az;
      const matches: SnapResult['matches'] = [];
      const used = new Set<SnapTarget>();
      pins.forEach((p, i) => {
        const [rx, rz] = rp[i]!;
        const hit = nearTargets(index, ox + rx, oz + rz, tol).find((c) => !used.has(c));
        if (hit) {
          used.add(hit);
          matches.push({ pinId: p.id, target: hit });
        }
      });
      const score = matches.length * 1000 - Math.hypot(ox - desired[0], oz - desired[1]);
      if (!best || score > best.score) best = { xz: [ox, oz], matches, score };
    }
  });
  if (!best) return null;
  const b: SnapResult & { score: number } = best;
  const need = Math.min(pins.length, 2);
  return b.matches.length >= need ? { xz: b.xz, matches: b.matches } : null;
}
