// Dev-only hooks used by tools/e2e-browser.mjs (never bundled in production builds).
import { Vector3 } from 'three';
import { EXAMPLES, pinWorldPos } from './core';
import { refs } from '../scene3d/sceneRefs';
import { addPart, getState } from './store';
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
(window as unknown as { __lab: unknown }).__lab = { EXAMPLES, setSimInput, projectPart, getState, project, litOf, addPart, frame: () => frameRef.current, simState: () => sim.state, camera: () => refs.camera?.position.toArray() };
