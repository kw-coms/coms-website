import { useLayoutEffect, useMemo, useRef } from 'react';
import { Object3D, type InstancedMesh } from 'three';
import { RoundedBox } from '@react-three/drei';
import type { PinDef } from '../../core/types';
import { PARTS } from '../../ui/core';
import { DESK_Y } from '../sceneRefs';
import { makeTexture, type PartProps } from './common';

const P = 2.54;
const SILVER = '#c9ced3';

/** Split pins that share a row into contiguous header strips. */
function strips(pins: PinDef[]) {
  const rows = new Map<number, PinDef[]>();
  for (const p of pins) {
    const k = Math.round(p.pos[2] * 10);
    (rows.get(k) ?? rows.set(k, []).get(k)!).push(p);
  }
  const out: PinDef[][] = [];
  for (const row of rows.values()) {
    row.sort((a, b) => a.pos[0] - b.pos[0]);
    let cur: PinDef[] = [];
    for (const p of row) {
      if (cur.length && p.pos[0] - cur[cur.length - 1]!.pos[0] > P * 1.5) (out.push(cur), (cur = []));
      cur.push(p);
    }
    if (cur.length) out.push(cur);
  }
  return out;
}

export function ArduinoUno() {
  const def = PARTS['arduino-uno'];
  const [W, , D] = def.size;
  const groups = useMemo(() => strips(def.pins), [def]);
  const tex = useMemo(() => {
    const s = 16;
    return makeTexture(Math.round(W * s), Math.round(D * s), (c) => {
      c.clearRect(0, 0, W * s, D * s);
      c.fillStyle = 'rgba(255,255,255,0.92)';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `bold ${1.5 * s}px sans-serif`;
      for (const p of def.pins) {
        const top = p.pos[2] < 0;
        const x = (p.pos[0] + W / 2) * s;
        const y = (p.pos[2] + D / 2 + (top ? 4.2 : -4.2)) * s;
        c.save();
        c.translate(x, y);
        c.rotate(-Math.PI / 2);
        c.fillText(p.id.replace('.', '').replace(/^GND\d$/, 'GND'), 0, 0);
        c.restore();
      }
      c.font = `bold ${4.2 * s}px sans-serif`;
      c.fillText('ARDUINO', (W / 2 + 4) * s, (D / 2 - 11) * s);
      c.font = `bold ${3 * s}px sans-serif`;
      c.fillText('UNO  R3', (W / 2 + 4) * s, (D / 2 - 5) * s);
      c.strokeStyle = 'rgba(255,255,255,0.8)';
      c.lineWidth = 0.35 * s;
      c.strokeRect(1.5 * s, 1.5 * s, (W - 3) * s, (D - 3) * s);
    });
  }, [def, W, D]);
  return (
    <group>
      <mesh position={[0, -0.8, 0]} castShadow receiveShadow>
        <boxGeometry args={[W, 1.6, D]} />
        <meshStandardMaterial color="#0b8a8f" roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[W, D]} />
        <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      {[[-29, -20], [29, -20], [-29, 20], [26, 20]].map(([x, z], i) => (
        <mesh key={i} position={[x!, (DESK_Y - 1.6) / 2, z!]}>
          <cylinderGeometry args={[3, 3, -DESK_Y - 1.6, 12]} />
          <meshStandardMaterial color="#2a2f35" />
        </mesh>
      ))}
      {/* USB-B and barrel jack on the -X end */}
      <mesh position={[-28.5, 5.7, -11]} castShadow>
        <boxGeometry args={[16, 11, 12]} />
        <meshStandardMaterial color={SILVER} metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[-29.5, 5.5, 18]} castShadow>
        <boxGeometry args={[14, 11, 9]} />
        <meshStandardMaterial color="#1b1d20" roughness={0.6} />
      </mesh>
      {/* ATmega328P DIP-28 */}
      <mesh position={[4, 2.4, 7]} castShadow>
        <boxGeometry args={[34.8, 4.4, 7.6]} />
        <meshStandardMaterial color="#1e2023" roughness={0.5} />
      </mesh>
      <mesh position={[-12.8, 4.62, 7]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[1.2, 16]} />
        <meshStandardMaterial color="#111" />
      </mesh>
      {/* crystal, reset button, caps, LEDs */}
      <mesh position={[-14, 1.6, -3]} castShadow><boxGeometry args={[11, 3.2, 4.5]} /><meshStandardMaterial color={SILVER} metalness={0.8} roughness={0.35} /></mesh>
      <mesh position={[-20, 1.5, 21]} castShadow><cylinderGeometry args={[2.6, 2.6, 3, 16]} /><meshStandardMaterial color="#d33" /></mesh>
      <mesh position={[-21, 4, 7]} castShadow><cylinderGeometry args={[3.2, 3.2, 8, 16]} /><meshStandardMaterial color={SILVER} metalness={0.7} roughness={0.35} /></mesh>
      <mesh position={[-21, 4, 14]} castShadow><cylinderGeometry args={[3.2, 3.2, 8, 16]} /><meshStandardMaterial color={SILVER} metalness={0.7} roughness={0.35} /></mesh>
      <mesh position={[-3, 0.6, -17]}><boxGeometry args={[2, 1, 1.2]} /><meshStandardMaterial color="#ffb300" emissive="#ffb300" emissiveIntensity={0.3} /></mesh>
      <mesh position={[8, 0.6, -17]}><boxGeometry args={[2, 1, 1.2]} /><meshStandardMaterial color="#27d35a" emissive="#27d35a" emissiveIntensity={0.6} /></mesh>
      {/* header strips + socket openings */}
      {groups.map((g, i) => {
        const x0 = g[0]!.pos[0], x1 = g[g.length - 1]!.pos[0];
        return (
          <mesh key={i} position={[(x0 + x1) / 2, 4.25, g[0]!.pos[2]]} castShadow receiveShadow>
            <boxGeometry args={[x1 - x0 + P, 8.5, P]} />
            <meshStandardMaterial color="#17191c" roughness={0.55} />
          </mesh>
        );
      })}
      {def.pins.map((p) => (
        <mesh key={p.id} position={[p.pos[0], p.pos[1] + 0.02, p.pos[2]]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[1.3, 1.3]} />
          <meshStandardMaterial color="#55585d" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

export function Breadboard({ part }: PartProps) {
  const def = PARTS[part.kind];
  const [W, H, D] = def.size;
  const ref = useRef<InstancedMesh>(null);
  const holes = def.pins;
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new Object3D();
    holes.forEach((h, i) => {
      o.position.set(h.pos[0], 0.04, h.pos[2]);
      o.rotation.set(-Math.PI / 2, 0, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [holes]);
  const railInfo = useMemo(() => {
    const r = (prefix: string) => {
      const xs = holes.filter((h) => h.id.startsWith(prefix)).map((h) => h.pos);
      return { x0: Math.min(...xs.map((p) => p[0])), x1: Math.max(...xs.map((p) => p[0])), z: xs[0]![2] };
    };
    return { tp: r('tp'), tn: r('tn'), bp: r('bp'), bn: r('bn') };
  }, [holes]);
  const tex = useMemo(() => {
    const s = 12;
    return makeTexture(Math.round(W * s), Math.round(D * s), (c) => {
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `${2.1 * s}px sans-serif`;
      c.fillStyle = '#6d7480';
      const px = (x: number) => (x + W / 2) * s;
      const pz = (z: number) => (z + D / 2) * s;
      const cols = new Map<number, number>();
      const rows = new Map<string, number>();
      for (const h of holes) {
        const m = /^([a-j])(\d+)$/.exec(h.id);
        if (!m) continue;
        cols.set(Number(m[2]), h.pos[0]);
        rows.set(m[1]!, h.pos[2]);
      }
      const xMin = Math.min(...cols.values());
      for (const [letter, z] of rows) c.fillText(letter, px(xMin - 3.6), pz(z));
      const zTop = Math.min(...rows.values()), zBot = Math.max(...rows.values());
      for (const [n, x] of cols) if (n === 1 || n % 5 === 0) (c.fillText(String(n), px(x), pz(zTop - 3.4)), c.fillText(String(n), px(x), pz(zBot + 3.4)));
      c.font = `bold ${2.6 * s}px sans-serif`;
      for (const [key, sign, color] of [['tp', '+', '#d33'], ['tn', '−', '#2563d9'], ['bp', '+', '#d33'], ['bn', '−', '#2563d9']] as const) {
        c.fillStyle = color;
        c.fillText(sign, px(railInfo[key].x0 - 3.6), pz(railInfo[key].z));
      }
    });
  }, [holes, W, D, railInfo]);
  const stripe = (key: 'tp' | 'tn' | 'bp' | 'bn', color: string, dz: number) => {
    const r = railInfo[key];
    return (
      <mesh key={key} position={[(r.x0 + r.x1) / 2, 0.03, r.z + dz]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[r.x1 - r.x0 + 3, 0.5]} />
        <meshBasicMaterial color={color} />
      </mesh>
    );
  };
  return (
    <group>
      <RoundedBox args={[W, H, D]} radius={1.2} smoothness={3} position={[0, -H / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#f0ede4" roughness={0.55} />
      </RoundedBox>
      <mesh position={[0, 0.02, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[W - 2, 2.6]} />
        <meshStandardMaterial color="#cfcabd" roughness={0.8} />
      </mesh>
      {stripe('tp', '#e53935', -1.9)}
      {stripe('tn', '#2563d9', 1.9)}
      {stripe('bp', '#e53935', 1.9)}
      {stripe('bn', '#2563d9', -1.9)}
      <instancedMesh ref={ref} args={[undefined, undefined, holes.length]}>
        <planeGeometry args={[1.35, 1.35]} />
        <meshBasicMaterial color="#3a3e45" />
      </instancedMesh>
      <mesh position={[0, 0.06, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[W, D]} />
        <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}
