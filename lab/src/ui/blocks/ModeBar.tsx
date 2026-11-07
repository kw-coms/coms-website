// 블록 / 블록+코드 / 코드 switch, with Tinkercad's one-way rule, plus keeping the code equal to what the blocks generate.
//   blocks -> text : asks first (in the page, not a browser popup); stays reversible until the code is edited by hand
//   text -> blocks : only while the code is still exactly what the blocks generated, or by starting a new block program
// The code tab renders <ModeBar /> above the editors (src/ui/components/CodeTab.tsx).
import { useEffect, useMemo, useState } from 'react';
import type { CodeMode } from '../../core';
import { EXAMPLES } from '../core';
import { getState, set, setBlocks, setCode, setCodeMode, useStore } from '../store';
import { sceneContext } from './context';
import { generate, isGeneratedCode } from './generate';
import { DEFAULT_BLOCKS, STARTER_BLOCKS } from './starters';
import './blocks.css';

const MODES: { id: CodeMode; label: string; hint: string }[] = [
  { id: 'blocks', label: '블록', hint: '블록을 끌어다 놓아 프로그램을 만들어요' },
  { id: 'blocks+text', label: '블록+코드', hint: '블록 옆에서 만들어진 코드를 읽어 보세요 (읽기 전용)' },
  { id: 'text', label: '코드', hint: '코드를 직접 쓰고 고쳐요' },
];

export function ModeBar() {
  const mode = useStore((s) => s.hist.present.codeMode ?? 'text');
  const blocks = useStore((s) => s.hist.present.blocks);
  const code = useStore((s) => s.code);
  const parts = useStore((s) => s.hist.present.parts);
  const analysis = useStore((s) => s.analysis);
  const { opts } = useMemo(() => sceneContext(parts, analysis), [parts, analysis]);
  const [ask, setAsk] = useState<'text' | 'fresh' | null>(null);
  const inBlocks = mode !== 'text';
  const gen = useMemo(() => (blocks ? generate(blocks, opts) : null), [blocks, opts]);

  // blocks are wide: give the side panel room the first time a block mode opens
  const visible = useStore((s) => s.sideTab === 'code');
  useEffect(() => { if (inBlocks && visible && getState().sideWidth < 560) set({ sideWidth: 560 }); }, [inBlocks, visible]);

  // in a block mode the code is always exactly what the blocks generate
  useEffect(() => {
    if (!inBlocks) return;
    if (!blocks) setBlocks(DEFAULT_BLOCKS, generate(DEFAULT_BLOCKS, opts).code);
    else if (gen && gen.code !== code) setCode(gen.code);
  }, [inBlocks, blocks, gen, code, opts]);

  const generated = !!blocks && isGeneratedCode(blocks, code, opts);
  const example = EXAMPLES.find((e) => e.scene.code === code);
  const starter = example && STARTER_BLOCKS[example.id];

  const startBlocks = (to: CodeMode, state: unknown) => {
    setBlocks(state, generate(state, opts).code);
    setCodeMode(to);
    setAsk(null);
  };
  const pick = (to: CodeMode) => {
    if (to === mode) return;
    if (to === 'text') return setAsk('text');
    if (mode !== 'text' || generated) return setCodeMode(to);
    if (starter) return startBlocks(to, starter);
    setAsk('fresh');
  };

  const note = inBlocks
    ? MODES.find((m) => m.id === mode)!.hint
    : generated ? '아직 코드를 고치지 않아서 블록으로 돌아갈 수 있어요. 코드를 한 글자라도 고치면 돌아갈 수 없어요.'
      : starter ? '이 예제는 블록으로도 열 수 있어요 (블록 또는 블록+코드를 누르세요).'
        : blocks ? '코드를 직접 고쳐서 블록으로 돌아갈 수 없어요. 블록은 코드를 만들어 주는 도구라서, 코드를 블록으로 거꾸로 바꾸지는 못해요.'
          : '직접 쓴 코드는 블록으로 바꿀 수 없어요. 새 블록 프로그램으로 시작할 수는 있어요.';

  return (
    <>
      <div className="mode-bar">
        <div className="mode-seg" role="group" aria-label="코드 입력 방식">
          {MODES.map((m) => (
            <button key={m.id} type="button" aria-pressed={mode === m.id} title={m.hint} onClick={() => pick(m.id)}>{m.label}</button>
          ))}
        </div>
        <span className="mode-note" role="status">{note}</span>
      </div>
      {ask === 'text' && (
        <div className="mode-confirm" role="alertdialog" aria-label="코드로 바꾸기 확인">
          <p>코드로 바꾸면 이 코드를 직접 고칠 수 있어요. 하지만 한 글자라도 고치면 <strong>다시 블록으로 돌아올 수 없어요.</strong> 계속할까요?</p>
          <button type="button" className="danger" onClick={() => { setCodeMode('text'); setAsk(null); }}>코드로 바꾸기</button>
          <button type="button" autoFocus onClick={() => setAsk(null)}>취소</button>
        </div>
      )}
      {ask === 'fresh' && (
        <div className="mode-confirm" role="alertdialog" aria-label="새 블록 프로그램 확인">
          <p>직접 쓴 코드는 블록으로 바꿀 수 없어요. 새 블록 프로그램으로 시작하면 <strong>지금 코드는 지워져요.</strong> 계속할까요?</p>
          <button type="button" className="danger" onClick={() => startBlocks('blocks', DEFAULT_BLOCKS)}>새로 시작하기</button>
          <button type="button" autoFocus onClick={() => setAsk(null)}>취소</button>
        </div>
      )}
      {inBlocks && !!gen?.warnings.length && <p className="blocks-warn" role="status">{gen.warnings.join(' ')}</p>}
    </>
  );
}
