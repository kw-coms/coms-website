// Dev-only hooks used by tools/e2e-browser.mjs (never bundled in production builds).
import { Vector3 } from 'three';
import { EXAMPLES, PARTS, pinWorldPos } from './core';
import { refs } from '../scene3d/sceneRefs';
import { addPart, deleteSelection, getState, loadScene, selectParts, selectPart, set, updateParts, updateWire } from './store';
import { frameAll, partsBox, viewAngle } from '../scene3d/cameraFrame';
import type { PartKind, Scene } from '../core/types';
import { frameRef, setSimInput, sim } from './simHost';
import { clearSerial, serialLog } from './serial';
import { setCode } from './store';

function project(partId: string, pinId: string) {
  const part = getState().hist.present.parts.find((p) => p.id === partId);
  if (!part || !refs.camera || !refs.gl) return null;
  const w = pinWorldPos(part, pinId);
  const v = new Vector3(...w).project(refs.camera);
  const r = refs.gl.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}
function projectPart(partId: string, dy = 5) {
  const part = getState().hist.present.parts.find((p) => p.id === partId);
  if (!part || !refs.camera || !refs.gl) return null;
  const v = new Vector3(part.pos[0], part.pos[1] + dy, part.pos[2]).project(refs.camera);
  const r = refs.gl.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}
/** Opacity of the visible glow sprite of a part (0 when unlit): the LED lit-state probe. */
function litOf(partId: string) {
  let max = 0;
  refs.scene?.traverse((o) => {
    if (o.userData.partId !== partId) return;
    o.traverse((m) => {
      if ((m as { isSprite?: boolean }).isSprite && m.visible) max = Math.max(max, (m as unknown as { material: { opacity: number } }).material.opacity);
    });
  });
  return max;
}

const nextFrames = (n = 3) => new Promise<void>((r) => { const f = (k: number) => (k ? requestAnimationFrame(() => f(k - 1)) : r()); f(n); });
/** "부품 갤러리": every PartKind on the desk, packed in rows without overlap (measured from the real meshes). */
async function gallery(kinds?: PartKind[]) {
  const all = (kinds ?? (Object.keys(PARTS) as PartKind[]));
  const parts = all.map((k, i) => ({ id: `g-${k}`, kind: k, pos: [i * 200, k === 'arduino-uno' || k.startsWith('breadboard') ? 0 : -9, 0] as [number, number, number], rotY: 0 as const, props: Object.fromEntries(PARTS[k].props.map((p) => [p.key, p.default])) }));
  const scene: Scene = { version: 1, title: '부품 갤러리', parts, wires: [], code: 'void setup() {}\nvoid loop() {}\n' };
  loadScene(scene);
  await nextFrames();
  const rowW = 330;
  let x = 0, z = 0, rowD = 0;
  const placed = parts.map((p) => {
    const b = partsBox([p.id]);
    if (!b) return p;
    const w = b.max.x - b.min.x, d = b.max.z - b.min.z;
    if (x > 0 && x + w > rowW) { x = 0; z += rowD + 16; rowD = 0; }
    // the box was measured with the part at its load position; shift it so its min corner lands at (x, z)
    const pos = [x + (p.pos[0] - b.min.x), p.pos[1], z + (p.pos[2] - b.min.z)] as [number, number, number];
    x += w + 14;
    rowD = Math.max(rowD, d);
    return { ...p, pos };
  });
  updateParts(placed);
  set({ view: 'persp' });
  await nextFrames();
  frameAll();
  return placed.map((p) => p.id);
}
async function closeup(kind: PartKind, az = 25, el = 38, fill = 0.8) {
  viewAngle([`g-${kind}`], az, el, fill);
  await nextFrames(2);
}

/** Visible state of a part's meshes: what the user actually sees (lit glow, emissive, servo horn / motor shaft angle). */
function probe(partId: string) {
  const out = { sprite: 0, emissive: 0, horn: null as number | null, shaft: null as number | null };
  refs.scene?.children.forEach((g) => {
    if (g.userData.partId !== partId) return;
    g.traverse((o) => {
      const m = o as unknown as { isSprite?: boolean; material?: { opacity?: number; emissiveIntensity?: number; userData?: { dynamic?: boolean } } };
      if (m.isSprite && o.visible) out.sprite = Math.max(out.sprite, m.material?.opacity ?? 0);
      if (m.material?.userData?.dynamic && o.visible) out.emissive += m.material.emissiveIntensity ?? 0;
      if (o.userData.probe === 'horn') out.horn = o.rotation.y;
      if (o.userData.probe === 'shaft') out.shaft = o.rotation.x;
    });
  });
  return out;
}

function projectWorld(x: number, y: number, z: number) {
  if (!refs.camera || !refs.gl) return null;
  const v = new Vector3(x, y, z).project(refs.camera);
  const r = refs.gl.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}
/** Fraction of the canvas (limiting dimension) covered by all parts' bounding box corners. */
function fillRatio() {
  const b = partsBox();
  if (!b || !refs.camera) return 0;
  let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
    const v = new Vector3(x, y, z).project(refs.camera);
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
  }
  return Math.max((x1 - x0) / 2, (y1 - y0) / 2);
}

/** GPU resources alive in the renderer (leak probe for the long-session e2e). */
const memory = () => ({ geometries: refs.gl?.info.memory.geometries ?? -1, textures: refs.gl?.info.memory.textures ?? -1 });
function removeParts(ids: string[]) { selectParts(ids); deleteSelection(); }

(window as unknown as { __lab: unknown }).__lab = { memory, removeParts, setCode, serialClear: clearSerial, updateWire, selectPart, projectWorld, fillRatio, serial: () => serialLog.text, probe, loadScene, gallery, closeup, viewAngle, frameAll, partsBox, set, EXAMPLES, setSimInput, projectPart, getState, project, litOf, addPart, frame: () => frameRef.current, simState: () => sim.state, camera: () => refs.camera?.position.toArray() };
