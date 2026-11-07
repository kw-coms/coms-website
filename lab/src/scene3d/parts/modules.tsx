import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { MeshStandardMaterial, type CanvasTexture, type Group } from 'three';
import { PARTS } from '../../ui/core';
import { Cable, Legs, cachedTexture, inputOf, makeTexture, useOwned, vis, type PartProps } from './common';
import { reduced } from './basic';

const METAL = '#bfc4c9';

export function Servo({ part }: PartProps) {
  const horn = useRef<Group>(null);
  useFrame(() => {
    if (horn.current) horn.current.rotation.y = ((vis(part.id)?.servo?.angle ?? 90) - 90) * (Math.PI / 180);
  });
  const pins = PARTS.servo.pins;
  const colors: Record<string, string> = { GND: '#5a3416', 'V+': '#d32f2f', SIG: '#f57c00' };
  return (
    <group>
      <mesh position={[0, 1.4, 0]} castShadow><boxGeometry args={[8.4, 2.8, 2.8]} /><meshStandardMaterial color="#17191c" /></mesh>
      {pins.map((p) => <Cable key={p.id} a={[p.pos[0], 2.6, 0]} b={[p.pos[0] * 0.5, 7, -14]} color={colors[p.id] ?? '#888'} r={0.55} />)}
      <Legs kind="servo" top={1.2} />
      <group position={[0, 0, -20]}>
        <mesh position={[0, 12, 0]} castShadow><boxGeometry args={[22.5, 22.7, 12.2]} /><meshStandardMaterial color="#2c63d8" roughness={0.5} /></mesh>
        <mesh position={[0, 18.5, 0]} castShadow><boxGeometry args={[32.5, 2.2, 12.2]} /><meshStandardMaterial color="#2c63d8" roughness={0.5} /></mesh>
        {[-14.5, 14.5].map((x) => <mesh key={x} position={[x, 18.5, 0]} rotation-x={Math.PI / 2}><cylinderGeometry args={[1.1, 1.1, 2.4, 12]} /><meshStandardMaterial color="#111" /></mesh>)}
        <mesh position={[6, 24.8, 0]}><cylinderGeometry args={[2.6, 2.6, 2.4, 20]} /><meshStandardMaterial color="#e6e8ea" /></mesh>
        <group ref={horn} userData={{ probe: 'horn' }} position={[6, 27, 0]}>
          <mesh position={[-5, 0, 0]} castShadow><boxGeometry args={[16, 1.4, 4]} /><meshStandardMaterial color="#f4f5f6" roughness={0.4} /></mesh>
          <mesh><cylinderGeometry args={[3, 3, 1.4, 20]} /><meshStandardMaterial color="#f4f5f6" /></mesh>
        </group>
      </group>
    </group>
  );
}

export function HcSr04({ part }: PartProps) {
  const dist = useRef<Group>(null);
  const tx = useRef<MeshStandardMaterial[]>([]);
  const obsTex = useMemo(() => cachedTexture('hcsr04-obs', 256, 180, (c) => {
    c.fillStyle = '#f2a65a'; c.fillRect(0, 0, 256, 180);
    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 6;
    for (let x = -180; x < 256; x += 36) { c.beginPath(); c.moveTo(x, 180); c.lineTo(x + 180, 0); c.stroke(); }
    c.fillStyle = '#4a2a0c'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'bold 30px sans-serif';
    c.fillText('장애물', 128, 74); c.font = '20px sans-serif'; c.fillText('끌어서 이동', 128, 112);
  }), []);
  useFrame(() => {
    const cm = Number(inputOf(part.id, 'distanceCm', 100));
    if (dist.current) dist.current.position.z = 16 + cm * 0.8;
    const pinging = !!vis(part.id)?.hcsr04?.pinging;
    tx.current.forEach((m) => m && (m.emissiveIntensity = pinging ? 1.2 : 0));
  });
  return (
    <group>
      <Legs kind="hc-sr04" top={3} />
      <mesh position={[0, 3, -0.6]}><boxGeometry args={[10.4, 2.6, 2.6]} /><meshStandardMaterial color="#17191c" /></mesh>
      <mesh position={[0, 14, 0]} castShadow><boxGeometry args={[45, 20, 1.6]} /><meshStandardMaterial color="#1c63c7" roughness={0.45} /></mesh>
      {[-10.5, 10.5].map((x, i) => (
        <group key={x} position={[x, 15, 0.8]}>
          <mesh position={[0, 0, 5.5]} rotation-x={Math.PI / 2} castShadow>
            <cylinderGeometry args={[8.1, 8.1, 11, 28]} />
            <meshStandardMaterial userData={{ dynamic: true }} ref={(m) => { if (m) tx.current[i] = m; }} color="#cfd4d9" metalness={0.85} roughness={0.3} emissive="#6cf" emissiveIntensity={0} />
          </mesh>
          <mesh position={[0, 0, 11.05]} rotation-x={Math.PI / 2}><circleGeometry args={[6.4, 28]} /><meshStandardMaterial color="#222" /></mesh>
        </group>
      ))}
      <mesh position={[0, 15, -1.3]}><boxGeometry args={[10, 5, 1]} /><meshStandardMaterial color="#9aa0a6" metalness={0.8} /></mesh>
      <mesh position={[0, 6.5, -1]}><boxGeometry args={[11, 4, 0.8]} /><meshStandardMaterial color="#17191c" /></mesh>
      {[-1.5, 1.5].map((x) => <mesh key={x} position={[x * 4, 3, 0.5]}><boxGeometry args={[1.4, 2.4, 0.4]} /><meshStandardMaterial color="#d9b44a" metalness={1} roughness={0.3} /></mesh>)}
      {/* movable obstacle: drag it in the scene (or use the distance slider) */}
      <group ref={dist} position={[0, 0, 96]} userData={{ obstacle: part.id }}>
        <mesh position={[0, 1, 0]} castShadow userData={{ obstacle: part.id }}><boxGeometry args={[36, 2, 8]} /><meshStandardMaterial color="#7a4a1c" roughness={0.7} /></mesh>
        <mesh position={[0, 14, 0]} castShadow userData={{ obstacle: part.id }}><boxGeometry args={[34, 24, 3]} /><meshStandardMaterial map={obsTex} roughness={0.55} /></mesh>
      </group>
    </group>
  );
}

const LCD_ON = '#a5d63a', LCD_OFF = '#3a4a34';
export function Lcd1602({ part }: PartProps) {
  const tex = useRef<CanvasTexture | null>(null);
  const last = useRef('');
  const t = useOwned(() => {
    const x = makeTexture(640, 128, () => {});
    tex.current = x;
    return x;
  }, []);
  useFrame(() => {
    const v = vis(part.id)?.lcd;
    const lines = v?.lines ?? ['', ''];
    const bl = v?.backlight ?? false;
    const cur = v?.cursor?.visible ? `${v.cursor.row},${v.cursor.col}` : '';
    const key = `${lines[0]}|${lines[1]}|${bl}|${cur}`;
    if (key === last.current) return;
    last.current = key;
    const cv = t.image as HTMLCanvasElement;
    const c = cv.getContext('2d')!;
    c.fillStyle = bl ? LCD_ON : LCD_OFF;
    c.fillRect(0, 0, 640, 128);
    c.fillStyle = bl ? 'rgba(20,50,10,0.16)' : 'rgba(0,0,0,0.25)';
    for (let r = 0; r < 2; r++) for (let i = 0; i < 16; i++) c.fillRect(i * 40 + 3, r * 64 + 5, 33, 54);
    c.fillStyle = bl ? '#10280a' : 'rgba(200,230,200,0.35)';
    c.font = 'bold 50px "Courier New", monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    lines.forEach((l, r) => [...l.slice(0, 16)].forEach((ch, i) => ch !== ' ' && c.fillText(ch, i * 40 + 20, r * 64 + 34)));
    if (cur && v?.cursor) c.fillRect(v.cursor.col * 40 + 3, v.cursor.row * 64 + 50, 33, 6);
    t.needsUpdate = true;
  });
  return (
    <group>
      <Legs kind={part.kind} top={5} />
      {part.kind === 'lcd1602-i2c' && <mesh position={[0, 7, -1.4]}><boxGeometry args={[40, 4, 1.6]} /><meshStandardMaterial color="#17191c" /></mesh>}
      <mesh position={[0, 20, 0]} castShadow><boxGeometry args={[80, 36, 1.6]} /><meshStandardMaterial color="#0a6b3d" roughness={0.45} /></mesh>
      <mesh position={[0, 21, 2.4]} castShadow><boxGeometry args={[71.2, 25.2, 3.2]} /><meshStandardMaterial color="#1a1d20" roughness={0.5} /></mesh>
      <mesh position={[0, 21, 4.02]}><planeGeometry args={[64.5, 14.6]} /><meshBasicMaterial map={t} toneMapped={false} /></mesh>
      {[[-37, 33], [37, 33], [-37, 7], [37, 7]].map(([x, y]) => <mesh key={`${x}${y}`} position={[x!, y!, 0.9]} rotation-x={Math.PI / 2}><cylinderGeometry args={[1.5, 1.5, 0.4, 12]} /><meshStandardMaterial color={METAL} metalness={0.8} /></mesh>)}
    </group>
  );
}

export function Multimeter({ part }: PartProps) {
  const last = useRef('');
  const t = useOwned(() => makeTexture(256, 128, () => {}), []);
  useFrame(() => {
    const m = vis(part.id)?.meter;
    const mode = m?.mode ?? String(part.props.mode ?? 'V');
    const key = `${m?.reading ?? '0.00'}|${mode}`;
    if (key === last.current) return;
    last.current = key;
    const c = (t.image as HTMLCanvasElement).getContext('2d')!;
    c.fillStyle = '#c9d7c0'; c.fillRect(0, 0, 256, 128);
    c.fillStyle = '#16210f'; c.textAlign = 'right'; c.textBaseline = 'middle';
    c.font = 'bold 66px "Courier New", monospace';
    c.fillText(m?.reading ?? '0.00', 205, 56);
    c.font = 'bold 34px sans-serif'; c.textAlign = 'left';
    c.fillText(mode === 'V' ? 'V' : 'mA', 212, 72);
    t.needsUpdate = true;
  });
  const pins = PARTS.multimeter.pins;
  const col: Record<string, string> = { COM: '#1a1a1a', V: '#d32f2f', A: '#e65100' };
  return (
    <group>
      <RoundedBox args={[45, 15, 75]} radius={3} position={[0, 7.5, -42]} castShadow receiveShadow><meshStandardMaterial color="#f2b80f" roughness={0.5} /></RoundedBox>
      <mesh position={[0, 15.05, -60]} rotation-x={-Math.PI / 2}><planeGeometry args={[32, 16]} /><meshBasicMaterial map={t} toneMapped={false} /></mesh>
      <mesh position={[0, 16.5, -33]} castShadow><cylinderGeometry args={[9, 9.5, 3, 32]} /><meshStandardMaterial color="#26282c" roughness={0.45} /></mesh>
      <mesh position={[0, 18.1, -33]}><boxGeometry args={[1.4, 0.3, 12]} /><meshStandardMaterial color="#f5f5f5" /></mesh>
      {pins.map((p) => (
        <group key={p.id}>
          <mesh position={[p.pos[0], 7.5, -4.6]} rotation-x={Math.PI / 2}><cylinderGeometry args={[1.8, 1.8, 1, 16]} /><meshStandardMaterial color={col[p.id]} /></mesh>
          <Cable a={[p.pos[0], 7.5, -5]} b={[p.pos[0], 14, 1.5]} color={col[p.id]!} r={0.8} />
          <mesh position={[p.pos[0], 8, 0]} castShadow><cylinderGeometry args={[1.5, 1.2, 10, 12]} /><meshStandardMaterial color={col[p.id]} roughness={0.5} /></mesh>
          <mesh position={[p.pos[0], 1.4, 0]}><cylinderGeometry args={[0.45, 0.25, 3, 8]} /><meshStandardMaterial color={METAL} metalness={0.9} roughness={0.25} /></mesh>
        </group>
      ))}
    </group>
  );
}

export function Dht11({ part }: PartProps) {
  void part;
  return (
    <group>
      <Legs kind="dht11" top={3} />
      <mesh position={[0, 9.5, 0]} castShadow><boxGeometry args={[12, 15.5, 5.6]} /><meshStandardMaterial color="#2f74c0" roughness={0.5} /></mesh>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => <mesh key={i} position={[0, 4.4 + i * 1.7 + 2.4, 2.85]}><boxGeometry args={[9.4, 0.6, 0.1]} /><meshStandardMaterial color="#143a66" /></mesh>)}
      <mesh position={[0, 4.6, 2.85]}><boxGeometry args={[9.4, 0.5, 0.1]} /><meshStandardMaterial color="#143a66" /></mesh>
    </group>
  );
}

export function Joystick({ part }: PartProps) {
  const stick = useRef<Group>(null);
  useFrame(() => {
    const g = stick.current;
    if (!g) return;
    g.rotation.z = -(Number(inputOf(part.id, 'x', 0.5)) - 0.5) * 2 * 0.5;
    g.rotation.x = (Number(inputOf(part.id, 'y', 0.5)) - 0.5) * 2 * 0.5;
    g.position.y = inputOf(part.id, 'pressed') ? 10.6 : 12;
  });
  return (
    <group>
      <Legs kind="joystick" top={5} />
      <mesh position={[0, 6, -13]} castShadow><boxGeometry args={[34, 1.6, 26]} /><meshStandardMaterial color="#17191c" roughness={0.5} /></mesh>
      <RoundedBox args={[18, 7, 18]} radius={1} position={[0, 9.8, -13]} castShadow><meshStandardMaterial color="#26282c" roughness={0.45} /></RoundedBox>
      <group ref={stick} position={[0, 12, -13]}>
        <mesh position={[0, 4, 0]} castShadow><cylinderGeometry args={[1.6, 1.8, 8, 16]} /><meshStandardMaterial color="#202226" /></mesh>
        <mesh position={[0, 9, 0]} castShadow><sphereGeometry args={[5.6, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62]} /><meshStandardMaterial color="#2b2e33" roughness={0.4} /></mesh>
      </group>
    </group>
  );
}

const SEG: [number, number, boolean][] = [ // [x, z, horizontal] for a,b,c,d,e,f,g
  [0, -6.6, true], [3.4, -3.3, false], [3.4, 3.3, false], [0, 6.6, true], [-3.4, 3.3, false], [-3.4, -3.3, false], [0, 0, true],
];
export function SevenSegment({ part }: PartProps) {
  const mats = useRef<MeshStandardMaterial[]>([]);
  useFrame(() => {
    const segs = vis(part.id)?.sevenSeg?.segments ?? [];
    mats.current.forEach((m, i) => {
      if (!m) return;
      const on = !!segs[i];
      m.emissiveIntensity = on ? 2.2 : 0;
      m.color.set(on ? '#ff3b30' : '#3a1210');
    });
  });
  const item = (i: number, w: number, d: number, x: number, z: number) => (
    <mesh key={i} position={[x, 9.06, z]}>
      <boxGeometry args={[w, 0.1, d]} />
      <meshStandardMaterial userData={{ dynamic: true }} ref={(m) => { if (m) mats.current[i] = m; }} color="#3a1210" emissive="#ff2a1a" emissiveIntensity={0} />
    </mesh>
  );
  return (
    <group>
      <Legs kind="seven-segment" top={2} radius={0.3} />
      <mesh position={[0, 5.3, 0]} castShadow><boxGeometry args={[12.7, 7.4, 19]} /><meshStandardMaterial color="#17191c" roughness={0.5} /></mesh>
      {SEG.map(([x, z, h], i) => item(i, h ? 5.4 : 1.2, h ? 1.2 : 5.4, x, z))}
      {item(7, 1.3, 1.3, 5.2, 7.6)}
    </group>
  );
}

export function NeopixelStrip({ part }: PartProps) {
  const n = Math.max(1, Math.min(16, Number(part.props.count) || 8));
  const mats = useRef<MeshStandardMaterial[]>([]);
  useFrame(() => {
    const cols = vis(part.id)?.pixels?.colors;
    mats.current.forEach((m, i) => {
      if (!m) return;
      const c = cols?.[i] ?? [0, 0, 0];
      m.emissive.setRGB(c[0] / 255, c[1] / 255, c[2] / 255);
      m.emissiveIntensity = Math.max(c[0], c[1], c[2]) > 0 ? 1.6 : 0;
      m.color.setRGB(0.55 + c[0] / 700, 0.55 + c[1] / 700, 0.55 + c[2] / 700);
    });
  });
  const len = n * 10;
  return (
    <group>
      <Legs kind="neopixel-strip" top={2} radius={0.3} />
      {PARTS['neopixel-strip'].pins.map((p, i) => <Cable key={p.id} a={[p.pos[0], 1, 0]} b={[p.pos[0] + (i - 1) * 0.5, 3, -6]} color={['#f5f5f5', '#d32f2f', '#222'][i]!} r={0.45} />)}
      <mesh position={[len / 2 - 5, 2.6, -11]} castShadow><boxGeometry args={[len, 1.2, 9.6]} /><meshStandardMaterial color="#efe9da" roughness={0.6} /></mesh>
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i} position={[i * 10, 3.8, -11]} castShadow>
          <boxGeometry args={[5, 1.4, 5]} />
          <meshStandardMaterial userData={{ dynamic: true }} ref={(m) => { if (m) mats.current[i] = m; }} color="#8c8c8c" roughness={0.4} emissive="#000" />
        </mesh>
      ))}
    </group>
  );
}

export function L9110s({ part }: PartProps) {
  void part;
  const silk = useMemo(() => cachedTexture('l9110s', 540, 240, (c) => {
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = 'bold 44px sans-serif'; c.fillText('L9110S', 270, 70);
    c.font = '26px sans-serif'; c.fillText('MOTOR DRIVER', 270, 124);
    c.font = 'bold 22px sans-serif'; c.fillText('A', 120, 190); c.fillText('B', 420, 190);
  }), []);
  return (
    <group>
      <Legs kind="l9110s" top={4} radius={0.3} />
      <mesh position={[0, 5.4, 0]} castShadow><boxGeometry args={[29, 1.6, 21]} /><meshStandardMaterial color="#b3262d" roughness={0.45} /></mesh>
      {[-5.5, 5.5].map((x) => <mesh key={x} position={[x, 7, -1]} castShadow><boxGeometry args={[7, 2, 5]} /><meshStandardMaterial color="#17191c" /></mesh>)}
      {[-6, 6].map((x) => <mesh key={x} position={[x, 9.4, 7.5]} castShadow><boxGeometry args={[11, 7, 7]} /><meshStandardMaterial color="#2e9e55" roughness={0.5} /></mesh>)}
      <mesh position={[0, 6.4, -8.2]}><boxGeometry args={[26, 0.4, 3]} /><meshStandardMaterial color="#17191c" /></mesh>
      <mesh position={[0, 6.22, 0.5]} rotation-x={-Math.PI / 2}><planeGeometry args={[27, 12]} /><meshBasicMaterial map={silk} transparent depthWrite={false} toneMapped={false} /></mesh>
    </group>
  );
}

export function DcMotor({ part }: PartProps) {
  const shaft = useRef<Group>(null);
  const ang = useRef(0);
  useFrame((s, dt) => {
    const m = vis(part.id)?.motor;
    const w = m ? Math.min(28, (m.rpm / 60) * Math.PI * 2) * m.direction : 0;
    if (!w) return;
    ang.current += reduced ? 0 : w * dt;
    if (shaft.current) shaft.current.rotation.x = ang.current;
    s.invalidate();
  });
  const pins = PARTS['dc-motor'].pins;
  return (
    <group>
      <Legs kind="dc-motor" top={1.2} />
      {pins.map((p, i) => <Cable key={p.id} a={[p.pos[0], 1.5, 0]} b={[p.pos[0] * 1.6, 6, -5]} color={i ? '#1a1a1a' : '#d32f2f'} r={0.55} />)}
      <mesh position={[-3, 10.5, -14]} rotation-z={Math.PI / 2} castShadow><cylinderGeometry args={[10, 10, 22, 32]} /><meshStandardMaterial color={METAL} metalness={0.85} roughness={0.35} /></mesh>
      <mesh position={[8.4, 10.5, -14]} rotation-z={Math.PI / 2}><cylinderGeometry args={[6, 6, 1.2, 24]} /><meshStandardMaterial color="#6d7378" metalness={0.7} /></mesh>
      <group ref={shaft} userData={{ probe: 'shaft' }} position={[9, 10.5, -14]}>
        <mesh rotation-z={Math.PI / 2} position={[3, 0, 0]}><cylinderGeometry args={[1, 1, 9, 12]} /><meshStandardMaterial color="#d8dcdf" metalness={0.9} roughness={0.2} /></mesh>
        {/* wheel: rubber tyre, hub and spokes + a white mark so the spin reads */}
        <mesh position={[7, 0, 0]} rotation-z={Math.PI / 2} castShadow><cylinderGeometry args={[10.5, 10.5, 4.2, 36]} /><meshStandardMaterial color="#1f2124" roughness={0.85} /></mesh>
        <mesh position={[7, 0, 0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[7.6, 7.6, 4.6, 36]} /><meshStandardMaterial color="#ffb74d" roughness={0.5} /></mesh>
        <mesh position={[7, 0, 0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[2.2, 2.2, 5.2, 16]} /><meshStandardMaterial color="#cfd3d6" metalness={0.8} roughness={0.3} /></mesh>
        {[0, 1, 2].map((i) => <mesh key={i} position={[7, 0, 0]} rotation-x={(i * Math.PI) / 3} castShadow><boxGeometry args={[4.9, 14, 1.4]} /><meshStandardMaterial color="#ffe0b2" roughness={0.5} /></mesh>)}
        <mesh position={[7, 8.9, 0]}><boxGeometry args={[4.9, 1.6, 2.6]} /><meshStandardMaterial color="#ffffff" /></mesh>
      </group>
    </group>
  );
}
