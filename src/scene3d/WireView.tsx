import { memo, useEffect, useMemo } from 'react';
import { Color } from 'three';
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
  const dark = useMemo(() => `#${new Color(color).multiplyScalar(0.55).getHexString()}`, [color]);
  return (
    <group>
      <mesh geometry={geo} castShadow userData={{ wireId: wire.id }}>
        <meshPhysicalMaterial color={color} roughness={0.28} clearcoat={0.9} clearcoatRoughness={0.15} emissive={glow ? '#33e0ff' : selected ? '#ffffff' : '#000000'} emissiveIntensity={glow ? 0.9 : selected ? 0.25 : 0} />
      </mesh>
      {[a, b].map((p, i) => (
        <group key={i} position={[p[0], p[1], p[2]]}>
          {/* darker moulded plug + bare pin */}
          <mesh position={[0, 2.2, 0]} castShadow userData={{ wireId: wire.id }}>
            <cylinderGeometry args={[1.15, 1.15, 3.2, 14]} />
            <meshStandardMaterial color={dark} roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.3, 0]}>
            <cylinderGeometry args={[0.32, 0.32, 1.8, 8]} />
            <meshStandardMaterial color="#c9ced3" metalness={0.9} roughness={0.25} />
          </mesh>
        </group>
      ))}
    </group>
  );
});
