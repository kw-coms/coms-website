import { useMemo, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { PARTS } from '../core';
import { set, useStore } from '../store';
import { layoutSchematic, type Sym } from './layout';

function Glyph({ s }: { s: Sym }) {
  const cx = s.w / 2, cy = s.h / 2;
  switch (s.glyph) {
    case 'res': return <path d={`M0 ${cy}H${cx - 26}l5 -8 8 16 8 -16 8 16 8 -16 5 8H${s.w}`} className="sch-line" fill="none" />;
    case 'cap': return <g className="sch-line"><path d={`M0 ${cy}H${cx - 4}M${cx + 4} ${cy}H${s.w}`} fill="none" /><path d={`M${cx - 4} ${cy - 12}V${cy + 12}M${cx + 4} ${cy - 12}V${cy + 12}`} strokeWidth={3} /></g>;
    case 'diode': return <g className="sch-line"><path d={`M0 ${cy}H${cx - 8}M${cx + 8} ${cy}H${s.w}M${cx + 8} ${cy - 11}V${cy + 11}`} fill="none" /><path d={`M${cx - 8} ${cy - 11}L${cx + 8} ${cy}L${cx - 8} ${cy + 11}Z`} className="sch-fill" /></g>;
    case 'ind': return <path d={`M0 ${cy}H${cx - 24}${[0, 1, 2, 3].map(() => 'a6 6 0 0 1 12 0').join('')}H${s.w}`} className="sch-line" fill="none" />;
    case 'bat': return <g className="sch-line"><path d={`M0 ${cy}H${cx - 5}M${cx + 5} ${cy}H${s.w}`} fill="none" /><path d={`M${cx - 5} ${cy - 13}V${cy + 13}`} strokeWidth={3} /><path d={`M${cx + 5} ${cy - 7}V${cy + 7}`} /></g>;
    default: return null;
  }
}

/** Read-only auto schematic of the circuit (the document's parts and nets), drawn over the 3D stage. */
export function Schematic() {
  const on = useStore((s) => s.schematic);
  const plist = useStore((s) => s.hist.present.parts);
  const an = useStore((s) => s.analysis);
  const [zoom, setZoom] = useState(1);
  const lay = useMemo(() => (on ? layoutSchematic(plist, PARTS, an) : null), [on, plist, an]);
  if (!on || !lay) return null;
  const empty = !lay.syms.length;
  return (
    <div className="schematic" role="region" aria-label="회로도">
      <div className="sch-bar">
        <strong>회로도</strong><span className="muted small">자동으로 그려져요 · 읽기 전용</span>
        <span className="sch-spacer" />
        <button type="button" aria-label="축소" onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}><Minus size={15} /></button>
        <button type="button" aria-label="확대" onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}><Plus size={15} /></button>
        <button type="button" aria-label="회로도 닫기" onClick={() => set({ schematic: false })}><X size={16} /></button>
      </div>
      <div className="sch-scroll">
        {empty ? <p className="muted pad">부품을 놓으면 회로도가 나타나요.</p> : (
          <svg width={lay.width * zoom} height={lay.height * zoom} viewBox={`0 0 ${lay.width} ${lay.height}`} role="img" aria-label="회로도 그림" data-testid="schematic-svg">
            {lay.wires.map((w) => <path key={w.key} d={w.d} className="sch-wire" fill="none" />)}
            {lay.dots.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2.6} className="sch-dot" />)}
            {lay.syms.map((s) => (
              <g key={s.part.id} transform={`translate(${s.x} ${s.y})`}>
                {s.glyph ? <Glyph s={s} /> : <rect width={s.w} height={s.h} rx={6} className="sch-box" />}
                {!s.glyph && <text x={s.w / 2} y={13} textAnchor="middle" className="sch-title">{s.title}</text>}
                {s.glyph && <text x={s.w / 2} y={s.h / 2 - 15} textAnchor="middle" className="sch-title">{s.part.kind === 'resistor' ? `${s.part.props.ohms}Ω` : s.title}</text>}
                <text x={s.w / 2} y={s.h + 12} textAnchor="middle" className="sch-id">{s.part.id}</text>
                {s.pins.map((p) => (
                  <g key={p.id}>
                    <circle cx={p.x} cy={p.y} r={2.4} className="sch-pin" />
                    {!s.glyph && <text x={p.side === 'L' ? 6 : s.w - 6} y={p.y + 3.5} textAnchor={p.side === 'L' ? 'start' : 'end'} className="sch-pl">{p.label}</text>}
                  </g>
                ))}
              </g>
            ))}
            {lay.labels.map((l, i) => (
              <g key={i} transform={`translate(${l.x} ${l.y})`}>
                <path d={`M0 0H${l.dir * 14}`} className="sch-wire" />
                {l.ground ? <path d={`M${l.dir * 14} -6V6M${l.dir * 18} -4V4M${l.dir * 22} -2V2`} className="sch-wire" /> : null}
                <text x={l.dir * (l.ground ? 26 : 17)} y={4} textAnchor={l.dir > 0 ? 'start' : 'end'} className="sch-net">{l.text}</text>
              </g>
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}
