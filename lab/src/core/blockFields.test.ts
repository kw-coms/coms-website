import { describe, expect, it } from 'vitest';
import { blockFieldsProblem, MAX_TEXT_FIELD, readBlockField } from './blockFields';
import { blocksProblem, validateScene } from './scene';
import { decodeShare } from './share';

const workspace = (block: object) => ({ blocks: { blocks: [block] } });
const scene = (block: object) => ({ version: 2, code: '', parts: [], wires: [], blocks: workspace(block) });

describe('block field schema', () => {
  it.each([
    ['lab_digital_write', 'STATE', 'HIGH); evil(); //', 'HIGH'],
    ['lab_digital_write', 'PIN', '13); evil(); //', '13'],
    ['lab_keypad', 'ROWS', '2); evil(); //', '2'],
    ['lab_keypad', 'COLS', '6); evil(); //', '6'],
    ['lab_seg_digit', 'START', '2); evil(); //', '2'],
    ['lab_wait', 'UNIT', 'ms); evil(); //', 'ms'],
    ['lab_pixel_color', 'COLOUR', '#ff0000; evil()', '#ff0000'],
    ['math_arithmetic', 'OP', 'ADD); evil(); //', 'ADD'],
    ['logic_boolean', 'BOOL', 'TRUE); evil(); //', 'TRUE'],
    ['math_number', 'NUM', '0); evil(); //', '0'],
    ['math_number', 'NUM', 'Infinity', '0'],
    ['text', 'TEXT', 42, ''],
  ])('defaults hostile %s.%s', (type, name, hostile, fallback) => {
    expect(readBlockField(type, name, hostile)).toEqual({ value: fallback, valid: false });
    expect(blockFieldsProblem(type, { [name]: hostile })).toMatch(/블록 필드/);
    expect(blocksProblem(workspace({ type, fields: { [name]: hostile } }))).toMatch(/블록 필드/);
  });

  it('canonicalizes valid decimal numbers', () => {
    expect(readBlockField('math_number', 'NUM', '003.500')).toEqual({ value: '3.5', valid: true });
    expect(readBlockField('math_number', 'NUM', -0)).toEqual({ value: '0', valid: true });
    expect(readBlockField('math_number', 'NUM', '0x10').valid).toBe(false);
  });

  it('accepts every name the editor lets a student type, and bounds only type and length', () => {
    for (const name of ['눌렸나?', 'a\\b', 'x//y', 'x'.repeat(100), 'safe*/evil()', 'safe\nevil()']) {
      expect(readBlockField('variables_get', 'VAR', { id: 'id', name }).valid, name).toBe(true);
      expect(readBlockField('procedures_defreturn', 'NAME', name).valid, name).toBe(true);
    }
    for (const bad of ['x'.repeat(101), 5, {}, null]) expect(readBlockField('procedures_defreturn', 'NAME', bad).valid).toBe(false);
    expect(blocksProblem({ ...workspace({ type: 'variables_get', fields: { VAR: { id: 'v' } } }), variables: [{ id: 'v', name: 'x'.repeat(101) }] })).toMatch(/블록/);
  });

  it('caps a TEXT field', () => {
    expect(readBlockField('text', 'TEXT', 'x'.repeat(MAX_TEXT_FIELD)).valid).toBe(true);
    expect(readBlockField('text', 'TEXT', 'x'.repeat(MAX_TEXT_FIELD + 1)).valid).toBe(false);
  });

  it('rejects an injected field from a share link before loading blocks', async () => {
    const unsafe = scene({ type: 'lab_digital_write', fields: { PIN: '13', STATE: 'HIGH); evil(); //' } });
    expect(() => validateScene(unsafe)).toThrow(/블록 필드/);
    const json = JSON.stringify(unsafe);
    const compressed = new Blob([new TextEncoder().encode(json) as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const bytes = new Uint8Array(await new Response(compressed).arrayBuffer());
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await expect(decodeShare(token)).rejects.toThrow(/블록 필드/);
  });
});
