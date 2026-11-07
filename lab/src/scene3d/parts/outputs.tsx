import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh, MeshStandardMaterial, Sprite } from 'three';
import { Cable, GlowPool, GlowSprite, vis, type PartProps } from './common';
import { reduced } from './basic';
import { Box, Cyl, Legs, METAL, Mat, Silk, pinBox, pinsOf } from './kit';

export function LightBulb({ part }: PartProps) {
  const glass = useRef<Mesh>(null);
  const fil = useRef<Mesh>(null);
  const glow = useRef<Sprite>(null);
  const pool = useRef<Mesh>(null);
  useFrame(() => {
    const b = vis(part.id)?.bulb?.brightness ?? 0;
    const e = Math.sqrt(b);
    const gm = glass.current?.material as MeshStandardMaterial | undefined;
    if (gm) gm.emissiveIntensity = e * 1.1;
    const fm = fil.current?.material as MeshStandardMaterial | undefined;
    if (fm) fm.emissiveIntensity = e * 6;
    if (glow.current) {
      glow.current.visible = b > 0.02;
      glow.current.scale.setScalar(16 + e * 38);
      (glow.current.material as { opacity: number }).opacity = Math.min(1, 0.2 + e * 0.8);
    }
    if (pool.current) {
      pool.current.visible = b > 0.02;
      pool.current.scale.setScalar(20 + e * 44);
      (pool.current.material as { opacity: number }).opacity = Math.min(0.9, e * 0.8);
    }
  });
  return (
    <group>
      <Legs kind="light-bulb" top={3} radius={0.4} />
      {pinsOf('light-bulb').map((p) => <Cable key={p.id} a={[p.pos[0], 3, p.pos[2]]} b={[p.pos[0] * 0.4, 8, -9]} color="#b7bcc2" r={0.5} />)}
      <Cyl r={5} h={10} p={[0, 10, -12]} color="#c9ced3" metal={0.85} rough={0.35} seg={24} />
      {[0, 1, 2, 3].map((i) => <Cyl key={i} r={5.2} h={0.7} p={[0, 6.5 + i * 2.2, -12]} color="#9aa0a6" metal={0.85} rough={0.35} seg={24} shadow={false} />)}
      <Cyl r={3} h={2} p={[0, 15.6, -12]} color="#17191c" seg={20} />
      <mesh ref={glass} position={[0, 27, -12]} castShadow>
        <sphereGeometry args={[11.5, 32, 24]} />
        <meshStandardMaterial userData={{ dynamic: true }} color="#f3f6f8" transparent opacity={0.4} roughness={0.08} emissive="#ffc766" emissiveIntensity={0} />
      </mesh>
      <Cyl r={0.35} h={9} p={[-1.6, 20.5, -12]} color={METAL} metal={0.8} seg={8} shadow={false} />
      <Cyl r={0.35} h={9} p={[1.6, 20.5, -12]} color={METAL} metal={0.8} seg={8} shadow={false} />
      <mesh ref={fil} position={[0, 25.3, -12]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.35, 0.35, 3.4, 8]} />
        <meshStandardMaterial userData={{ dynamic: true }} color="#4a3d2a" emissive="#ffb347" emissiveIntensity={0} />
      </mesh>
      <group position={[0, 27, -12]}><GlowSprite spriteRef={glow} position={[0, 0, 0]} color="#ffc766" /></group>
      <group position={[0, 0, -12]}><GlowPool poolRef={pool} color="#ffc766" /></group>
    </group>
  );
}

export function VibrationMotor({ part }: PartProps) {
  const g = useRef<Group>(null);
  useFrame((s) => {
    const on = !!vis(part.id)?.vibration?.on;
    if (!g.current) return;
    const t = s.clock.elapsedTime * 60;
    g.current.position.x = on && !reduced ? Math.sin(t) * 0.5 : 0;
    g.current.position.z = -9 + (on && !reduced ? Math.cos(t * 1.3) * 0.5 : 0);
    if (on) s.invalidate();
  });
  return (
    <group>
      <Legs kind="vibration-motor" top={3} radius={0.35} />
      {pinsOf('vibration-motor').map((p, i) => <Cable key={p.id} a={[p.pos[0], 3, p.pos[2]]} b={[p.pos[0] * 1.2, 4, -6]} color={i ? '#1a1a1a' : '#d32f2f'} r={0.5} />)}
      <group ref={g} position={[0, 4, -9]}>
        <Cyl r={5.2} h={3.4} color="#b9bdc2" metal={0.85} rough={0.3} seg={30} />
        <Cyl r={4.6} h={0.2} p={[0, 1.8, 0]} color="#8a9096" metal={0.8} seg={30} shadow={false} />
        <Box s={[2.6, 1.4, 1.8]} p={[0, 0.2, -4.6]} color="#2a2d31" />
      </group>
    </group>
  );
}

export function Gearmotor({ part }: PartProps) {
  const shaft = useRef<Group>(null);
  const ang = useRef(0);
  useFrame((s, dt) => {
    const m = vis(part.id)?.motor;
    const w = m ? Math.min(20, (m.rpm / 60) * Math.PI * 2) * m.direction : 0;
    if (!w) return;
    ang.current += reduced ? 0 : w * dt;
    if (shaft.current) shaft.current.rotation.x = ang.current;
    s.invalidate();
  });
  return (
    <group>
      <Legs kind="gearmotor" top={1.2} />
      {pinsOf('gearmotor').map((p, i) => <Cable key={p.id} a={[p.pos[0], 1.5, 0]} b={[p.pos[0] * 1.6, 7, -10]} color={i ? '#1a1a1a' : '#d32f2f'} r={0.6} />)}
      {/* TT motor: yellow gearbox, silver can, double-sided shaft and wheel */}
      <Box s={[37, 22.5, 19]} p={[-4, 12, -26]} color="#f6c824" rough={0.45} />
      <Box s={[37.4, 3, 19.4]} p={[-4, 22.5, -26]} color="#e5b414" rough={0.45} />
      <Cyl r={11} h={25} p={[-34, 12, -26]} rot={[0, 0, Math.PI / 2]} color="#b9bdc2" metal={0.85} rough={0.3} seg={30} />
      <Cyl r={7} h={1} p={[-47, 12, -26]} rot={[0, 0, Math.PI / 2]} color="#6d7378" metal={0.7} />
      <group ref={shaft} userData={{ probe: 'shaft' }} position={[0, 8, -26]}>
        <Cyl r={2.7} h={46} p={[0, 0, 0]} rot={[0, 0, Math.PI / 2]} color="#d8dcdf" metal={0.9} rough={0.2} seg={14} />
        <Cyl r={32} h={7} p={[26.5, 0, 0]} rot={[0, 0, Math.PI / 2]} color="#1f2124" rough={0.85} seg={48} />
        <Cyl r={23} h={7.4} p={[26.5, 0, 0]} rot={[0, 0, Math.PI / 2]} color="#f4f1ea" rough={0.5} seg={48} />
        <Cyl r={5} h={8} p={[26.5, 0, 0]} rot={[0, 0, Math.PI / 2]} color="#c9ced3" metal={0.8} seg={16} />
        {[0, 1, 2, 3].map((i) => <Box key={i} s={[7.6, 40, 3]} p={[26.5, 0, 0]} r={[(i * Math.PI) / 4, 0, 0]} color="#d8d3c4" shadow={false} />)}
        <Box s={[7.8, 5, 5]} p={[26.5, 18, 0]} color="#d33a2c" shadow={false} />
      </group>
    </group>
  );
}

export function NeopixelRing({ part }: PartProps) {
  const n = Math.max(1, Math.min(24, Number(part.props.count ?? part.props.leds ?? part.props.pixels) || 12));
  const mats = useRef<MeshStandardMaterial[]>([]);
  useFrame(() => {
    const cols = vis(part.id)?.pixels?.colors;
    mats.current.forEach((m, i) => {
      if (!m) return;
      const c = cols?.[i] ?? [0, 0, 0];
      m.emissive.setRGB(c[0] / 255, c[1] / 255, c[2] / 255);
      m.emissiveIntensity = Math.max(c[0], c[1], c[2]) > 0 ? 1.8 : 0;
      m.color.setRGB(0.6 + c[0] / 700, 0.6 + c[1] / 700, 0.6 + c[2] / 700);
    });
  });
  const R = Math.max(12, (n * 7.8) / (2 * Math.PI));
  const cz = -R - 7;
  return (
    <group>
      <Legs kind="neopixel-ring" top={2} radius={0.3} />
      {pinsOf('neopixel-ring').map((p, i) => <Cable key={p.id} a={[p.pos[0], 1.2, 0]} b={[p.pos[0], 2.6, -7]} color={['#f5f5f5', '#d32f2f', '#222', '#f5f5f5'][i % 4]!} r={0.45} />)}
      <mesh position={[0, 2.4, cz]} rotation-x={-Math.PI / 2} castShadow>
        <ringGeometry args={[R - 4.6, R + 4.6, 48]} />
        <Mat color="#17191c" rough={0.5} />
      </mesh>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * R, 3.4, cz + Math.sin(a) * R]} rotation-y={-a} castShadow>
            <boxGeometry args={[5, 1.4, 5]} />
            <meshStandardMaterial userData={{ dynamic: true }} ref={(m) => { if (m) mats.current[i] = m; }} color="#9a9a9a" roughness={0.4} emissive="#000" />
          </mesh>
        );
      })}
    </group>
  );
}

const SEG4: [number, number, boolean][] = [[0, -6.4, true], [3.2, -3.2, false], [3.2, 3.2, false], [0, 6.4, true], [-3.2, 3.2, false], [-3.2, -3.2, false], [0, 0, true]];
export function SevenSegment4({ part }: PartProps) {
  const mats = useRef<MeshStandardMaterial[]>([]);
  useFrame(() => {
    const d = vis(part.id)?.digits?.segments ?? [];
    mats.current.forEach((m, k) => {
      if (!m) return;
      const on = !!d[Math.floor(k / 8)]?.[k % 8];
      m.emissiveIntensity = on ? 2.4 : 0;
      m.color.set(on ? '#ff3b30' : '#3a1210');
    });
  });
  const b = pinBox('seven-segment-4digit');
  const seg = (k: number, w: number, dd: number, x: number, z: number) => (
    <mesh key={k} position={[x, 8.26, z]}>
      <boxGeometry args={[w, 0.1, dd]} />
      <meshStandardMaterial userData={{ dynamic: true }} ref={(m) => { if (m) mats.current[k] = m; }} color="#3a1210" emissive="#ff2a1a" emissiveIntensity={0} />
    </mesh>
  );
  return (
    <group position={[b.cx, 0, b.cz]}>
      <Legs kind="seven-segment-4digit" top={2} radius={0.3} />
      <Box s={[50.5, 7.4, 19]} p={[0, 4.8, 0]} color="#17191c" rough={0.5} />
      {[0, 1, 2, 3].map((d) =>
        <group key={d} position={[(d - 1.5) * 12.2, 0, 0]}>
          {SEG4.map(([x, z, h], i) => seg(d * 8 + i, h ? 4.6 : 1.1, h ? 1.1 : 4.6, x, z))}
          {seg(d * 8 + 7, 1.2, 1.2, 5.4, 7)}
        </group>)}
    </group>
  );
}

export function Relay({ part }: PartProps) {
  const led = useRef<Mesh>(null);
  const arm = useRef<Mesh>(null);
  useFrame(() => {
    const closed = !!vis(part.id)?.relay?.closed;
    const m = led.current?.material as MeshStandardMaterial | undefined;
    if (m) m.emissiveIntensity = closed ? 3 : 0;
    if (arm.current) arm.current.rotation.z = closed ? -0.12 : 0;
  });
  const b = pinBox('relay-spdt');
  return (
    <group position={[b.cx, 0, 0]}>
      <Legs kind="relay-spdt" top={3} radius={0.35} />
      <Box s={[Math.max(34, b.x1 - b.x0 + 8), 1.4, 28]} p={[0, 5, -18]} color="#1c4f9e" rough={0.45} />
      <Box s={[19, 15.5, 15.5]} p={[-3, 13.6, -20]} color="#2d6fd0" rough={0.35} />
      <Silk text="SRD-05VDC" lines={['SRD-05VDC-SL-C', '10A 250VAC']} w={16} h={8} p={[-3, 21.4, -20]} color="#e9ecef" />
      <mesh ref={arm} position={[10, 11, -20]}><boxGeometry args={[0.8, 9, 8]} /><Mat color={METAL} metal={0.9} rough={0.3} /></mesh>
      <Box s={[9, 8.5, 9]} p={[12, 9.6, -6]} color="#2c8a4f" rough={0.5} />
      <mesh ref={led} position={[-12, 6.4, -6]}><boxGeometry args={[3, 1.6, 1.8]} /><meshStandardMaterial userData={{ dynamic: true }} color="#5a1010" emissive="#ff2a1a" emissiveIntensity={0} /></mesh>
      <Silk text="RELAY" w={9} h={2.4} p={[-12, 5.8, -10]} color="#e9ecef" />
    </group>
  );
}
