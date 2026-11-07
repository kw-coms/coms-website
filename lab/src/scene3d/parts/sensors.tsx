import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';
import { inputOf, vis, type PartProps } from './common';
import { Box, Cyl, Legs, Mat, Silk, To92, pinBox } from './kit';

export const Tmp36 = (_: PartProps) => <To92 kind="tmp36" label="TMP36" />;

export function Pir({ part }: PartProps) {
  const lens = useRef<Mesh>(null);
  useFrame(() => {
    const on = !!inputOf(part.id, 'motion', 0);
    const m = lens.current?.material as { emissiveIntensity: number } | undefined;
    if (m) m.emissiveIntensity = on ? 0.9 : 0;
  });
  const b = pinBox('pir');
  return (
    <group position={[b.cx, 0, 0]}>
      <Legs kind="pir" top={3} radius={0.3} />
      <Box s={[32, 1.6, 24]} p={[0, 8, -14]} color="#1c7a52" rough={0.45} />
      <Cyl r={11.5} h={8} p={[0, 12.6, -14]} color="#f1f3f4" rough={0.4} seg={32} />
      <mesh ref={lens} position={[0, 16.6, -14]} castShadow>
        <sphereGeometry args={[11, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#f7f8f8" roughness={0.35} emissive="#ff8844" emissiveIntensity={0} userData={{ dynamic: true }} transparent opacity={0.96} />
      </mesh>
      {[[-12, 5], [12, 5]].map(([x, z]) => <Cyl key={String(x)} r={1.6} h={1.8} p={[x!, 9, z! - 14]} color="#c9ced3" metal={0.7} seg={14} />)}
      <Silk text="HC-SR501" w={14} h={3} p={[0, 8.9, -3]} color="#e9ecef" />
    </group>
  );
}

export function FlexSensor({ part }: PartProps) {
  const arm = useRef<Mesh>(null);
  useFrame(() => {
    if (arm.current) arm.current.rotation.x = -Number(inputOf(part.id, 'bend', 0)) * 0.6;
  });
  return (
    <group>
      <Legs kind="flex-sensor" top={2} radius={0.3} />
      <Box s={[7, 0.5, 8]} p={[0, 2, -4]} color="#d9d5c8" />
      <group position={[0, 2.2, -8]}>
        <mesh ref={arm} position={[0, 0.3, -28]} castShadow>
          <boxGeometry args={[6.4, 0.6, 56]} />
          <Mat color="#17191c" rough={0.5} />
        </mesh>
        <Box s={[5.2, 0.62, 52]} p={[0, 0.35, -28]} color="#6b6e72" metal={0.4} rough={0.5} shadow={false} />
      </group>
    </group>
  );
}

export function ForceSensor({ part }: PartProps) {
  const disc = useRef<Mesh>(null);
  useFrame(() => {
    if (disc.current) disc.current.position.y = 1.45 - Number(inputOf(part.id, 'force', 0)) * 0.5;
  });
  return (
    <group>
      <Legs kind="force-sensor" top={2} radius={0.3} />
      <Box s={[3, 0.5, 20]} p={[0, 1.3, -12]} color="#d9d5c8" />
      <Cyl r={9.5} h={0.4} p={[0, 1.2, -32]} color="#d9d5c8" seg={36} />
      <mesh ref={disc} position={[0, 1.45, -32]} castShadow><cylinderGeometry args={[7.2, 7.2, 0.5, 36]} /><Mat color="#222" rough={0.6} /></mesh>
      <Cyl r={5} h={0.2} p={[0, 1.8, -32]} color="#555" seg={30} shadow={false} />
    </group>
  );
}

export function SoilMoisture({ part }: PartProps) {
  void part;
  return (
    <group>
      <Legs kind="soil-moisture" top={3} radius={0.3} />
      <Box s={[22, 1.4, 16]} p={[0, 6, -8]} color="#1c7a52" rough={0.45} />
      <Box s={[7, 5, 3]} p={[-6, 8.4, -7]} color="#1b1d21" />
      <Box s={[18, 1.6, 52]} p={[0, 6, -42]} color="#f2d24a" rough={0.5} />
      <Box s={[3.4, 1.7, 52]} p={[-5.5, 6, -42]} color="#b8860b" metal={0.4} rough={0.4} shadow={false} />
      <Box s={[3.4, 1.7, 52]} p={[5.5, 6, -42]} color="#b8860b" metal={0.4} rough={0.4} shadow={false} />
      <Cyl r={0.9} h={0.2} p={[8, 6.9, -4]} color="#c8ced4" shadow={false} />
    </group>
  );
}

export function GasSensor({ part }: PartProps) {
  const heat = useRef<Mesh>(null);
  useFrame(() => {
    const g = Number(inputOf(part.id, 'gas', 0));
    const m = heat.current?.material as { emissiveIntensity: number } | undefined;
    if (m) m.emissiveIntensity = 0.25 + Math.min(1, g) * 0.8;
  });
  return (
    <group>
      <Legs kind="gas-sensor" top={3} radius={0.3} />
      <Box s={[32, 1.4, 21]} p={[0, 6, -14]} color="#1c4f9e" rough={0.45} />
      <Cyl r={7.2} h={9} p={[0, 11.2, -14]} color="#b9bdc2" metal={0.85} rough={0.3} seg={30} />
      <mesh ref={heat} position={[0, 15.8, -14]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[6.4, 30]} />
        <meshStandardMaterial color="#6a6f75" metalness={0.7} roughness={0.5} emissive="#ff5a1a" emissiveIntensity={0.25} userData={{ dynamic: true }} />
      </mesh>
      <Silk text="MQ-2" w={8} h={3} p={[0, 15.85, -14]} color="#16181b" />
      <Box s={[7, 5, 3]} p={[-10, 8.4, -4]} color="#1b1d21" />
    </group>
  );
}

export function IrReceiver({ part }: PartProps) {
  const eye = useRef<Mesh>(null);
  useFrame(() => {
    const m = eye.current?.material as { emissiveIntensity: number } | undefined;
    if (m) m.emissiveIntensity = vis(part.id)?.ic?.outputs?.OUT === 0 ? 0.9 : 0;
  });
  return (
    <group>
      <Legs kind="ir-receiver" top={3} radius={0.3} />
      <Box s={[7.4, 9.6, 5.4]} p={[0, 7, 0]} color="#17191c" rough={0.45} />
      <mesh ref={eye} position={[0, 8.4, 2.75]}>
        <sphereGeometry args={[2.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#3a1a1f" roughness={0.3} emissive="#ff3322" emissiveIntensity={0} userData={{ dynamic: true }} />
      </mesh>
      <mesh position={[0, 8.4, 2.7]} rotation-x={Math.PI / 2}><cylinderGeometry args={[2.3, 2.3, 0.4, 20]} /><Mat color="#3a1a1f" rough={0.3} /></mesh>
      <Silk text="VS1838" w={5.4} h={1.6} p={[0, 4.6, 2.72]} rot={[0, 0, 0]} />
    </group>
  );
}
