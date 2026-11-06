import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import type { PartInstance, PartKind, PinRef, RotY, Vec3 } from '../core/types';
import { PARTS, pinWorldPos } from '../ui/core';
import { buildIndex, rotXZ, snapPart, type SnapTarget } from '../ui/snap';
import { addPart, getState, parts, set, updateParts, type SnapView } from '../ui/store';
import { DESK_Y, refs } from './sceneRefs';

export const isBoard = (k: PartKind) => k === 'arduino-uno' || k.startsWith('breadboard');

export interface WorldPin {
  ref: PinRef;
  pos: Vec3;
  board: boolean;
}
let pinMemo: { key: unknown; pins: WorldPin[] } | null = null;
/** All pins/holes in world space, rebuilt only when the part list changes. */
export function worldPins(): WorldPin[] {
  const list = parts();
  if (pinMemo?.key === list) return pinMemo.pins;
  const pins: WorldPin[] = [];
  for (const p of list)
    for (const d of PARTS[p.kind]?.pins ?? []) pins.push({ ref: { partId: p.id, pinId: d.id }, pos: pinWorldPos(p, d.id), board: isBoard(p.kind) });
  pinMemo = { key: list, pins };
  return pins;
}

const ndc = new Vector2();
const ray = new Raycaster();
export function rayFromClient(cx: number, cy: number): Raycaster | null {
  const { gl, camera } = refs;
  if (!gl || !camera) return null;
  const r = gl.domElement.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray;
}
const plane = new Plane(new Vector3(0, 1, 0), 0);
const hit = new Vector3();
export function groundPoint(cx: number, cy: number, y = 0): Vec3 | null {
  const r = rayFromClient(cx, cy);
  if (!r) return null;
  plane.constant = -y;
  return r.ray.intersectPlane(plane, hit) ? [hit.x, y, hit.z] : null;
}

/** Nearest pin to the pointer ray (perpendicular distance, tolerance grows with camera distance). */
export function pickPin(cx: number, cy: number, hideId?: string): WorldPin | null {
  const r = rayFromClient(cx, cy);
  if (!r) return null;
  const v = new Vector3();
  let best: WorldPin | null = null;
  let bestScore = Infinity;
  for (const p of worldPins()) {
    if (p.ref.partId === hideId) continue;
    v.set(p.pos[0], p.pos[1], p.pos[2]);
    const t = v.clone().sub(r.ray.origin).dot(r.ray.direction);
    if (t <= 0) continue;
    const d = r.ray.at(t, new Vector3()).distanceTo(v);
    const tol = refs.camera && 'zoom' in refs.camera && (refs.camera as { isOrthographicCamera?: boolean }).isOrthographicCamera
      ? 1.5 / Math.max(0.2, (refs.camera as { zoom: number }).zoom) * 2.2
      : Math.max(1.3, t * 0.005);
    if (d > tol) continue;
    const score = d + (p.board ? 0.3 : 0) - t * 1e-6;
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

function occupiedHoles(exceptPart?: string): Set<string> {
  const s = new Set<string>();
  for (const [k, ref] of Object.entries(getState().analysis.insertions)) if (!exceptPart || !k.startsWith(`${exceptPart}:`)) s.add(`${ref.partId}:${ref.pinId}`);
  return s;
}

let targetMemo: { key: unknown; targets: SnapTarget[]; index: ReturnType<typeof buildIndex> } | null = null;
function targets() {
  const list = parts();
  if (targetMemo?.key === list) return targetMemo;
  const ts = worldPins().filter((p) => p.board).map((p) => ({ partId: p.ref.partId, pinId: p.ref.pinId, pos: p.pos }));
  targetMemo = { key: list, targets: ts, index: buildIndex(ts) };
  return targetMemo;
}

/** Position a part at desired XZ: snap legs into holes/sockets, or rest on the desk. */
export function placeAt(part: PartInstance, desired: [number, number]): { part: PartInstance; snap: SnapView } {
  const def = PARTS[part.kind];
  const none: SnapView = { ok: [], bad: [] };
  if (isBoard(part.kind)) return { part: { ...part, pos: [Math.round(desired[0] * 2) / 2, 0, Math.round(desired[1] * 2) / 2] }, snap: none };
  const { index } = targets();
  const res = snapPart(def.pins.map((p) => ({ id: p.id, pos: p.pos })), part.rotY, desired, index);
  if (!res) return { part: { ...part, pos: [desired[0], DESK_Y, desired[1]] }, snap: none };
  const first = res.matches[0]!;
  const lp = def.pins.find((p) => p.id === first.pinId)!;
  const occ = occupiedHoles(part.id);
  const snap: SnapView = { ok: [], bad: [] };
  for (const m of res.matches) (occ.has(`${m.target.partId}:${m.target.pinId}`) ? snap.bad : snap.ok).push(m.target.pos);
  return { part: { ...part, pos: [res.xz[0], first.target.pos[1] - lp.pos[1], res.xz[1]] }, snap };
}

/** Where to drop things "in the middle" of the view (click-to-add). */
export function viewCenterGround(): [number, number] {
  const t = refs.controls?.target;
  return t ? [t.x, t.z] : [0, 0];
}

export function dropFromPalette(kind: PartKind, cx: number, cy: number, rotY: RotY = 0) {
  const g = groundPoint(cx, cy);
  set({ draft: null });
  if (!g) return;
  const base: PartInstance = { id: '__new', kind, pos: [0, 0, 0], rotY, props: {} };
  const { part } = placeAt(base, [g[0], g[2]]);
  addPart(kind, part.pos, rotY);
}
export function addAtCenter(kind: PartKind) {
  const [x, z] = viewCenterGround();
  const base: PartInstance = { id: '__new', kind, pos: [0, 0, 0], rotY: 0, props: {} };
  addPart(kind, placeAt(base, [x, z]).part.pos, 0);
}

/** Boards carry the parts inserted into them. */
export function childrenOf(boardId: string): PartInstance[] {
  const ids = new Set<string>();
  for (const [k, ref] of Object.entries(getState().analysis.insertions)) if (ref.partId === boardId) ids.add(k.split(':')[0]!);
  return parts().filter((p) => ids.has(p.id) && p.id !== boardId);
}
export function commitMove(moved: PartInstance) {
  const old = parts().find((p) => p.id === moved.id);
  if (!old) return;
  const dx = moved.pos[0] - old.pos[0], dz = moved.pos[2] - old.pos[2];
  const kids = isBoard(moved.kind) ? childrenOf(moved.id).map((k) => ({ ...k, pos: [k.pos[0] + dx, k.pos[1], k.pos[2] + dz] as Vec3 })) : [];
  updateParts([moved, ...kids]);
}
export { rotXZ };
