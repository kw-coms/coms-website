import { useEffect, useLayoutEffect, useMemo, useRef, type DragEvent } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { PMREMGenerator, RepeatWrapping, type DirectionalLight } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { PARTS } from '../ui/core';
import { scheduleFrame } from './cameraFrame';
import { QualityRig } from './Quality';
import { onSimFrame } from '../ui/simHost';
import { getState, subscribe, useStore } from '../ui/store';
import { Interaction } from './Interaction';
import { BendHandles, NetGlow, PartAnnotations, PreviewWire, SelectionBox, SnapRings } from './Overlays';
import { PartView } from './PartView';
import { WireView, pinPos } from './WireView';
import { dropFromPalette, groundPoint, placeAt } from './placement';
import { DESK_Y, refs } from './sceneRefs';
import { makeTexture } from './parts/common';
import type { PartKind } from '../core/types';
import { set } from '../ui/store';

const DARK = { bg: '#141a21', fog: '#141a21' };
const LIGHT = { bg: '#e6edf4', fog: '#e6edf4' };

// mulberry32: tiny seeded PRNG so the wood grain is the same on every load
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** 203.2 mm square tile: two planks with grain, faint 25.4 mm grid (theme-aware). */
function deskTexture(dark: boolean) {
  const S = 1024;
  const r = rng(7);
  const planks = dark ? ['#3b4452', '#343d4a'] : ['#e3c697', '#dcbd8c'];
  const grain = dark ? '255,255,255' : '110,70,25';
  const seam = dark ? 'rgba(0,0,0,0.45)' : 'rgba(95,60,20,0.35)';
  const gridC = dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.28)';
  const t = makeTexture(S, S, (g) => {
    planks.forEach((col, k) => {
      const y0 = (k * S) / 2;
      g.fillStyle = col;
      g.fillRect(0, y0, S, S / 2);
      for (let i = 0; i < 90; i++) {
        const y = y0 + r() * (S / 2);
        g.strokeStyle = `rgba(${grain},${(dark ? 0.01 + r() * 0.025 : 0.03 + r() * 0.07).toFixed(3)})`;
        g.lineWidth = 0.6 + r() * 1.8;
        g.beginPath();
        g.moveTo(0, y);
        g.bezierCurveTo(S * 0.3, y + (r() - 0.5) * 9, S * 0.65, y + (r() - 0.5) * 9, S, y + (r() - 0.5) * 4);
        g.stroke();
      }
      g.fillStyle = seam;
      g.fillRect(0, y0, S, 3);
    });
    g.strokeStyle = gridC;
    g.lineWidth = 2;
    for (let i = 0; i <= 8; i++) {
      const q = (i * S) / 8;
      g.beginPath(); g.moveTo(q, 0); g.lineTo(q, S); g.moveTo(0, q); g.lineTo(S, q); g.stroke();
    }
  });
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

function Desk() {
  const dark = useStore((s) => s.theme === 'dark');
  const tex = useMemo(() => {
    const t = deskTexture(dark);
    t.repeat.set(2400 / 203.2, 1800 / 203.2);
    return t;
  }, [dark]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh position={[0, DESK_Y - 0.05, 0]} rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[2400, 1800]} />
      <meshStandardMaterial map={tex} roughness={0.78} envMapIntensity={0.5} />
    </mesh>
  );
}

function Env({ strength }: { strength: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pm = new PMREMGenerator(gl);
    const env = new RoomEnvironment();
    const rt = pm.fromScene(env, 0.04);
    scene.environment = rt.texture;
    scene.environmentIntensity = strength;
    return () => {
      scene.environment = null;
      rt.dispose();
      pm.dispose();
    };
  }, [gl, scene, strength]);
  return null;
}

/** Re-render the (demand-driven) canvas whenever the document, selection or simulation changes. */
function Invalidator() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const a = subscribe(() => invalidate());
    const b = onSimFrame(() => invalidate());
    return () => {
      a();
      b();
    };
  }, [invalidate]);
  return null;
}

function CameraRig() {
  const view = useStore((s) => s.view);
  const tick = useStore((s) => s.cameraResetTick);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  useEffect(() => {
    refs.camera = camera;
    refs.controls = controls;
    scheduleFrame();
  }, [camera, controls, view, tick]);
  return (
    <>
      {view === 'persp' ? (
        <PerspectiveCamera makeDefault fov={36} near={8} far={6000} position={[60, 220, 260]} />
      ) : (
        <OrthographicCamera makeDefault near={1} far={3000} position={[0, 800, 0.001]} zoom={4} />
      )}
      <OrbitControls
        key={`${view}-${camera.uuid}`}
        makeDefault
        enableDamping
        dampingFactor={0.12}
        enableRotate={view === 'persp'}
        screenSpacePanning
        minDistance={view === 'persp' ? 25 : 0}
        maxDistance={view === 'persp' ? 1800 : 3000}
        minZoom={0.5}
        maxZoom={40}
        minPolarAngle={0.12}
        maxPolarAngle={view === 'persp' ? Math.PI / 2.1 : Math.PI}
        mouseButtons={{ LEFT: 0, MIDDLE: 1, RIGHT: 2 }}
      />
    </>
  );
}

/** Key light with a shadow frustum fitted to the bench, plus a soft fill from the opposite side. */
function Lights({ dark, quality }: { dark: boolean; quality: 'high' | 'medium' | 'low' }) {
  const plist = useStore((s) => s.hist.present.parts);
  const key = useRef<DirectionalLight>(null);
  const { cx, cz, half } = useMemo(() => {
    if (!plist.length) return { cx: 0, cz: 0, half: 160 };
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of plist) {
      const r = Math.max(...(PARTS[p.kind]?.size ?? [20, 0, 20])) + 40;
      x0 = Math.min(x0, p.pos[0] - r); x1 = Math.max(x1, p.pos[0] + r);
      z0 = Math.min(z0, p.pos[2] - r); z1 = Math.max(z1, p.pos[2] + r);
    }
    return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, half: Math.min(900, Math.max(150, Math.hypot(x1 - x0, z1 - z0) / 2)) };
  }, [plist]);
  useLayoutEffect(() => {
    const l = key.current;
    if (!l) return;
    const c = l.shadow.camera;
    c.left = -half; c.right = half; c.top = half; c.bottom = -half; c.near = 20; c.far = 1400;
    c.updateProjectionMatrix();
    l.target.position.set(cx, 0, cz);
    l.target.updateMatrixWorld();
    l.shadow.needsUpdate = true;
  }, [cx, cz, half, quality]);
  return (
    <>
      <hemisphereLight args={['#ffffff', dark ? '#4b5a70' : '#9aa7b8', quality === 'low' ? (dark ? 1.1 : 1.5) : dark ? 0.55 : 0.8]} />
      <directionalLight key={quality} ref={key} position={[cx + 190, 420, cz + 230]} intensity={dark ? 1.9 : 2.3} castShadow={quality !== 'low'} shadow-mapSize={quality === 'high' ? [4096, 4096] : [2048, 2048]} shadow-bias={-0.0003} shadow-normalBias={0.35} shadow-radius={quality === 'high' ? 6 : 3} shadow-blurSamples={16} />
      {quality !== 'low' && <directionalLight position={[cx - 220, 260, cz - 140]} intensity={dark ? 0.35 : 0.6} />}
    </>
  );
}

function Content() {
  const plist = useStore((s) => s.hist.present.parts);
  const wlist = useStore((s) => s.hist.present.wires);
  const draft = useStore((s) => s.draft);
  const sel = useStore((s) => s.selection);
  const hover = useStore((s) => s.hover);
  const analysis = useStore((s) => s.analysis);
  const theme = useStore((s) => s.theme);
  const quality = useStore((s) => s.quality);
  const hidden = draft?.hideIds ?? (draft?.hideId ? [draft.hideId] : []);
  const shownParts = hidden.length ? plist.filter((p) => !hidden.includes(p.id)) : plist;
  const ptsMemo = useMemo(() => {
    const m = new Map<string, [import('../core/types').Vec3, import('../core/types').Vec3]>();
    for (const w of wlist) {
      const a = pinPos(plist, w.from.partId, w.from.pinId), b = pinPos(plist, w.to.partId, w.to.pinId);
      if (a && b) m.set(w.id, [a, b]);
    }
    return m;
  }, [wlist, plist]);
  const bg = theme === 'dark' ? DARK.bg : LIGHT.bg;
  return (
    <>
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[bg, 900, 2600]} />
      <Lights dark={theme === 'dark'} quality={quality} />
      {quality !== 'low' && <Env strength={quality === 'high' ? 0.55 : 0.4} />}
      <QualityRig />
      <Desk />
      {shownParts.map((p) => <PartView key={p.id} part={p} />)}
      {draft && <PartView key="__draft" part={draft.part} />}
      {draft?.extra?.map((p) => <PartView key={`__draft-${p.id}`} part={p} />)}
      {wlist.map((w) => {
        const e = ptsMemo.get(w.id);
        if (!e) return null;
        const net = analysis.pinToNet[`${w.from.partId}:${w.from.pinId}`];
        return <WireView key={w.id} wire={w} a={e[0]} b={e[1]} selected={sel?.kind === 'wire' && sel.id === w.id} glow={!!hover?.netId && hover.netId === net} />;
      })}
      <NetGlow />
      <SnapRings />
      <PreviewWire />
      <SelectionBox />
      <BendHandles />
      <PartAnnotations />
      <CameraRig />
      <Interaction />
      <Invalidator />
    </>
  );
}

function Marquee() {
  const m = useStore((s) => s.marquee);
  if (!m) return null;
  return <div className="marquee" style={{ left: Math.min(m.x0, m.x1), top: Math.min(m.y0, m.y1), width: Math.abs(m.x1 - m.x0), height: Math.abs(m.y1 - m.y0) }} />;
}

export function Workspace() {
  const wrap = useRef<HTMLDivElement>(null);
  const quality = useStore((s) => s.quality);
  const aa = useRef(getState().quality !== 'low').current; // antialias is fixed at context creation
  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('application/x-part-kind')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const kind = dragKind;
    if (!kind) return;
    const g = groundPoint(e.clientX, e.clientY);
    if (!g) return;
    const { part, snap } = placeAt({ id: '__drag', kind, pos: [0, 0, 0], rotY: 0, props: {} }, [g[0], g[2]]);
    set({ draft: { part: { ...part, props: Object.fromEntries((PARTS[kind]?.props ?? []).map((p) => [p.key, p.default])) }, snap } });
  };
  const onDrop = (e: DragEvent) => {
    const kind = e.dataTransfer.getData('application/x-part-kind') as PartKind;
    e.preventDefault();
    dragKind = null;
    if (kind && PARTS[kind]) dropFromPalette(kind, e.clientX, e.clientY);
    wrap.current?.focus();
  };
  return (
    <div ref={wrap} className="workspace" tabIndex={-1} onDragOver={onDragOver} onDrop={onDrop} onDragLeave={() => getState().draft && set({ draft: null })}>
      <Marquee />
      <Canvas frameloop="demand" shadows={quality === 'low' ? false : quality === 'high' ? 'soft' : true} dpr={quality === 'high' ? [1, 2] : quality === 'medium' ? [1, 1.5] : 0.75} gl={{ antialias: aa, preserveDrawingBuffer: true, powerPreference: 'high-performance' }} aria-label="3D 작업대">
        <Content />
      </Canvas>
    </div>
  );
}

let dragKind: PartKind | null = null;
export const setDragKind = (k: PartKind | null) => (dragKind = k);
