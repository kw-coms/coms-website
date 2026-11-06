import { useEffect, useLayoutEffect } from 'react';
import { Workspace } from './scene3d/Workspace';
import { loadFromLocationHash } from './ui/actions';
import { SidePanel } from './ui/components/SidePanel';
import { ContextMenu, Toast, Tooltip, Tutorial } from './ui/components/Misc';
import { Palette } from './ui/components/Palette';
import { Toolbar } from './ui/components/Toolbar';
import { useShortcuts } from './ui/shortcuts';
import { dismissQualityNotice, useStore } from './ui/store';

function StageStatus() {
  const wireStart = useStore((s) => s.wireStart);
  const sim = useStore((s) => s.simState);
  const speed = useStore((s) => s.speed);
  const compiling = useStore((s) => s.compile.status === 'compiling');
  const multi = useStore((s) => s.multi.length);
  return (
    <div className="stage-status" aria-live="polite">
      {compiling && <span className="chip">컴파일 중…</span>}
      {!compiling && sim === 'running' && <span className="chip run">실행 중 ×{speed}</span>}
      {sim === 'paused' && <span className="chip">일시정지</span>}
      {multi > 1 && <span className="chip">{multi}개 선택됨</span>}
      {wireStart && <span className="chip wire">전선 연결 중 · 연결할 핀을 누르세요 (Esc 취소)</span>}
    </div>
  );
}

export function App() {
  const theme = useStore((s) => s.theme);
  const open = useStore((s) => s.sideOpen);
  const sheet = useStore((s) => s.sheetOpen);
  const quality = useStore((s) => s.quality);
  const notice = useStore((s) => s.qualityNotice);
  useShortcuts();
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useLayoutEffect(() => {
    document.documentElement.dataset.perf = quality === 'low' ? 'lite' : 'full';
  }, [quality]);
  useEffect(() => {
    void loadFromLocationHash();
    const onHash = () => void loadFromLocationHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return (
    <div className="app" data-side={open ? 'open' : 'closed'} data-sheet={sheet ? 'open' : 'closed'}>
      <Toolbar />
      <main className="main">
        <Palette />
        <div className="stage">
          <Workspace />
          <StageStatus />
        </div>
        <SidePanel />
      </main>
      {notice && (
        <div className="perf-notice" role="status">
          <span>{notice}</span>
          <button type="button" onClick={dismissQualityNotice}>확인</button>
        </div>
      )}
      <Tutorial />
      <Tooltip />
      <ContextMenu />
      <Toast />
    </div>
  );
}
