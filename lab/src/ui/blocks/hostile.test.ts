// Hostile block workspaces (a small #s= link or imported file) against the real Blockly loader, run headless.
// Blockly allocates one input per mutator item while loading, so a count of 1e9 would freeze the tab.
import { describe, expect, it } from 'vitest';
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
