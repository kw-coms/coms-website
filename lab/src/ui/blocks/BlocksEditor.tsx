// The Blockly workspace. Loaded lazily (see CodeTab.tsx): Blockly is only downloaded when Blocks mode opens.
// No network requests: no sounds, and the few images Blockly needs (toolbox/zoom icons, cursors) are copied from
// node_modules/blockly/media into public/blockly-media (Blockly would otherwise load them from static.blockly.com).
import { useEffect, useRef, useState } from 'react';
import * as Blockly from 'blockly/core';
import { COLOUR, TOOLBOX } from './defs';
import { MAX_CANONICAL_BLOCKS_BYTES, stringifyJsonBounded } from '../../core/scene';
import { loadBlocks, setPinHints } from './blocklyRuntime';
import { createSaveScheduler } from './saveScheduler';
import './blocks.css';

export { loadBlocks };

const classic = Blockly.Themes.Classic;
const blockStyles = Object.fromEntries(
  ([['logic_blocks', COLOUR.control], ['loop_blocks', COLOUR.control], ['math_blocks', COLOUR.math], ['text_blocks', COLOUR.text],
    ['variable_blocks', COLOUR.variable], ['variable_dynamic_blocks', COLOUR.variable], ['procedure_blocks', COLOUR.func]] as const)
    .map(([k, c]) => [k, { colourPrimary: c }]),
);
const mkTheme = (name: string, dark: boolean) => Blockly.Theme.defineTheme(name, {
  name, base: classic, blockStyles,
  componentStyles: dark
    ? { workspaceBackgroundColour: '#11161c', toolboxBackgroundColour: '#1a2129', toolboxForegroundColour: '#e6edf3', flyoutBackgroundColour: '#212a34', flyoutForegroundColour: '#e6edf3', flyoutOpacity: 0.97, scrollbarColour: '#93a1b1', insertionMarkerColour: '#ffffff', insertionMarkerOpacity: 0.3, cursorColour: '#2bb8bd' }
    : { workspaceBackgroundColour: '#f7f9fc', toolboxBackgroundColour: '#ffffff', toolboxForegroundColour: '#1b2430', flyoutBackgroundColour: '#eef2f7', flyoutForegroundColour: '#1b2430', flyoutOpacity: 0.97, scrollbarColour: '#64707f', insertionMarkerColour: '#000000', insertionMarkerOpacity: 0.25, cursorColour: '#0b8f94' },
});
const themes = { light: mkTheme('lab-light', false), dark: mkTheme('lab-dark', true) };

export interface BlocksEditorProps {
  /** Blockly serialization JSON (undefined = a fresh workspace) */
  state: unknown;
  dark: boolean;
  /** pin value ("8", "A0") -> what the circuit has there ("LED") */
  hints: Record<string, string>;
  readOnly?: boolean;
  onChange: (state: unknown) => void;
}

export default function BlocksEditor({ state, dark, hints, readOnly, onChange }: BlocksEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const ws = useRef<Blockly.WorkspaceSvg | null>(null);
  const last = useRef('');
  const loading = useRef(false);
  // a refused or failed load shows a stand-in workspace: it must never be saved over the program the store holds
  const saver = useRef<ReturnType<typeof createSaveScheduler> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const loader = useRef<(s: unknown) => void>(() => {});
  const cb = useRef(onChange);
  cb.current = onChange;
  setPinHints(hints);

  useEffect(() => {
    const w = Blockly.inject(host.current!, {
      toolbox: TOOLBOX as Blockly.utils.toolbox.ToolboxDefinition,
      theme: dark ? themes.dark : themes.light,
      renderer: 'zelos', sounds: false, media: `${import.meta.env.BASE_URL}blockly-media/`, readOnly: !!readOnly,
      trashcan: true, collapse: false, comments: false,
      zoom: { controls: true, wheel: false, pinch: true, startScale: 0.9, minScale: 0.4, maxScale: 1.8, scaleSpeed: 1.2 },
      move: { scrollbars: true, drag: true, wheel: true },
      grid: { spacing: 24, length: 2, colour: dark ? '#2c3744' : '#d9e0ea', snap: true },
    });
    ws.current = w;
    const mark = () => {
      // stacks that are not inside "처음 한 번 실행" / "계속 반복" / a function never run: say so on the block
      for (const b of w.getAllBlocks(false)) b.setWarningText(!b.getParent() && b.previousConnection ? '"계속 반복"이나 "처음 한 번 실행" 안에 넣어야 실행돼요.' : null);
    };
    const load = (s: unknown) => {
      loading.current = true;
      try {
        const problem = loadBlocks(w, s, MAX_CANONICAL_BLOCKS_BYTES);
        saver.current?.setBlocked(problem !== null);
        setNotice(problem ? `저장된 블록을 열지 못해서 빈 작업 영역을 보여 주고 있어요. 고쳐도 저장되지 않아요. (${problem})` : null);
        mark();
      } catch (e) {
        console.error('블록 불러오기 실패', e);
        w.clear();
        saver.current?.setBlocked(true);
        setNotice('블록을 불러오지 못해서 빈 작업 영역을 보여 주고 있어요. 고쳐도 저장되지 않아요.');
      } finally { loading.current = false; }
    };
    const scheduler = createSaveScheduler(() => {
      const s = Blockly.serialization.workspaces.save(w);
      last.current = stringifyJsonBounded(s, 1000, MAX_CANONICAL_BLOCKS_BYTES) ?? '';
      cb.current(s);
    });
    saver.current = scheduler;
    load(state);
    last.current = stringifyJsonBounded(state ?? null, 1000, MAX_CANONICAL_BLOCKS_BYTES) ?? '';
    w.addChangeListener((ev: Blockly.Events.Abstract) => {
      if (loading.current || ev.isUiEvent) return;
      mark();
      scheduler.schedule();
    });
    const ro = new ResizeObserver(() => Blockly.svgResize(w));
    ro.observe(host.current!);
    loader.current = load;
    return () => { scheduler.cancel(); saver.current = null; ro.disconnect(); w.dispose(); ws.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!readOnly]);

  useEffect(() => { ws.current?.setTheme(dark ? themes.dark : themes.light); }, [dark]);

  // the document changed from outside (undo, another example, opened file): reload the workspace
  useEffect(() => {
    const key = stringifyJsonBounded(state ?? null, 1000, MAX_CANONICAL_BLOCKS_BYTES) ?? '';
    if (key === last.current || !ws.current) return;
    last.current = key;
    loader.current(state);
  }, [state]);

  return (
    <>
      {notice && <p className="blocks-warn" role="alert">{notice}</p>}
      <div className="blocks-host" ref={host} role="application" aria-label="블록 코딩 작업 영역. 탭으로 들어가 방향키로 블록을 옮겨 다닐 수 있어요." />
    </>
  );
}
