import { useEffect, useRef, useState } from 'react';
import { PARTS } from '../core';
import { fmtVolts } from '../format';
import { onSimFrame, frameRef } from '../simHost';
import { resistorBands } from '../core';
import { fmtOhms } from '../format';
import { Copy, RotateCw, Trash2 } from 'lucide-react';
import { deleteBend, deleteSelection, duplicateSelection, getState, rotateSelection, set, TUTORIAL_KEY, updateWire, useStore, WIRE_COLORS } from '../store';
import { setItem } from '../storage';

const STEPS = [
  { t: '1. 부품 놓기', d: '왼쪽 목록에서 아두이노, 빵판, LED, 저항 같은 부품을 끌어다 작업대에 놓아 보세요. 다리는 가장 가까운 구멍에 딱 맞게 꽂혀요.' },
  { t: '2. 전선 연결', d: '핀이나 구멍을 한 번 누르고 다른 핀을 누르면 전선이 이어져요. 전선을 고르면 색을 바꾸고 점을 끌어 모양도 고칠 수 있어요. 마우스 오른쪽 버튼으로 시점을 옮기고 휠로 확대해요.' },
  { t: '3. 코드 작성 후 실행', d: '아래 코드 탭에서 스케치를 쓰고 ▶ 실행을 누르세요. 버튼과 가변저항은 직접 눌러 보고, 시리얼 모니터에서 출력을 확인해요.' },
];
export function Tutorial() {
  const open = useStore((s) => s.tutorial);
  const [i, setI] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open) btn.current?.focus(); }, [open, i]);
  if (!open) return null;
  const close = () => { setItem(TUTORIAL_KEY, '1'); set({ tutorial: false }); };
  const s = STEPS[i]!;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="처음 시작하기" onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className="card">
        <p className="muted small">처음 오셨나요? ({i + 1}/3)</p>
        <h2>{s.t}</h2>
        <p>{s.d}</p>
        <div className="card-actions">
          <button type="button" onClick={close}>건너뛰기</button>
          {i > 0 && <button type="button" onClick={() => setI(i - 1)}>이전</button>}
          <button type="button" ref={btn} className="primary" onClick={() => (i < 2 ? setI(i + 1) : close())}>{i < 2 ? '다음' : '시작하기'}</button>
        </div>
      </div>
    </div>
  );
}

/** Pin tooltip: name, net, live voltage, resistor bands. Position follows the pointer; text updates from sim frames. */
export function Tooltip() {
  const hover = useStore((s) => s.hover);
  const box = useRef<HTMLDivElement>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (box.current) box.current.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`;
    };
    window.addEventListener('pointermove', move);
    const off = onSimFrame(() => { if (getState().hover) tick((n) => n + 1); });
    return () => { window.removeEventListener('pointermove', move); off(); };
  }, []);
  if (!hover) return null;
  const st = getState();
  const part = st.hist.present.parts.find((p) => p.id === hover.ref.partId);
  const pin = part && PARTS[part.kind]?.pins.find((p) => p.id === hover.ref.pinId);
  if (!part || !pin) return null;
  const net = st.analysis.nets.find((n) => n.id === hover.netId);
  const f = frameRef.current;
  const volts = st.simState !== 'idle' && f ? (f.parts[part.id]?.pinVolts?.[pin.id] ?? (hover.netId ? f.netVolts[hover.netId] : undefined)) : undefined;
  let bands = '';
  if (part.kind === 'resistor') {
    try { const b = resistorBands(Number(part.props.ohms)); bands = `${b.names.join('-')} = ${fmtOhms(Number(part.props.ohms))}`; } catch { /* ignore */ }
  }
  return (
    <div ref={box} className="tooltip" role="tooltip">
      <strong>{PARTS[part.kind].title} · {pin.label}</strong>
      {net?.name && <div>연결: {net.name}</div>}
      {volts !== undefined && <div>전압 {fmtVolts(volts)}</div>}
      {bands && <div>{bands}</div>}
    </div>
  );
}

export function Toast() {
  const msg = useStore((s) => s.toast);
  return msg ? <div className="toast" role="status">{msg}</div> : null;
}

/** Right-click menu for parts, wires and wire bend points. */
export function ContextMenu() {
  const ctx = useStore((s) => s.ctx);
  const wire = useStore((s) => (s.ctx?.target.kind === 'wire' ? s.hist.present.wires.find((w) => w.id === s.ctx!.target.id) : undefined));
  useEffect(() => {
    if (!ctx) return;
    const close = (e: Event) => { if (!(e.target as HTMLElement)?.closest?.('.ctx-menu')) set({ ctx: null }); };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && set({ ctx: null });
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', key);
    window.addEventListener('wheel', close, { passive: true });
    return () => { window.removeEventListener('pointerdown', close, true); window.removeEventListener('keydown', key); window.removeEventListener('wheel', close); };
  }, [ctx]);
  if (!ctx) return null;
  const run = (fn: () => void) => () => { fn(); set({ ctx: null }); };
  const t = ctx.target;
  const x = Math.min(ctx.x, window.innerWidth - 190), y = Math.min(ctx.y, window.innerHeight - 190);
  return (
    <div className="ctx-menu" role="menu" aria-label="바로가기 메뉴" style={{ left: x, top: y }}>
      {t.kind === 'part' && (
        <>
          <button role="menuitem" type="button" onClick={run(rotateSelection)}><RotateCw size={15} /> 회전 <kbd>R</kbd></button>
          <button role="menuitem" type="button" onClick={run(duplicateSelection)}><Copy size={15} /> 복제 <kbd>Ctrl+D</kbd></button>
          <button role="menuitem" type="button" className="danger" onClick={run(deleteSelection)}><Trash2 size={15} /> 삭제 <kbd>Del</kbd></button>
        </>
      )}
      {t.kind === 'wire' && (
        <>
          <div className="ctx-label">선 색 변경</div>
          <div className="swatches ctx-sw" role="radiogroup" aria-label="전선 색">
            {WIRE_COLORS.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={wire?.color === c.id} aria-label={c.label} title={c.label} className={`swatch ${wire?.color === c.id ? 'on' : ''}`} style={{ background: c.hex }} onClick={run(() => updateWire(t.id, { color: c.id }))} />
            ))}
          </div>
          <button role="menuitem" type="button" className="danger" onClick={run(deleteSelection)}><Trash2 size={15} /> 전선 삭제 <kbd>Del</kbd></button>
        </>
      )}
      {t.kind === 'bend' && <button role="menuitem" type="button" className="danger" onClick={run(() => deleteBend(t.id, t.index))}><Trash2 size={15} /> 꺾임 점 삭제</button>}
    </div>
  );
}
