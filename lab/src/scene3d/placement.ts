import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import type { PartInstance, PartKind, PinRef, RotY, Vec3 } from '../core/types';
import { PARTS, pinWorldPos } from '../ui/core';
import { buildIndex, rotXZ, snapPart, type SnapTarget } from '../ui/snap';
import { addPart, getState, parts, set, updateParts, type SnapView } from '../ui/store';
import { DESK_Y, refs } from './sceneRefs';
import { focusParts, partsBox } from './cameraFrame';

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
  // plain numbers, no per-pin allocations (two boards are ~1.7k pins per hover)
  const o = r.ray.origin, dir = r.ray.direction;
  const ortho = !!refs.camera && (refs.camera as { isOrthographicCamera?: boolean }).isOrthographicCamera;
  const orthoTol = ortho ? 1.5 / Math.max(0.2, (refs.camera as unknown as { zoom: number }).zoom) * 2.2 : 0;
  let best: WorldPin | null = null;
  let bestScore = Infinity;
  for (const p of worldPins()) {
    if (p.ref.partId === hideId) continue;
    const wx = p.pos[0] - o.x, wy = p.pos[1] - o.y, wz = p.pos[2] - o.z;
    const t = wx * dir.x + wy * dir.y + wz * dir.z;
    if (t <= 0) continue;
    const tol = ortho ? orthoTol : Math.max(1.6, t * 0.007);
    const d2 = wx * wx + wy * wy + wz * wz - t * t;
    if (d2 > tol * tol) continue;
    const score = Math.sqrt(Math.max(0, d2)) + (p.board ? 0.3 : 0) - t * 1e-6;
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
/** Parts that end up tiny on screen are hard to grab: fly in when the new part is under ~90 px. */
function ensureGrabbable(id: string) {
  const go = () => {
    const b = partsBox([id]);
    const cam = refs.camera;
    const el = refs.gl?.domElement;
    if (!b || !cam || !el) return;
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
    const v = new Vector3();
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
      v.set(x, y, z).project(cam);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
    }
    const px = Math.max(((x1 - x0) / 2) * el.clientWidth, ((y1 - y0) / 2) * el.clientHeight);
    if (px < 90) focusParts([id]);
  };
  requestAnimationFrame(() => requestAnimationFrame(go));
}
export function addAtCenter(kind: PartKind) {
  const [x, z] = viewCenterGround();
  const base: PartInstance = { id: '__new', kind, pos: [0, 0, 0], rotY: 0, props: {} };
  const id = addPart(kind, placeAt(base, [x, z]).part.pos, 0);
  if (id && !isBoard(kind)) ensureGrabbable(id);
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

/** Commit a group move; children inserted in a moved board that were not selected travel with it. */
export function commitMoveGroup(moved: PartInstance[]) {
  const ids = new Set(moved.map((m) => m.id));
  const out = [...moved];
  for (const m of moved) {
    if (!isBoard(m.kind)) continue;
    const old = parts().find((p) => p.id === m.id);
    if (!old) continue;
    const dx = m.pos[0] - old.pos[0], dz = m.pos[2] - old.pos[2];
    for (const k of childrenOf(m.id))
      if (!ids.has(k.id)) {
        ids.add(k.id);
        out.push({ ...k, pos: [k.pos[0] + dx, k.pos[1], k.pos[2] + dz] as Vec3 });
      }
  }
  updateParts(out);
}
