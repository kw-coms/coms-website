import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { MeshPhysicalMaterial, MeshStandardMaterial, type Group, type Mesh, type Sprite } from 'three';
import { resistorBands } from '../../ui/core';
import { GlowPool, GlowSprite, Legs, inputOf, makeTexture, vis, type PartProps } from './common';

export const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const LED_COLORS: Record<string, string> = { red: '#ff2f2f', green: '#22d65a', blue: '#2f6bff', yellow: '#ffd21f', white: '#f3f3f3' };

export function Led({ part }: PartProps) {
  const color = LED_COLORS[String(part.props.color)] ?? LED_COLORS.red!;
  // translucent coloured epoxy: you can see the lead-frame cup and die inside; lit = emissive + halo + light pool
  const mat = useMemo(() => new MeshPhysicalMaterial({ userData: { dynamic: true }, color, emissive: color, emissiveIntensity: 0, transparent: true, opacity: 0.74, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.2 }), [color]);
  const die = useMemo(() => new MeshStandardMaterial({ userData: { dynamic: true }, color: '#d8d2c4', emissive: color, emissiveIntensity: 0, metalness: 0.6, roughness: 0.4 }), [color]);
  const glow = useRef<Sprite>(null);
  const pool = useRef<Mesh>(null);
  useFrame(() => {
    const b = vis(part.id)?.led?.brightness ?? 0;
    const e = Math.sqrt(b); // perceptual: low PWM duty stays visibly dim, not off
    mat.emissiveIntensity = e * 2.6;
    die.emissiveIntensity = e * 4;
    const g = glow.current;
    if (g) {
      g.visible = b > 0.02;
      g.scale.setScalar(7 + e * 20);
      (g.material as { opacity: number }).opacity = Math.min(1, 0.15 + e * 0.85);
    }
    const p = pool.current;
    if (p) {
      p.visible = b > 0.02;
      p.scale.setScalar(10 + e * 22);
      (p.material as { opacity: number }).opacity = Math.min(0.9, e * 0.8);
    }
  });
  return (
    <group>
      <Legs kind="led" top={4.2} />
      <mesh position={[0, 4.5, 0]} castShadow material={mat}><cylinderGeometry args={[2.9, 2.9, 0.8, 24]} /></mesh>
      <mesh position={[0, 6.3, 0]} castShadow material={mat}><cylinderGeometry args={[2.4, 2.4, 3.2, 24]} /></mesh>
      <mesh position={[0, 7.9, 0]} castShadow material={mat}><sphereGeometry args={[2.4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
      {/* lead frame: anvil + cup + die */}
      <mesh position={[0.7, 5.6, 0]}><boxGeometry args={[0.35, 2.2, 1.3]} /><meshStandardMaterial color="#cfd3d6" metalness={0.85} roughness={0.3} /></mesh>
      <mesh position={[-0.7, 5.3, 0]}><boxGeometry args={[0.35, 1.6, 0.9]} /><meshStandardMaterial color="#cfd3d6" metalness={0.85} roughness={0.3} /></mesh>
      <mesh position={[-0.7, 6.3, 0]} material={die}><boxGeometry args={[0.9, 0.9, 0.9]} /></mesh>
      <GlowSprite spriteRef={glow} position={[0, 7, 0]} color={color} />
      <GlowPool poolRef={pool} color={color} />
    </group>
  );
}

export function RgbLed({ part }: PartProps) {
  const mat = useRef<MeshStandardMaterial>(null);
  const glow = useRef<Sprite>(null);
  const pool = useRef<Mesh>(null);
  useFrame(() => {
    const v = vis(part.id)?.rgb ?? { r: 0, g: 0, b: 0 };
    const m = Math.max(v.r, v.g, v.b);
    const e = Math.sqrt(m);
    mat.current?.emissive.setRGB(v.r, v.g, v.b);
    if (mat.current) mat.current.emissiveIntensity = e * 2.4;
    const g = glow.current;
    if (g) {
      g.visible = m > 0.02;
      g.scale.setScalar(7 + e * 22);
      const gm = g.material as { opacity: number; color: { setRGB: (r: number, g: number, b: number) => void } };
      gm.opacity = Math.min(1, 0.15 + e * 0.85);
      gm.color.setRGB(v.r, v.g, v.b);
    }
    const p = pool.current;
    if (p) {
      p.visible = m > 0.02;
      p.scale.setScalar(10 + e * 24);
      const pm = p.material as unknown as { opacity: number; color: { setRGB: (r: number, g: number, b: number) => void } };
      pm.opacity = Math.min(0.9, e * 0.8);
      pm.color.setRGB(v.r, v.g, v.b);
    }
  });
  return (
    <group>
      <Legs kind="rgb-led" top={4.2} />
      <mesh position={[0, 4.5, 0]} castShadow><cylinderGeometry args={[3.2, 3.2, 0.8, 24]} /><meshStandardMaterial color="#e8eaec" transparent opacity={0.8} /></mesh>
      <mesh position={[0, 6.7, 0]} castShadow><cylinderGeometry args={[2.8, 2.8, 4, 24]} /><meshStandardMaterial userData={{ dynamic: true }} ref={mat} color="#f1f3f4" emissive="#000" transparent opacity={0.72} roughness={0.15} /></mesh>
      <mesh position={[0, 8.7, 0]} castShadow><sphereGeometry args={[2.8, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#f1f3f4" transparent opacity={0.72} roughness={0.15} /></mesh>
      {[-1.1, 0, 1.1].map((x, i) => <mesh key={x} position={[x * 0.9, 6.2, 0]}><boxGeometry args={[0.3, 2.2 + (i % 2) * 0.6, 0.8]} /><meshStandardMaterial color="#cfd3d6" metalness={0.85} roughness={0.3} /></mesh>)}
      <GlowSprite spriteRef={glow} position={[0, 7.5, 0]} color="#ffffff" />
      <GlowPool poolRef={pool} color="#ffffff" />
    </group>
  );
}

export function Resistor({ part }: PartProps) {
  const bands = useMemo(() => {
    try {
      return resistorBands(Number(part.props.ohms)).colors;
    } catch {
      return ['#777', '#777', '#777', '#C0C0C0'];
    }
  }, [part.props.ohms]);
  const xs = [-2.5, -1.2, 0.1, 2.7];
  return (
    <group>
      <Legs kind="resistor" top={3.2} radius={0.35} only={['1', '2']} />
      <mesh position={[-3.8, 3.2, 0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.32, 0.32, 2.6, 8]} /><meshStandardMaterial color="#b7bcc2" metalness={0.85} roughness={0.3} /></mesh>
      <mesh position={[3.8, 3.2, 0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.32, 0.32, 2.6, 8]} /><meshStandardMaterial color="#b7bcc2" metalness={0.85} roughness={0.3} /></mesh>
      <mesh position={[-5.08, 1.45, 0]}><cylinderGeometry args={[0.32, 0.32, 3.4, 8]} /><meshStandardMaterial color="#b7bcc2" metalness={0.85} /></mesh>
      <mesh position={[0, 3.2, 0]} rotation-z={Math.PI / 2} castShadow><cylinderGeometry args={[1.45, 1.45, 6.2, 20]} /><meshStandardMaterial color="#d9bf8c" roughness={0.65} /></mesh>
      {[-3, 3].map((x) => <mesh key={x} position={[x, 3.2, 0]} castShadow><sphereGeometry args={[1.45, 14, 10]} /><meshStandardMaterial color="#d9bf8c" roughness={0.65} /></mesh>)}
      {bands.map((c, i) => (
        <mesh key={i} position={[xs[i]!, 3.2, 0]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[1.52, 1.52, 0.82, 20]} />
          <meshStandardMaterial color={c} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

export function Pushbutton({ part }: PartProps) {
  const cap = useRef<Group>(null);
  useFrame(() => {
    if (cap.current) cap.current.position.y = inputOf(part.id, 'pressed') ? -0.9 : 0;
  });
  return (
    <group>
      <Legs kind="pushbutton" top={1.2} radius={0.3} />
      <RoundedBox args={[6, 3.4, 6]} radius={0.35} position={[0, 2.7, 0]} castShadow><meshStandardMaterial color="#26282c" roughness={0.5} /></RoundedBox>
      <mesh position={[0, 4.4, 0]}><boxGeometry args={[4.6, 0.12, 4.6]} /><meshStandardMaterial color="#aeb4ba" metalness={0.8} roughness={0.3} /></mesh>
      <group ref={cap}>
        <mesh position={[0, 5.5, 0]} castShadow><cylinderGeometry args={[1.8, 1.8, 2.2, 20]} /><meshStandardMaterial color="#2c63d8" roughness={0.4} /></mesh>
      </group>
    </group>
  );
}

export function SlideSwitch({ part }: PartProps) {
  const knob = useRef<Mesh>(null);
  useFrame(() => {
    if (knob.current) knob.current.position.x = (Number(inputOf(part.id, 'position')) >= 0.5 ? 1 : -1) * 1.6;
  });
  return (
    <group>
      <Legs kind="slide-switch" top={1.6} radius={0.3} />
      <mesh position={[0, 3.3, -0.2]} castShadow><boxGeometry args={[8.6, 3.4, 3.8]} /><meshStandardMaterial color="#b9bec4" metalness={0.75} roughness={0.35} /></mesh>
      <mesh position={[0, 5.2, -0.2]}><boxGeometry args={[6.4, 0.5, 1.2]} /><meshStandardMaterial color="#17191c" /></mesh>
      <mesh ref={knob} position={[-1.6, 6.4, -0.2]} castShadow><boxGeometry args={[2.6, 2.2, 2.2]} /><meshStandardMaterial color="#202226" roughness={0.5} /></mesh>
    </group>
  );
}

export function Potentiometer({ part }: PartProps) {
  const knob = useRef<Group>(null);
  useFrame(() => {
    if (knob.current) knob.current.rotation.y = -(Number(inputOf(part.id, 'position', 0.5)) - 0.5) * 2 * 2.35;
  });
  return (
    <group>
      <Legs kind="potentiometer" top={2.5} radius={0.3} />
      <RoundedBox args={[10, 5, 10]} radius={0.5} position={[0, 4.5, -2.5]} castShadow><meshStandardMaterial color="#2455b8" roughness={0.45} /></RoundedBox>
      <group ref={knob} position={[0, 7, -2.5]}>
        <mesh position={[0, 1.4, 0]} castShadow><cylinderGeometry args={[3.5, 3.7, 3, 28]} /><meshStandardMaterial color="#dfe3e6" roughness={0.35} metalness={0.4} /></mesh>
        <mesh position={[0, 2.95, 0]}><boxGeometry args={[6.2, 0.35, 0.9]} /><meshStandardMaterial color="#555b61" /></mesh>
        <mesh position={[0, 2.95, 0]}><boxGeometry args={[0.9, 0.36, 0.9]} /><meshStandardMaterial color="#d33" /></mesh>
      </group>
    </group>
  );
}

export function Photoresistor({ part }: PartProps) {
  const tex = useMemo(() => makeTexture(128, 128, (c) => {
    c.fillStyle = '#e8a840'; c.fillRect(0, 0, 128, 128);
    c.strokeStyle = '#5a3a14'; c.lineWidth = 7;
    c.beginPath();
    for (let i = 0; i < 6; i++) { c.moveTo(24, 22 + i * 17); c.lineTo(104, 22 + i * 17); if (i < 5) c.lineTo(i % 2 ? 24 : 104, 39 + i * 17); }
    c.stroke();
  }), []);
  void part;
  return (
    <group>
      <Legs kind="photoresistor" top={4.5} radius={0.3} />
      <mesh position={[0, 5, 0]} castShadow><cylinderGeometry args={[2.6, 2.6, 1, 28]} /><meshStandardMaterial color="#e8a840" roughness={0.5} /></mesh>
      <mesh position={[0, 5.52, 0]} rotation-x={-Math.PI / 2}><circleGeometry args={[2.4, 28]} /><meshStandardMaterial map={tex} roughness={0.35} /></mesh>
    </group>
  );
}

export function Buzzer({ part }: PartProps) {
  const rings = useRef<Group>(null);
  useFrame((s) => {
    const on = !!vis(part.id)?.buzzer?.on;
    const g = rings.current;
    if (!g) return;
    g.visible = on;
    if (!on) return;
    const t = reduced ? 0.5 : (s.clock.elapsedTime * 1.6) % 1;
    g.children.forEach((c, i) => {
      const k = (t + i / 3) % 1;
      c.scale.setScalar(1 + k * 2.2);
      ((c as Mesh).material as MeshStandardMaterial).opacity = 0.7 * (1 - k);
    });
    if (!reduced) s.invalidate();
  });
  return (
    <group>
      <Legs kind="buzzer" top={3} radius={0.3} />
      <mesh position={[0, 5.2, 0]} castShadow><cylinderGeometry args={[6, 6, 8, 32]} /><meshStandardMaterial color="#17191c" roughness={0.5} /></mesh>
      <mesh position={[0, 9.25, 0]}><cylinderGeometry args={[1.1, 1.1, 0.2, 16]} /><meshStandardMaterial color="#000" /></mesh>
      <mesh position={[-3.6, 9.25, 2.4]} rotation-x={-Math.PI / 2}><planeGeometry args={[1.3, 0.3]} /><meshBasicMaterial color="#eee" /></mesh>
      <mesh position={[-3.6, 9.25, 2.4]} rotation-x={-Math.PI / 2}><planeGeometry args={[0.3, 1.3]} /><meshBasicMaterial color="#eee" /></mesh>
      <group ref={rings} position={[0, 11, 0]} visible={false}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation-x={Math.PI / 2}><torusGeometry args={[3, 0.18, 8, 36]} /><meshStandardMaterial userData={{ dynamic: true }} color="#6cc0ff" emissive="#6cc0ff" emissiveIntensity={1} transparent opacity={0.5} /></mesh>
        ))}
      </group>
    </group>
  );
}
