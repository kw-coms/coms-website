import { useEffect, useLayoutEffect, useState } from 'react';
import { Workspace } from './scene3d/Workspace';
import { dismissRestoreNotice, downloadBackup, importJson, loadFromLocationHash } from './ui/actions';
import { ErrorBoundary } from './ui/components/ErrorBoundary';
import { SidePanel } from './ui/components/SidePanel';
import { ContextMenu, Toast, Tooltip, Tutorial } from './ui/components/Misc';
import { Palette } from './ui/components/Palette';
import { Toolbar } from './ui/components/Toolbar';
import { PartInfoDialog } from './ui/components/PartInfo';
import { FloatingInstruments } from './ui/instruments/Panels';
import { Schematic } from './ui/schematic/Schematic';
import { onSimFrame } from './ui/simHost';
import { useShortcuts } from './ui/shortcuts';
import { dismissQualityNotice, pinHighQuality, setAntialias, useStore } from './ui/store';

/** Screen-reader (and test) readable summary of which LEDs the running circuit currently lights. */
function LedStatus() {
  const [lit, setLit] = useState('');
  useEffect(() => {
    const off = onSimFrame((f) => {
    const ids = Object.entries(f.parts)
      .filter(([, v]) => (v.led?.brightness ?? 0) > 0.05 || (v.rgb && v.rgb.r + v.rgb.g + v.rgb.b > 0.05))
      .map(([id]) => id)
      .sort()
      .join(',');
    setLit((prev) => (prev === ids ? prev : ids));
    });
    return () => void off();
  }, []);
  return <p className="sr" id="led-status" data-lit={lit}>{lit ? `켜진 LED: ${lit}` : '켜진 LED 없음'}</p>;
}

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
  const aa = useStore((s) => s.antialias);
  const restore = useStore((s) => s.restoreNotice);
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
  useEffect(() => {
    // a file dropped outside a drop target must not navigate away; a .json file is imported instead
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) void importJson(f);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('drop', drop); };
  }, []);
  return (
    <div className="app" data-side={open ? 'open' : 'closed'} data-sheet={sheet ? 'open' : 'closed'}>
      <Toolbar />
      <main className="main">
        <Palette />
        <div className="stage">
          <ErrorBoundary fallback="3D를 표시할 수 없어요. 브라우저의 그래픽 가속(WebGL)이 꺼져 있을 수 있어요. 코드 편집과 시리얼 창은 그대로 쓸 수 있고, 페이지를 새로고침하면 다시 시도해요.">
            <Workspace />
          </ErrorBoundary>
          <Schematic />
          <StageStatus />
          <LedStatus />
        </div>
        <SidePanel />
      </main>
      {restore && (
        <div className="perf-notice restore" role="alert">
          <span>저장된 작업을 불러오지 못해 백업해 두었어요. 예제 회로로 시작했어요.</span>
          <button type="button" onClick={downloadBackup}>백업 다운로드</button>
          <button type="button" onClick={dismissRestoreNotice}>확인</button>
        </div>
      )}
      {notice && (
        <div className="perf-notice" role="status">
          <span>{notice}{aa && ' 안티앨리어싱을 끄면 더 부드러워져요.'}</span>
          <button type="button" onClick={pinHighQuality}>고화질로 고정</button>
          {aa && <button type="button" onClick={() => setAntialias(false)}>안티앨리어싱 끄기</button>}
          <button type="button" onClick={dismissQualityNotice}>확인</button>
        </div>
      )}
      <FloatingInstruments />
      <PartInfoDialog />
      <Tutorial />
      <Tooltip />
      <ContextMenu />
      <Toast />
    </div>
  );
}
