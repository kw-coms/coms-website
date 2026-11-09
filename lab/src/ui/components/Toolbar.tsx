import { useEffect, useId, useRef, useState } from 'react';
import {
  BookOpen, Camera, Download, Focus, Grid3x3, Loader2, Moon, Pause, Play, Redo2, RotateCcw, Share2, Square, Sun, Tag, Undo2, Upload, Box, ChevronDown, Ellipsis, FileCode2, FileSpreadsheet, StickyNote, Workflow,
} from 'lucide-react';
import { EXAMPLES } from '../core';
import { copyShareLink, exportBom, exportIno, exportJson, importJson, loadExample, snapshotPng, toggleTheme } from '../actions';
import { cancelCompile, pause, reset, run, setSpeed, stop } from '../simHost';
import { addNote, canRedo, canUndo, dismissQualityNotice, getState, redo, set, setAntialias, setQualityMode, undo, useStore } from '../store';
import { viewCenterGround } from '../../scene3d/placement';
import type { Quality, QualityMode } from '../quality';

const Btn = ({ label, onClick, children, active, disabled, className = '' }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean; disabled?: boolean; className?: string }) => (
  <button type="button" className={`tb ${active ? 'on' : ''} ${className}`} onClick={onClick} aria-label={label} title={label} aria-pressed={active} disabled={disabled}>
    {children}
  </button>
);

const HOME_LABEL = "COM's 홈으로 (사이트로 돌아가기)";

/** The COM's mark (same artwork as the site header's logo), inlined so Lab needs no extra asset or CSP entry. Black in the source; currentColor follows the theme. */
function ComsMark({ size = 20 }: { size?: number }) {
  return (
    <svg className="coms-mark" width={size} height={size * 368 / 333} viewBox="0 0 333 368" aria-hidden="true" focusable="false">
      <path d="M162.5 322.483V367.071L0.5 276.903V96.0713L162.5 181.571V224.071L34.7598 153.541V252.627L162.5 322.483Z" fill="currentColor" stroke="currentColor"/>
      <path d="M202.605 347.571L169.503 367.071L169.503 181.571L332 96.5713L331.5 276.571L298.398 294.571V150.467L266.802 167.619V312.071L233 331.071C233 283.373 232.697 187.417 232.697 186.241C232.697 185.065 212.635 196.859 202.605 202.903V347.571Z" fill="currentColor" stroke="currentColor"/>
      <path d="M166.242 0.133789L328.742 90.1338L329.555 90.584L328.731 91.0146L166.231 176.015L165.999 176.136L165.767 176.014L3.7666 90.5137L2.94824 90.0811L3.75781 89.6338L165.758 0.133789L166 0L166.242 0.133789ZM164.816 40.2002L76.3164 89.2002L75.5039 89.6504L76.3271 90.0811L129.827 118.081L130.068 118.207L130.305 118.072L201.555 77.7129L219.555 88.1338L150.311 127.703L149.521 128.154L150.324 128.58L167.324 137.58L167.566 137.707L167.804 137.573L254.804 88.5732L255.589 88.1318L254.799 87.6992L201.799 58.6992L201.556 58.5664L201.314 58.7012L130.057 98.5654L111.091 88.1338L145.302 69.0742L180.302 49.5742L181.079 49.1416L180.305 48.7031L165.305 40.2031L165.062 40.0645L164.816 40.2002Z" fill="currentColor"/>
    </svg>
  );
}

const QUALITY_LABEL: Record<Quality, string> = { high: '높음', medium: '보통', low: '낮음' };

/** Quality choices (radio group) plus the antialias checkbox. Inline it is a button + popover; inside the narrow-width "더보기" menu it is laid out flat. */
function QualityMenu({ inMenu }: { inMenu: boolean }) {
  const qmode = useStore((s) => s.qualityMode);
  const qeff = useStore((s) => s.quality);
  const aa = useStore((s) => s.antialias);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const pointerIn = useRef(false);
  const name = useId();
  useEffect(() => {
    if (!open) return;
    pop.current?.querySelector<HTMLInputElement>('input[type=radio]:checked')?.focus();
    const close = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest('.quality-pop')) setOpen(false); };
    const up = () => { pointerIn.current = false; };
    const shut = () => setOpen(false); // .tb-secondary hides below 1000px
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    window.addEventListener('pointerup', up);
    window.addEventListener('resize', shut);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); window.removeEventListener('pointerup', up); window.removeEventListener('resize', shut); };
  }, [open]);
  const choices: [QualityMode, string][] = [['auto', `자동${qmode === 'auto' ? ` (${QUALITY_LABEL[qeff]})` : ''}`], ['high', '높음'], ['medium', '보통'], ['low', '낮음']];
  const body = (
    <>
      <div role="radiogroup" aria-label="화질" className="quality-choices">
        {choices.map(([v, t]) => (
          <label key={v} className="quality-choice">
            <input type="radio" name={name} value={v} checked={qmode === v} onChange={() => setQualityMode(v)} />
            <span>화질: {t}</span>
          </label>
        ))}
      </div>
      <label className="aa-toggle">
        <input type="checkbox" checked={aa} onChange={(e) => setAntialias(e.target.checked)} />
        <span>부드러운 가장자리 (안티앨리어싱)<small>끄면 느린 컴퓨터에서 더 빨라져요</small></span>
      </label>
    </>
  );
  if (inMenu) return <div className="quality-flat">{body}</div>;
  return (
    <div className="pop quality-pop" onPointerDown={() => { pointerIn.current = true; }} onPointerUp={() => { pointerIn.current = false; }} onBlur={(e) => { if (open && !pointerIn.current && !e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false); }}>
      <button ref={btn} type="button" className={`tb quality-btn ${open ? 'on' : ''}`} aria-haspopup="dialog" aria-expanded={open} title="화질 (느린 컴퓨터에서는 낮춰 보세요)" aria-label={`화질: ${qmode === 'auto' ? `자동 (${QUALITY_LABEL[qeff]})` : QUALITY_LABEL[qmode as Quality]}`} onClick={() => { if (!open && getState().qualityNotice) dismissQualityNotice(); setOpen(!open); }}>
        <span className="q-text">화질: </span>{qmode === 'auto' ? `자동 (${QUALITY_LABEL[qeff]})` : QUALITY_LABEL[qmode as Quality]}
        <ChevronDown size={14} />
      </button>
      {open && <div ref={pop} className="popover quality-popover" role="dialog" aria-label="화질 설정">{body}</div>}
    </div>
  );
}

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

  const secondaryOf = (inMenu: boolean) => (
    <>
      {inMenu && (
        <a className="tb home-item" href="/" title={HOME_LABEL}><ComsMark size={16} /> <span className="tb-more-text">COM's 홈으로</span></a>
      )}
      <label className="speed" title="시뮬레이션 속도">
        <span className="sr">속도</span>
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="시뮬레이션 속도">
          {[0.25, 0.5, 1, 1.5, 2].map((v) => <option key={v} value={v}>×{v}</option>)}
        </select>
      </label>
      <QualityMenu inMenu={inMenu} />
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
      <div className="brand">
        {/* plain link = full page load to the site; store.ts flushes a pending autosave on pagehide, and Lab has no beforeunload prompt, so this behaves like any navigation */}
        <a className="brand-home" href="/" aria-label={HOME_LABEL} title={HOME_LABEL}>
          <ComsMark />
          <span className="brand-home-text">COM's</span>
        </a>
        <span className="brand-sep" aria-hidden="true">/</span>
        <strong aria-current="page">Circuit Lab</strong>
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
      <div className="tb-secondary">{secondaryOf(false)}</div>
      <div className="tb-more pop">
        <Btn label="더보기" onClick={() => setMore(!more)} active={more}><Ellipsis size={18} /></Btn>
        {more && <div className="popover more-pop" role="group" aria-label="더보기 메뉴" onClick={(e) => (e.target as HTMLElement).closest('button') && setMore(false)}>{secondaryOf(true)}</div>}
      </div>
      <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importJson(f); e.target.value = ''; }} />
    </header>
  );
}
