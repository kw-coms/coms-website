import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MeshLambertMaterial, type Material, type Mesh, type MeshStandardMaterial, type Object3D } from 'three';
import { createGovernor, WARMUP_MS } from '../ui/quality';
import { getState, onSceneLoaded, stepQuality, subscribe, useStore } from '../ui/store';

type StdLike = MeshStandardMaterial & { userData: { dynamic?: boolean; lite?: Material } };

/** Lite replacements are owned here: created on demand, disposed when switching back or when their source material left the scene. */
const lites = new Map<Material, MeshLambertMaterial>();
function liteOf(m: StdLike): Material {
  const have = lites.get(m);
  if (have) return have;
  const l = new MeshLambertMaterial({
    color: m.color, map: m.map, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity, transparent: m.transparent,
    opacity: m.opacity, side: m.side, depthWrite: m.depthWrite,
  });
  lites.set(m, l);
  return l;
}
function releaseLites(live: Set<Material>) {
  for (const [full, l] of lites) if (!live.has(full)) { l.dispose(); lites.delete(full); }
}

/** Low quality: swap static PBR materials for cheap Lambert ones (and back). Materials driven per frame are left alone. */
export function applyLite(root: Object3D, on: boolean) {
  const live = new Set<Material>();
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const mat = m.material as StdLike | Material[];
    if (on) {
      if (Array.isArray(mat) || !(mat as StdLike).isMeshStandardMaterial || mat.userData.dynamic) return;
      m.userData.fullMat = mat;
      live.add(mat);
      m.material = liteOf(mat);
    } else if (m.userData.fullMat) {
      m.material = m.userData.fullMat as Material;
      delete m.userData.fullMat;
    }
  });
  releaseLites(live);
}

const SLOW_CAP_MS = 250;

/**
 * Quality plumbing inside the Canvas: applies lite materials, and watches frame times so auto mode steps down
 * (and, cautiously, back up) without flapping. Only back-to-back frames count, idle gaps are ignored.
 */
export function QualityRig() {
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const quality = useStore((s) => s.quality);
  const controls = useThree((s) => s.controls) as { addEventListener?: (t: string, f: () => void) => void; removeEventListener?: (t: string, f: () => void) => void } | null;
  const gov = useRef(createGovernor());
  const last = useRef(0);
  const orbiting = useRef(false);
  const warmUntil = useRef(performance.now() + WARMUP_MS);
  useEffect(() => {
    const run = () => requestAnimationFrame(() => { applyLite(scene, getState().quality === 'low'); invalidate(); });
    run();
    // parts/wires mounted later must be converted too
    let prev = getState().hist.present;
    const off = subscribe(() => { const cur = getState().hist.present; if (cur !== prev) { prev = cur; if (getState().quality === 'low') run(); } });
    // a scene replacement (load or example switch) recompiles shaders and rebuilds shadow maps: restart the warm-up, plain edits do not
    const offLoad = onSceneLoaded(() => { warmUntil.current = performance.now() + WARMUP_MS; });
    return () => { off(); offLoad(); applyLite(scene, false); };
  }, [scene, invalidate, quality]);
  useEffect(() => { gov.current.reset(); warmUntil.current = performance.now() + WARMUP_MS; }, [quality]);
  // remember whether the user is orbiting: only continuous frames say anything about GPU speed
  useEffect(() => {
    if (!controls?.addEventListener) return;
    const on = () => { orbiting.current = true; };
    const off = () => { orbiting.current = false; };
    controls.addEventListener('start', on);
    controls.addEventListener('end', off);
    return () => { controls.removeEventListener?.('start', on); controls.removeEventListener?.('end', off); orbiting.current = false; };
  }, [controls]);
  useFrame(() => {
    // demand rendering: only frames driven continuously (a running simulation or an orbit drag) say anything about GPU speed
    if (!orbiting.current && getState().simState !== 'running') { last.current = 0; return; }
    const now = performance.now();
    if (now < warmUntil.current) { last.current = 0; gov.current.reset(); return; }
    const dt = last.current ? now - last.current : 0;
    last.current = now;
    // 100-250 ms gaps are slow frames (a GPU under ~10 fps must still be able to step down); longer gaps are idle, not GPU speed
    if (dt > SLOW_CAP_MS) { gov.current.reset(); return; }
    if (dt < 1) return;
    const r = gov.current.push(dt);
    if (r) stepQuality(r);
  });
  return null;
}
