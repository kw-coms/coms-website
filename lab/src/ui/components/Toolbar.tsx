import { useEffect, useRef, useState } from 'react';
import {
  BookOpen, Camera, Download, Focus, Grid3x3, Loader2, Moon, Pause, Play, Redo2, RotateCcw, Share2, Square, Sun, Tag, Undo2, Upload, Box, Ellipsis, FileCode2, FileSpreadsheet, StickyNote, Workflow,
} from 'lucide-react';
import { EXAMPLES } from '../core';
import { copyShareLink, exportBom, exportIno, exportJson, importJson, loadExample, snapshotPng, toggleTheme } from '../actions';
import { cancelCompile, pause, reset, run, setSpeed, stop } from '../simHost';
import { addNote, canRedo, canUndo, redo, set, setQualityMode, undo, useStore } from '../store';
import { viewCenterGround } from '../../scene3d/placement';
import type { QualityMode } from '../quality';

const Btn = ({ label, onClick, children, active, disabled, className = '' }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean; disabled?: boolean; className?: string }) => (
  <button type="button" className={`tb ${active ? 'on' : ''} ${className}`} onClick={onClick} aria-label={label} title={label} aria-pressed={active} disabled={disabled}>
    {children}
  </button>
);

export function Toolbar() {
  const simState = useStore((s) => s.simState);
  const compile = useStore((s) => s.compile);
  const speed = useStore((s) => s.speed);
  const view = useStore((s) => s.view);
  const labels = useStore((s) => s.labels);
  const theme = useStore((s) => s.theme);
  const undoable = useStore(canUndo);
  const redoable = useStore(canRedo);
  const qmode = useStore((s) => s.qualityMode);
  const qeff = useStore((s) => s.quality);
  const exOpen = useStore((s) => s.examplesOpen);
  const schematic = useStore((s) => s.schematic);
  const file = useRef<HTMLInputElement>(null);
  const [more, setMore] = useState(false);
  const compiling = compile.status === 'compiling';
  useEffect(() => {
    if (!more) return;
    const close = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest('.tb-more')) setMore(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMore(false); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); };
  }, [more]);
  useEffect(() => {
    if (!exOpen) return;
    const close = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest('.pop')) set({ examplesOpen: false }); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') set({ examplesOpen: false }); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); };
  }, [exOpen]);

  const secondary = (
    <>
      <label className="speed" title="시뮬레이션 속도">
        <span className="sr">속도</span>
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="시뮬레이션 속도">
          {[0.25, 0.5, 1, 1.5, 2].map((v) => <option key={v} value={v}>×{v}</option>)}
        </select>
      </label>
      <label className="speed quality" title="화질 (느린 컴퓨터에서는 낮춰 보세요)">
        <span className="tb-more-text">화질</span>
        <select value={qmode} onChange={(e) => setQualityMode(e.target.value as QualityMode)} aria-label="화질">
          <option value="auto">화질: 자동{qmode === 'auto' ? ` (${{ high: '높음', medium: '보통', low: '낮음' }[qeff]})` : ''}</option>
          <option value="high">화질: 높음</option>
          <option value="medium">화질: 보통</option>
          <option value="low">화질: 낮음</option>
        </select>
      </label>
      <div className="tb-group" role="group" aria-label="편집">
        <Btn label="실행 취소 (Ctrl+Z)" onClick={undo} disabled={!undoable}><Undo2 size={18} /> <span className="tb-more-text">실행 취소</span></Btn>
        <Btn label="다시 실행 (Ctrl+Shift+Z)" onClick={redo} disabled={!redoable}><Redo2 size={18} /> <span className="tb-more-text">다시 실행</span></Btn>
      </div>
      <div className="tb-group" role="group" aria-label="보기">
        <Btn label="3D 보기" onClick={() => set({ view: 'persp' })} active={view === 'persp'}><Box size={18} /> <span className="tb-text">3D</span></Btn>
        <Btn label="위에서 보기 (배선용)" onClick={() => set({ view: 'top' })} active={view === 'top'}><Grid3x3 size={18} /> <span className="tb-text">위에서</span></Btn>
        <Btn label="카메라 리셋" onClick={() => set({ cameraResetTick: Date.now() })}><Focus size={18} /> <span className="tb-more-text">카메라 리셋</span></Btn>
        <Btn label="회로도 보기" onClick={() => set({ schematic: !schematic })} active={schematic}><Workflow size={18} /> <span className="tb-more-text">회로도</span></Btn>
        <Btn label="메모 붙이기" onClick={() => { const [x, z] = viewCenterGround(); addNote([x, -9, z]); }}><StickyNote size={18} /> <span className="tb-more-text">메모</span></Btn>
        <Btn label="부품 이름 표시" onClick={() => set({ labels: !labels })} active={labels}><Tag size={18} /> <span className="tb-more-text">이름 표시</span></Btn>
      </div>
      <div className="tb-group" role="group" aria-label="파일">
        <Btn label="공유 링크 복사" onClick={() => void copyShareLink()}><Share2 size={18} /> <span className="tb-more-text">공유 링크</span></Btn>
        <Btn label="JSON 내보내기" onClick={exportJson}><Download size={18} /> <span className="tb-more-text">내보내기</span></Btn>
        <Btn label="JSON 불러오기" onClick={() => file.current?.click()}><Upload size={18} /> <span className="tb-more-text">불러오기</span></Btn>
        <Btn label=".ino 스케치로 내보내기" onClick={exportIno}><FileCode2 size={18} /> <span className="tb-more-text">.ino 내보내기</span></Btn>
        <Btn label="부품 목록 CSV로 내보내기" onClick={exportBom}><FileSpreadsheet size={18} /> <span className="tb-more-text">부품 CSV</span></Btn>
        <Btn label="PNG로 저장" onClick={snapshotPng}><Camera size={18} /> <span className="tb-more-text">PNG 저장</span></Btn>
        <Btn label={theme === 'dark' ? '밝은 테마로' : '어두운 테마로'} onClick={toggleTheme}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />} <span className="tb-more-text">테마</span></Btn>
      </div>
    </>
  );
  return (
    <header className="toolbar" role="toolbar" aria-label="도구 모음">
      <div className="brand" aria-label="COM's Circuit Lab">
        <span className="brand-dot" />
        <strong>Circuit Lab</strong>
      </div>
      <div className="tb-group">
        <div className="pop">
          <Btn label="예제 갤러리" onClick={() => set({ examplesOpen: !exOpen })} active={exOpen}>
            <BookOpen size={18} /> <span className="tb-text">예제</span>
          </Btn>
          {exOpen && (
            <div className="popover" role="menu" aria-label="예제 목록">
              {EXAMPLES.map((e) => (
                <button key={e.id} role="menuitem" type="button" className="pop-item" onClick={() => loadExample(e.id)}>
                  <span>{e.title}</span>
                  {e.chapter && <small>{e.chapter}</small>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="tb-group run" role="group" aria-label="실행">
        {compiling ? (
          <Btn label="컴파일 취소" onClick={cancelCompile} className="run-btn"><Loader2 size={18} className="spin" /> <span className="tb-text">컴파일 중… 취소</span></Btn>
        ) : (
          <Btn label="실행" onClick={() => void run()} disabled={simState === 'running'} className="run-btn go"><Play size={18} /> <span className="tb-text">실행</span></Btn>
        )}
        <Btn label="일시정지" onClick={pause} disabled={simState !== 'running'}><Pause size={18} /></Btn>
        <Btn label="정지" onClick={stop} disabled={simState === 'idle' && !compiling}><Square size={16} /></Btn>
        <Btn label="리셋" onClick={reset} disabled={simState === 'idle'}><RotateCcw size={18} /></Btn>
      </div>
      <div className="tb-secondary">{secondary}</div>
      <div className="tb-more pop">
        <Btn label="더보기" onClick={() => setMore(!more)} active={more}><Ellipsis size={18} /></Btn>
        {more && <div className="popover more-pop" role="group" aria-label="더보기 메뉴" onClick={(e) => (e.target as HTMLElement).closest('button') && setMore(false)}>{secondary}</div>}
      </div>
      <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importJson(f); e.target.value = ''; }} />
    </header>
  );
}
