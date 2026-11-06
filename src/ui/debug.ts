// Dev-only hooks used by tools/e2e-browser.mjs (never bundled in production builds).
import { Vector3 } from 'three';
import { EXAMPLES, PARTS, pinWorldPos } from './core';
import { refs } from '../scene3d/sceneRefs';
import { addPart, getState, loadScene, set, updateParts } from './store';
import { frameAll, partsBox, viewAngle } from '../scene3d/cameraFrame';
import type { PartKind, Scene } from '../core/types';
import { frameRef, setSimInput, sim } from './simHost';

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

(window as unknown as { __lab: unknown }).__lab = { loadScene, gallery, closeup, viewAngle, frameAll, partsBox, set, EXAMPLES, setSimInput, projectPart, getState, project, litOf, addPart, frame: () => frameRef.current, simState: () => sim.state, camera: () => refs.camera?.position.toArray() };
