import { useMemo, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import {
  Activity, AudioWaveform, Battery, BatteryCharging, Binary, Cable, CircleDot, Cog, Cpu, Disc3, Droplets, Eye, Fan, Flame, Gauge, Grid3x3, Hash, Info,
  Joystick, Keyboard, Lightbulb, Magnet, Monitor, Palette as PaletteIcon, PlugZap, Radar, Radio, Rainbow, Search, SlidersHorizontal, Sun, Thermometer,
  Timer, ToggleLeft, Vibrate, Volume2, Waves, Zap, Router, Layers, Scale, Hand,
} from 'lucide-react';
import type { PartCategory, PartKind } from '../../core/types';
import { PARTS } from '../core';
import { addAtCenter } from '../../scene3d/placement';
import { setDragKind } from '../../scene3d/Workspace';
import { searchText } from '../partInfo';
import { set, useStore } from '../store';
import { PartCard } from './PartInfo';

type Icon = React.ComponentType<{ size?: number }>;
const ICONS: Partial<Record<PartKind, Icon>> = {
  'arduino-uno': Cpu, 'breadboard-half': Grid3x3, 'breadboard-full': Grid3x3, 'breadboard-mini': Grid3x3, led: Lightbulb, 'rgb-led': PaletteIcon, resistor: Zap,
  pushbutton: CircleDot, 'slide-switch': ToggleLeft, potentiometer: SlidersHorizontal, photoresistor: Sun, buzzer: Volume2, servo: Cog,
  'hc-sr04': Radar, 'lcd1602-i2c': Monitor, 'lcd1602-parallel': Monitor, multimeter: Gauge, dht11: Thermometer, tmp36: Thermometer, joystick: Joystick, 'seven-segment': Hash,
  'seven-segment-4digit': Hash, 'neopixel-strip': Rainbow, 'neopixel-ring': Rainbow, l9110s: Waves, 'dc-motor': Fan, gearmotor: Cog, 'vibration-motor': Vibrate,
  'battery-9v': Battery, 'battery-aa-pack': BatteryCharging, 'coin-cell-3v': Disc3, 'power-supply': PlugZap,
  'capacitor-ceramic': Layers, 'capacitor-electrolytic': Layers, diode: Zap, zener: Zap, inductor: Waves, 'dip-switch-4': ToggleLeft, 'keypad-4x4': Keyboard, 'tilt-switch': Scale,
  pir: Eye, 'flex-sensor': Activity, 'force-sensor': Hand, 'soil-moisture': Droplets, 'gas-sensor': Flame, 'ir-receiver': Radio, 'light-bulb': Lightbulb,
  'relay-spdt': Magnet, 'timer-555': Timer, oscilloscope: AudioWaveform, 'function-generator': AudioWaveform, 'logic-analyzer': Binary,
};
const CATEGORY_ICON: Record<PartCategory, Icon> = { 보드: Cpu, 전원: BatteryCharging, 기본: Zap, 입력: CircleDot, 출력: Volume2, 센서: Radar, 디스플레이: Monitor, 반도체: Router, IC: Cable, 측정: Gauge };
export const ORDER: PartCategory[] = ['보드', '전원', '기본', '입력', '출력', '센서', '디스플레이', '반도체', 'IC', '측정'];

export function Palette({ inSheet = false }: { inSheet?: boolean }) {
  const [q, setQ] = useState('');
  const [hover, setHover] = useState<{ kind: PartKind; y: number } | null>(null);
  const folded = useStore((s) => s.paletteCollapsed) && !inSheet;
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/\s+/g, ' ');
    const kinds = (Object.keys(PARTS) as PartKind[]).filter((k) => {
      const d = PARTS[k];
      return d && (!needle || needle.split(' ').every((w) => searchText(k, d.title).includes(w)));
    });
    const known = new Set(ORDER);
    return [...ORDER, ...[...new Set(kinds.map((k) => PARTS[k].category))].filter((c) => !known.has(c))]
      .map((c) => ({ c, items: kinds.filter((k) => PARTS[k].category === c) })).filter((g) => g.items.length);
  }, [q]);
  return (
    <aside className={`palette panel ${folded ? 'folded' : ''} ${inSheet ? 'in-sheet' : ''}`} aria-label={inSheet ? '부품 팔레트 (시트)' : '부품 팔레트'}>
      {!inSheet && (
        <button type="button" className="pal-fold" aria-label={folded ? '부품 목록 펼치기' : '부품 목록 아이콘으로 접기'} title={folded ? '펼치기' : '아이콘으로 접기'} onClick={() => set({ paletteCollapsed: !folded })}>
          {folded ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
      )}
      {!folded && (
        <div className="search">
          <Search size={15} aria-hidden />
          <input type="search" placeholder="부품 검색 (예: 트랜지스터, 2N2222, 595)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="부품 검색" />
        </div>
      )}
      <div className="palette-scroll" onMouseLeave={() => setHover(null)}>
        {groups.map((g) => (
          <section key={g.c}>
            {!folded && <h3>{g.c}</h3>}
            <ul>
              {g.items.map((k) => {
                const Icon = ICONS[k] ?? CATEGORY_ICON[PARTS[k].category] ?? Cpu;
                return (
                  <li key={k} className="part-row">
                    <button
                      type="button"
                      className="part-item"
                      draggable
                      data-kind={k}
                      title={folded ? PARTS[k].title : undefined}
                      aria-label={PARTS[k].title}
                      onMouseEnter={(e) => !inSheet && setHover({ kind: k, y: e.currentTarget.getBoundingClientRect().top })}
                      onDragStart={(e) => { e.dataTransfer.setData('application/x-part-kind', k); e.dataTransfer.effectAllowed = 'copy'; setDragKind(k); setHover(null); }}
                      onDragEnd={() => setDragKind(null)}
                      onClick={() => addAtCenter(k)}
                    >
                      <span className="part-icon"><Icon size={18} /></span>
                      {!folded && <span>{PARTS[k].title}</span>}
                    </button>
                    {!folded && <button type="button" className="part-info-btn" aria-label={`${PARTS[k].title} 설명`} title="설명 보기" onClick={() => set({ info: k })}><Info size={15} /></button>}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {!groups.length && <p className="muted pad">검색 결과가 없어요. 부품 이름이나 영문, 부품 번호로 찾아 보세요.</p>}
      </div>
      {hover && <PartCard kind={hover.kind} y={hover.y} />}
    </aside>
  );
}
