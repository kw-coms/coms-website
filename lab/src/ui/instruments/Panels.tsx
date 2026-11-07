import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ExternalLink, Pin, Pause, Play, Ruler } from 'lucide-react';
import type { LogicTrace, PartInstance, ScopeTrace } from '../../core/types';
import { PARTS } from '../core';
import { onSimFrame, frameRef, setSimInput } from '../simHost';
import { setInstUi, setProp, setScope, useStore } from '../store';
import { PropField } from '../components/Inspector';
import {
  CH_COLORS, DEFAULT_LOGIC, SPAN_STEPS, TIME_STEPS, VOLT_STEPS, drawLogic, drawScope, fmtT, fmtV, frozen, logicStats, measureScope, scopeCursors, scopeSettings,
  type LogicSettings, type ScopeSettings,
} from './draw';

export const INSTRUMENT_KINDS = ['oscilloscope', 'function-generator', 'power-supply', 'logic-analyzer', 'multimeter'] as const;
const TITLE: Record<string, string> = { oscilloscope: '오실로스코프', 'function-generator': '함수 발생기', 'power-supply': '전원 공급기', 'logic-analyzer': '로직 분석기', multimeter: '멀티미터' };

/** Re-render a panel on every simulator frame (~60 Hz is too much for React; ~15 Hz is plenty). */
function useFrameTick(hz = 15) {
  const [, set] = useState(0);
  useEffect(() => {
    let last = 0;
    const off = onSimFrame(() => {
      const now = performance.now();
      if (now - last > 1000 / hz) { last = now; set((v) => v + 1); }
    });
    return () => void off();
  }, [hz]);
}

function useCanvas(draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, aspect: number, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dark = useStore((s) => s.theme);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth || 320, h = Math.round(w / aspect);
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const c = cv.getContext('2d')!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(c, w, h);
  }, [dark, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}


function Stepper({ label, value, steps, fmt, onChange }: { label: string; value: number; steps: number[]; fmt: (v: number) => string; onChange: (v: number) => void }) {
  const idx = Math.max(0, steps.findIndex((s) => s >= value));
  return (
    <label className="inst-step"><span>{label}</span>
      <select value={steps[idx]} onChange={(e) => onChange(Number(e.target.value))} aria-label={label}>
        {steps.map((s) => <option key={s} value={s}>{fmt(s)}</option>)}
      </select>
    </label>
  );
}

export function ScopePanel({ part }: { part: PartInstance }) {
  useFrameTick();
  const ui = useStore((s) => s.instUi[part.id]?.scope);
  // time/div and trigger are the part's props: the simulator acquires with them, so the panel only writes them there
  const s = scopeSettings(part.props, ui as Partial<ScopeSettings> | undefined);
  const [triggerDraft, setTriggerDraft] = useState<number | null>(null);
  const live = frameRef.current?.scopes?.[part.id];
  const shown: ScopeTrace | undefined = s.run ? live : ((frozen.get(part.id) as ScopeTrace | undefined) ?? live);
  const cv = useCanvas((c, w, h) => drawScope(c, w, h, shown, s), 1.25, [shown?.t0Ms, shown?.channels[0]?.length, JSON.stringify(s)]);
  const m = shown ? measureScope(shown, s) : null;
  const drag = useRef<'c1' | 'c2' | null>(null);
  const toggleRun = () => {
    if (s.run && live) frozen.set(part.id, JSON.parse(JSON.stringify(live)));
    setScope(part.id, { run: !s.run });
  };
  const commitTrigger = () => {
    if (triggerDraft !== null) void setProp(part.id, 'trigger', triggerDraft);
    setTriggerDraft(null);
  };
  const pick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!s.cursors) return;
    const r = e.currentTarget.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    if (e.type === 'pointerdown') drag.current = Math.abs(f - s.c1) < Math.abs(f - s.c2) ? 'c1' : 'c2';
    if (drag.current) setScope(part.id, { [drag.current]: f });
  };
  const cur = shown ? scopeCursors(shown, s) : null;
  const dt = cur?.dtMs ?? 0;
  return (
    <div className="inst-body">
      <canvas ref={cv} className="inst-screen" aria-label="오실로스코프 화면" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pick(e); }} onPointerMove={pick} onPointerUp={() => (drag.current = null)} />
      <div className="inst-grid">
        <Stepper label="시간/칸" value={s.timePerDiv} steps={TIME_STEPS} fmt={fmtT} onChange={(v) => void setProp(part.id, 'timeDiv', v)} />
        <Stepper label="CH1 전압/칸" value={s.voltsPerDiv[0]} steps={VOLT_STEPS} fmt={fmtV} onChange={(v) => setScope(part.id, { voltsPerDiv: [v, s.voltsPerDiv[1]] })} />
        <Stepper label="CH2 전압/칸" value={s.voltsPerDiv[1]} steps={VOLT_STEPS} fmt={fmtV} onChange={(v) => setScope(part.id, { voltsPerDiv: [s.voltsPerDiv[0], v] })} />
        <label className="inst-step wide"><span>트리거 레벨 <b className="val">{(triggerDraft ?? s.trigger).toFixed(2)}V</b></span>
          {/* one history step per drag: the level is written to the part when the slider is released */}
          <input type="range" min={-10} max={10} step={0.05} value={triggerDraft ?? s.trigger} aria-label="트리거 레벨"
            onChange={(e) => setTriggerDraft(Number(e.target.value))}
            onPointerUp={commitTrigger} onKeyUp={commitTrigger} onBlur={commitTrigger} />
        </label>
      </div>
      <div className="inst-actions">
        <button type="button" onClick={toggleRun} className={s.run ? '' : 'on'}>{s.run ? <><Pause size={14} /> 정지</> : <><Play size={14} /> 계속</>}</button>
        <button type="button" onClick={() => setScope(part.id, { cursors: !s.cursors })} className={s.cursors ? 'on' : ''}><Ruler size={14} /> 커서</button>
      </div>
      <dl className="inst-read">
        <dt style={{ color: CH_COLORS[0] }}>CH1 Vpp</dt><dd>{m ? fmtV(m.vpp[0] ?? 0) : '-'}</dd>
        <dt style={{ color: CH_COLORS[1] }}>CH2 Vpp</dt><dd>{m ? fmtV(m.vpp[1] ?? 0) : '-'}</dd>
        <dt>주파수</dt><dd>{m && m.freq ? `${+m.freq.toFixed(m.freq < 100 ? 2 : 0)} Hz` : '-'}</dd>
        {s.cursors && <><dt>Δt</dt><dd>{fmtT(+dt.toFixed(3))}{dt > 0 ? ` (${+(1000 / dt).toFixed(1)} Hz)` : ''}</dd><dt>ΔV(CH1)</dt><dd>{cur?.dv != null ? fmtV(cur.dv) : '-'}</dd></>}
      </dl>
    </div>
  );
}

export function LogicPanel({ part }: { part: PartInstance }) {
  useFrameTick();
  const ui = useStore((s) => s.instUi[part.id]?.logic);
  const s: LogicSettings = { ...DEFAULT_LOGIC, ...ui };
  const live: LogicTrace | undefined = frameRef.current?.logic?.[part.id];
  const shown = s.run ? live : ((frozen.get(part.id) as LogicTrace | undefined) ?? live);
  const cv = useCanvas((c, w, h) => drawLogic(c, w, h, shown, s), 1.6, [shown?.t0Ms, shown?.channels[0]?.length, s.spanMs, s.run]);
  const set = (p: Partial<LogicSettings>) => setInstUi(part.id, { logic: { ...ui, ...p } });
  return (
    <div className="inst-body">
      <canvas ref={cv} className="inst-screen" aria-label="로직 분석기 화면" />
      <div className="inst-grid">
        <Stepper label="보이는 시간" value={s.spanMs} steps={SPAN_STEPS} fmt={fmtT} onChange={(v) => set({ spanMs: v })} />
        <div className="inst-actions">
          <button type="button" className={s.run ? '' : 'on'} onClick={() => { if (s.run && live) frozen.set(part.id, JSON.parse(JSON.stringify(live))); set({ run: !s.run }); }}>
            {s.run ? <><Pause size={14} /> 정지</> : <><Play size={14} /> 계속</>}
          </button>
        </div>
      </div>
      <table className="inst-table">
        <thead><tr><th>채널</th><th>주파수</th><th>듀티</th><th>에지</th></tr></thead>
        <tbody>
          {Array.from({ length: 8 }, (_, k) => { const st = logicStats(shown, k, s); return <tr key={k}><td>D{k}</td><td>{st.freq ? `${+st.freq.toFixed(1)} Hz` : '-'}</td><td>{st.edges ? `${Math.round(st.duty * 100)}%` : '-'}</td><td>{st.edges}</td></tr>; })}
        </tbody>
      </table>
    </div>
  );
}

export function SupplyPanel({ part }: { part: PartInstance }) {
  useFrameTick();
  const s = frameRef.current?.parts[part.id]?.supply;
  return (
    <div className="inst-body">
      <div className="supply-read" aria-live="off">
        <div><b>{(s?.volts ?? 0).toFixed(2)}</b><small>V</small></div>
        <div><b>{(s?.amps ?? 0).toFixed(3)}</b><small>A</small></div>
        <span className={`lamp ${s?.limiting ? 'cc' : s ? 'cv' : ''}`}>{s?.limiting ? 'CC 전류 제한' : s ? 'CV 정전압' : '꺼짐'}</span>
      </div>
      {PARTS[part.kind].props.map((d) => <PropField key={d.key} part={part} def={d} />)}
    </div>
  );
}

export function FuncGenPanel({ part }: { part: PartInstance }) {
  return <div className="inst-body">{PARTS[part.kind].props.map((d) => <PropField key={d.key} part={part} def={d} />)}</div>;
}

export function MeterPanel({ part }: { part: PartInstance }) {
  useFrameTick();
  const m = frameRef.current?.parts[part.id]?.meter;
  return (
    <div className="inst-body">
      <div className="supply-read"><div><b>{m?.reading ?? '0.00'}</b><small>{m?.mode ?? ''}</small></div></div>
      {PARTS[part.kind].props.map((d) => <PropField key={d.key} part={part} def={d} />)}
      <p className="muted small">저항(Ω)·연속성 모드는 전원이 꺼진 부품에만 쓰세요. 연속성은 이어져 있으면 소리가 나요.</p>
    </div>
  );
}

/** NEC remote (the common 21-key kit remote). The code is sent as a pulse: set, then cleared. */
const REMOTE: [string, number][] = [
  ['⏻', 0xFFA25D], ['VOL+', 0xFF629D], ['FUNC', 0xFFE21D],
  ['⏮', 0xFF22DD], ['⏯', 0xFF02FD], ['⏭', 0xFFC23D],
  ['▼', 0xFFE01F], ['VOL−', 0xFFA857], ['▲', 0xFF906F],
  ['0', 0xFF6897], ['EQ', 0xFF9867], ['ST/REPT', 0xFFB04F],
  ['1', 0xFF30CF], ['2', 0xFF18E7], ['3', 0xFF7A85],
  ['4', 0xFF10EF], ['5', 0xFF38C7], ['6', 0xFF5AA5],
  ['7', 0xFF42BD], ['8', 0xFF4AB5], ['9', 0xFF52AD],
];
export function IrRemote({ part }: { part: PartInstance }) {
  const running = useStore((s) => s.simState !== 'idle');
  const last = useStore((s) => s.inputs[part.id]?.irCode);
  const send = (code: number) => { setSimInput(part.id, 'irCode', code); setTimeout(() => setSimInput(part.id, 'irCode', 0), 180); };
  return (
    <div className="inst-body">
      <div className="remote" role="group" aria-label="적외선 리모컨">
        {REMOTE.map(([l, c]) => <button key={l} type="button" disabled={!running} onClick={() => send(c)} title={`0x${c.toString(16).toUpperCase()}`}>{l}</button>)}
      </div>
      <p className="muted small">{running ? `마지막 코드: ${last ? `0x${Number(last).toString(16).toUpperCase()}` : '-'}` : '실행하면 버튼을 누를 수 있어요.'}</p>
    </div>
  );
}

function Body({ part }: { part: PartInstance }) {
  switch (part.kind) {
    case 'oscilloscope': return <ScopePanel part={part} />;
    case 'logic-analyzer': return <LogicPanel part={part} />;
    case 'power-supply': return <SupplyPanel part={part} />;
    case 'function-generator': return <FuncGenPanel part={part} />;
    case 'multimeter': return <MeterPanel part={part} />;
    case 'ir-receiver': return <IrRemote part={part} />;
    default: return null;
  }
}
export const hasPanel = (k: string) => (INSTRUMENT_KINDS as readonly string[]).includes(k) || k === 'ir-receiver';

/** One instrument panel in the side tab; can be popped out into a floating window. */
export function InstrumentCard({ part, floating = false }: { part: PartInstance; floating?: boolean }) {
  const ui = useStore((s) => s.instUi[part.id]);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const title = `${TITLE[part.kind] ?? (part.kind === 'ir-receiver' ? '적외선 리모컨' : PARTS[part.kind].title)} · ${part.id}`;
  const style: CSSProperties | undefined = floating ? { left: ui?.x ?? 80, top: ui?.y ?? 120 } : undefined;
  return (
    <section className={`inst-card ${floating ? 'floating' : ''}`} style={style} aria-label={title}>
      <header
        onPointerDown={(e) => { if (!floating || (e.target as HTMLElement).closest('button')) return; drag.current = { dx: e.clientX - (ui?.x ?? 80), dy: e.clientY - (ui?.y ?? 120) }; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => drag.current && setInstUi(part.id, { x: Math.max(0, e.clientX - drag.current.dx), y: Math.max(0, e.clientY - drag.current.dy) })}
        onPointerUp={() => (drag.current = null)}
      >
        <strong>{title}</strong>
        <button type="button" title={floating ? '패널에 붙이기' : '떼어내기'} aria-label={floating ? '패널에 붙이기' : '떼어내기'} onClick={() => setInstUi(part.id, { floating: !floating, x: ui?.x ?? 120, y: ui?.y ?? 120 })}>
          {floating ? <Pin size={14} /> : <ExternalLink size={14} />}
        </button>
      </header>
      <Body part={part} />
    </section>
  );
}

/** Side-panel tab: every instrument in the circuit that is not popped out. */
export function InstrumentsTab() {
  const plist = useStore((s) => s.hist.present.parts);
  const ui = useStore((s) => s.instUi);
  const list = plist.filter((p) => hasPanel(p.kind) && !ui[p.id]?.floating);
  if (!list.length)
    return <p className="muted pad">계측 장비가 없어요. 부품 목록의 <b>측정</b> 카테고리에서 오실로스코프, 함수 발생기, 로직 분석기를 가져다 놓아 보세요. 전원 공급기와 멀티미터 패널도 여기에 나타나요.</p>;
  return <div className="inst-list">{list.map((p) => <InstrumentCard key={p.id} part={p} />)}</div>;
}

/** Popped-out instruments float above the whole app. */
export function FloatingInstruments() {
  const plist = useStore((s) => s.hist.present.parts);
  const ui = useStore((s) => s.instUi);
  return <>{plist.filter((p) => hasPanel(p.kind) && ui[p.id]?.floating).map((p) => <InstrumentCard key={p.id} part={p} floating />)}</>;
}
