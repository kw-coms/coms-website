import { useRef } from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { CodeEditor, SerialDock } from './Dock';
import { BomPanel, PropsPanel, useWarnings, WarningsPanel } from './Inspector';
import { Palette } from './Palette';
import { countByLevel } from '../warnings';
import { set, useStore, type SideTab } from '../store';

const MIN_W = 300;
const maxW = () => Math.max(MIN_W, Math.min(760, window.innerWidth * 0.62));

/** Right panel (desktop) / bottom sheet (mobile): 코드 | 속성 | 경고 | 부품 목록. */
export function SidePanel() {
  const tab = useStore((s) => s.sideTab);
  const open = useStore((s) => s.sideOpen);
  const sheet = useStore((s) => s.sheetOpen);
  const width = useStore((s) => s.sideWidth);
  const warns = useWarnings();
  const c = countByLevel(warns);
  const drag = useRef<{ x: number; w: number } | null>(null);
  const badge = c.error ? 'error' : c.warn ? 'warn' : 'info';
  const tabs: { id: SideTab; label: string; mobileOnly?: boolean; count?: number }[] = [
    { id: 'parts', label: '부품', mobileOnly: true },
    { id: 'code', label: '코드' },
    { id: 'props', label: '속성' },
    { id: 'warnings', label: '경고', count: warns.length },
    { id: 'bom', label: '부품 목록' },
  ];
  const pick = (id: SideTab) => {
    // second tap on the active mobile tab folds the sheet; desktop always opens
    const mobile = window.matchMedia('(max-width: 768px)').matches;
    if (mobile && sheet && tab === id) return set({ sheetOpen: false });
    set({ sideTab: id, sideOpen: true, sheetOpen: true });
  };
  return (
    <>
      {!open && (
        <button type="button" className="side-reopen" aria-label="오른쪽 패널 열기" title="오른쪽 패널 열기" onClick={() => set({ sideOpen: true })}>
          <PanelRightOpen size={18} />
        </button>
      )}
      <aside className={`sidepanel ${open ? '' : 'closed'} ${sheet ? 'sheet-open' : ''}`} aria-label="코드와 속성 패널" style={{ ['--side-w' as string]: `${width}px` }}>
        <div
          className="side-resizer" role="separator" aria-orientation="vertical" aria-label="오른쪽 패널 너비 조절" tabIndex={0}
          onPointerDown={(e) => { drag.current = { x: e.clientX, w: width }; e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => drag.current && set({ sideWidth: Math.round(Math.max(MIN_W, Math.min(maxW(), drag.current.w + drag.current.x - e.clientX))) })}
          onPointerUp={() => (drag.current = null)}
          onKeyDown={(e) => { if (e.key === 'ArrowLeft') set({ sideWidth: Math.min(maxW(), width + 24) }); if (e.key === 'ArrowRight') set({ sideWidth: Math.max(MIN_W, width - 24) }); }}
        />
        <div className="tabs side-tabs" role="tablist" aria-label="패널">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id && (open || sheet)} className={`${tab === t.id ? 'on' : ''} ${t.mobileOnly ? 'only-mobile' : ''}`} onClick={() => pick(t.id)}>
              {t.label}{!!t.count && <span className={`tab-badge lvl-${badge}`}>{t.count}</span>}
            </button>
          ))}
          <button type="button" className="fold side-fold" aria-label="오른쪽 패널 접기" title="오른쪽 패널 접기" onClick={() => set({ sideOpen: false })}><PanelRightClose size={17} /></button>
        </div>
        <div className="side-body">
          <div className="side-pane code-pane" hidden={tab !== 'code'} role="tabpanel" aria-label="코드">
            <div className="code-top"><CodeEditor /></div>
            <SerialDock />
          </div>
          <div className="side-pane scroll" hidden={tab !== 'props'} role="tabpanel" aria-label="속성"><PropsPanel /></div>
          <div className="side-pane scroll" hidden={tab !== 'warnings'} role="tabpanel" aria-label="경고"><WarningsPanel /></div>
          <div className="side-pane scroll" hidden={tab !== 'bom'} role="tabpanel" aria-label="부품 목록"><BomPanel /></div>
          <div className="side-pane only-mobile-pane" hidden={tab !== 'parts'} role="tabpanel" aria-label="부품"><Palette inSheet /></div>
        </div>
      </aside>
    </>
  );
}
