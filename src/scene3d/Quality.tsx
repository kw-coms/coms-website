import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MeshLambertMaterial, type Material, type Mesh, type MeshStandardMaterial, type Object3D } from 'three';
import { createGovernor } from '../ui/quality';
import { getState, stepQuality, subscribe, useStore } from '../ui/store';

type StdLike = MeshStandardMaterial & { userData: { dynamic?: boolean; lite?: Material } };

function liteOf(m: StdLike): Material {
  if (m.userData.lite) return m.userData.lite;
  const l = new MeshLambertMaterial({
    color: m.color, map: m.map, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity, transparent: m.transparent,
    opacity: m.opacity, side: m.side, depthWrite: m.depthWrite,
  });
  m.userData.lite = l;
  return l;
}

/** Low quality: swap static PBR materials for cheap Lambert ones (and back). Materials driven per frame are left alone. */
export function applyLite(root: Object3D, on: boolean) {
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const mat = m.material as StdLike | Material[];
    if (on) {
      if (Array.isArray(mat) || !(mat as StdLike).isMeshStandardMaterial || mat.userData.dynamic) return;
      m.userData.fullMat = mat;
      m.material = liteOf(mat);
    } else if (m.userData.fullMat) {
      m.material = m.userData.fullMat as Material;
      delete m.userData.fullMat;
    }
  });
}

/**
 * Quality plumbing inside the Canvas: applies lite materials, and watches frame times so auto mode steps down
 * (and, cautiously, back up) without flapping. Only back-to-back frames count, idle gaps are ignored.
 */
export function QualityRig() {
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const quality = useStore((s) => s.quality);
  const setDpr = useThree((s) => s.setDpr);
  const controls = useThree((s) => s.controls) as { addEventListener?: (t: string, f: () => void) => void; removeEventListener?: (t: string, f: () => void) => void } | null;
  const gov = useRef(createGovernor());
  const last = useRef(0);
  useEffect(() => {
    const run = () => requestAnimationFrame(() => { applyLite(scene, getState().quality === 'low'); invalidate(); });
    run();
    // parts/wires mounted later must be converted too
    let prev = getState().hist.present;
    const off = subscribe(() => { const cur = getState().hist.present; if (cur !== prev) { prev = cur; if (getState().quality === 'low') run(); } });
    return () => void off();
  }, [scene, invalidate, quality]);
  useEffect(() => { gov.current.reset(); }, [quality]);
  // while the user orbits/zooms, render at lower resolution (restored on release)
  useEffect(() => {
    if (quality === 'high' || !controls?.addEventListener) return;
    const base = quality === 'low' ? 0.75 : Math.min(1.5, window.devicePixelRatio || 1);
    const start = () => setDpr(quality === 'low' ? 0.5 : 0.75);
    const end = () => { setDpr(base); invalidate(); };
    controls.addEventListener('start', start);
    controls.addEventListener('end', end);
    return () => { controls.removeEventListener?.('start', start); controls.removeEventListener?.('end', end); setDpr(base); };
  }, [controls, quality, setDpr, invalidate]);
  useFrame(() => {
    const now = performance.now();
    const dt = now - last.current;
    last.current = now;
    if (dt > 250 || dt < 1) return;
    const r = gov.current.push(dt);
    if (r) stepQuality(r);
  });
  return null;
}
