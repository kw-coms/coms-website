import { useRef } from 'react';
import {
  BookOpen, Camera, Download, Focus, Grid3x3, Loader2, Moon, Pause, Play, Redo2, RotateCcw, Share2, Square, Sun, Tag, Undo2, Upload, Box,
} from 'lucide-react';
import { EXAMPLES } from '../core';
import { copyShareLink, exportJson, importJson, loadExample, snapshotPng, toggleTheme } from '../actions';
import { cancelCompile, pause, reset, run, setSpeed, stop } from '../simHost';
import { canRedo, canUndo, redo, set, undo, useStore } from '../store';

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
  const exOpen = useStore((s) => s.examplesOpen);
  const file = useRef<HTMLInputElement>(null);
  const compiling = compile.status === 'compiling';
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
        <label className="speed" title="시뮬레이션 속도">
          <span className="sr">속도</span>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="시뮬레이션 속도">
            {[0.25, 0.5, 1, 1.5, 2].map((v) => <option key={v} value={v}>×{v}</option>)}
          </select>
        </label>
      </div>
      <div className="tb-group" role="group" aria-label="편집">
        <Btn label="실행 취소 (Ctrl+Z)" onClick={undo} disabled={!undoable}><Undo2 size={18} /></Btn>
        <Btn label="다시 실행 (Ctrl+Shift+Z)" onClick={redo} disabled={!redoable}><Redo2 size={18} /></Btn>
      </div>
      <div className="tb-group" role="group" aria-label="보기">
        <Btn label="3D 보기" onClick={() => set({ view: 'persp' })} active={view === 'persp'}><Box size={18} /> <span className="tb-text">3D</span></Btn>
        <Btn label="위에서 보기 (배선용)" onClick={() => set({ view: 'top' })} active={view === 'top'}><Grid3x3 size={18} /> <span className="tb-text">위에서</span></Btn>
        <Btn label="카메라 리셋" onClick={() => set({ cameraResetTick: Date.now() })}><Focus size={18} /></Btn>
        <Btn label="부품 이름 표시" onClick={() => set({ labels: !labels })} active={labels}><Tag size={18} /></Btn>
      </div>
      <div className="tb-group" role="group" aria-label="파일">
        <Btn label="공유 링크 복사" onClick={() => void copyShareLink()}><Share2 size={18} /></Btn>
        <Btn label="JSON 내보내기" onClick={exportJson}><Download size={18} /></Btn>
        <Btn label="JSON 불러오기" onClick={() => file.current?.click()}><Upload size={18} /></Btn>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importJson(f); e.target.value = ''; }} />
        <Btn label="PNG로 저장" onClick={snapshotPng}><Camera size={18} /></Btn>
        <Btn label={theme === 'dark' ? '밝은 테마로' : '어두운 테마로'} onClick={toggleTheme}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</Btn>
      </div>
    </header>
  );
}
