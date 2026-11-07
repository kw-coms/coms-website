// The Blockly workspace. Loaded lazily (see CodeTab.tsx): Blockly is only downloaded when Blocks mode opens.
// No network requests: no sounds, and the few images Blockly needs (toolbox/zoom icons, cursors) are copied from
// node_modules/blockly/media into public/blockly-media (Blockly would otherwise load them from static.blockly.com).
import { useEffect, useRef } from 'react';
import * as Blockly from 'blockly/core';
import 'blockly/blocks';
import * as Ko from 'blockly/msg/ko';
import { COLOUR, CUSTOM_BLOCKS, TOOLBOX, type PinKind, PIN_VALUES } from './defs';
import { blocksProblem, stringifyJsonBounded } from '../../core/scene';
import './blocks.css';

Blockly.setLocale(Ko as unknown as Record<string, string>);

let pinHints: Record<string, string> = {};
const pinOptions = (kind: PinKind): [string, string][] => PIN_VALUES[kind].map((v) => [pinHints[v] ? `${v} · ${pinHints[v]}` : v, v]);

for (const def of CUSTOM_BLOCKS) {
  Blockly.Blocks[def.type] = {
    init(this: Blockly.Block) {
      this.jsonInit(def);
      for (const a of def.args0 ?? []) {
        const kind = a.pinKind as PinKind | undefined;
        if (kind) (this.getField(a.name as string) as Blockly.FieldDropdown).setOptions(() => pinOptions(kind));
      }
    },
  };
}

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

const START_WORKSPACE = () => ({ blocks: { languageVersion: 0, blocks: [
  { type: 'lab_setup', x: 24, y: 24 }, { type: 'lab_loop', x: 24, y: 130 },
] } });

/**
 * Load a workspace into Blockly. The state is untrusted (share links, opened files), and Blockly allocates one input per
 * mutator item while loading, so it is checked again here: anything validateScene would refuse gives the start workspace.
 * Returns the Korean reason when it refused, null otherwise.
 */
export function loadBlocks(w: Blockly.Workspace, s: unknown): string | null {
  w.clear();
  const problem = s && typeof s === 'object' ? blocksProblem(s) : null;
  if (problem) console.warn('블록 불러오기를 건너뛰었어요:', problem);
  const state = s && typeof s === 'object' && !problem ? s as object : START_WORKSPACE();
  if (stringifyJsonBounded(state, 64, 256 * 1024) !== null) {
    Blockly.serialization.workspaces.load(state, w);
  } else {
    // Blockly's deserializer recursively follows next/input blocks. A valid
    // 450-block workspace can exceed the JS stack on smaller hosts.
    const workspace = state as { blocks?: { blocks?: Blockly.serialization.blocks.State[] } };
    const roots = workspace.blocks?.blocks ?? [];
    Blockly.serialization.workspaces.load({ ...state, blocks: { ...workspace.blocks, blocks: [] } }, w);
    loadDeepBlocks(w, roots);
  }
  return problem;
}

function loadDeepBlocks(w: Blockly.Workspace, roots: Blockly.serialization.blocks.State[]): void {
  type State = Blockly.serialization.blocks.State;
  type Task = { state: State; parent?: Blockly.Connection; loaded?: Blockly.Block };
  const pending: Task[] = roots.map(root => ({ state: root })).reverse();
  const shadows = new WeakMap<Blockly.Connection, State>();
  const wrapped = new WeakSet<Blockly.Connection>();
  const ready = new WeakSet<Blockly.Connection>();
  const building = new Set<Blockly.Connection>();
  const drain = (): void => {
    while (pending.length) {
      const { state, parent, loaded } = pending.pop()!;
      const { inputs, next, ...shallow } = state;
      const block = loaded ?? Blockly.serialization.blocks.appendInternal(shallow, w, { parentConnection: parent });
      const connect = (connection: Blockly.Connection | null | undefined, slot: Blockly.serialization.blocks.ConnectionState) => {
        if (!connection) throw new Error('블록 연결이 올바르지 않습니다.');
        if (slot.shadow) attachShadow(connection, slot.shadow, !!slot.block);
        if (slot.block) pending.push({ state: slot.block, parent: connection });
      };
      if (next) connect(block.nextConnection, next);
      for (const [name, slot] of Object.entries(inputs ?? {}).reverse()) connect(block.getInput(name)?.connection, slot);
    }
    for (const connection of building) ready.add(connection);
    building.clear();
  };
  const attachShadow = (connection: Blockly.Connection, state: State, obscured: boolean): void => {
    const originalRespawn: unknown = Reflect.get(connection, 'respawnShadow_');
    if (typeof originalRespawn !== 'function') {
      console.warn('블록 그림자 복원 기능을 사용할 수 없어요.');
      return;
    }
    const { inputs: _inputs, next: _next, ...shallow } = state;
    void _inputs; void _next;
    connection.setShadowState(shallow);
    shadows.set(connection, state);
    if (!wrapped.has(connection)) {
      wrapped.add(connection);
      const originalGet = connection.getShadowState.bind(connection);
      // Blockly respawns from shadowState recursively. Keep its stored state
      // shallow and restore descendants through the same iterative loader.
      Reflect.set(connection, 'respawnShadow_', () => {
        originalRespawn.call(connection);
        const shadow = connection.targetBlock();
        const saved = shadows.get(connection);
        if (shadow?.isShadow() && saved) {
          ready.delete(connection);
          building.add(connection);
          pending.push({ state: saved, loaded: shadow });
          drain();
        }
      });
      Reflect.set(connection, 'getShadowState', (current?: boolean) => {
        const saved = shadows.get(connection);
        if (!saved) return originalGet(current);
        if (!current) {
          const { inputs: _inputs, next: _next, ...shallowState } = saved;
          void _inputs; void _next;
          return shallowState; // Blockly's recursive respawn sees only one block.
        }
        const active = connection.targetBlock();
        if (!active?.isShadow()) return saved;
        if (!ready.has(connection)) return saved;
        const latest = originalGet(true);
        if (latest) shadows.set(connection, latest);
        return latest;
      });
    }
    const shadow = connection.targetBlock();
    if (!obscured && shadow?.isShadow()) {
      building.add(connection);
      pending.push({ state, loaded: shadow });
    }
  };
  drain();
}

export default function BlocksEditor({ state, dark, hints, readOnly, onChange }: BlocksEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const ws = useRef<Blockly.WorkspaceSvg | null>(null);
  const last = useRef('');
  const loading = useRef(false);
  const loader = useRef<(s: unknown) => void>(() => {});
  const cb = useRef(onChange);
  cb.current = onChange;
  pinHints = hints;

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
        loadBlocks(w, s);
        mark();
      } catch (e) {
        console.error('블록 불러오기 실패', e);
        w.clear();
      } finally { loading.current = false; }
    };
    load(state);
    last.current = stringifyJsonBounded(state ?? null, 1000, 256 * 1024) ?? '';
    let timer = 0;
    w.addChangeListener((ev: Blockly.Events.Abstract) => {
      if (loading.current || ev.isUiEvent) return;
      mark();
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const s = Blockly.serialization.workspaces.save(w);
        last.current = stringifyJsonBounded(s, 1000, 256 * 1024) ?? '';
        cb.current(s);
      }, 300);
    });
    const ro = new ResizeObserver(() => Blockly.svgResize(w));
    ro.observe(host.current!);
    loader.current = load;
    return () => { window.clearTimeout(timer); ro.disconnect(); w.dispose(); ws.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!readOnly]);

  useEffect(() => { ws.current?.setTheme(dark ? themes.dark : themes.light); }, [dark]);

  // the document changed from outside (undo, another example, opened file): reload the workspace
  useEffect(() => {
    const key = stringifyJsonBounded(state ?? null, 1000, 256 * 1024) ?? '';
    if (key === last.current || !ws.current) return;
    last.current = key;
    loader.current(state);
  }, [state]);

  return <div className="blocks-host" ref={host} role="application" aria-label="블록 코딩 작업 영역. 탭으로 들어가 방향키로 블록을 옮겨 다닐 수 있어요." />;
}
