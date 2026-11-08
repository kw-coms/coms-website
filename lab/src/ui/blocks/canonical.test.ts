// The blocks the student sees are exactly the code that runs: every scene goes through headless Blockly first.
// Each mismatch between the raw JSON and Blockly's own reading of it is a hidden-code bug; here each one is either
// rejected or settled so that generate(canonical) is the code for what Blockly displays.
import { describe, expect, it } from 'vitest';
import * as Blockly from 'blockly/core';
import { blocksProblem } from '../../core/scene';
import { canonicalizeBlocks, loadBlocks } from './blocklyRuntime';
import { generate } from './generate';
import { STARTER_BLOCKS } from './starters';
import { workspace } from './build';

const ws = (blocks: unknown[], variables?: unknown[]) => ({ blocks: { languageVersion: 0, blocks }, ...(variables ? { variables } : {}) });
const loop = (...stack: unknown[]) => ({ type: 'lab_loop', inputs: { DO: { block: chain(stack) } } });
const chain = (stack: unknown[]): unknown => {
  const blocks = stack.map(b => ({ ...(b as object) })) as { next?: unknown }[];
  for (let i = blocks.length - 2; i >= 0; i--) blocks[i]!.next = { block: blocks[i + 1] };
  return blocks[0];
};
const num = (n: number) => ({ block: { type: 'math_number', fields: { NUM: n } } });

/** What Blockly displays for this JSON, read straight from a workspace with no canonicalizer involved. */
const displayed = (json: unknown) => {
  const w = new Blockly.Workspace();
  loadBlocks(w, json);
  const saved = Blockly.serialization.workspaces.save(w);
  w.dispose();
  return saved;
};
const canon = (json: unknown) => {
  const r = canonicalizeBlocks(json);
  if (!r.ok) throw new Error(r.error);
  return r.blocks;
};

describe('canonical blocks run as displayed', () => {
  const cases: [string, unknown][] = [
    ['call: fields.NAME disagrees with extraState.name', ws([
      { type: 'procedures_defnoreturn', fields: { NAME: 'good' } },
      { type: 'procedures_defnoreturn', fields: { NAME: 'evil' } },
      loop({ type: 'procedures_callnoreturn', fields: { NAME: 'evil' }, extraState: { name: 'good', params: [] } }),
    ])],
    ['string VAR', ws([loop({ type: 'variables_set', fields: { VAR: 'foo' }, inputs: { VALUE: num(1) } })])],
    ['VAR id missing from variables (Blockly auto-creates i/j)', ws([loop(
      { type: 'variables_set', fields: { VAR: { id: 'zz' } }, inputs: { VALUE: num(1) } },
      { type: 'variables_set', fields: { VAR: { id: 'yy' } }, inputs: { VALUE: num(2) } },
    )])],
    ['X and x', ws([loop(
      { type: 'variables_set', fields: { VAR: { id: 'a' } }, inputs: { VALUE: num(1) } },
      { type: 'variables_set', fields: { VAR: { id: 'b' } }, inputs: { VALUE: num(2) } },
    )], [{ id: 'a', name: 'X' }, { id: 'b', name: 'x' }])],
    ['missing fields get Blockly defaults', ws([loop({ type: 'lab_digital_write' }, { type: 'lab_serial_print', inputs: { VALUE: { block: { type: 'math_single' } } } })])],
    ['unknown field is dropped', ws([loop({ type: 'lab_digital_write', fields: { PIN: '8', STATE: 'HIGH', GHOST: 'x' } })])],
  ];

  it.each(cases)('%s', (_name, json) => {
    // fields the schema has no rule for are refused up front; the rest must match the displayed reading exactly
    const r = canonicalizeBlocks(json);
    if (!r.ok) { expect(r.error).toMatch(/[가-힣]/); return; }
    expect(generate(r.blocks).code).toBe(generate(displayed(json)).code);
    expect(blocksProblem(r.blocks)).toBeNull();
  });

  it('a call runs the procedure Blockly shows, not the one fields.NAME named', () => {
    const c = canon(cases[0]![1]);
    const callOf = (state: unknown) => /"type":"procedures_callnoreturn"[^]*?"extraState":\{"name":"(\w+)"/.exec(JSON.stringify(state))?.[1];
    const shown = callOf(displayed(cases[0]![1]));
    expect(shown).toBeTruthy();
    expect(callOf(c)).toBe(shown);
    expect(generate(c).code).toMatch(new RegExp(`^  f_${shown}\\(\\);`, 'm')); // a call, not the prototype
    expect(generate(cases[0]![1]).code).not.toMatch(new RegExp(`^  f_${shown}\\(\\);`, 'm')); // the raw reading is the hidden-code bug canonicalizing removes
  });
  it('a string VAR never reaches the code under its raw spelling', () => {
    const { code } = generate(canon(cases[1]![1]));
    expect(code).not.toMatch(/\bfoo\b/);
    expect(code).toMatch(/v_\w+ = 1;/);
  });

  it('ids unknown to `variables` become the variables Blockly created, distinct from each other', () => {
    const c = canon(cases[2]![1]) as { variables: { id: string; name: string }[] };
    expect(c.variables.map(v => v.id).sort()).toEqual(['yy', 'zz']);
    const { code } = generate(c);
    const names = [...code.matchAll(/^int (v_\w+) = 0;/gm)].map(m => m[1]);
    expect(new Set(names).size).toBe(2);
  });

  it('X and x are two variables with two identifiers, like Blockly shows them', () => {
    const { code } = generate(canon(cases[3]![1]));
    expect(code).toMatch(/v_X = 1;/);
    expect(code).toMatch(/v_x = 2;/);
  });

  it('missing fields take the values Blockly shows', () => {
    const { code } = generate(canon(cases[4]![1]));
    expect(code).toContain('digitalWrite(2, HIGH);');
  });

  it('an unknown input that makes Blockly throw is refused, not shown empty', () => {
    const r = canonicalizeBlocks(ws([{ type: 'lab_loop', inputs: { NOPE: { block: { type: 'lab_millis' } } } }]));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/불러오지 못했어요/);
  });

  it('every starter canonicalizes to the same program', () => {
    for (const [id, state] of Object.entries(STARTER_BLOCKS)) {
      const r = canon(state);
      expect(generate(r).code, id).toBe(generate(state).code);
      expect(JSON.stringify(canon(r)), `${id} is stable`).toBe(JSON.stringify(r));
    }
  });
});

describe('disabled blocks do not run', () => {
  const enabled = loop({ type: 'lab_digital_write', fields: { PIN: '8', STATE: 'HIGH' } });
  const off = (extra: object) => ws([loop({ type: 'lab_digital_write', fields: { PIN: '8', STATE: 'HIGH' }, ...extra }, { type: 'lab_digital_write', fields: { PIN: '9', STATE: 'LOW' } })]);
  it.each([[{ disabledReasons: ['MANUALLY_DISABLED'] }], [{ enabled: false }]])('%j', extra => {
    const { code } = generate(off(extra));
    expect(code).not.toContain('digitalWrite(8,');
    expect(code).toContain('digitalWrite(9, LOW);');
    expect(generate(canon(off(extra))).code).toBe(code);
  });
  it('an empty disabledReasons does not disable, and the key is validated at import', () => {
    expect(generate(off({ disabledReasons: [] })).code).toContain('digitalWrite(8, HIGH);');
    expect(canonicalizeBlocks(off({ disabledReasons: 'yes' })).ok).toBe(false);
    expect(canonicalizeBlocks(off({ enabled: 'no' })).ok).toBe(false);
  });
  void enabled;
});

describe('identifiers', () => {
  const names = (...vars: string[]) => workspace([{ type: 'lab_loop', do: { DO: vars.map(v => ({ type: 'variables_set', fields: { VAR: v }, in: { VALUE: 1 } })) } }], vars);
  it('every user name is prefixed, so it cannot collide with Arduino / C++ / library symbols', () => {
    const syms = ['yield', 'serialEvent', 'initVariant', 'log10', 'delayMicroseconds', 'Wire', 'sqrtf', 'powf', 'floorf', 'setup', 'loop', 'delay', 'Serial', 'int'];
    const { code } = generate(names(...syms));
    for (const s of syms) expect(code, s).toContain(`int v_${s} = 0;`);
    expect(code).not.toMatch(/^int (yield|Wire|log10)\b/m);
    const fns = generate(workspace([...['loop', 'setup', 'yield', 'main'].map(n => ({ type: 'procedures_defnoreturn', fields: { NAME: n } }))]));
    for (const s of ['loop', 'setup', 'yield', 'main']) expect(fns.code, s).toContain(`void f_${s}();`);
  });
  it('different unsafe names get different identifiers', () => {
    const { code } = generate(names('점수', '속도', 'a b', 'a-b', 'a b!'));
    const ids = [...code.matchAll(/^int (v_\w+) = 0;/gm)].map(m => m[1]);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    expect(code).toContain('// 변수 "점수"');
  });
  it('names differing only in case are one variable when they share an id and two when they do not', () => {
    const one = generate({ variables: [{ id: 'a', name: 'Score' }], blocks: { blocks: [loop(
      { type: 'variables_set', fields: { VAR: { id: 'a' } }, inputs: { VALUE: num(1) } },
      { type: 'variables_set', fields: { VAR: { id: 'a' } }, inputs: { VALUE: num(2) } },
    )] } }).code;
    expect(one.match(/^int v_Score/gm)).toHaveLength(1);
    const byName = generate({ blocks: { blocks: [loop(
      { type: 'variables_set', fields: { VAR: { name: 'Score' } }, inputs: { VALUE: num(1) } },
      { type: 'variables_set', fields: { VAR: { name: 'score' } }, inputs: { VALUE: num(2) } },
    )] } }).code;
    expect(byName.match(/^int v_/gm)).toHaveLength(1); // Blockly compares names case-insensitively
  });
  it('a name that is not a valid generator name is still a distinct variable from one named like the fallback', () => {
    const { code } = generate(names('이름 없음', '이름'));
    expect(new Set([...code.matchAll(/^int (v_\w+) = 0;/gm)].map(m => m[1])).size).toBe(2);
  });
});

describe('canonicalizing leaves the live editor alone', () => {
  it('a load that throws does not leave Blockly events disabled', () => {
    const live = new Blockly.Workspace();
    let fired = 0;
    live.addChangeListener(() => { fired++; });
    expect(Blockly.Events.isEnabled()).toBe(true);
    expect(canonicalizeBlocks(ws([{ type: 'lab_loop', inputs: { NOPE: { block: { type: 'lab_millis' } } } }])).ok).toBe(false);
    expect(Blockly.Events.isEnabled()).toBe(true);
    Blockly.serialization.blocks.append({ type: 'lab_millis' }, live);
    Blockly.Events.fireNow_?.();
    return new Promise<void>(resolve => setTimeout(() => { expect(fired).toBeGreaterThan(0); live.dispose(); resolve(); }, 20));
  });
  it('does not enable events that were already off, and keeps the event group', () => {
    Blockly.Events.disable();
    Blockly.Events.setGroup('keep');
    canonicalizeBlocks(ws([{ type: 'lab_loop' }]));
    expect(Blockly.Events.isEnabled()).toBe(false);
    expect(Blockly.Events.getGroup()).toBe('keep');
    Blockly.Events.enable();
    Blockly.Events.setGroup(false);
  });
});

describe('size bounds', () => {
  it('a valid import under 256 KB still canonicalizes when the save adds ids and coordinates', () => {
    const state = ws(Array.from({ length: 4500 }, () => ({ type: 'math_number', fields: { NUM: 1 } })));
    expect(JSON.stringify(state).length).toBeLessThan(256 * 1024);
    const r = canonicalizeBlocks(state);
    expect(r.ok).toBe(true);
    expect(JSON.stringify(r.ok && r.blocks).length).toBeGreaterThan(256 * 1024);
  });
  it('the pre-load bound stays 256 KB', () => {
    expect(canonicalizeBlocks(ws(Array.from({ length: 6000 }, () => ({ type: 'math_number', fields: { NUM: 1 } })))).ok).toBe(false);
  });
});
