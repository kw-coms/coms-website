// Blockly setup shared by the visible editor and the headless canonicalizer: block registration, the bounded loader, and
// canonicalizeBlocks (the one door every untrusted block workspace goes through before its code can run).
import * as Blockly from 'blockly/core';
import 'blockly/blocks';
import * as Ko from 'blockly/msg/ko';
import { CUSTOM_BLOCKS, type PinKind, PIN_VALUES } from './defs';
import { blocksProblem, MAX_CANONICAL_BLOCKS_BYTES, stringifyJsonBounded } from '../../core/scene';
import { registerCanonicalizer } from './canon';

Blockly.setLocale(Ko as unknown as Record<string, string>);

let pinHints: Record<string, string> = {};
export const setPinHints = (hints: Record<string, string>) => { pinHints = hints; };
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

const START_WORKSPACE = () => ({ blocks: { languageVersion: 0, blocks: [
  { type: 'lab_setup', x: 24, y: 24 }, { type: 'lab_loop', x: 24, y: 130 },
] } });

/**
 * Load a workspace into Blockly. The state is untrusted (share links, opened files), and Blockly allocates one input per
 * mutator item while loading, so it is checked again here: anything validateScene would refuse gives the start workspace.
 * `maxBytes` is the size bound of the caller: the headless canonicalizer keeps the 256 KB import bound, the visible editor
 * shows what the store holds, which may be a canonical tree of up to 512 KB.
 * Returns the Korean reason when it refused, null otherwise.
 */
export function loadBlocks(w: Blockly.Workspace, s: unknown, maxBytes?: number): string | null {
  w.clear();
  const problem = s && typeof s === 'object' ? blocksProblem(s, maxBytes) : null;
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


type Canon = { ok: true; blocks: object } | { ok: false; error: string };
type Node = Record<string, unknown>;

/** Block types of a workspace JSON in walk order, iteratively (shadows included). */
function blockTypes(state: unknown): string[] {
  const out: string[] = [];
  const todo: unknown[] = [...((state as { blocks?: { blocks?: unknown[] } })?.blocks?.blocks ?? [])].reverse();
  while (todo.length) {
    const b = todo.pop() as Node | undefined;
    if (!b || typeof b !== 'object') continue;
    out.push(String(b.type));
    const slots = [...Object.values((b.inputs ?? {}) as object), b.next] as (Node | undefined)[];
    for (const slot of slots.reverse()) if (slot) todo.push(slot.shadow, slot.block);
  }
  return out;
}

/**
 * Round-trip an untrusted workspace through Blockly itself (headless) so the block tree we store, show and generate code from
 * is Blockly's own reading of it. Whatever the raw JSON said that Blockly reads differently (a call's fields.NAME vs
 * extraState.name, a string VAR, `X` vs `x`, a missing field's default) is settled here, once, instead of the generator
 * running one reading while the student sees another. Refuses (Korean message) when Blockly throws or drops a block.
 * The depth, size and field checks of blocksProblem run first, so Blockly never sees a hostile shape; the result passes them again.
 */
export function canonicalizeBlocks(state: unknown): Canon {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return { ok: false, error: '블록 데이터가 올바르지 않아요.' };
  const problem = blocksProblem(state);
  if (problem) return { ok: false, error: problem };
  // Blockly's event counter is global: a load that throws midway must not leave the live editor's events disabled.
  const eventsWereOn = Blockly.Events.isEnabled(), group = Blockly.Events.getGroup();
  const w = new Blockly.Workspace();
  try {
    loadBlocks(w, state);
    const saved = Blockly.serialization.workspaces.save(w);
    const before = blockTypes(state), after = blockTypes(saved);
    if (before.length !== after.length || before.some((t, i) => t !== after[i])) {
      return { ok: false, error: '블록을 그대로 불러올 수 없어요. 파일이 손상되었거나 다른 버전에서 만든 것 같아요.' };
    }
    // the save adds an id and coordinates to every block, so this re-check has more room than the import bound
    const again = blocksProblem(saved, MAX_CANONICAL_BLOCKS_BYTES);
    if (again) return { ok: false, error: again };
    return { ok: true, blocks: saved };
  } catch {
    return { ok: false, error: '블록을 불러오지 못했어요. 블록 데이터가 올바르지 않아요.' };
  } finally {
    w.dispose();
    if (eventsWereOn) for (let i = 0; !Blockly.Events.isEnabled() && i < 100; i++) Blockly.Events.enable();
    Blockly.Events.setGroup(group || false);
  }
}

registerCanonicalizer(canonicalizeBlocks);
