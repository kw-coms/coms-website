import { useMemo } from 'react';
import { CircleAlert, Copy, Info, RotateCw, Trash2, TriangleAlert } from 'lucide-react';
import type { PartInstance, PropDef, SimInputDef, SimWarning } from '../../core/types';
import { PARTS, resistorBands } from '../core';
import { fmtOhms } from '../format';
import { setSimInput } from '../simHost';
import {
  deleteSelection, duplicateSelection, rotateSelection, set, setProp, updateWire, useStore, WIRE_COLORS, type SideTab,
} from '../store';

const UNIT: Record<string, string> = { lux: 'lux', distanceCm: 'cm', temperature: '°C', humidity: '%' };

function PropField({ part, def }: { part: PartInstance; def: PropDef }) {
  const value = part.props[def.key] ?? def.default;
  if (def.type === 'boolean')
    return <label className="row"><span>{def.label}</span><input type="checkbox" checked={!!value} onChange={(e) => setProp(part.id, def.key, e.target.checked)} /></label>;
  if (def.type === 'enum')
    return (
      <label className="row"><span>{def.label}</span>
        <select value={String(value)} onChange={(e) => setProp(part.id, def.key, def.options?.find((o) => String(o.value) === e.target.value)?.value ?? e.target.value)}>
          {def.options?.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
        </select>
      </label>
    );
  const num = Number(value);
  return (
    <div className="row col">
      <span>{def.label}{def.unit ? ` (${def.unit})` : ''}</span>
      <div className="num">
        <input
          type="number" value={Number.isFinite(num) ? num : ''} min={def.min} max={def.max} step="any"
          onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= (def.min ?? -Infinity) && v <= (def.max ?? Infinity)) setProp(part.id, def.key, v); }}
          aria-label={def.label}
        />
        {def.options && (
          <select value="" aria-label={`${def.label} 프리셋`} onChange={(e) => e.target.value && setProp(part.id, def.key, Number(e.target.value))}>
            <option value="">프리셋</option>
            {def.options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}

function ResistorReadout({ ohms }: { ohms: number }) {
  const b = useMemo(() => {
    try { return resistorBands(ohms); } catch { return null; }
  }, [ohms]);
  if (!b) return <p className="muted">색띠로 표시할 수 없는 값이에요.</p>;
  return (
    <div className="bands" aria-live="polite">
      <div className="band-row">{b.colors.map((c, i) => <span key={i} className="band" style={{ background: c }} title={b.names[i]} />)}</div>
      <p>{b.names.join('-')} = <strong>{fmtOhms(ohms)}</strong></p>
    </div>
  );
}

function InputField({ part, def }: { part: PartInstance; def: SimInputDef }) {
  const val = useStore((s) => s.inputs[part.id]?.[def.key]);
  const running = useStore((s) => s.simState !== 'idle');
  if (def.type === 'momentary')
    return (
      <button
        type="button" className="hold" disabled={!running}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setSimInput(part.id, def.key, true); }}
        onPointerUp={() => setSimInput(part.id, def.key, false)}
        onPointerCancel={() => setSimInput(part.id, def.key, false)}
        onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') setSimInput(part.id, def.key, true); }}
        onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') setSimInput(part.id, def.key, false); }}
      >
        {def.label} {running ? '(누르고 있는 동안)' : '(실행 후 사용)'}
      </button>
    );
  const min = def.min ?? 0, max = def.max ?? 1;
  const v = Number(val ?? def.default);
  const log = def.key === 'lux';
  const toSlider = (x: number) => (log ? Math.log10(x) : x);
  const fromSlider = (x: number) => (log ? 10 ** x : x);
  const unit = UNIT[def.key];
  const shown = unit ? `${Math.round(v * 10) / 10} ${unit}` : `${Math.round(v * 100)}%`;
  return (
    <label className="row col">
      <span>{def.label}<b className="val">{shown}</b></span>
      <input
        type="range" min={toSlider(min)} max={toSlider(max)} step={log ? 0.01 : (max - min) / 200}
        value={toSlider(v)} onChange={(e) => setSimInput(part.id, def.key, fromSlider(Number(e.target.value)))}
        aria-label={def.label}
      />
    </label>
  );
}

function PartPanel({ part }: { part: PartInstance }) {
  const def = PARTS[part.kind];
  return (
    <>
      <h3>{def.title}</h3>
      <p className="muted small">{part.id}</p>
      <div className="actions">
        <button type="button" onClick={rotateSelection} title="회전 (R)"><RotateCw size={15} /> 회전</button>
        <button type="button" onClick={duplicateSelection} title="복제 (Ctrl+D)"><Copy size={15} /> 복제</button>
        <button type="button" className="danger" onClick={deleteSelection} title="삭제 (Del)"><Trash2 size={15} /> 삭제</button>
      </div>
      {def.props.map((p) => <PropField key={p.key} part={part} def={p} />)}
      {part.kind === 'resistor' && <ResistorReadout ohms={Number(part.props.ohms)} />}
      {!!def.inputs?.length && (
        <>
          <h4>조작 (실행 중)</h4>
          {def.inputs.map((i) => <InputField key={i.key} part={part} def={i} />)}
        </>
      )}
    </>
  );
}

function WarningList() {
  const analysis = useStore((s) => s.analysis);
  const sim = useStore((s) => s.simWarnings);
  const all: SimWarning[] = [...analysis.warnings, ...sim.filter((w) => !analysis.warnings.some((a) => a.id === w.id))];
  if (!all.length) return <p className="muted pad">경고가 없어요. 회로가 깔끔해요.</p>;
  const Icon = { error: CircleAlert, warn: TriangleAlert, info: Info };
  return (
    <ul className="warnings">
      {all.map((w) => {
        const I = Icon[w.level];
        return (
          <li key={w.id} className={`lvl-${w.level}`}>
            <button type="button" onClick={() => w.partId && set({ selection: { kind: 'part', id: w.partId } })}>
              <I size={16} /> <span>{w.message}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Bom() {
  const plist = useStore((s) => s.hist.present.parts);
  const rows = useMemo(() => {
    const m = new Map<string, { name: string; detail: string; n: number }>();
    for (const p of plist) {
      const d = PARTS[p.kind];
      const detail = p.kind === 'resistor' ? fmtOhms(Number(p.props.ohms)) : p.kind === 'led' ? String(d.props[0]?.options?.find((o) => o.value === p.props.color)?.label ?? '') : p.kind === 'potentiometer' ? fmtOhms(Number(p.props.ohms)) : '';
      const key = `${p.kind}|${detail}`;
      const r = m.get(key) ?? { name: d.title, detail, n: 0 };
      r.n++;
      m.set(key, r);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [plist]);
  if (!rows.length) return <p className="muted pad">부품이 없어요.</p>;
  return (
    <table className="bom">
      <thead><tr><th>부품</th><th>값</th><th>수량</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.name + r.detail}><td>{r.name}</td><td>{r.detail || '-'}</td><td>{r.n}</td></tr>)}</tbody>
      <tfoot><tr><td colSpan={2}>합계</td><td>{rows.reduce((a, r) => a + r.n, 0)}</td></tr></tfoot>
    </table>
  );
}

export function Inspector() {
  const tab = useStore((s) => s.sideTab);
  const sel = useStore((s) => s.selection);
  const part = useStore((s) => (s.selection?.kind === 'part' ? s.hist.present.parts.find((p) => p.id === s.selection!.id) : undefined));
  const wire = useStore((s) => (s.selection?.kind === 'wire' ? s.hist.present.wires.find((w) => w.id === s.selection!.id) : undefined));
  const warnCount = useStore((s) => s.analysis.warnings.length + s.simWarnings.length);
  const tabs: [SideTab, string][] = [['props', '속성'], ['warnings', `경고${warnCount ? ` ${warnCount}` : ''}`], ['bom', '부품 목록']];
  return (
    <aside className="inspector panel" aria-label="속성 패널">
      <div className="tabs" role="tablist">
        {tabs.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => set({ sideTab: id })}>{label}</button>)}
      </div>
      <div className="inspector-body" role="tabpanel">
        {tab === 'props' && (part ? <PartPanel part={part} /> : wire ? (
          <>
            <h3>전선</h3>
            <p className="muted small">색을 골라 회로를 읽기 쉽게 만들어 보세요.</p>
            <div className="swatches" role="radiogroup" aria-label="전선 색">
              {WIRE_COLORS.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={wire.color === c.id} aria-label={c.label} title={c.label} className={`swatch ${wire.color === c.id ? 'on' : ''}`} style={{ background: c.hex }} onClick={() => updateWire(wire.id, { color: c.id })} />
              ))}
            </div>
            <div className="actions">
              {!!wire.bends?.length && <button type="button" onClick={() => updateWire(wire.id, { bends: undefined })}>휘어짐 초기화</button>}
              <button type="button" className="danger" onClick={deleteSelection}><Trash2 size={15} /> 삭제</button>
            </div>
            <p className="muted small">선을 선택하면 나타나는 점을 끌어서 모양을 바꿀 수 있어요.</p>
          </>
        ) : (
          <div className="empty">
            <p><strong>{sel ? '' : '부품이나 전선을 선택해 보세요.'}</strong></p>
            <ul className="muted small tips">
              <li>핀(구멍)을 누르고 다른 핀을 눌러 전선을 연결해요.</li>
              <li>R 회전 · Del 삭제 · Ctrl+D 복제 · Esc 취소</li>
              <li>핀에 마우스를 올리면 연결된 곳이 모두 빛나요.</li>
            </ul>
          </div>
        ))}
        {tab === 'warnings' && <WarningList />}
        {tab === 'bom' && <Bom />}
      </div>
    </aside>
  );
}
