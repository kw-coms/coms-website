// Hostile block workspaces (a small #s= link or imported file) against the real Blockly loader, run headless.
// Blockly allocates one input per mutator item while loading, so a count of 1e9 would freeze the tab.
import { describe, expect, it, vi } from 'vitest';
import * as Blockly from 'blockly/core';
import 'blockly/blocks';
import { ALLOWED_BLOCK_TYPES, blocksProblem, validateScene } from '../../core/scene';
import type { Scene } from '../../core/types';
import { loadBlocks } from './BlocksEditor';
import { CUSTOM_BLOCKS, TOOLBOX } from './defs';
import { HANDLED_TYPES } from './generate';
import { STARTER_BLOCKS } from './starters';
import { workspace } from './build';

const scene = (blocks: unknown): Scene => ({ version: 2, code: '', parts: [], wires: [], blocks }) as Scene;
const top = (block: object) => ({ blocks: { languageVersion: 0, blocks: [block] } });
const hostile: [string, object][] = [
  ['text_join itemCount 1e9', { type: 'text_join', extraState: { itemCount: 1_000_000_000 } }],
  ['text_join itemCount 65', { type: 'text_join', extraState: { itemCount: 65 } }],
  ['text_join itemCount -1', { type: 'text_join', extraState: { itemCount: -1 } }],
  ['text_join itemCount 2.5', { type: 'text_join', extraState: { itemCount: 2.5 } }],
  ['text_join itemCount string', { type: 'text_join', extraState: { itemCount: '1000000000' } }],
  ['controls_if elseIfCount 1e9', { type: 'controls_if', extraState: { elseIfCount: 1e9 } }],
  ['controls_if elseIfCount 33', { type: 'controls_if', extraState: { elseIfCount: 33 } }],
  ['controls_if legacy elseif 1e9', { type: 'controls_if', extraState: { elseif: 1e9 } }],
  ['controls_if else 1e9', { type: 'controls_if', extraState: { hasElse: 1e9 } }],
  ['procedures_defnoreturn 100k params', { type: 'procedures_defnoreturn', extraState: { params: Array.from({ length: 100_000 }, (_, i) => ({ name: `p${i}`, id: `i${i}` })) } }],
  ['procedures_defreturn params not array', { type: 'procedures_defreturn', extraState: { params: 1e9 } }],
  ['procedures_callnoreturn 100k params', { type: 'procedures_callnoreturn', extraState: { name: 'f', params: Array.from({ length: 100_000 }, (_, i) => `p${i}`) } }],
  ['procedures_callreturn param not string', { type: 'procedures_callreturn', extraState: { name: 'f', params: [{}] } }],
  ['lists_create_with itemCount 1e9 (not in the toolbox)', { type: 'lists_create_with', extraState: { itemCount: 1e9 } }],
  ['unknown extraState on a plain block', { type: 'lab_wait', extraState: { itemCount: 1e9 } }],
  ['nested in an input', { type: 'lab_serial_print', inputs: { VALUE: { block: { type: 'text_join', extraState: { itemCount: 1e9 } } } } }],
  ['nested in next', { type: 'lab_loop', inputs: { DO: { block: { type: 'lab_wait', next: { block: { type: 'controls_if', extraState: { elseIfCount: 1e9 } } } } } } }],
];

describe('hostile block workspaces', () => {
  it('rejects a 10k-deep workspace before Blockly loading on a small stack', () => {
    let block: object = { type: 'lab_serial_println' };
    for (let i = 0; i < 10_000; i++) block = { type: 'lab_serial_println', next: { block } };
    const ws = new Blockly.Workspace();
    expect(loadBlocks(ws, top(block))).toMatch(/블록/);
    expect(ws.getAllBlocks(false).map(b => b.type).sort()).toEqual(['lab_loop', 'lab_setup']);
    ws.dispose();
  });
  it('loads a valid 450-block chain and preserves every connection on a small stack', () => {
    let block: object = { type: 'lab_wait' };
    for (let i = 0; i < 450; i++) block = { type: 'lab_wait', next: { block } };
    const ws = new Blockly.Workspace();
    expect(loadBlocks(ws, top(block))).toBeNull();
    expect(ws.getAllBlocks(false)).toHaveLength(451);
    let next = ws.getTopBlocks(false)[0];
    for (let i = 0; i < 450; i++) {
      next = next?.getNextBlock() ?? undefined;
      expect(next?.type).toBe('lab_wait');
    }
    expect(() => Blockly.serialization.workspaces.save(ws)).not.toThrow();
    ws.dispose();
  });
  it.each([false, true])('loads a valid deep shadow and restores it after a real block is unplugged (%s)', obscured => {
    let shadow: object = { type: 'logic_boolean', fields: { BOOL: 'TRUE' } };
    for (let i = 0; i < 200; i++) shadow = { type: 'logic_negate', inputs: { BOOL: { shadow } } };
    const root = { type: 'lab_serial_print', inputs: { VALUE: { shadow, ...(obscured ? { block: { type: 'math_number', fields: { NUM: 1 } } } : {}) } } };
    const ws = new Blockly.Workspace();
    expect(loadBlocks(ws, top(root))).toBeNull();
    const value = ws.getTopBlocks(false).find(block => block.type === 'lab_serial_print')!.getInput('VALUE')!.connection!;
    if (obscured) {
      expect(value.targetBlock()?.type).toBe('math_number');
      const saved = Blockly.serialization.workspaces.save(ws);
      expect(blocksProblem(saved)).toBeNull();
      const stored = (saved.blocks as { blocks: { inputs?: { VALUE?: { shadow?: unknown } } }[] }).blocks[0]!.inputs?.VALUE?.shadow;
      let shadowNode = stored as { type?: string; inputs?: { BOOL?: { shadow?: unknown } } } | undefined;
      for (let i = 0; i < 200; i++) {
        expect(shadowNode?.type).toBe('logic_negate');
        shadowNode = shadowNode?.inputs?.BOOL?.shadow as typeof shadowNode;
      }
      expect(shadowNode?.type).toBe('logic_boolean');
      value.disconnect();
    }
    let current = value.targetBlock();
    for (let i = 0; i < 200; i++) {
      expect(current?.type).toBe('logic_negate');
      current = current?.getInput('BOOL')?.connection?.targetBlock() ?? null;
    }
    expect(current?.type).toBe('logic_boolean');
    expect(blocksProblem(Blockly.serialization.workspaces.save(ws))).toBeNull();
    ws.dispose();
  });
  it('preserves an edited deep shadow when a real block replaces it and is unplugged', () => {
    let shadow: object = { type: 'logic_boolean', fields: { BOOL: 'TRUE' } };
    for (let i = 0; i < 200; i++) shadow = { type: 'logic_negate', inputs: { BOOL: { shadow } } };
    const ws = new Blockly.Workspace();
    expect(loadBlocks(ws, top({ type: 'lab_serial_print', inputs: { VALUE: { shadow } } }))).toBeNull();
    const value = ws.getTopBlocks(false).find(block => block.type === 'lab_serial_print')!.getInput('VALUE')!.connection!;
    let leaf = value.targetBlock();
    for (let i = 0; i < 200; i++) leaf = leaf?.getInput('BOOL')?.connection?.targetBlock() ?? null;
    expect(leaf?.type).toBe('logic_boolean');
    leaf!.setFieldValue('FALSE', 'BOOL');
    const real = Blockly.serialization.blocks.append({ type: 'math_number', fields: { NUM: 1 } }, ws);
    expect(value.connect(real.outputConnection!)).toBe(true);
    expect(value.targetBlock()?.type).toBe('math_number');
    value.disconnect();
    leaf = value.targetBlock();
    for (let i = 0; i < 200; i++) leaf = leaf?.getInput('BOOL')?.connection?.targetBlock() ?? null;
    expect(leaf?.type).toBe('logic_boolean');
    expect(leaf?.getFieldValue('BOOL')).toBe('FALSE');
    ws.dispose();
  });
  it('saves an edit made after uncovering an initially covered deep shadow', () => {
    let shadow: object = { type: 'logic_boolean', fields: { BOOL: 'TRUE' } };
    for (let i = 0; i < 30; i++) shadow = { type: 'logic_negate', inputs: { BOOL: { shadow } } };
    const initial = top({ type: 'lab_serial_print', inputs: { VALUE: {
      shadow, block: { type: 'math_number', fields: { NUM: 1 } },
    } } });
    const ws = new Blockly.Workspace();
    expect(loadBlocks(ws, initial)).toBeNull();
    const value = ws.getTopBlocks(false).find(block => block.type === 'lab_serial_print')!.getInput('VALUE')!.connection!;
    value.disconnect();
    let leaf = value.targetBlock();
    for (let i = 0; i < 30; i++) leaf = leaf?.getInput('BOOL')?.connection?.targetBlock() ?? null;
    expect(leaf?.type).toBe('logic_boolean');
    leaf!.setFieldValue('FALSE', 'BOOL');
    const saved = Blockly.serialization.workspaces.save(ws);
    const restored = new Blockly.Workspace();
    expect(loadBlocks(restored, saved)).toBeNull();
    const restoredValue = restored.getTopBlocks(false).find(block => block.type === 'lab_serial_print')!.getInput('VALUE')!.connection!;
    let restoredLeaf = restoredValue.targetBlock();
    for (let i = 0; i < 30; i++) restoredLeaf = restoredLeaf?.getInput('BOOL')?.connection?.targetBlock() ?? null;
    expect(restoredLeaf?.getFieldValue('BOOL')).toBe('FALSE');
    ws.dispose();
    restored.dispose();
  });
  it('warns without wrapping when Blockly lacks the shadow respawn hook', () => {
    let shadow: object = { type: 'logic_boolean', fields: { BOOL: 'TRUE' } };
    for (let i = 0; i < 30; i++) shadow = { type: 'logic_negate', inputs: { BOOL: { shadow } } };
    const original = Object.getOwnPropertyDescriptor(Blockly.Connection.prototype, 'respawnShadow_');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ws = new Blockly.Workspace();
    try {
      Object.defineProperty(Blockly.Connection.prototype, 'respawnShadow_', { configurable: true, value: undefined });
      expect(() => loadBlocks(ws, top({ type: 'lab_serial_print', inputs: { VALUE: { shadow } } }))).not.toThrow();
      expect(warning).toHaveBeenCalledWith(expect.stringMatching(/그림자 복원/));
    } finally {
      if (original) Object.defineProperty(Blockly.Connection.prototype, 'respawnShadow_', original);
      else Reflect.deleteProperty(Blockly.Connection.prototype, 'respawnShadow_');
      warning.mockRestore();
      ws.dispose();
    }
  });
  it.each(hostile)('validateScene refuses %s with a Korean error, quickly', (_n, block) => {
    const t0 = Date.now();
    expect(() => validateScene(scene(top(block)))).toThrow(/블록|항목/);
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it.each(hostile)('the Blockly loader never sees %s: start workspace, Korean reason, fast', (_n, block) => {
    const ws = new Blockly.Workspace();
    const t0 = Date.now();
    const problem = loadBlocks(ws, top(block));
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(problem).toMatch(/블록|항목/);
    expect(ws.getAllBlocks(false).map(b => b.type).sort()).toEqual(['lab_loop', 'lab_setup']);
    ws.dispose();
  });

  it('many small mutators cannot add up to a freeze either', () => {
    const blocks = Array.from({ length: 200 }, () => ({ type: 'text_join', extraState: { itemCount: 64 } }));
    expect(blocksProblem({ blocks: { blocks } })).toMatch(/총합/);
  });
});

describe('real Blockly output passes the schema', () => {
  it('the allowlist is the toolbox plus what the generator handles', () => {
    const toolbox = new Set<string>();
    const walk = (n: unknown) => {
      if (Array.isArray(n)) n.forEach(walk);
      else if (n && typeof n === 'object') {
        const o = n as Record<string, unknown>;
        if (typeof o.type === 'string') toolbox.add(o.type);
        Object.values(o).forEach(walk);
      }
    };
    walk(TOOLBOX);
    for (const t of [...toolbox, ...CUSTOM_BLOCKS.map(b => b.type), ...HANDLED_TYPES]) expect(ALLOWED_BLOCK_TYPES.has(t), t).toBe(true);
    for (const t of ALLOWED_BLOCK_TYPES) expect(HANDLED_TYPES.has(t) || t === 'procedures_ifreturn', t).toBe(true);
  });

  it('every starter, and a Blockly round trip of mutated blocks, is accepted unchanged', () => {
    for (const [id, state] of Object.entries(STARTER_BLOCKS)) {
      expect(blocksProblem(state), id).toBeNull();
      const ws = new Blockly.Workspace();
      expect(loadBlocks(ws, state), id).toBeNull();
      expect(blocksProblem(Blockly.serialization.workspaces.save(ws)), id).toBeNull();
      ws.dispose();
    }
    const state = workspace([
      { type: 'lab_loop', do: { DO: [
        { type: 'controls_if', extra: { elseIfCount: 3, hasElse: true } },
        { type: 'lab_serial_println', in: { VALUE: { type: 'text_join', extra: { itemCount: 5 } } } },
        { type: 'procedures_callnoreturn', extra: { name: 'f', params: ['a', 'b'] } },
      ] } },
      { type: 'procedures_defreturn', fields: { NAME: 'f' }, extra: { params: [{ name: 'a', id: 'id_a' }, { name: 'b', id: 'id_b' }] } },
      { type: 'procedures_ifreturn' },
    ], ['a', 'b']);
    const ws = new Blockly.Workspace();
    expect(loadBlocks(ws, state)).toBeNull();
    const saved = Blockly.serialization.workspaces.save(ws);
    expect(blocksProblem(saved)).toBeNull();
    expect(JSON.stringify(saved)).toContain('"itemCount":5');
    expect(JSON.stringify(saved)).toContain('"elseIfCount":3');
    ws.dispose();
  });
});
