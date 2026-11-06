import { CatmullRomCurve3, TubeGeometry, Vector3 } from 'three';
import type { Vec3 } from '../core/types';

const STUB = 4; // vertical plug length at each end, mm

export const arcHeight = (len: number) => Math.min(45, Math.max(3, len * 0.28));
export function arcApex(from: Vec3, to: Vec3): Vec3 {
  const len = Math.hypot(to[0] - from[0], to[2] - from[2]);
  return [(from[0] + to[0]) / 2, Math.max(from[1], to[1]) + STUB + arcHeight(len), (from[2] + to[2]) / 2];
}

/** Control points of a jumper wire: plug up, arc above the board (higher for longer wires), plug down. */
export function wirePoints(from: Vec3, to: Vec3, bends?: Vec3[]): Vec3[] {
  const a1: Vec3 = [from[0], from[1] + STUB, from[2]];
  const b1: Vec3 = [to[0], to[1] + STUB, to[2]];
  if (bends?.length) return [from, a1, ...bends, b1, to];
  return [from, a1, arcApex(from, to), b1, to];
}

export function wireGeometry(points: Vec3[], radius = 0.9): TubeGeometry {
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)), false, 'centripetal');
  return new TubeGeometry(curve, Math.max(24, points.length * 14), radius, 8, false);
}
