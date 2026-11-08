import { useEffect, useMemo, useState } from 'react';
import { Info, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react';
import type { PartCategory, PartKind } from '../../core/types';
import { PARTS } from '../core';
import { addAtCenter } from '../../scene3d/placement';
import { setDragKind } from '../../scene3d/Workspace';
import { searchText } from '../partInfo';
import { set, useStore } from '../store';
import { PartCard, PartThumb } from './PartInfo';

export const ORDER: PartCategory[] = ['보드', '전원', '기본', '입력', '출력', '센서', '디스플레이', '반도체', 'IC', '측정'];

export function Palette({ inSheet = false }: { inSheet?: boolean }) {
  const [q, setQ] = useState('');
  const [hover, setHover] = useState<{ kind: PartKind; y: number } | null>(null);
  useEffect(() => {
    if (!hover) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setHover(null);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [hover]);
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
                return (
                  <li key={k} className="part-row">
                    <button
                      type="button"
                      className="part-item"
                      draggable
                      data-kind={k}
                      title={folded ? PARTS[k].title : undefined}
                      aria-label={PARTS[k].title}
                      aria-describedby={hover?.kind === k ? 'part-card' : undefined}
                      onMouseEnter={(e) => !inSheet && setHover({ kind: k, y: e.currentTarget.getBoundingClientRect().top })}
                      onFocus={(e) => !inSheet && setHover({ kind: k, y: e.currentTarget.getBoundingClientRect().top })}
                      onBlur={() => setHover(null)}
                      onDragStart={(e) => { e.dataTransfer.setData('application/x-part-kind', k); e.dataTransfer.effectAllowed = 'copy'; setDragKind(k); setHover(null); }}
                      onDragEnd={() => setDragKind(null)}
                      onClick={() => addAtCenter(k)}
                    >
                      <span className="part-thumb"><PartThumb kind={k} /></span>
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
