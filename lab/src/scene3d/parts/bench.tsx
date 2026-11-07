// Bench instruments: power supply, oscilloscope, function generator, logic analyzer. Screens are live canvas textures.
import { useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import type { CanvasTexture, MeshStandardMaterial } from 'three';
import { frameRef } from '../../ui/simHost';
import { getState } from '../../ui/store';
import { DEFAULT_LOGIC, drawLogic, drawScope, frozen, scopeSettings, type ScopeSettings } from '../../ui/instruments/draw';
import type { LogicTrace, PartKind, ScopeTrace } from '../../core/types';
import { Cable, makeTexture, useOwned, vis, type PartProps } from './common';
import { Box, Cyl, Legs, METAL, Silk, pinBox, pinsOf } from './kit';

/** A canvas texture redrawn (at most ~20 Hz) by `draw`; skipped while `key()` is unchanged. */
function useScreen(w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, key: () => string) {
  const last = useRef('');
  const at = useRef(0);
  const tex = useOwned(() => makeTexture(w, h, (c) => draw(c, w, h)), []); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((s) => {
    const now = s.clock.elapsedTime;
    if (now - at.current < 0.05) return;
    const k = key();
    if (k === last.current) return;
    last.current = k;
    at.current = now;
    draw((tex.image as HTMLCanvasElement).getContext('2d')!, w, h);
    (tex as CanvasTexture).needsUpdate = true;
  });
  return tex;
}

const N = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
const first = (props: Record<string, unknown>, ...keys: string[]) => keys.map((k) => props[k]).find((v) => v !== undefined);

/** Slanted front panel: a bench box whose top-front face tilts toward the viewer. */
function Bench({ kind, w, d, h = 30, color = '#46515c', panel = '#d9dde1', children }: { kind: PartKind; w: number; d: number; h?: number; color?: string; panel?: string; children: ReactNode }) {
  const b = pinBox(kind);
  return (
    <group>
      <Legs kind={kind} top={3} radius={0.4} />
      <group position={[b.cx, 0, 0]}>
        <Box s={[w, h, d]} p={[0, h / 2 + 2, -d / 2 - 14]} color={color} rough={0.5} />
        <group position={[0, h + 3, -(d / 2 + 14)]} rotation-x={-0.5}>
          <Box s={[w - 2, 3, d - 4]} p={[0, 0, 0]} color={panel} rough={0.55} />
          {children}
        </group>
      </group>
    </group>
  );
}

function Knob({ p, r = 5, angle = 0, color = '#1b1d21' }: { p: [number, number, number]; r?: number; angle?: number; color?: string }) {
  return (
    <group position={p}>
      <Cyl r={r} h={4} p={[0, 2, 0]} color={color} rough={0.4} seg={28} />
      <Box s={[0.9, 0.3, r * 0.9]} p={[Math.sin(angle) * r * 0.45, 4.1, -Math.cos(angle) * r * 0.45]} r={[0, angle, 0]} color="#f2f2f2" shadow={false} />
    </group>
  );
}
function Lamp({ p, color, refFn }: { p: [number, number, number]; color: string; refFn: (m: MeshStandardMaterial | null) => void }) {
  return (
    <mesh position={p}>
      <cylinderGeometry args={[1.5, 1.5, 1.4, 14]} />
      <meshStandardMaterial ref={refFn} userData={{ dynamic: true }} color="#3a2a2a" emissive={color} emissiveIntensity={0} />
    </mesh>
  );
}
const Plane = ({ tex, w, h, p }: { tex: CanvasTexture; w: number; h: number; p: [number, number, number] }) => (
  <mesh position={p} rotation-x={-Math.PI / 2}>
    <planeGeometry args={[w, h]} />
    <meshBasicMaterial map={tex} toneMapped={false} />
  </mesh>
);

export function PowerSupply({ part }: PartProps) {
  const cv = useRef<MeshStandardMaterial | null>(null);
  const cc = useRef<MeshStandardMaterial | null>(null);
  const setV = N(first(part.props, 'volts', 'voltage', 'vset'), 5);
  const setA = N(first(part.props, 'limit', 'currentLimit', 'amps', 'iset'), 0.5);
  const disp = useScreen(
    360, 150,
    (c, w, h) => {
      const s = vis(part.id)?.supply;
      c.fillStyle = '#0a0f0c'; c.fillRect(0, 0, w, h);
      c.font = 'bold 62px "Courier New", monospace'; c.textBaseline = 'middle'; c.textAlign = 'right';
      c.fillStyle = '#4dff88'; c.fillText((s?.volts ?? 0).toFixed(2), 258, 44);
      c.fillStyle = '#ffcf4d'; c.fillText((s?.amps ?? 0).toFixed(3), 258, 108);
      c.font = 'bold 30px sans-serif'; c.textAlign = 'left';
      c.fillStyle = '#4dff88'; c.fillText('V', 270, 48); c.fillStyle = '#ffcf4d'; c.fillText('A', 270, 112);
      c.font = '20px sans-serif'; c.fillStyle = '#7bd7a0'; c.fillText(`설정 ${setV.toFixed(1)}V / ${setA.toFixed(2)}A`, 12, 138);
    },
    () => { const s = vis(part.id)?.supply; return `${s?.volts.toFixed(2)}|${s?.amps.toFixed(3)}|${setV}|${setA}`; },
  );
  useFrame(() => {
    const s = vis(part.id)?.supply;
    if (cv.current) cv.current.emissiveIntensity = s && !s.limiting ? 2.4 : 0;
    if (cc.current) cc.current.emissiveIntensity = s?.limiting ? 2.4 : 0;
  });
  return (
    <Bench kind="power-supply" w={120} d={68} h={26}>
      <Plane tex={disp} w={50} h={21} p={[-28, 1.7, -14]} />
      <Lamp p={[-4, 1.8, 4]} color="#31ff72" refFn={(m) => { cv.current = m; }} />
      <Lamp p={[6, 1.8, 4]} color="#ff3b30" refFn={(m) => { cc.current = m; }} />
      <Silk text="CV" w={5} h={2.4} p={[-4, 1.62, 9]} color="#222" />
      <Silk text="CC" w={5} h={2.4} p={[6, 1.62, 9]} color="#222" />
      <Knob p={[34, 1.5, -14]} angle={(setV / 30) * 4.6 - 2.3} />
      <Knob p={[34, 1.5, 12]} angle={(Math.min(3, setA) / 3) * 4.6 - 2.3} color="#2a3a52" />
      <Silk text="0–30V 3A" w={26} h={5} p={[-24, 1.62, 18]} color="#222" />
      {pinsOf('power-supply').map((p, i) => <Cyl key={p.id} r={3.2} h={3} p={[p.pos[0] - pinBox('power-supply').cx, 2.2, 24]} color={i % 2 ? '#1a1a1a' : '#d32f2f'} seg={20} />)}
    </Bench>
  );
}

const traceOf = (id: string): ScopeTrace | undefined => frameRef.current?.scopes?.[id];
const scopeUi = (part: PartProps['part']): ScopeSettings => scopeSettings(part.props, getState().instUi[part.id]?.scope);

export function Oscilloscope({ part }: PartProps) {
  const tex = useScreen(
    512, 410,
    (c, w, h) => {
      const ui = scopeUi(part);
      drawScope(c, w, h, ui.run ? traceOf(part.id) : (frozen.get(part.id) as ScopeTrace | undefined) ?? traceOf(part.id), ui, undefined, true);
    },
    () => { const t = traceOf(part.id); const ui = getState().instUi[part.id]?.scope; return `${t?.t0Ms}|${t?.channels[0]?.length}|${JSON.stringify(ui)}|${ui?.run}|${part.props.timeDiv}|${part.props.trigger}`; },
  );
  const ps = pinsOf('oscilloscope');
  const b = pinBox('oscilloscope');
  return (
    <Bench kind="oscilloscope" w={150} d={76} h={26} color="#4a545e" panel="#cfd5da">
      <Box s={[88, 1, 70]} p={[-18, 2, 0]} color="#101418" shadow={false} />
      <Plane tex={tex} w={84} h={67} p={[-18, 2.6, 0]} />
      {[0, 1, 2].map((i) => <Knob key={i} p={[47, 1.5, -20 + i * 18]} r={4.2} angle={i} />)}
      {[0, 1, 2, 3].map((i) => <Box key={i} s={[7, 1.6, 4]} p={[44 + (i % 2) * 11, 2, 12 + Math.floor(i / 2) * 7]} color="#3a424a" shadow={false} />)}
      <Silk text="COM'S SCOPE" w={30} h={4} p={[-48, 1.7, 30]} rot={[-Math.PI / 2, 0, 0]} color="#30363d" />
      {ps.map((p, i) => <Cyl key={p.id} r={3} h={3} p={[p.pos[0] - b.cx, 2.4, 26]} color={i === 0 ? '#ffd21f' : i === 1 ? '#3fe0ff' : '#444'} metal={0.6} seg={18} />)}
    </Bench>
  );
}

export function FunctionGenerator({ part }: PartProps) {
  const wave = String(first(part.props, 'waveform', 'wave', 'shape') ?? 'sine');
  const freq = N(first(part.props, 'freq', 'frequency', 'hz'), 1000);
  const amp = N(first(part.props, 'amplitude', 'amp', 'vpp'), 2);
  const tex = useScreen(
    420, 200,
    (c, w, h) => {
      c.fillStyle = '#0a0f0c'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#4dff88'; c.lineWidth = 3; c.beginPath();
      for (let x = 0; x <= w - 190; x += 2) {
        const t = (x / (w - 190)) * 2, ph = t % 1;
        const y = wave === 'square' ? (ph < 0.5 ? 1 : -1) : wave === 'triangle' ? (ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4) : wave === 'sawtooth' ? ph * 2 - 1 : Math.sin(ph * Math.PI * 2);
        x ? c.lineTo(10 + x, 100 - y * 52) : c.moveTo(10, 100 - y * 52);
      }
      c.stroke();
      c.fillStyle = '#4dff88'; c.font = 'bold 40px "Courier New", monospace'; c.textAlign = 'right';
      c.fillText(freq >= 1000 ? `${+(freq / 1000).toFixed(2)}k` : `${+freq.toFixed(1)}`, w - 14, 66);
      c.font = '24px sans-serif'; c.fillText('Hz', w - 14, 96);
      c.font = 'bold 30px "Courier New", monospace'; c.fillText(`${amp.toFixed(1)}Vpp`, w - 14, 150);
      c.font = '20px sans-serif'; c.fillText(wave, w - 14, 184);
    },
    () => `${wave}|${freq}|${amp}`,
  );
  const b = pinBox('function-generator');
  return (
    <Bench kind="function-generator" w={116} d={64} h={24} color="#4d5a52" panel="#d3d8d4">
      <Plane tex={tex} w={64} h={30} p={[-14, 1.7, -14]} />
      <Knob p={[34, 1.5, -14]} r={6} angle={Math.log10(freq) / 2} />
      {['~', '⊓', '△', '⩘'].map((s, i) => <Box key={s} s={[7, 1.6, 5]} p={[-36 + i * 10, 2, 12]} color={['sine', 'square', 'triangle', 'sawtooth'][i] === wave ? '#31ff72' : '#3a424a'} shadow={false} />)}
      {pinsOf('function-generator').map((p) => <Cyl key={p.id} r={3} h={3} p={[p.pos[0] - b.cx, 2.4, 24]} color="#c9ced3" metal={0.8} seg={18} />)}
    </Bench>
  );
}

export function LogicAnalyzer({ part }: PartProps) {
  const lt = (): LogicTrace | undefined => frameRef.current?.logic?.[part.id];
  const tex = useScreen(
    384, 128,
    (c, w, h) => drawLogic(c, w, h, lt(), { ...DEFAULT_LOGIC, ...getState().instUi[part.id]?.logic }, undefined, true),
    () => { const t = lt(); return `${t?.t0Ms}|${t?.channels[0]?.length}|${getState().instUi[part.id]?.logic?.spanMs}`; },
  );
  const b = pinBox('logic-analyzer');
  return (
    <group>
      <Legs kind="logic-analyzer" top={3} radius={0.35} />
      {pinsOf('logic-analyzer').map((p, i) => <Cable key={p.id} a={[p.pos[0], 3, p.pos[2]]} b={[p.pos[0], 6, -9]} color={['#222', '#8b5a2b', '#d32f2f', '#f57c00', '#f2c200', '#2fa84f', '#1e6fe8', '#8e44ad', '#8a949c'][i % 9]!} r={0.45} />)}
      <group position={[b.cx, 0, 0]}>
        <Box s={[78, 16, 46]} p={[0, 10, -34]} color="#17191c" rough={0.45} />
        <mesh position={[0, 18.1, -34]} rotation-x={-Math.PI / 2}><planeGeometry args={[66, 22]} /><meshBasicMaterial map={tex} toneMapped={false} /></mesh>
        <Silk text="LOGIC 8CH" w={30} h={4} p={[0, 18.1, -50]} color="#9aa5ad" />
        <Box s={[10, 5, 14]} p={[34, 8, -8]} color={METAL} metal={0.85} rough={0.3} />
      </group>
    </group>
  );
}
