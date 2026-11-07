// Building blocks shared by the v2 part meshes. Everything here is data-driven from PARTS pin positions,
// so a mesh follows the core's pin layout instead of hard-coding it.
import { useMemo } from 'react';
import type { PartKind, PinDef, Vec3 } from '../../core/types';
import { PARTS } from '../../ui/core';
import { cachedTexture, Legs } from './common';

export { Legs };

export const METAL = '#b7bcc2';
export const pinsOf = (kind: PartKind): PinDef[] => PARTS[kind]?.pins ?? [];
export const pinById = (kind: PartKind, ...ids: string[]) => pinsOf(kind).find((p) => ids.includes(p.id));
/** First pin whose id matches the pattern (e.g. the '+' terminal). */
export const pinMatch = (kind: PartKind, re: RegExp) => pinsOf(kind).find((p) => re.test(p.id));
export function pinBox(kind: PartKind) {
  const ps = pinsOf(kind);
  if (!ps.length) return { x0: -5, x1: 5, z0: 0, z1: 0, cx: 0, cz: 0, n: 0 };
  const xs = ps.map((p) => p.pos[0]), zs = ps.map((p) => p.pos[2]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, n: ps.length };
}

export const Mat = ({ color, rough = 0.55, metal = 0, ...rest }: { color: string; rough?: number; metal?: number; emissive?: string; transparent?: boolean; opacity?: number }) => (
  <meshStandardMaterial color={color} roughness={rough} metalness={metal} {...rest} />
);

type P3 = Vec3;
export function Box({ s, p = [0, 0, 0], r, color, rough, metal, shadow = true }: { s: P3; p?: P3; r?: P3; color: string; rough?: number; metal?: number; shadow?: boolean }) {
  return (
    <mesh position={p} rotation={r} castShadow={shadow}>
      <boxGeometry args={s} />
      <Mat color={color} rough={rough} metal={metal} />
    </mesh>
  );
}
export function Cyl({ r, h, p = [0, 0, 0], rot, color, rough, metal, seg = 24, r2, shadow = true, open }: { r: number; h: number; p?: P3; rot?: P3; color: string; rough?: number; metal?: number; seg?: number; r2?: number; shadow?: boolean; open?: boolean }) {
  return (
    <mesh position={p} rotation={rot} castShadow={shadow}>
      <cylinderGeometry args={[r, r2 ?? r, h, seg, 1, open]} />
      <Mat color={color} rough={rough} metal={metal} />
    </mesh>
  );
}

/** Flat text plane (silkscreen, part numbers). Textures are shared per (text, colours). */
export function Silk({ text, w, h, p, rot = [-Math.PI / 2, 0, 0], color = '#e9ecef', bg, font = 'bold', lines }: { text: string; w: number; h: number; p: P3; rot?: P3; color?: string; bg?: string; font?: string; lines?: string[] }) {
  const all = lines ?? [text];
  const tex = useMemo(() => {
    const W = 512, H = Math.max(32, Math.round((512 * h) / w));
    return cachedTexture(`silk:${all.join('|')}:${color}:${bg ?? ''}:${w}x${h}`, W, H, (c) => {
      if (bg) { c.fillStyle = bg; c.fillRect(0, 0, W, H); }
      c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle';
      const fs = Math.min(H / all.length * 0.86, (W / Math.max(...all.map((t) => t.length), 1)) * 1.45);
      c.font = `${font} ${fs}px "Courier New", monospace`;
      all.forEach((t, i) => c.fillText(t, W / 2, (H * (i + 0.5)) / all.length));
    });
  }, [all.join('|'), color, bg, w, h, font]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <mesh position={p} rotation={rot} renderOrder={2}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={tex} transparent={!bg} toneMapped={false} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
  );
}

/** Dot marking pin 1 on IC packages and the notch beside it. */
export const Pin1Dot = ({ p }: { p: P3 }) => (
  <mesh position={p} rotation-x={-Math.PI / 2}>
    <circleGeometry args={[0.55, 14]} />
    <meshBasicMaterial color="#c9ced3" toneMapped={false} />
  </mesh>
);

/** Dual in-line package sized from the pin layout; pin 1 = first pin of PARTS. */
export function DipIC({ kind, label, sub, body = '#1b1d20', y0 = 1.6, h = 3.4, text = '#dfe3e6' }: { kind: PartKind; label: string; sub?: string; body?: string; y0?: number; h?: number; text?: string }) {
  const b = pinBox(kind);
  const ps = pinsOf(kind);
  const len = Math.max(8, b.x1 - b.x0 + 2.8);
  const rows = b.z1 - b.z0;
  const wid = rows > 3 ? Math.min(rows - 1.2, 7.2) : 6.4;
  const first = ps[0];
  const left = first ? first.pos[0] <= b.cx : true;
  const sgn = left ? -1 : 1;
  return (
    <group position={[b.cx, 0, b.cz]}>
      <Legs kind={kind} top={y0 + 1} radius={0.28} />
      {ps.map((p) => <Box key={p.id} s={[0.5, 0.35, 1.5]} p={[p.pos[0] - b.cx, y0 + 0.5, p.pos[2] - b.cz + (p.pos[2] <= b.cz ? 1.2 : -1.2)]} color={METAL} metal={0.85} rough={0.3} shadow={false} />)}
      <Box s={[len, h, wid]} p={[0, y0 + h / 2, 0]} color={body} rough={0.5} />
      <Cyl r={1.15} h={0.12} p={[sgn * (len / 2 - 0.1), y0 + h - 0.04, 0]} color="#0c0d0f" seg={18} shadow={false} />
      {first && <Pin1Dot p={[first.pos[0] - b.cx + sgn * -0.2 + (left ? 0.9 : -0.9), y0 + h + 0.02, (first.pos[2] - b.cz) * 0.5]} />}
      <Silk text={label} lines={sub ? [label, sub] : undefined} w={Math.max(4, len - 3.2)} h={sub ? 3.4 : 2.2} p={[0, y0 + h + 0.03, 0]} color={text} />
    </group>
  );
}

/** TO-92 transistor/sensor: half-round epoxy with a flat printed face toward +z. */
export function To92({ kind, label, color = '#17191c', y0 = 2.2 }: { kind: PartKind; label: string; color?: string; y0?: number }) {
  const b = pinBox(kind);
  return (
    <group position={[b.cx, 0, b.cz]}>
      <Legs kind={kind} top={y0 + 0.4} radius={0.26} />
      <mesh position={[0, y0 + 2.4, 0]} castShadow>
        <cylinderGeometry args={[2.55, 2.55, 4.8, 24, 1, false, Math.PI / 2, Math.PI]} />
        <Mat color={color} rough={0.5} />
      </mesh>
      <mesh position={[0, y0 + 2.4, 0.01]}>
        <planeGeometry args={[5.1, 4.8]} />
        <Mat color={color} rough={0.5} />
      </mesh>
      <mesh position={[0, y0 + 4.8, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[2.55, 24, Math.PI, Math.PI]} />
        <Mat color={color} rough={0.5} />
      </mesh>
      <Silk text={label} w={4.6} h={1.6} p={[0, y0 + 2.5, 0.04]} rot={[0, 0, 0]} color="#e9ecef" />
    </group>
  );
}

/** TO-220: black body, metal tab with a mounting hole, labelled front. */
export function To220({ kind, label, sub, tab = '#a8aeb4' }: { kind: PartKind; label: string; sub?: string; tab?: string }) {
  const b = pinBox(kind);
  return (
    <group position={[b.cx, 0, b.cz]}>
      <Legs kind={kind} top={5} radius={0.45} />
      <Box s={[10.2, 9, 4.5]} p={[0, 9.5, 0]} color="#17191c" rough={0.45} />
      <Box s={[10.2, 6.2, 1.3]} p={[0, 16.1, -1.5]} color={tab} metal={0.8} rough={0.35} />
      <Cyl r={1.8} h={1.5} p={[0, 17.4, -1.5]} rot={[Math.PI / 2, 0, 0]} color="#3a3f44" seg={20} />
      <Silk text={label} lines={sub ? [label, sub] : undefined} w={8.4} h={sub ? 4 : 2.4} p={[0, 9.6, 2.28]} rot={[0, 0, 0]} />
    </group>
  );
}

/** Axial (resistor-shaped) body between the first and last pin: legs bent up to the body. */
export function AxialLegs({ kind, y = 3.2, half = 3.8 }: { kind: PartKind; y?: number; half?: number }) {
  const ps = [...pinsOf(kind)].sort((a, b) => a.pos[0] - b.pos[0]);
  if (ps.length < 2) return null;
  const first = ps[0]!, last = ps[ps.length - 1]!;
  return (
    <>
      <Legs kind={kind} top={y} radius={0.35} />
      {[first, last].map((p, i) => {
        const sgn = i ? 1 : -1;
        const inner = p.pos[0] - sgn * (Math.abs(p.pos[0]) - half);
        const len = Math.abs(Math.abs(p.pos[0]) - half);
        return (
          <mesh key={p.id} position={[(p.pos[0] + inner) / 2, y, p.pos[2]]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.32, 0.32, len, 8]} />
            <Mat color={METAL} metal={0.85} rough={0.3} />
          </mesh>
        );
      })}
    </>
  );
}
