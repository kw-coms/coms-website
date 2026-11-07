import { describe, expect, it } from 'vitest';
import { addPart, getState, isDirty, loadScene, markClean, setCode, setProp, addWire } from './store';
import { EXAMPLES } from './core';

describe('store validation and dirty state', () => {
  it('rejects fractional NeoPixel count without mutating the document', () => {
    loadScene(EXAMPLES[0]!.scene);
    const id = addPart('neopixel-strip', [0, 0, 0]);
    expect(id).not.toBe('');
    const before = getState().hist.present;
    expect(setProp(id, 'count', 1.5)).toMatch(/count/);
    expect(getState().hist.present).toBe(before);
    expect(setProp(id, 'count', 4)).toBeNull();
  });
  it('refuses the 301st part', () => {
    loadScene(EXAMPLES[0]!.scene);
    let last = 'x';
    for (let i = 0; i < 320 && last; i++) last = addPart('led', [i, 0, 0]);
    expect(getState().hist.present.parts.length).toBe(300);
  });
  it('tracks whole-document dirtiness including code-only edits', () => {
    loadScene(EXAMPLES[0]!.scene);
    expect(isDirty()).toBe(false);
    setCode(getState().code + '\n// edit');
    expect(isDirty()).toBe(true);
    markClean();
    expect(isDirty()).toBe(false);
  });
  it('rejects code over 64 KB', () => {
    loadScene(EXAMPLES[0]!.scene);
    const code = getState().code;
    setCode('a'.repeat(70_000));
    expect(getState().code).toBe(code);
  });
  void addWire;
});
