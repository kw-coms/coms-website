import { lazy, Suspense, useMemo } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, ChevronsRight, Play, StepForward, Trash2 } from 'lucide-react';
import type { CodeMode } from '../../core/types';
import { generate } from '../blocks/generate';
import { sceneContext } from '../blocks/context';
import { clearBreakpoints, debugContinue, debugStepInto, debugStepOut, debugStepOver } from '../simHost';
import { codeMode, setBlocks, useStore } from '../store';
import { ModeBar } from '../blocks/ModeBar';
import { CodeEditor, SerialDock } from './Dock';

// Blockly is only downloaded when a blocks mode is opened.
const BlocksEditor = lazy(() => import('../blocks/BlocksEditor'));

/** 계속 / 한 줄씩 / 함수 안으로 / 함수 밖으로 + the variables of the paused program. */
export function DebugBar() {
  const bps = useStore((s) => s.breakpoints);
  const dbg = useStore((s) => s.debug);
  const sim = useStore((s) => s.simState);
  const paused = !!dbg?.paused;
  if (!bps.length && !paused) return <p className="debug-hint">줄 번호 왼쪽을 눌러 중단점을 찍고 실행하면 그 줄에서 멈춰요.</p>;
  return (
    <div className="debug-bar" role="group" aria-label="디버거">
      <div className="debug-btns">
        <button type="button" disabled={!paused} onClick={debugContinue} title="다음 중단점까지 계속"><Play size={14} /> 계속</button>
        <button type="button" disabled={!paused} onClick={debugStepOver} title="한 줄씩 실행"><StepForward size={14} /> 한 줄씩</button>
        <button type="button" disabled={!paused} onClick={debugStepInto} title="함수 안으로 들어가기"><ArrowDownToLine size={14} /> 함수 안으로</button>
        <button type="button" disabled={!paused} onClick={debugStepOut} title="함수 밖으로 나오기"><ArrowUpFromLine size={14} /> 함수 밖으로</button>
        <button type="button" onClick={clearBreakpoints} title="중단점 모두 지우기"><Trash2 size={14} /> 중단점 {bps.length}</button>
      </div>
      <div className="debug-state" aria-live="polite">
        {paused ? <><ChevronsRight size={14} /> {dbg?.line}번 줄에서 멈춤{dbg?.reason === 'breakpoint' ? ' (중단점)' : ''}</> : sim === 'idle' ? '실행하면 중단점에서 멈춰요.' : '실행 중…'}
      </div>
      {paused && (
        <table className="debug-vars" aria-label="변수">
          <thead><tr><th>변수</th><th>값</th><th>자료형</th></tr></thead>
          <tbody>
            {(dbg?.globals ?? []).map((g) => <tr key={g.name}><td>{g.name}</td><td>{g.value}</td><td className="muted">{g.type}</td></tr>)}
            {!dbg?.globals?.length && <tr><td colSpan={3} className="muted">보여 줄 전역 변수가 없어요.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Blocks({ mode }: { mode: CodeMode }) {
  const state = useStore((s) => s.hist.present.blocks);
  const dark = useStore((s) => s.theme === 'dark');
  const plist = useStore((s) => s.hist.present.parts);
  const analysis = useStore((s) => s.analysis);
  const ctx = useMemo(() => sceneContext(plist, analysis), [plist, analysis]);
  return (
    <Suspense fallback={<p className="muted pad">블록 편집기를 불러오는 중…</p>}>
      <BlocksEditor
        state={state} dark={dark} hints={ctx.hints} readOnly={false}
        onChange={(next) => setBlocks(next, generate(next, ctx.opts).code)}
      />
      {mode === 'blocks' && null}
    </Suspense>
  );
}

/** The 코드 tab: mode switch, debugger bar, blocks and/or text editor, serial dock. */
export function CodeTab() {
  const mode = useStore((s) => codeMode(s));
  return (
    <>
      <ModeBar />
      <div className="code-top">
        {mode !== 'text' && <div className={`blocks-slot ${mode === 'blocks+text' ? 'half' : ''}`}><Blocks mode={mode} /></div>}
        {mode !== 'blocks' && <div className="text-slot"><DebugBar /><CodeEditor readOnly={mode === 'blocks+text'} /></div>}
      </div>
      <SerialDock />
    </>
  );
}
