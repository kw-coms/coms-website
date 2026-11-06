import { useEffect, useRef, useState } from 'react';
import { PARTS } from '../core';
import { fmtVolts } from '../format';
import { onSimFrame, frameRef } from '../simHost';
import { resistorBands } from '../core';
import { fmtOhms } from '../format';
import { getState, set, TUTORIAL_KEY, useStore } from '../store';
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
