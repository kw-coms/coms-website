import { useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace, AdditiveBlending } from 'three';
import type { PartInstance, PartVisualState, Vec3 } from '../../core/types';
import { PARTS } from '../../ui/core';
import { frameRef } from '../../ui/simHost';
import { getState } from '../../ui/store';

export interface PartProps {
  part: PartInstance;
}
/** Latest simulator visual state of a part (read inside useFrame, never triggers React renders). */
export const vis = (id: string): PartVisualState | undefined => frameRef.current?.parts[id];
export const inputOf = (id: string, key: string, fallback: number | boolean = 0): number | boolean => {
  const v = getState().inputs[id]?.[key];
  if (v !== undefined) return v;
  const d = PARTS[getState().hist.present.parts.find((p) => p.id === id)?.kind ?? 'led']?.inputs?.find((i) => i.key === key);
  return d?.default ?? fallback;
};

export function makeTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d')!;
  draw(c);
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

let glowTex: CanvasTexture | null = null;
export function glowTexture(): CanvasTexture {
  glowTex ??= makeTexture(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  });
  return glowTex;
}
export const GlowSprite = ({ spriteRef, position, color }: { spriteRef: React.Ref<import('three').Sprite>; position: Vec3; color: string }) => (
  <sprite ref={spriteRef} position={position} visible={false} renderOrder={5}>
    <spriteMaterial map={glowTexture()} color={color} transparent depthWrite={false} blending={AdditiveBlending} opacity={0} />
  </sprite>
);

/** Soft additive light pool a lit LED casts on the board/desk under it (no real light per LED). */
export const GlowPool = ({ poolRef, color }: { poolRef: React.Ref<import('three').Mesh>; color: string }) => (
  <mesh ref={poolRef} position={[0, 0.12, 0]} rotation-x={-Math.PI / 2} visible={false} renderOrder={3}>
    <planeGeometry args={[1, 1]} />
    <meshBasicMaterial map={glowTexture()} color={color} transparent depthWrite={false} blending={AdditiveBlending} opacity={0} toneMapped={false} />
  </mesh>
);

const METAL = '#b7bcc2';
/** Straight pin legs from the insertion point up to `top`. */
export function Legs({ kind, top = 4, radius = 0.32, color = METAL, only }: { kind: PartInstance['kind']; top?: number; radius?: number; color?: string; only?: string[] }) {
  return (
    <>
      {PARTS[kind].pins.filter((p) => !only || only.includes(p.id)).map((p) => (
        <mesh key={p.id} position={[p.pos[0], p.pos[1] + (top - 2.5) / 2, p.pos[2]]} castShadow>
          <cylinderGeometry args={[radius, radius, top + 2.5, 8]} />
          <meshStandardMaterial color={color} metalness={0.85} roughness={0.3} />
        </mesh>
      ))}
    </>
  );
}

/** Cable between two points (straight tube), used for servo/meter/motor leads. */
export function Cable({ a, b, color, r = 0.6 }: { a: Vec3; b: Vec3; color: string; r?: number }) {
  const { pos, len, quat } = useMemo(() => {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    // rotate +Y axis onto direction
    const dir: Vec3 = [dx / len, dy / len, dz / len];
    const ax: Vec3 = [dir[2], 0, -dir[0]];
    const s = Math.hypot(ax[0], ax[2]);
    const ang = Math.acos(Math.max(-1, Math.min(1, dir[1])));
    const h = Math.sin(ang / 2);
    const q: [number, number, number, number] = s < 1e-6 ? (dir[1] < 0 ? [1, 0, 0, 0] : [0, 0, 0, 1]) : [(ax[0] / s) * h, 0, (ax[2] / s) * h, Math.cos(ang / 2)];
    return { pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] as Vec3, len, quat: q };
  }, [a, b]);
  return (
    <mesh position={pos} quaternion={quat} castShadow>
      <cylinderGeometry args={[r, r, len, 8]} />
      <meshStandardMaterial color={color} roughness={0.55} />
    </mesh>
  );
}
