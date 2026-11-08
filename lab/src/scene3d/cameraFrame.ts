import { Box3, PerspectiveCamera, Vector3, type Camera, type Mesh, type Object3D } from 'three';
import { getState } from '../ui/store';
import { refs } from './sceneRefs';

/** Fraction of the canvas the bench should fill (limiting dimension). */
export const FILL = 0.88;
const ELEV = (44 * Math.PI) / 180;
const YAW = (16 * Math.PI) / 180;
export const DEFAULT_DIR = new Vector3(Math.sin(YAW) * Math.cos(ELEV), Math.sin(ELEV), Math.cos(YAW) * Math.cos(ELEV));

type Cam = Camera & { zoom: number; fov?: number; updateProjectionMatrix(): void };

/** World box of real geometry (no sprites, no hidden helpers) of the given parts, or of every part when `ids` is omitted. */
export function partsBox(ids?: string[]): Box3 | null {
  const root = refs.scene;
  if (!root) return null;
  const box = new Box3();
  const tmp = new Box3();
  let any = false;
  const visit = (o: Object3D) => {
    if (!o.visible) return;
    const m = o as Mesh;
    if (m.isMesh && m.geometry) {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      tmp.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
      box.union(tmp);
      any = true;
    }
    o.children.forEach(visit);
  };
  root.updateMatrixWorld(true);
  for (const c of root.children) {
    const id = c.userData.partId as string | undefined;
    if (!id || id === '__draft' || id === '__new') continue;
    if (ids && !ids.includes(id)) continue;
    visit(c);
  }
  return any ? box : null;
}

const corners = (b: Box3) => {
  const out: Vector3[] = [];
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) out.push(new Vector3(x, y, z));
  return out;
};

/** Camera position (looking along -dir at the box centre) so the box fills `fill` of the viewport. */
export function fitPerspective(box: Box3, fovDeg: number, aspect: number, dir: Vector3 = DEFAULT_DIR, fill = FILL): { position: Vector3; target: Vector3 } {
  const target = box.getCenter(new Vector3());
  const cam = new PerspectiveCamera(fovDeg, aspect, 1, 10000);
  const cs = corners(box);
  let dist = box.getSize(new Vector3()).length() * 1.4 + 50;
  const v = new Vector3();
  for (let i = 0; i < 12; i++) {
    cam.position.copy(target).addScaledVector(dir, dist);
    cam.lookAt(target);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    let m = 0;
    for (const c of cs) {
      v.copy(c).project(cam);
      m = Math.max(m, Math.abs(v.x), Math.abs(v.y));
    }
    if (!Number.isFinite(m) || m < 1e-3) break;
    dist = Math.max(40, dist * (m / fill) ** 0.9);
  }
  return { position: target.clone().addScaledVector(dir, dist), target };
}

export function fitTop(box: Box3, wpx: number, hpx: number, fill = FILL) {
  const c = box.getCenter(new Vector3());
  const s = box.getSize(new Vector3());
  const zoom = Math.min((wpx * fill) / Math.max(20, s.x), (hpx * fill) / Math.max(20, s.z));
  return { cx: c.x, cz: c.z, zoom };
}

const canvasSize = () => ({ w: refs.gl?.domElement.clientWidth || 800, h: refs.gl?.domElement.clientHeight || 600 });

let flight = 0;
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
function fly(to: { pos: Vector3; target: Vector3; zoom?: number }, animate: boolean) {
  const cam = refs.camera as Cam | null;
  const ctl = refs.controls;
  if (!cam) return;
  const id = ++flight;
  const done = () => {
    cam.updateProjectionMatrix();
    ctl?.update();
    refs.invalidate();
  };
  if (!animate || reducedMotion()) {
    cam.position.copy(to.pos);
    ctl?.target.copy(to.target);
    if (to.zoom !== undefined) cam.zoom = to.zoom;
    return done();
  }
  const p0 = cam.position.clone(), t0 = ctl ? ctl.target.clone() : to.target.clone(), z0 = cam.zoom;
  const t1 = performance.now();
  const step = () => {
    if (id !== flight || refs.camera !== cam) return; // superseded, or the Canvas was unmounted
    const k = Math.min(1, (performance.now() - t1) / 320);
    const e = 1 - (1 - k) ** 3;
    cam.position.lerpVectors(p0, to.pos, e);
    ctl?.target.lerpVectors(t0, to.target, e);
    if (to.zoom !== undefined) cam.zoom = z0 + (to.zoom - z0) * e;
    done();
    if (k < 1) requestAnimationFrame(step);
  };
  step();
}

/** Re-frame the whole bench (load, example switch, camera reset, view toggle). */
export function frameAll(opts: { animate?: boolean } = {}) {
  const cam = refs.camera as Cam | null;
  if (!cam) return;
  const { w, h } = canvasSize();
  const box = partsBox() ?? new Box3(new Vector3(-80, -9, -50), new Vector3(80, 10, 50));
  if (getState().view === 'top') {
    const f = fitTop(box, w, h);
    fly({ pos: new Vector3(f.cx, 800, f.cz + 0.001), target: new Vector3(f.cx, 0, f.cz), zoom: f.zoom }, !!opts.animate);
  } else {
    const f = fitPerspective(box, cam.fov ?? 38, w / h);
    fly({ pos: f.position, target: f.target }, !!opts.animate);
    const ctl = refs.controls;
    if (ctl) {
      ctl.minDistance = 12;
      ctl.maxDistance = Math.max(600, box.getSize(new Vector3()).length() * 5);
    }
  }
}

/** Fly to a close-up of the given parts, keeping the current viewing direction. */
export function focusParts(ids: string[]) {
  const cam = refs.camera as Cam | null;
  const box = partsBox(ids);
  if (!cam || !box) return;
  const { w, h } = canvasSize();
  if (getState().view === 'top') {
    const f = fitTop(box, w, h, 0.5);
    return fly({ pos: new Vector3(f.cx, 800, f.cz + 0.001), target: new Vector3(f.cx, 0, f.cz), zoom: Math.min(30, f.zoom) }, true);
  }
  const target = box.getCenter(new Vector3());
  const dir = cam.position.clone().sub(refs.controls?.target ?? target).normalize();
  if (dir.y < 0.3) dir.y = 0.3;
  const f = fitPerspective(box, cam.fov ?? 38, w / h, dir.normalize(), 0.58);
  fly({ pos: f.position, target: f.target }, true);
}

/** Run `frameAll` once the scene graph reflects the current document (two animation frames). */
export function scheduleFrame(animate = false) {
  requestAnimationFrame(() => requestAnimationFrame(() => frameAll({ animate })));
}

/** Dev/e2e helper: frame some parts (or all) from an explicit azimuth/elevation (degrees) so shots are reproducible. */
export function viewAngle(ids: string[] | undefined, azimuthDeg: number, elevationDeg: number, fill = FILL) {
  const cam = refs.camera as Cam | null;
  const box = partsBox(ids);
  if (!cam || !box) return;
  const { w, h } = canvasSize();
  const az = (azimuthDeg * Math.PI) / 180, el = (elevationDeg * Math.PI) / 180;
  const dir = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  const f = fitPerspective(box, cam.fov ?? 38, w / h, dir, fill);
  fly({ pos: f.position, target: f.target }, false);
}
