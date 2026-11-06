import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Workspace } from './scene3d/Workspace';
import { loadFromLocationHash } from './ui/actions';
import { Dock } from './ui/components/Dock';
import { Inspector } from './ui/components/Inspector';
import { Toast, Tooltip, Tutorial } from './ui/components/Misc';
import { Palette } from './ui/components/Palette';
import { Toolbar } from './ui/components/Toolbar';
import { useShortcuts } from './ui/shortcuts';
import { set, useStore, type MobileTab } from './ui/store';

const MTABS: [MobileTab, string][] = [['view', '3D'], ['parts', '부품'], ['props', '속성'], ['code', '코드'], ['serial', '시리얼'], ['plotter', '그래프']];

function StageStatus() {
  const wireStart = useStore((s) => s.wireStart);
  const sim = useStore((s) => s.simState);
  const speed = useStore((s) => s.speed);
  const compiling = useStore((s) => s.compile.status === 'compiling');
  return (
    <div className="stage-status" aria-live="polite">
      {compiling && <span className="chip">컴파일 중…</span>}
      {!compiling && sim === 'running' && <span className="chip run">실행 중 ×{speed}</span>}
      {sim === 'paused' && <span className="chip">일시정지</span>}
      {wireStart && <span className="chip wire">전선 연결 중 · 연결할 핀을 누르세요 (Esc 취소)</span>}
    </div>
  );
}

export function App() {
  const theme = useStore((s) => s.theme);
  const mtab = useStore((s) => s.mobileTab);
  const [dockH, setDockH] = useState(() => Math.round(Math.min(300, window.innerHeight * 0.36)));
  const drag = useRef<{ y: number; h: number } | null>(null);
  useShortcuts();
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    void loadFromLocationHash();
    const onHash = () => void loadFromLocationHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  // mobile tab → which dock tab is shown
  useEffect(() => {
    if (mtab === 'code' || mtab === 'serial' || mtab === 'plotter') set({ dockTab: mtab });
  }, [mtab]);
  return (
    <div className="app" data-mtab={mtab} style={{ ['--dock-h' as string]: `${dockH}px` }}>
      <Toolbar />
      <main className="main">
        <Palette />
        <div className="stage">
          <Workspace />
          <StageStatus />
        </div>
        <Inspector />
      </main>
      <div
        className="splitter" role="separator" aria-orientation="horizontal" aria-label="코드 패널 크기 조절" tabIndex={0}
        onPointerDown={(e) => { drag.current = { y: e.clientY, h: dockH }; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => drag.current && setDockH(Math.max(110, Math.min(window.innerHeight * 0.7, drag.current.h + drag.current.y - e.clientY)))}
        onPointerUp={() => (drag.current = null)}
        onKeyDown={(e) => { if (e.key === 'ArrowUp') setDockH((h) => Math.min(window.innerHeight * 0.7, h + 24)); if (e.key === 'ArrowDown') setDockH((h) => Math.max(110, h - 24)); }}
      />
      <Dock />
      <nav className="mtabs" aria-label="화면 전환">
        {MTABS.map(([id, label]) => <button key={id} className={mtab === id ? 'on' : ''} aria-pressed={mtab === id} onClick={() => set({ mobileTab: id })}>{label}</button>)}
      </nav>
      <Tutorial />
      <Tooltip />
      <Toast />
    </div>
  );
}
