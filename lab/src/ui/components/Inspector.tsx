import { useEffect, useMemo, useState } from 'react';
import { CircleAlert, Copy, Info, RotateCcw, RotateCw, Trash2, TriangleAlert } from 'lucide-react';
import type { PartInstance, PropDef, SimInputDef } from '../../core/types';
import { PARTS, resistorBands } from '../core';
import { InstrumentCard, hasPanel } from '../instruments/Panels';
import { fmtOhms } from '../format';
import { setSimInput } from '../simHost';
import {
  deleteSelection, duplicateSelection, rotateSelection, selectPart, set, setProp, updateWire, useStore, WIRE_COLORS,
} from '../store';
import { countByLevel, groupWarnings, LEVEL_LABEL, visibleWarnings } from '../warnings';

const UNIT: Record<string, string> = { lux: 'lux', distanceCm: 'cm', temperature: '°C', humidity: '%', force: 'N', bend: '%' };

export function PropField({ part, def }: { part: PartInstance; def: PropDef }) {
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
  return <NumberField part={part} def={def} value={Number(value)} />;
}

/** Number input with a text draft: only values the core accepts (range, integer rules) are committed; the reason is shown inline. */
function NumberField({ part, def, value }: { part: PartInstance; def: PropDef; value: number }) {
  const [text, setText] = useState(String(value));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setText((t) => (Number(t) === value ? t : String(value))); }, [value]);
  useEffect(() => { setErr(null); }, [part.id]);
  const range = def.min !== undefined || def.max !== undefined ? ` (${def.min ?? '−∞'} ~ ${def.max ?? '∞'})` : '';
  const change = (raw: string) => {
    setText(raw);
    const v = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(v)) return setErr(`숫자를 입력해 주세요.${range}`);
    if (v < (def.min ?? -Infinity) || v > (def.max ?? Infinity)) return setErr(`범위를 벗어났어요.${range}`);
    const e = setProp(part.id, def.key, v);
    setErr(e ? `이 값은 쓸 수 없어요. ${e}` : null);
  };
  return (
    <div className="row col">
      <span>{def.label}{def.unit ? ` (${def.unit})` : ''}</span>
      <div className="num">
        <input
          type="number" value={text} min={def.min} max={def.max} step="any"
          onChange={(e) => change(e.target.value)}
          onBlur={() => { setText(String(value)); setErr(null); }}
          aria-label={def.label} aria-invalid={!!err}
        />
        {def.options && (
          <select value="" aria-label={`${def.label} 프리셋`} onChange={(e) => e.target.value && setProp(part.id, def.key, Number(e.target.value))}>
            <option value="">프리셋</option>
            {def.options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
          </select>
        )}
      </div>
      {err && <p className="field-err" role="alert">{err}</p>}
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
  if (def.key === 'switches') {
    const bits = Number(val ?? def.default ?? 0);
    return (
      <div className="row col"><span>{def.label}</span>
        <div className="bit-row">
          {[0, 1, 2, 3].map((i) => <label key={i} className="chk"><input type="checkbox" checked={!!((bits >> i) & 1)} disabled={!running} onChange={() => setSimInput(part.id, 'switches', bits ^ (1 << i))} /> {i + 1}</label>)}
        </div>
      </div>
    );
  }
  if (def.key === 'key') {
    const cur = Number(val ?? 0);
    return (
      <div className="keypad-grid" role="group" aria-label={def.label}>
        {'123A456B789C*0#D'.split('').map((k, i) => (
          <button key={k} type="button" disabled={!running} className={cur === i + 1 ? 'on' : ''}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setSimInput(part.id, 'key', i + 1); }}
            onPointerUp={() => setSimInput(part.id, 'key', 0)} onPointerCancel={() => setSimInput(part.id, 'key', 0)}>{k}</button>
        ))}
      </div>
    );
  }
  if (def.key === 'tilt' || def.key === 'motion') {
    return <label className="row"><span>{def.label}</span><input type="checkbox" checked={!!Number(val ?? def.default)} disabled={!running} onChange={(e) => setSimInput(part.id, def.key, e.target.checked ? 1 : 0)} /></label>;
  }
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
      <h3>{def.title} <button type="button" className="link-btn" onClick={() => set({ info: part.kind })} aria-label="부품 설명">설명 보기</button></h3>
      <p className="muted small">{part.id}</p>
      <div className="actions">
        <button type="button" onClick={() => rotateSelection()} title="시계 방향 회전 (R)"><RotateCw size={15} /> 회전</button>
        <button type="button" onClick={() => rotateSelection(-1)} title="반시계 방향 회전 (Shift+R)"><RotateCcw size={15} /> 반대로</button>
        <button type="button" onClick={() => rotateSelection(2)} title="180° 뒤집기">↻180°</button>
        <button type="button" onClick={duplicateSelection} title="복제 (Ctrl+D)"><Copy size={15} /> 복제</button>
        <button type="button" className="danger" onClick={deleteSelection} title="삭제 (Del)"><Trash2 size={15} /> 삭제</button>
      </div>
      {def.props.map((p) => <PropField key={p.key} part={part} def={p} />)}
      {part.kind === 'resistor' && <ResistorReadout ohms={Number(part.props.ohms)} />}
      {!!def.inputs?.length && (
        <>
          <h4>조작 (실행 중)</h4>
          {def.inputs.filter((i) => i.key !== 'irCode').map((i) => <InputField key={i.key} part={part} def={i} />)}
        </>
      )}
      {hasPanel(part.kind) && <InstrumentCard part={part} />}
    </>
  );
}

export function useWarnings() {
  const analysis = useStore((s) => s.analysis);
  const sim = useStore((s) => s.simWarnings);
  const plist = useStore((s) => s.hist.present.parts);
  return useMemo(() => visibleWarnings([...analysis.warnings, ...sim], (id) => plist.find((p) => p.id === id)?.kind), [analysis, sim, plist]);
}

const ICON = { error: CircleAlert, warn: TriangleAlert, info: Info };
function WarningList() {
  const all = useWarnings();
  const plist = useStore((s) => s.hist.present.parts);
  const groups = useMemo(() => groupWarnings(all), [all]);
  if (!all.length) return <p className="muted pad">경고가 없어요. 회로가 깔끔해요.</p>;
  const c = countByLevel(all);
  return (
    <div className="warn-wrap">
      <div className="warn-counts" aria-label="경고 개수">
        {(['error', 'warn', 'info'] as const).map((l) => <span key={l} className={`lvl-${l}`}>{LEVEL_LABEL[l]} <b>{c[l]}</b></span>)}
      </div>
      {groups.map((g) => {
        const part = g.partId ? plist.find((p) => p.id === g.partId) : undefined;
        return (
          <section key={g.partId ?? 'general'} className={`warn-group lvl-${g.worst}`}>
            <h4>
              {part ? <button type="button" onClick={() => selectPart(part.id)}>{PARTS[part.kind].title} <small>{part.id}</small></button> : '회로 전체'}
              <span className="count">{g.items.length}</span>
            </h4>
            <ul className="warnings">
              {g.items.map((w) => {
                const I = ICON[w.level];
                return <li key={w.id} className={`lvl-${w.level}`}><I size={15} /> <span>{w.message}</span></li>;
              })}
            </ul>
          </section>
        );
      })}
    </div>
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

export function PropsPanel() {
  const sel = useStore((s) => s.selection);
  const multi = useStore((s) => s.multi);
  const part = useStore((s) => (s.selection?.kind === 'part' ? s.hist.present.parts.find((p) => p.id === s.selection!.id) : undefined));
  const wire = useStore((s) => (s.selection?.kind === 'wire' ? s.hist.present.wires.find((w) => w.id === s.selection!.id) : undefined));
  if (multi.length > 1)
    return (
      <>
        <h3>부품 {multi.length}개 선택됨</h3>
        <p className="muted small">끌어서 함께 옮기고, 아래 버튼으로 한꺼번에 돌리거나 지울 수 있어요.</p>
        <div className="actions">
          <button type="button" onClick={() => rotateSelection()} title="시계 방향 회전 (R)"><RotateCw size={15} /> 회전</button>
        <button type="button" onClick={() => rotateSelection(-1)} title="반시계 방향 회전 (Shift+R)"><RotateCcw size={15} /> 반대로</button>
        <button type="button" onClick={() => rotateSelection(2)} title="180° 뒤집기">↻180°</button>
          <button type="button" onClick={duplicateSelection} title="복제 (Ctrl+D)"><Copy size={15} /> 복제</button>
          <button type="button" className="danger" onClick={deleteSelection} title="삭제 (Del)"><Trash2 size={15} /> 삭제</button>
        </div>
      </>
    );
  if (part) return <PartPanel part={part} />;
  if (wire)
    return (
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
        <p className="muted small">선을 선택하면 나타나는 점을 끌어서 모양을 바꿀 수 있어요. 점을 더블클릭하면 지워져요.</p>
      </>
    );
  return (
    <div className="empty">
      <p><strong>{sel ? '' : '부품이나 전선을 선택해 보세요.'}</strong></p>
      <ul className="muted small tips">
        <li>핀(구멍)을 누르고 다른 핀을 눌러 전선을 연결해요.</li>
        <li>R 회전 · Del 삭제 · Ctrl+D 복제 · Esc 취소</li>
        <li>Shift+클릭으로 여러 개를 고르고, 위에서 보기에서는 빈 곳을 끌어 한꺼번에 고를 수 있어요.</li>
        <li>부품을 더블클릭하면 가까이 보여 줘요. 오른쪽 클릭은 메뉴예요.</li>
      </ul>
    </div>
  );
}
export { WarningList as WarningsPanel, Bom as BomPanel };
