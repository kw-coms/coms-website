import { useEffect, useMemo, useRef, type DragEvent } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { PMREMGenerator, RepeatWrapping, type Camera } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { PARTS } from '../ui/core';
import { onSimFrame } from '../ui/simHost';
import { getState, parts, subscribe, useStore } from '../ui/store';
import { Interaction } from './Interaction';
import { BendHandles, NetGlow, PartAnnotations, PreviewWire, SelectionBox, SnapRings } from './Overlays';
import { PartView } from './PartView';
import { WireView, pinPos } from './WireView';
import { dropFromPalette, groundPoint, placeAt } from './placement';
import { DESK_Y, refs } from './sceneRefs';
import { makeTexture } from './parts/common';
import type { PartKind } from '../core/types';
import { set } from '../ui/store';

const DARK = { bg: '#161b22', desk: '#232a33', grid: '#2e3744' };
const LIGHT = { bg: '#e9eff5', desk: '#dde5ee', grid: '#cbd5e1' };

function Desk() {
  const theme = useStore((s) => s.theme);
  const c = theme === 'dark' ? DARK : LIGHT;
  const tex = useMemo(() => {
    const t = makeTexture(256, 256, (g) => {
      g.fillStyle = c.desk; g.fillRect(0, 0, 256, 256);
      g.strokeStyle = c.grid; g.lineWidth = 2;
      g.strokeRect(0, 0, 256, 256);
    });
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(1600 / 25.4 / 2, 1000 / 25.4 / 2);
    return t;
  }, [c.desk, c.grid]);
  return (
    <mesh position={[40, DESK_Y - 0.05, 0]} rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[1600, 1000]} />
      <meshStandardMaterial map={tex} roughness={0.95} />
    </mesh>
  );
}

function Env() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pm = new PMREMGenerator(gl);
    const env = new RoomEnvironment();
    const rt = pm.fromScene(env, 0.04);
    scene.environment = rt.texture;
    scene.environmentIntensity = 0.55;
    return () => {
      scene.environment = null;
      rt.dispose();
      pm.dispose();
    };
  }, [gl, scene]);
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

function frameAll(camera: Camera, controls: OrbitControlsImpl | null, view: 'persp' | 'top', aspect: number) {
  const list = parts();
  let x0 = -60, x1 = 60, z0 = -40, z1 = 40;
  if (list.length) {
    x0 = Infinity; x1 = -Infinity; z0 = Infinity; z1 = -Infinity;
    for (const p of list) {
      const s = PARTS[p.kind]?.size ?? [10, 10, 10];
      const r = Math.max(s[0], s[2]) / 2;
      x0 = Math.min(x0, p.pos[0] - r); x1 = Math.max(x1, p.pos[0] + r);
      z0 = Math.min(z0, p.pos[2] - r); z1 = Math.max(z1, p.pos[2] + r);
    }
  }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const w = Math.max(60, x1 - x0) * 1.12, d = Math.max(60, z1 - z0) * 1.12;
  const cam = camera as Camera & { zoom: number; isOrthographicCamera?: boolean; fov?: number; updateProjectionMatrix(): void };
  if (view === 'top') {
    cam.position.set(cx, 800, cz + 0.001);
    if (controls) controls.target.set(cx, 0, cz);
    const h = refs.gl?.domElement.clientHeight ?? 600, wpx = refs.gl?.domElement.clientWidth ?? 800;
    cam.zoom = Math.min(wpx / w, h / d);
  } else {
    const fov = ((cam.fov ?? 40) * Math.PI) / 180;
    const dist = Math.max(d / 2 / Math.tan(fov / 2), w / 2 / Math.tan(fov / 2) / Math.max(aspect, 0.5)) * 1.05;
    cam.position.set(cx, dist * 0.78, cz + dist * 0.66);
    if (controls) controls.target.set(cx, -4, cz);
  }
  cam.updateProjectionMatrix();
  controls?.update();
  refs.invalidate();
}

function CameraRig() {
  const view = useStore((s) => s.view);
  const tick = useStore((s) => s.cameraResetTick);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  useEffect(() => {
    refs.camera = camera;
    refs.controls = controls;
    frameAll(camera, controls, view, sizeRef.current.width / sizeRef.current.height);
  }, [camera, controls, view, tick]);
  return (
    <>
      {view === 'persp' ? (
        <PerspectiveCamera makeDefault fov={38} near={5} far={5000} position={[60, 220, 260]} />
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
        minDistance={view === 'persp' ? 40 : 0}
        maxDistance={view === 'persp' ? 1400 : 3000}
        minZoom={0.6}
        maxZoom={30}
        maxPolarAngle={view === 'persp' ? Math.PI / 2.08 : Math.PI}
        mouseButtons={{ LEFT: 0, MIDDLE: 1, RIGHT: 2 }}
      />
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
  const shownParts = draft?.hideId ? plist.filter((p) => p.id !== draft.hideId) : plist;
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
      <hemisphereLight args={['#ffffff', '#7b8ca3', 0.85]} />
      <directionalLight position={[150, 320, 180]} intensity={2.4} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.6} shadow-radius={5}>
        <orthographicCamera attach="shadow-camera" args={[-280, 280, 220, -220, 10, 900]} />
      </directionalLight>
      <Env />
      <Desk />
      {shownParts.map((p) => <PartView key={p.id} part={p} />)}
      {draft && <PartView key="__draft" part={draft.part} />}
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

export function Workspace() {
  const wrap = useRef<HTMLDivElement>(null);
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
      <Canvas frameloop="demand" shadows="soft" dpr={[1, 2]} gl={{ antialias: true, preserveDrawingBuffer: true }} aria-label="3D 작업대">
        <Content />
      </Canvas>
    </div>
  );
}

let dragKind: PartKind | null = null;
export const setDragKind = (k: PartKind | null) => (dragKind = k);
