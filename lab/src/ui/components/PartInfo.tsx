import { X } from 'lucide-react';
import type { PartKind } from '../../core/types';
import { addAtCenter } from '../../scene3d/placement';
import { PARTS } from '../core';
import { PART_INFO } from '../partInfo';
import { set, useStore } from '../store';

const ROLE: Record<string, string> = { digital: '디지털', analog: '아날로그', power: '전원', gnd: 'GND', passive: '단자', hole: '구멍' };

/** Short hover card shown beside the palette. */
export function PartCard({ kind, y }: { kind: PartKind; y: number }) {
  const d = PARTS[kind], info = PART_INFO[kind];
  if (!d || !info) return null;
  const pins = d.pins.length > 24 ? `${d.pins.length}개 구멍` : `핀 ${d.pins.length}개`;
  return (
    <div className="part-card" role="tooltip" style={{ top: Math.max(8, Math.min(y, window.innerHeight - 200)) }}>
      <strong>{d.title}</strong>
      <span className="muted small">{d.category} · {pins}</span>
      <p>{info.what}</p>
      <em className="muted small">눌러서 추가 · ⓘ 자세히</em>
    </div>
  );
}

/** Full Korean part guide: what it is, pins, typical wiring and common mistakes. */
export function PartInfoDialog() {
  const kind = useStore((s) => s.info);
  if (!kind) return null;
  const d = PARTS[kind], info = PART_INFO[kind];
  if (!d || !info) return null;
  const close = () => set({ info: null });
  const pins = d.pins.length > 24 ? [] : d.pins;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={`${d.title} 설명`} onClick={(e) => e.target === e.currentTarget && close()} onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className="card info-card">
        <button type="button" className="info-x" aria-label="닫기" onClick={close}><X size={18} /></button>
        <h2>{d.title}</h2>
        <p className="muted small">{d.category} · {kind}</p>
        <h4>이게 뭐예요?</h4>
        <p>{info.what}</p>
        {!!pins.length && (
          <>
            <h4>핀</h4>
            <ul className="pin-list">{pins.map((p) => <li key={p.id}><b>{p.label}</b><span className="muted"> {ROLE[p.role] ?? ''}</span></li>)}</ul>
          </>
        )}
        {d.props.length > 0 && (
          <>
            <h4>설정할 수 있는 값</h4>
            <p>{d.props.map((p) => p.label).join(' · ')}</p>
          </>
        )}
        <h4>대표 연결법</h4>
        <p>{info.wiring}</p>
        <h4>자주 하는 실수</h4>
        <ul>{info.mistakes.map((m) => <li key={m}>{m}</li>)}</ul>
        <div className="card-actions">
          <button type="button" onClick={close}>닫기</button>
          <button type="button" className="primary" onClick={() => { addAtCenter(kind); close(); }}>작업대에 놓기</button>
        </div>
      </div>
    </div>
  );
}
