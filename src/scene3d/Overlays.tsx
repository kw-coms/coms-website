import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Box3, Box3Helper, Color, Object3D, type InstancedMesh, type Mesh } from 'three';
import type { Vec3 } from '../core/types';
import { PARTS } from '../ui/core';
import { useStore, wireHex } from '../ui/store';
import { visibleWarnings } from '../ui/warnings';
import { pinPos } from './WireView';
import { preview } from './sceneRefs';
import { arcApex, wireGeometry, wirePoints } from './wireGeom';

const CYAN = '#2ee6ff';

export function NetGlow() {
  const hover = useStore((s) => s.hover);
  const analysis = useStore((s) => s.analysis);
  const plist = useStore((s) => s.hist.present.parts);
  const pts = useMemo(() => {
    if (!hover) return [] as Vec3[];
    const net = hover.netId ? analysis.nets.find((n) => n.id === hover.netId) : undefined;
    const refs = net?.pins ?? [hover.ref];
    return refs.slice(0, 400).map((r) => pinPos(plist, r.partId, r.pinId)).filter((p): p is Vec3 => !!p);
  }, [hover, analysis, plist]);
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new Object3D();
    pts.forEach((p, i) => {
      o.position.set(p[0], p[1] + 0.25, p[2]);
      o.rotation.set(-Math.PI / 2, 0, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.count = pts.length;
    m.instanceMatrix.needsUpdate = true;
  }, [pts]);
  const first = hover ? pinPos(plist, hover.ref.partId, hover.ref.pinId) : null;
  return (
    <>
      <instancedMesh ref={ref} args={[undefined, undefined, 400]} frustumCulled={false} renderOrder={4}>
        <ringGeometry args={[0.7, 1.45, 20]} />
        <meshBasicMaterial color={CYAN} transparent opacity={0.95} depthTest={false} toneMapped={false} />
      </instancedMesh>
      {first && (
        <mesh position={[first[0], first[1] + 0.3, first[2]]} rotation-x={-Math.PI / 2} renderOrder={5}>
          <ringGeometry args={[1.6, 2.3, 24]} />
          <meshBasicMaterial color="#ffffff" depthTest={false} toneMapped={false} />
        </mesh>
      )}
    </>
  );
}

export function SnapRings() {
  const draft = useStore((s) => s.draft);
  if (!draft) return null;
  const ring = (p: Vec3, color: string, i: string) => (
    <mesh key={i} position={[p[0], p[1] + 0.3, p[2]]} rotation-x={-Math.PI / 2} renderOrder={6}>
      <ringGeometry args={[1.1, 1.9, 20]} />
      <meshBasicMaterial color={color} depthTest={false} toneMapped={false} />
    </mesh>
  );
  return <>{draft.snap.ok.map((p, i) => ring(p, '#2fd45a', `o${i}`))}{draft.snap.bad.map((p, i) => ring(p, '#ff4040', `b${i}`))}</>;
}

/** Wire being drawn: follows the cursor. */
export function PreviewWire() {
  const start = useStore((s) => s.wireStart);
  const plist = useStore((s) => s.hist.present.parts);
  const mesh = useRef<Mesh>(null);
  const seen = useRef(-1);
  const a = start ? pinPos(plist, start.partId, start.pinId) : null;
  useFrame(() => {
    const m = mesh.current;
    if (!m || !a || !preview.point || seen.current === preview.v) return;
    seen.current = preview.v;
    m.geometry.dispose();
    m.geometry = wireGeometry(wirePoints(a, preview.point), 0.7);
  });
  useEffect(() => {
    seen.current = -1;
  }, [start]);
  if (!a) return null;
  return (
    <mesh ref={mesh} renderOrder={7}>
      <tubeGeometry args={[undefined, 1, 0.01, 3]} />
      <meshBasicMaterial color={CYAN} transparent opacity={0.85} toneMapped={false} />
    </mesh>
  );
}

function OneBox({ id }: { id: string }) {
  const helper = useMemo(() => new Box3Helper(new Box3(), new Color('#3b82f6')), []);
  useFrame(({ scene }) => {
    let target: Object3D | undefined;
    for (const c of scene.children) if (c.userData.partId === id && !target) target = c;
    if (!target) return void (helper.visible = false);
    helper.visible = true;
    helper.box.makeEmpty();
    helper.box.setFromObject(target);
    helper.box.expandByScalar(0.8);
  });
  return <primitive object={helper} />;
}
export function SelectionBox() {
  const sel = useStore((s) => s.selection);
  const multi = useStore((s) => s.multi);
  const ids = multi.length > 1 ? multi : sel?.kind === 'part' ? [sel.id] : [];
  return <>{ids.map((id) => <OneBox key={id} id={id} />)}</>;
}

/** Draggable bend handles for the selected wire (ghost handles at segment midpoints add a bend). */
export function BendHandles() {
  const sel = useStore((s) => s.selection);
  const wire = useStore((s) => (s.selection?.kind === 'wire' ? s.hist.present.wires.find((w) => w.id === s.selection!.id) : undefined));
  const plist = useStore((s) => s.hist.present.parts);
  if (sel?.kind !== 'wire' || !wire) return null;
  const a = pinPos(plist, wire.from.partId, wire.from.pinId);
  const b = pinPos(plist, wire.to.partId, wire.to.pinId);
  if (!a || !b) return null;
  const bends = wire.bends ?? [];
  const chain: Vec3[] = [a, ...bends, b];
  const ghosts: { at: Vec3; index: number }[] = [];
  if (!bends.length) ghosts.push({ at: arcApex(a, b), index: 0 });
  else for (let i = 0; i < chain.length - 1; i++) ghosts.push({ at: [(chain[i]![0] + chain[i + 1]![0]) / 2, (chain[i]![1] + chain[i + 1]![1]) / 2 + 2, (chain[i]![2] + chain[i + 1]![2]) / 2], index: i });
  return (
    <>
      {bends.map((p, i) => (
        <mesh key={`b${i}`} position={p} userData={{ bend: { wireId: wire.id, index: i, ghost: false } }} renderOrder={8}>
          <sphereGeometry args={[2.4, 16, 12]} />
          <meshBasicMaterial color={wireHex(wire.color) === '#eceff1' ? '#3b82f6' : '#ffffff'} depthTest={false} toneMapped={false} />
        </mesh>
      ))}
      {ghosts.map((g) => (
        <mesh key={`g${g.index}`} position={g.at} userData={{ bend: { wireId: wire.id, index: g.index, ghost: true } }} renderOrder={8}>
          <sphereGeometry args={[2.2, 16, 12]} />
          <meshBasicMaterial color="#3b82f6" transparent opacity={0.65} depthTest={false} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

const LEVEL_COLOR = { error: '#e5484d', warn: '#f5a524', info: '#3b82f6' } as const;
const RANK = { error: 3, warn: 2, info: 1 } as const;

/** Per-part Korean name chips and warning badges (DOM overlays, cheap for a handful of parts). */
export function PartAnnotations() {
  const plist = useStore((s) => s.hist.present.parts);
  const labels = useStore((s) => s.labels);
  const analysis = useStore((s) => s.analysis);
  const simW = useStore((s) => s.simWarnings);
  const hide = useStore((s) => s.draft?.hideId);
  const byPart = new Map<string, 'error' | 'warn' | 'info'>();
  for (const w of visibleWarnings([...analysis.warnings, ...simW], (id) => plist.find((p) => p.id === id)?.kind)) {
    if (!w.partId || w.level === 'info') continue;
    const cur = byPart.get(w.partId);
    if (!cur || RANK[w.level] > RANK[cur]) byPart.set(w.partId, w.level);
  }
  return (
    <>
      {plist.map((p) => {
        if (p.id === hide) return null;
        const def = PARTS[p.kind];
        const lvl = byPart.get(p.id);
        if (!labels && !lvl) return null;
        const top = (def?.size[1] ?? 8) + 6;
        const x = p.kind.startsWith('breadboard') ? p.pos[0] - (def!.size[0] / 2 - 8) : p.pos[0];
        const z = p.kind.startsWith('breadboard') || p.kind === 'arduino-uno' ? p.pos[2] - (def!.size[2] / 2) : p.pos[2];
        return (
          <Html key={p.id} position={[x, p.pos[1] + top, z]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
            <div className="ann">
              {labels && <span className="ann-name">{def?.title}</span>}
              {lvl && <span className="ann-badge" style={{ background: LEVEL_COLOR[lvl] }} title="경고가 있어요">!</span>}
            </div>
          </Html>
        );
      })}
    </>
  );
}
