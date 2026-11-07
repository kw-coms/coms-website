import { describe, expect, it } from 'vitest';
import { commit, initHistory, redo, undo } from './history';

describe('history', () => {
  it('commits, undoes and redoes', () => {
    let h = initHistory(0);
    h = commit(h, 1);
    h = commit(h, 2);
    expect(h.present).toBe(2);
    h = undo(h);
    expect(h.present).toBe(1);
    h = redo(h);
    expect(h.present).toBe(2);
    expect(redo(h)).toBe(h);
  });
  it('clears redo on new commit and ignores identical state', () => {
    let h = commit(commit(initHistory(0), 1), 2);
    h = undo(h);
    h = commit(h, 9);
    expect(h.future).toEqual([]);
    expect(commit(h, 9)).toBe(h);
  });
  it('caps the past at 100', () => {
    let h = initHistory(0);
    for (let i = 1; i <= 150; i++) h = commit(h, i);
    expect(h.past.length).toBe(100);
    expect(h.past[0]).toBe(50);
  });
});
