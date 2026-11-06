import { memo, useEffect, useMemo } from 'react';
import type { PartInstance, Vec3, Wire } from '../core/types';
import { PARTS, pinWorldPos } from '../ui/core';
import { wireHex } from '../ui/store';
import { wireGeometry, wirePoints } from './wireGeom';

export function pinPos(parts: PartInstance[], partId: string, pinId: string): Vec3 | null {
  const p = parts.find((q) => q.id === partId);
  if (!p || !PARTS[p.kind]?.pins.some((d) => d.id === pinId)) return null;
  return pinWorldPos(p, pinId);
}

export const WireView = memo(function WireView({ wire, a, b, selected, glow }: { wire: Wire; a: Vec3; b: Vec3; selected: boolean; glow: boolean }) {
  const pts = useMemo(() => wirePoints(a, b, wire.bends), [a, b, wire.bends]);
  const geo = useMemo(() => wireGeometry(pts), [pts]);
  useEffect(() => () => geo.dispose(), [geo]);
  const color = wireHex(wire.color);
  return (
    <group>
      <mesh geometry={geo} castShadow userData={{ wireId: wire.id }}>
        <meshStandardMaterial color={color} roughness={0.45} emissive={glow ? '#33e0ff' : selected ? '#ffffff' : '#000000'} emissiveIntensity={glow ? 0.9 : selected ? 0.25 : 0} />
      </mesh>
      {[a, b].map((p, i) => (
        <mesh key={i} position={[p[0], p[1] + 1.6, p[2]]} castShadow>
          <cylinderGeometry args={[1.25, 1.25, 3.2, 12]} />
          <meshStandardMaterial color={color} roughness={0.4} />
        </mesh>
      ))}
      {[a, b].map((p, i) => (
        <mesh key={`t${i}`} position={[p[0], p[1] - 0.2, p[2]]}>
          <cylinderGeometry args={[0.4, 0.4, 2.2, 8]} />
          <meshStandardMaterial color="#b7bcc2" metalness={0.85} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
});
