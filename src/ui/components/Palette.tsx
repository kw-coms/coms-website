import { useMemo, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import {
  Cpu, Fan, Gauge, Grid3x3, Hash, Joystick, Lightbulb, Monitor, Palette as PaletteIcon, Radar, Search, SlidersHorizontal, Sun, Thermometer,
  ToggleLeft, Volume2, Zap, CircleDot, Cog, Waves, Rainbow,
} from 'lucide-react';
import type { PartCategory, PartKind } from '../../core/types';
import { PARTS } from '../core';
import { addAtCenter } from '../../scene3d/placement';
import { setDragKind } from '../../scene3d/Workspace';
import { set, useStore } from '../store';

const ICONS: Record<PartKind, React.ComponentType<{ size?: number }>> = {
  'arduino-uno': Cpu, 'breadboard-half': Grid3x3, 'breadboard-full': Grid3x3, led: Lightbulb, 'rgb-led': PaletteIcon, resistor: Zap,
  pushbutton: CircleDot, 'slide-switch': ToggleLeft, potentiometer: SlidersHorizontal, photoresistor: Sun, buzzer: Volume2, servo: Cog,
  'hc-sr04': Radar, 'lcd1602-i2c': Monitor, multimeter: Gauge, dht11: Thermometer, joystick: Joystick, 'seven-segment': Hash,
  'neopixel-strip': Rainbow, l9110s: Waves, 'dc-motor': Fan,
};
const ORDER: PartCategory[] = ['보드', '기본', '입력', '출력', '센서', '디스플레이', '측정'];

export function Palette({ inSheet = false }: { inSheet?: boolean }) {
  const [q, setQ] = useState('');
  const folded = useStore((s) => s.paletteCollapsed) && !inSheet;
  const groups = useMemo(() => {
    const kinds = (Object.keys(PARTS) as PartKind[]).filter((k) => {
      const d = PARTS[k];
      return d && (!q || `${d.title} ${k}`.toLowerCase().includes(q.toLowerCase()));
    });
    return ORDER.map((c) => ({ c, items: kinds.filter((k) => PARTS[k].category === c) })).filter((g) => g.items.length);
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
          <input type="search" placeholder="부품 검색" value={q} onChange={(e) => setQ(e.target.value)} aria-label="부품 검색" />
        </div>
      )}
      <div className="palette-scroll">
        {groups.map((g) => (
          <section key={g.c}>
            {!folded && <h3>{g.c}</h3>}
            <ul>
              {g.items.map((k) => {
                const Icon = ICONS[k] ?? Cpu;
                return (
                  <li key={k}>
                    <button
                      type="button"
                      className="part-item"
                      draggable
                      title={folded ? PARTS[k].title : '캔버스로 끌어다 놓거나 눌러서 추가'}
                      aria-label={PARTS[k].title}
                      onDragStart={(e) => { e.dataTransfer.setData('application/x-part-kind', k); e.dataTransfer.effectAllowed = 'copy'; setDragKind(k); }}
                      onDragEnd={() => setDragKind(null)}
                      onClick={() => addAtCenter(k)}
                    >
                      <span className="part-icon"><Icon size={18} /></span>
                      {!folded && <span>{PARTS[k].title}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {!groups.length && <p className="muted pad">검색 결과가 없어요.</p>}
      </div>
    </aside>
  );
}
