import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh } from 'three';
import type { PartKind } from '../../core/types';
import { Cable, inputOf, useOwned, vis, type PartProps } from './common';
import { AxialLegs, Box, Cyl, Legs, METAL, Mat, Silk, pinBox, pinMatch, pinsOf } from './kit';
import { MeshStandardMaterial as StdMat } from 'three';


/** Which side (-1/+1 along x) holds the negative lead. */
function minusSide(kind: PartKind): number {
  const m = pinMatch(kind, /^(-|−|minus|neg|cathode|K)$/i) ?? pinsOf(kind)[1];
  return m && m.pos[0] < pinBox(kind).cx ? -1 : 1;
}

/** Red + black leads from a snap/holder to the two terminals (battery packs). */
function Leads({ kind, from }: { kind: PartKind; from: [number, number, number] }) {
  const plus = pinMatch(kind, /^(\+|plus|V\+|VCC|1)$/i) ?? pinsOf(kind)[0];
  const minus = pinMatch(kind, /^(-|−|minus|GND|2)$/i) ?? pinsOf(kind)[1];
  return (
    <>
      <Legs kind={kind} top={3} radius={0.4} />
      {plus && <Cable a={[plus.pos[0], 3, plus.pos[2]]} b={[from[0] + 2.5, from[1], from[2]]} color="#d32f2f" r={0.7} />}
      {minus && <Cable a={[minus.pos[0], 3, minus.pos[2]]} b={[from[0] - 2.5, from[1], from[2]]} color="#1a1a1a" r={0.7} />}
    </>
  );
}

export function Battery9v({ part }: PartProps) {
  void part;
  return (
    <group>
      <Leads kind="battery-9v" from={[0, 8, -4]} />
      {/* PP3: rounded block with the snap terminals on top */}
      <Box s={[26.5, 17.5, 48.5]} p={[0, 9.4, -28]} color="#2c3036" rough={0.45} />
      <Box s={[26.6, 13, 33]} p={[0, 9, -22]} color="#e7b416" rough={0.4} />
      <Box s={[26.7, 6, 10]} p={[0, 9.4, -43]} color="#2c3036" rough={0.45} />
      <Silk text="9V" w={14} h={7} p={[0, 18.2, -26]} color="#f2f2f2" font="bold" />
      <Silk text="ALKALINE" w={20} h={3} p={[0, 18.2, -33]} color="#e7b416" />
      <Cyl r={4.2} h={2.4} p={[-6, 19.4, -4.2]} color="#c9ced3" metal={0.8} rough={0.3} seg={6} />
      <Cyl r={3.2} h={2.4} p={[6, 19.4, -4.2]} color="#c9ced3" metal={0.8} rough={0.3} seg={20} />
    </group>
  );
}

export function BatteryAaPack({ part }: PartProps) {
  const n = Math.max(1, Math.min(4, Number(part.props.cells) || 4));
  const w = 15 * n + 3;
  return (
    <group>
      <Leads kind="battery-aa-pack" from={[0, 7, -8]} />
      <Box s={[w, 2, 56]} p={[0, 1.6, -36]} color="#17191c" rough={0.5} />
      <Box s={[w, 12, 1.4]} p={[0, 6.5, -63.4]} color="#17191c" rough={0.5} />
      <Box s={[w, 12, 1.4]} p={[0, 6.5, -9]} color="#17191c" rough={0.5} />
      {Array.from({ length: n }, (_, i) => {
        const x = (i - (n - 1) / 2) * 15;
        return (
          <group key={i} position={[x, 8.2, -36]} rotation-x={Math.PI / 2}>
            <Cyl r={7} h={50} color="#d4a52a" rough={0.35} metal={0.3} seg={28} />
            <Cyl r={7.05} h={20} p={[0, -9, 0]} color="#1b1d21" rough={0.4} seg={28} />
            <Cyl r={2.6} h={1.6} p={[0, 25.5, 0]} color="#c9ced3" metal={0.9} rough={0.25} seg={16} />
          </group>
        );
      })}
      <Box s={[w - 4, 0.5, 6]} p={[0, 15.2, -36]} color="#e9ecef" shadow={false} />
    </group>
  );
}

export function CoinCell({ part }: PartProps) {
  void part;
  return (
    <group>
      <Legs kind="coin-cell-3v" top={3} radius={0.4} />
      <Cyl r={11} h={3.4} p={[0, 3.2, -12]} color="#17191c" rough={0.5} seg={36} />
      <Cyl r={10} h={0.6} p={[0, 5.1, -12]} color="#d7dce0" metal={0.9} rough={0.25} seg={36} />
      <Silk text="CR2032" lines={['CR2032', '3V +']} w={14} h={9} p={[0, 5.45, -12]} color="#1a1d21" />
      <Box s={[3, 1.2, 8]} p={[0, 2.2, -2.5]} color={METAL} metal={0.85} rough={0.3} />
    </group>
  );
}

export function CapacitorCeramic({ part }: PartProps) {
  void part;
  return (
    <group>
      <Legs kind="capacitor-ceramic" top={4} radius={0.3} />
      <mesh position={[0, 6.6, 0]} rotation-x={Math.PI / 2} castShadow>
        <cylinderGeometry args={[3.6, 3.6, 2.6, 28]} />
        <Mat color="#d89a2b" rough={0.55} />
      </mesh>
      <mesh position={[0, 8.9, 0]}>
        <sphereGeometry args={[2.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <Mat color="#d89a2b" rough={0.55} />
      </mesh>
      <Silk text="104" w={4} h={2.2} p={[0, 6.6, 1.34]} rot={[0, 0, 0]} color="#3a2a08" />
    </group>
  );
}

export function CapacitorElectrolytic({ part }: PartProps) {
  const side = minusSide('capacitor-electrolytic');
  const top = useRef<Group>(null);
  const mat = useOwned(() => new StdMat({ userData: { dynamic: true }, color: '#1d3b78', roughness: 0.4, metalness: 0.15, emissive: '#ff2200', emissiveIntensity: 0 }), []);
  useFrame(() => {
    const c = vis(part.id)?.capacitor;
    const bad = !!(c?.overVoltage || c?.reversed);
    mat.emissiveIntensity = bad ? 1.4 : 0;
    if (top.current) top.current.position.y = bad ? 14.4 : 12.4;
  });
  return (
    <group>
      <Legs kind="capacitor-electrolytic" top={3} radius={0.3} />
      <mesh position={[0, 7.8, 0]} castShadow material={mat}><cylinderGeometry args={[5.2, 5.2, 11.6, 32]} /></mesh>
      <group ref={top} position={[0, 12.4, 0]}>
        <mesh material={mat}><cylinderGeometry args={[5.0, 5.2, 0.8, 32]} /></mesh>
        <mesh position={[0, 0.42, 0]} rotation-x={-Math.PI / 2}><ringGeometry args={[1.2, 3.6, 3]} /><meshBasicMaterial color="#0e1f45" /></mesh>
      </group>
      {/* silver stripe + minus signs on the negative side */}
      <mesh position={[0, 7.8, 0]} rotation-y={side < 0 ? -Math.PI / 2 : Math.PI / 2}>
        <cylinderGeometry args={[5.24, 5.24, 11.4, 24, 1, true, -0.5, 1]} />
        <Mat color="#d6dade" rough={0.4} />
      </mesh>
      <Silk text="−" w={2.4} h={7} p={[side * 5.3, 8.4, 0]} rot={[0, side < 0 ? -Math.PI / 2 : Math.PI / 2, 0]} color="#1b1d21" />
      <Silk text="100µF 16V" w={7} h={2} p={[0, 7.8, 5.3]} rot={[0, 0, 0]} color="#e9ecef" />
    </group>
  );
}

function Diode({ kind, body, band, label }: { kind: PartKind; body: string; band: string; label: string }) {
  const side = minusSide(kind);
  return (
    <group>
      <AxialLegs kind={kind} y={3.4} half={3.4} />
      <Cyl r={1.3} h={6.4} p={[0, 3.4, 0]} rot={[0, 0, Math.PI / 2]} color={body} rough={0.4} seg={20} />
      <Cyl r={1.36} h={1.1} p={[side * 2.4, 3.4, 0]} rot={[0, 0, Math.PI / 2]} color={band} rough={0.35} seg={20} />
      <Silk text={label} w={3.6} h={1.1} p={[-side * 0.4, 3.4, 1.34]} rot={[0, 0, 0]} color="#d8dde2" />
    </group>
  );
}
export const DiodePart = (_: PartProps) => <Diode kind="diode" body="#17191c" band="#d6dade" label="1N4007" />;
export const ZenerPart = (_: PartProps) => <Diode kind="zener" body="#c9a14a" band="#17191c" label="Zener" />;

export function Inductor({ part }: PartProps) {
  void part;
  return (
    <group>
      <AxialLegs kind="inductor" y={3.6} half={3.6} />
      <Cyl r={2.1} h={7.2} p={[0, 3.6, 0]} rot={[0, 0, Math.PI / 2]} color="#2a5a4a" rough={0.5} seg={20} />
      {Array.from({ length: 7 }, (_, i) => (
        <mesh key={i} position={[(i - 3) * 0.95, 3.6, 0]} rotation-y={Math.PI / 2} castShadow>
          <torusGeometry args={[2.3, 0.42, 8, 24]} />
          <Mat color="#c8742c" rough={0.3} metal={0.85} />
        </mesh>
      ))}
    </group>
  );
}

export function DipSwitch4({ part }: PartProps) {
  const sl = useRef<Mesh[]>([]);
  const b = pinBox('dip-switch-4');
  useFrame(() => {
    const bits = Number(inputOf(part.id, 'switches', 0));
    sl.current.forEach((m, i) => { if (m) m.position.z = (bits >> i) & 1 ? -1.1 : 1.1; });
  });
  return (
    <group position={[b.cx, 0, b.cz]}>
      <Legs kind="dip-switch-4" top={3} radius={0.28} />
      <Box s={[Math.max(10.4, b.x1 - b.x0 + 2.8), 4.6, 7]} p={[0, 4.4, 0]} color="#d33a2c" rough={0.45} />
      {[0, 1, 2, 3].map((i) => {
        const x = (i - 1.5) * 2.54;
        return (
          <group key={i} position={[x, 6.8, 0]} userData={{ simKey: i }}>
            <Box s={[1.9, 0.3, 4.4]} p={[0, 0, 0]} color="#f2f2f2" rough={0.5} shadow={false} />
            <mesh ref={(m) => { if (m) sl.current[i] = m; }} position={[0, 0.5, 1.1]} castShadow userData={{ simKey: i }}>
              <boxGeometry args={[1.5, 0.9, 1.7]} />
              <Mat color="#fafafa" rough={0.4} />
            </mesh>
            <Silk text={String(i + 1)} w={1.6} h={1.6} p={[0, 0.2, 3.4]} color="#f2f2f2" />
          </group>
        );
      })}
      <Silk text="ON" w={3} h={1.4} p={[-3.2, 7.05, -2.7]} color="#f2f2f2" />
    </group>
  );
}

const KEYS = ['1', '2', '3', 'A', '4', '5', '6', 'B', '7', '8', '9', 'C', '*', '0', '#', 'D'];
export function Keypad4x4({ part }: PartProps) {
  const keys = useRef<Group[]>([]);
  useFrame(() => {
    const k = Number(inputOf(part.id, 'key', 0));
    keys.current.forEach((g, i) => { if (g) g.position.y = k === i + 1 ? 0.7 : 1.9; });
  });
  const b = pinBox('keypad-4x4');
  return (
    <group position={[b.cx, 0, 0]}>
      <Legs kind="keypad-4x4" top={2} radius={0.3} />
      <Cyl r={0.5} h={0.1} p={[0, 0.2, 0]} color="#000" shadow={false} />
      <Box s={[7 * 2.54 + 4, 0.6, 3]} p={[0, 1.6, -3]} color="#e6b44a" rough={0.5} />
      <Box s={[70, 1.4, 76]} p={[0, 2.5, -42]} color="#1f2328" rough={0.6} />
      {KEYS.map((k, i) => {
        const r = Math.floor(i / 4), c = i % 4;
        return (
          <group key={k} ref={(g) => { if (g) keys.current[i] = g; }} position={[(c - 1.5) * 15.5, 1.9, -22 - r * 15.5 - 6]} userData={{ simKey: i + 1 }}>
            <mesh position={[0, 1.2, 0]} castShadow userData={{ simKey: i + 1 }}>
              <boxGeometry args={[12.4, 2.4, 12.4]} />
              <Mat color="#c9ced3" rough={0.45} />
            </mesh>
            <Silk text={k} w={7} h={7} p={[0, 2.45, 0]} color="#1b1d21" />
          </group>
        );
      })}
    </group>
  );
}

export function TiltSwitch({ part }: PartProps) {
  const can = useRef<Group>(null);
  const ball = useRef<Mesh>(null);
  useFrame(() => {
    const t = !!inputOf(part.id, 'tilt', 0);
    if (can.current) can.current.rotation.z = t ? 0.62 : 0;
    if (ball.current) ball.current.position.set(t ? 1.8 : 0, t ? -1 : -2, 0);
  });
  return (
    <group>
      <Legs kind="tilt-switch" top={3} radius={0.28} />
      <group ref={can} position={[0, 7.4, 0]} userData={{ simKey: 1 }}>
        <Cyl r={2.2} h={9} color="#c9ced3" metal={0.85} rough={0.3} seg={20} />
        <mesh position={[0, 4.5, 0]}><sphereGeometry args={[2.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /><Mat color="#c9ced3" metal={0.85} rough={0.3} /></mesh>
        <mesh ref={ball} position={[0, -2, 0]}><sphereGeometry args={[0.9, 14, 10]} /><Mat color="#8e949a" metal={1} rough={0.15} /></mesh>
      </group>
      <Box s={[7.6, 1.4, 4]} p={[0, 2.2, 0]} color="#17191c" />
    </group>
  );
}
